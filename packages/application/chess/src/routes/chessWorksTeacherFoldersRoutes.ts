// Chess Works teacher routes — folders
"use strict";

function registerChessWorksTeacherFoldersRoutes(app: any, shared: any): void {
  const {
    pool, requireDbReady, resolveOrgId, listOrgStudents, toCleanString, toIdString, nowIso,
    authenticateUser, authorizeRole, requireOrganizationAccess
  } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.get(
      "/api/teachers/chess-works/students",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const students = await listOrgStudents(orgId);
          return res.json({ ok: true, students });
        } catch (e) {
          console.error("[chess-works] list students error:", e);
          return res.status(500).json({ ok: false, error: "Failed to list students" });
        }
      }
    );

    // folders
    app.get(
      "/api/teachers/chess-works/folders",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(
            `SELECT id, name, sort_no, updated_at
             FROM chess_works_folders
             WHERE org_id = $1
             ORDER BY sort_no ASC, id ASC`,
            [String(orgId)]
          );
          const folders = (r.rows || []).map((x) => ({
            id: String(x.id),
            name: String(x.name || ""),
            sortNo: Number(x.sort_no || 0),
            updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
          }));
          return res.json({ ok: true, folders });
        } catch (e) {
          console.error("[chess-works] list folders error:", e);
          return res.status(500).json({ ok: false, error: "Failed to list folders" });
        }
      }
    );

    app.post(
      "/api/teachers/chess-works/folders",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const name = toCleanString(req.body?.name || "", 200);
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO chess_works_folders(org_id, name, created_by)
             VALUES ($1, $2, $3)
             RETURNING id, name, sort_no, created_at, updated_at`,
            [String(orgId), name, createdBy]
          );
          const row = r.rows?.[0];
          return res.json({
            ok: true,
            folder: {
              id: String(row.id),
              name: String(row.name || name),
              sortNo: Number(row.sort_no || 0),
              createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error("[chess-works] create folder error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to create folder", details: msg });
        }
      }
    );

    // delete folder (and all works inside)
    app.delete(
      "/api/teachers/chess-works/folders/:folderId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const folderId = toIdString(req.params.folderId || "");
          if (!folderId) return res.status(400).json({ ok: false, error: "Missing folderId" });

          await pool.query("BEGIN");
          const fR = await pool.query(
            `SELECT 1 AS ok FROM chess_works_folders WHERE org_id = $1 AND id = $2 LIMIT 1`,
            [String(orgId), Number(folderId)]
          );
          if (!fR.rows?.[0]) {
            await pool.query("ROLLBACK");
            return res.status(404).json({ ok: false, error: "Folder not found" });
          }

          const wR = await pool.query(
            `SELECT id FROM chess_works_works WHERE org_id = $1 AND folder_id = $2`,
            [String(orgId), Number(folderId)]
          );
          const workIds = (wR.rows || []).map((x) => Number(x.id)).filter(Number.isFinite);
          if (workIds.length) {
            await pool.query(
              `DELETE FROM chess_works_assignments WHERE org_id = $1 AND work_id = ANY($2::bigint[])`,
              [String(orgId), workIds]
            );
            await pool.query(
              `DELETE FROM chess_works_submissions WHERE org_id = $1 AND work_id = ANY($2::bigint[])`,
              [String(orgId), workIds]
            );
            await pool.query(
              `DELETE FROM chess_works_reviews WHERE org_id = $1 AND work_id = ANY($2::bigint[])`,
              [String(orgId), workIds]
            );
          }
          await pool.query(
            `DELETE FROM chess_works_works WHERE org_id = $1 AND folder_id = $2`,
            [String(orgId), Number(folderId)]
          );
          await pool.query(
            `DELETE FROM chess_works_folders WHERE org_id = $1 AND id = $2`,
            [String(orgId), Number(folderId)]
          );
          await pool.query("COMMIT");
          return res.json({ ok: true });
        } catch (e) {
          try { await pool.query("ROLLBACK"); } catch {}
          console.error("[chess-works] delete folder error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to delete folder", details: msg });
        }
      }
    );

  }
}

module.exports = { registerChessWorksTeacherFoldersRoutes };
export {};
