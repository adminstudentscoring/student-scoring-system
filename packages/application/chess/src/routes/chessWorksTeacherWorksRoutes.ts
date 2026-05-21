// Chess Works teacher routes — works
"use strict";

function registerChessWorksTeacherWorksRoutes(app: any, shared: any): void {
  const {
    pool, requireDbReady, resolveOrgId, listOrgStudents, toCleanString, toIdString, nowIso,
    authenticateUser, authorizeRole, requireOrganizationAccess
  } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    // works list
    app.get(
      "/api/teachers/chess-works/works",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const hasFolderParam = !!(req.query && Object.prototype.hasOwnProperty.call(req.query, "folderId"));
          const folderIdRaw = hasFolderParam ? String(req.query.folderId ?? "").trim() : "";
          const folderId = folderIdRaw ? Number(folderIdRaw) : null;
          const params = [String(orgId)];
          let where = `org_id = $1`;
          if (hasFolderParam) {
            if (!folderIdRaw) {
              // Unfiled: folder_id IS NULL
              where += ` AND folder_id IS NULL`;
            } else {
              params.push(String(folderId));
              where += ` AND folder_id = $2`;
            }
          }
          const r = await pool.query(
            `SELECT id, folder_id, title, updated_at
             FROM chess_works_works
             WHERE ${where}
             ORDER BY updated_at DESC, id DESC`,
            params
          );
          const works = (r.rows || []).map((x) => ({
            id: String(x.id),
            folderId: x.folder_id == null ? "" : String(x.folder_id),
            title: String(x.title || ""),
            updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
          }));
          return res.json({ ok: true, works });
        } catch (e) {
          console.error("[chess-works] list works error:", e);
          return res.status(500).json({ ok: false, error: "Failed to list works" });
        }
      }
    );

    app.post(
      "/api/teachers/chess-works/works",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const title = toCleanString(req.body?.title || "", 200);
          const folderIdRaw = toIdString(req.body?.folderId || "");
          const folderId = folderIdRaw ? Number(folderIdRaw) : null;
          const items = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO chess_works_works(org_id, folder_id, title, items, created_by)
             VALUES ($1, $2, $3, $4::jsonb, $5)
             RETURNING id, folder_id, title, items, created_at, updated_at`,
            [String(orgId), folderId, title, JSON.stringify(items), createdBy]
          );
          const row = r.rows?.[0];
          return res.json({
            ok: true,
            work: {
              id: String(row.id),
              folderId: row.folder_id == null ? "" : String(row.folder_id),
              title: String(row.title || title),
              items: row.items && typeof row.items === "object" ? row.items : [],
              createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error("[chess-works] create work error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to create work", details: msg });
        }
      }
    );

    app.get(
      "/api/teachers/chess-works/works/:workId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
          const r = await pool.query(
            `SELECT id, folder_id, title, items, created_at, updated_at
             FROM chess_works_works
             WHERE org_id = $1 AND id = $2
             LIMIT 1`,
            [String(orgId), Number(workId)]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Work not found" });
          return res.json({
            ok: true,
            work: {
              id: String(row.id),
              folderId: row.folder_id == null ? "" : String(row.folder_id),
              title: String(row.title || ""),
              items: row.items && typeof row.items === "object" ? row.items : [],
              createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
            }
          });
        } catch (e) {
          console.error("[chess-works] get work error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load work" });
        }
      }
    );

    app.patch(
      "/api/teachers/chess-works/works/:workId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
          const title = (req.body && Object.prototype.hasOwnProperty.call(req.body, "title")) ? toCleanString(req.body.title || "", 200) : null;
          const folderIdRaw = (req.body && Object.prototype.hasOwnProperty.call(req.body, "folderId")) ? toIdString(req.body.folderId || "") : null;
          const folderId = folderIdRaw == null ? null : (folderIdRaw ? Number(folderIdRaw) : null);
          const items = (req.body && Object.prototype.hasOwnProperty.call(req.body, "items")) ? (Array.isArray(req.body.items) ? req.body.items : []) : null;

          const r = await pool.query(
            `UPDATE chess_works_works
             SET
               title = COALESCE($3, title),
               folder_id = CASE WHEN $4::text IS NULL THEN folder_id ELSE $5 END,
               items = COALESCE($6::jsonb, items),
               updated_at = NOW()
             WHERE org_id = $1 AND id = $2
             RETURNING id, folder_id, title, items, updated_at`,
            [String(orgId), Number(workId), title, folderIdRaw, folderId, items ? JSON.stringify(items) : null]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Work not found" });
          return res.json({
            ok: true,
            work: {
              id: String(row.id),
              folderId: row.folder_id == null ? "" : String(row.folder_id),
              title: String(row.title || ""),
              items: row.items && typeof row.items === "object" ? row.items : [],
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error("[chess-works] update work error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to update work", details: msg });
        }
      }
    );

    // delete work
    app.delete(
      "/api/teachers/chess-works/works/:workId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });

          await pool.query("BEGIN");
          const eR = await pool.query(
            `SELECT 1 AS ok FROM chess_works_works WHERE org_id = $1 AND id = $2 LIMIT 1`,
            [String(orgId), Number(workId)]
          );
          if (!eR.rows?.[0]) {
            await pool.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "Work not found" });
          }
          await pool.query(
            `DELETE FROM chess_works_assignments WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          await pool.query(
            `DELETE FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          await pool.query(
            `DELETE FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          await pool.query(
            `DELETE FROM chess_works_works WHERE org_id = $1 AND id = $2`,
            [String(orgId), Number(workId)]
          );
          await pool.query("COMMIT");
          return res.json({ ok: true });
        } catch (e) {
          try { await pool.query("ROLLBACK"); } catch {}
          console.error("[chess-works] delete work error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to delete work", details: msg });
        }
      }
    );

  }
}

module.exports = { registerChessWorksTeacherWorksRoutes };
export {};
