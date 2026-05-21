// Tactics Fighter builder routes — topics
"use strict";

function registerTacticsFighterPuzzlesBuilderTopicsRoutes(app: any, deps: any, shared: any): void {
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;
  const { toCleanString, toRangeInt, parseUci, normalizeScore, nowIso, parseFenSideToMove,
    getTfSettings, requireDbReady, requirePublicStudent, normalizeBucket, resolveOrgId, pool, hasDb } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    // Topics
    app.post(
      "/api/teachers/tactics-fighter/builder/categories/:categoryId/topics",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const categoryId = String(req.params.categoryId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!categoryId) return res.status(400).json({ ok: false, error: "Missing categoryId" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO tactics_fighter_topics(org_id, category_id, name, created_by)
             SELECT $1, c.id, $3, $4
             FROM tactics_fighter_categories c
             WHERE c.org_id = $1 AND c.id = $2
             RETURNING id, category_id, name, created_at, updated_at`,
            [orgId, categoryId, name, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Category not found" });
          return res.json({ ok: true, topic: { id: String(row.id), categoryId: String(row.category_id), name: String(row.name) } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Topic already exists" : "Create topic failed" });
        }
      }
    );

    app.patch(
      "/api/teachers/tactics-fighter/builder/topics/:topicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.topicId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const r = await pool.query(
            `UPDATE tactics_fighter_topics
             SET name = $1, updated_at = NOW()
             WHERE org_id = $2 AND id = $3
             RETURNING id, category_id, name, created_at, updated_at`,
            [name, orgId, id]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({ ok: true, topic: { id: String(row.id), categoryId: String(row.category_id), name: String(row.name) } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Topic already exists" : "Rename failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/topics/:topicId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.topicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(`DELETE FROM tactics_fighter_topics WHERE org_id = $1 AND id = $2`, [orgId, id]);
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          return res.status(500).json({ ok: false, error: "Delete failed" });
        }
      }
    );

  }
}

module.exports = { registerTacticsFighterPuzzlesBuilderTopicsRoutes };
export {};
