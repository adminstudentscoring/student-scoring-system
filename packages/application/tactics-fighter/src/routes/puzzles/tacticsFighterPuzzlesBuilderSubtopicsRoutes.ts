// Tactics Fighter builder routes — subtopics
"use strict";

function registerTacticsFighterPuzzlesBuilderSubtopicsRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;
  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId, pool, hasDb } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    // Subtopics
    app.post(
      "/api/teachers/tactics-fighter/builder/topics/:topicId/subtopics",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const topicId = String(req.params.topicId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!topicId) return res.status(400).json({ ok: false, error: "Missing topicId" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO tactics_fighter_subtopics(org_id, topic_id, name, created_by)
             SELECT $1, t.id, $3, $4
             FROM tactics_fighter_topics t
             WHERE t.org_id = $1 AND t.id = $2
             RETURNING id, topic_id, name, created_at, updated_at`,
            [orgId, topicId, name, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Topic not found" });
          return res.json({ ok: true, subtopic: { id: String(row.id), topicId: String(row.topic_id), name: String(row.name) } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Subtopic already exists" : "Create subtopic failed" });
        }
      }
    );

    app.patch(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          const hasName = Object.prototype.hasOwnProperty.call(req?.body || {}, 'name');
          const hasMessage = Object.prototype.hasOwnProperty.call(req?.body || {}, 'message');
          if (!hasName && !hasMessage) return res.status(400).json({ ok: false, error: "Missing update fields" });

          const name = hasName ? toCleanString(req?.body?.name || '', 120) : null;
          if (hasName && !name) return res.status(400).json({ ok: false, error: "Missing name" });

          let message = null;
          if (hasMessage) {
            message = String(req?.body?.message ?? '');
            if (message.length > 2000) message = message.slice(0, 2000);
          }

          const sets = [];
          const vals = [];
          let i = 1;
          if (hasName) { sets.push(`name = $${i++}`); vals.push(name); }
          if (hasMessage) { sets.push(`message = $${i++}`); vals.push(message); }
          sets.push(`updated_at = NOW()`);
          vals.push(orgId);
          vals.push(id);

          const r = await pool.query(
            `UPDATE tactics_fighter_subtopics
             SET ${sets.join(', ')}
             WHERE org_id = $${i++} AND id = $${i++}
             RETURNING id, topic_id, name, message, created_at, updated_at`,
            vals
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({
            ok: true,
            subtopic: {
              id: String(row.id),
              topicId: String(row.topic_id),
              name: String(row.name || ''),
              message: row.message == null ? '' : String(row.message)
            }
          });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Subtopic already exists" : "Rename failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(`DELETE FROM tactics_fighter_subtopics WHERE org_id = $1 AND id = $2`, [orgId, id]);
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          return res.status(500).json({ ok: false, error: "Delete failed" });
        }
      }
    );

  }
}

module.exports = { registerTacticsFighterPuzzlesBuilderSubtopicsRoutes };
export {};
