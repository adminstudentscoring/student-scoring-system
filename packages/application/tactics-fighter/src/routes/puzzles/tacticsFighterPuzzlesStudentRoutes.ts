// Tactics Fighter public student tree + puzzle list routes
"use strict";

function registerTacticsFighterPuzzlesStudentRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId,
    pool, hasDb } = shared;

  // ----------------------------
  // Public Student APIs (bucket scoped)
  // ----------------------------

  app.get('/api/public/students/:id/tactics-fighter/tree', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const orgId = ctx.orgId;

      const catsRes = await pool.query(
        `SELECT id, name FROM tactics_fighter_categories WHERE org_id = $1 AND bucket = $2 ORDER BY name ASC`,
        [orgId, bucket]
      );
      const cats = catsRes.rows.map((r) => ({ id: String(r.id), name: String(r.name || ''), topics: [] }));
      const catIds = cats.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));

      const topicsRes = catIds.length ? await pool.query(
        `SELECT id, category_id, name FROM tactics_fighter_topics WHERE org_id = $1 AND category_id = ANY($2::bigint[]) ORDER BY name ASC`,
        [orgId, catIds]
      ) : { rows: [] };

      const topicsByCat = new Map();
      for (const t of topicsRes.rows) {
        const cid = String(t.category_id);
        if (!topicsByCat.has(cid)) topicsByCat.set(cid, []);
        topicsByCat.get(cid).push({ id: String(t.id), name: String(t.name || ''), subtopics: [] });
      }

      const topicIds = topicsRes.rows.map((t) => Number(t.id)).filter((n) => Number.isFinite(n));
      const subsRes = topicIds.length ? await pool.query(
        `SELECT id, topic_id, name FROM tactics_fighter_subtopics WHERE org_id = $1 AND topic_id = ANY($2::bigint[]) ORDER BY name ASC`,
        [orgId, topicIds]
      ) : { rows: [] };

      const subsByTopic = new Map();
      for (const s of subsRes.rows) {
        const tid = String(s.topic_id);
        if (!subsByTopic.has(tid)) subsByTopic.set(tid, []);
        subsByTopic.get(tid).push({ id: String(s.id), name: String(s.name || ''), puzzleCount: 0 });
      }

      const subtopicIds = subsRes.rows.map((s) => Number(s.id)).filter((n) => Number.isFinite(n));
      const countsRes = subtopicIds.length ? await pool.query(
        `SELECT subtopic_id, COUNT(*)::int AS cnt FROM tactics_fighter_puzzles WHERE org_id = $1 AND subtopic_id = ANY($2::bigint[]) GROUP BY subtopic_id`,
        [orgId, subtopicIds]
      ) : { rows: [] };
      const cntBySub = new Map(countsRes.rows.map((r) => [String(r.subtopic_id), Number(r.cnt || 0)]));

      for (const c of cats) {
        const topics = topicsByCat.get(String(c.id)) || [];
        for (const t of topics) {
          const subs = subsByTopic.get(String(t.id)) || [];
          for (const s of subs) {
            s.puzzleCount = cntBySub.get(String(s.id)) || 0;
          }
          t.subtopics = subs;
        }
        c.topics = topics;
      }

      return res.json({ ok: true, bucket, categories: cats });
    } catch (e) {
      console.error('[tactics-fighter] public tree error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load tree' });
    }
  });

  app.get('/api/public/students/:id/tactics-fighter/subtopics/:subtopicId/puzzles', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const subtopicId = toRangeInt(req.params?.subtopicId, 1, 1_000_000_000, 0);
      if (!subtopicId) return res.status(400).json({ ok: false, error: 'Invalid subtopicId' });

      const okRes = await pool.query(
        `
        SELECT s.id AS subtopic_id, COALESCE(s.message, '') AS message
        FROM tactics_fighter_subtopics s
        JOIN tactics_fighter_topics t ON t.id = s.topic_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id
        WHERE s.org_id = $1 AND s.id = $2 AND c.bucket = $3
        LIMIT 1
        `,
        [orgId, subtopicId, bucket]
      );
      if (!okRes.rows.length) return res.status(404).json({ ok: false, error: 'Subtopic not found' });
      const subtopicMessage = String(okRes.rows?.[0]?.message || '');

      const page = toRangeInt(req.query?.page, 1, 1000000, 1);
      const pageSize = toRangeInt(req.query?.pageSize, 1, 50, 10);
      const offset = (page - 1) * pageSize;

      const puzzlesRes = await pool.query(
        `
        SELECT id, fen, message, solutions, created_at
        FROM tactics_fighter_puzzles
        WHERE org_id = $1 AND subtopic_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT $3 OFFSET $4
        `,
        [orgId, subtopicId, pageSize, offset]
      );

      const totalRes = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM tactics_fighter_puzzles WHERE org_id = $1 AND subtopic_id = $2`,
        [orgId, subtopicId]
      );
      const total = Number(totalRes.rows?.[0]?.cnt || 0);

      const puzzleIds = puzzlesRes.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      const progRes = puzzleIds.length ? await pool.query(
        `
        SELECT puzzle_id, status, completed_at
        FROM tactics_fighter_student_progress
        WHERE org_id = $1 AND student_id = $2 AND puzzle_id = ANY($3::bigint[])
        `,
        [orgId, studentId, puzzleIds]
      ) : { rows: [] };
      const completedIds = new Set(progRes.rows.filter((r) => String(r.status) === 'completed').map((r) => String(r.puzzle_id)));

      const puzzles = puzzlesRes.rows.map((r) => ({
        id: String(r.id),
        fen: String(r.fen || ''),
        message: String(r.message || ''),
        solutions: r.solutions && typeof r.solutions === 'object' ? r.solutions : {},
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        completed: completedIds.has(String(r.id))
      }));

      return res.json({
        ok: true,
        bucket,
        subtopicId: String(subtopicId),
        subtopicMessage,
        page,
        pageSize,
        total,
        puzzles
      });
    } catch (e) {
      console.error('[tactics-fighter] public puzzles error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load puzzles' });
    }
  });
}

module.exports = { registerTacticsFighterPuzzlesStudentRoutes };
export {};
