// Tactics Fighter builder routes — tree
"use strict";

function registerTacticsFighterPuzzlesBuilderTreeRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;
  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId, pool, hasDb } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    // Tree: categories + topics + subtopics (no puzzles yet; puzzles are fetched per subtopic)
    app.get(
      "/api/teachers/tactics-fighter/builder/tree",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const bucket = toCleanString(req.query?.bucket || 'beginner', 32) || 'beginner';

          const cats = await pool.query(
            `SELECT id, name, bucket, created_at, updated_at
             FROM tactics_fighter_categories
             WHERE org_id = $1 AND bucket = $2
             ORDER BY name ASC`,
            [orgId, bucket]
          );
          const catIds = (cats.rows || []).map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
          if (!catIds.length) return res.json({ ok: true, bucket, categories: [] });

          const topics = await pool.query(
            `SELECT id, category_id, name, created_at, updated_at
             FROM tactics_fighter_topics
             WHERE org_id = $1 AND category_id = ANY($2::bigint[])
             ORDER BY name ASC`,
            [orgId, catIds]
          );
          const topicIds = (topics.rows || []).map((t) => Number(t.id)).filter((n) => Number.isFinite(n));
          const subs = topicIds.length ? await pool.query(
            `SELECT id, topic_id, name, message, created_at, updated_at
             FROM tactics_fighter_subtopics
             WHERE org_id = $1 AND topic_id = ANY($2::bigint[])
             ORDER BY name ASC`,
            [orgId, topicIds]
          ) : { rows: [] };

          const subtopicIds = (subs.rows || []).map((s) => Number(s.id)).filter((n) => Number.isFinite(n));
          const countsRes = subtopicIds.length
            ? await pool.query(
                `SELECT subtopic_id, COUNT(*)::int AS cnt
                 FROM tactics_fighter_puzzles
                 WHERE org_id = $1 AND subtopic_id = ANY($2::bigint[])
                 GROUP BY subtopic_id`,
                [orgId, subtopicIds]
              )
            : { rows: [] };
          const cntBySub = new Map(
            (countsRes.rows || []).map((r) => [String(r.subtopic_id), Number(r.cnt || 0)])
          );

          const topicsByCat = new Map();
          for (const t of topics.rows || []) {
            const cid = String(t.category_id);
            if (!topicsByCat.has(cid)) topicsByCat.set(cid, []);
            topicsByCat.get(cid).push({
              id: String(t.id),
              name: String(t.name || ''),
              createdAt: t.created_at ? new Date(t.created_at).toISOString() : null,
              updatedAt: t.updated_at ? new Date(t.updated_at).toISOString() : null
            });
          }

          const subsByTopic = new Map();
          for (const s of subs.rows || []) {
            const tid = String(s.topic_id);
            if (!subsByTopic.has(tid)) subsByTopic.set(tid, []);
            subsByTopic.get(tid).push({
              id: String(s.id),
              name: String(s.name || ''),
              message: s.message == null ? '' : String(s.message),
              puzzleCount: cntBySub.get(String(s.id)) || 0,
              createdAt: s.created_at ? new Date(s.created_at).toISOString() : null,
              updatedAt: s.updated_at ? new Date(s.updated_at).toISOString() : null
            });
          }

          const out = (cats.rows || []).map((c) => {
            const cid = String(c.id);
            const catTopics = topicsByCat.get(cid) || [];
            return {
              id: cid,
              name: String(c.name || ''),
              bucket: String(c.bucket || bucket),
              createdAt: c.created_at ? new Date(c.created_at).toISOString() : null,
              updatedAt: c.updated_at ? new Date(c.updated_at).toISOString() : null,
              topics: catTopics.map((t) => ({
                ...t,
                subtopics: subsByTopic.get(String(t.id)) || []
              }))
            };
          });

          return res.json({ ok: true, bucket, categories: out });
        } catch (e) {
          console.error('[tactics-fighter] builder tree error:', e);
          const msg = String(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to load builder tree", details: msg });
        }
      }
    );

  }
}

module.exports = { registerTacticsFighterPuzzlesBuilderTreeRoutes };
export {};
