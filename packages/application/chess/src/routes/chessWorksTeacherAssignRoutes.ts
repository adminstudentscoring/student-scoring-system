// Chess Works teacher routes — assign
"use strict";

function registerChessWorksTeacherAssignRoutes(app: any, shared: any): void {
  const {
    pool, requireDbReady, resolveOrgId, listOrgStudents, toCleanString, toIdString, nowIso,
    authenticateUser, authorizeRole, requireOrganizationAccess
  } = shared;

  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    // assign
    app.post(
      "/api/teachers/chess-works/works/:workId/assign",
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
          const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(toIdString).filter(Boolean) : [];
          const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds.map(toIdString).filter(Boolean) : [];
          if (!studentIds.length && !groupIds.length) return res.status(400).json({ ok: false, error: "No assignees" });
          const assignedBy = req?.user?.id ? String(req.user.id) : null;

          const values = [];
          const params = [];
          let i = 0;
          const push = (type, id) => {
            i += 1;
            params.push(String(orgId), Number(workId), String(type), String(id), assignedBy);
            const base = (i - 1) * 5;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
          };
          studentIds.forEach((sid) => push("student", sid));
          groupIds.forEach((gid) => push("group", gid));
          await pool.query(
            `INSERT INTO chess_works_assignments(org_id, work_id, assigned_to_type, assigned_to_id, assigned_by)
             VALUES ${values.join(", ")}
             ON CONFLICT (org_id, work_id, assigned_to_type, assigned_to_id) DO NOTHING`,
            params
          );
          return res.json({ ok: true });
        } catch (e) {
          console.error("[chess-works] assign error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to assign", details: msg });
        }
      }
    );

    // groups
    app.get(
      "/api/teachers/chess-works/groups",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(
            `SELECT g.id, g.name, g.updated_at,
                    COALESCE(json_agg(m.student_id) FILTER (WHERE m.student_id IS NOT NULL), '[]') AS members
             FROM chess_works_groups g
             LEFT JOIN chess_works_group_members m
               ON m.org_id = g.org_id AND m.group_id = g.id
             WHERE g.org_id = $1
             GROUP BY g.id
             ORDER BY g.updated_at DESC, g.id DESC`,
            [String(orgId)]
          );
          const groups = (r.rows || []).map((x) => ({
            id: String(x.id),
            name: String(x.name || ""),
            members: Array.isArray(x.members) ? x.members.map(toIdString).filter(Boolean) : [],
            updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
          }));
          return res.json({ ok: true, groups });
        } catch (e) {
          console.error("[chess-works] list groups error:", e);
          return res.status(500).json({ ok: false, error: "Failed to list groups" });
        }
      }
    );

    app.post(
      "/api/teachers/chess-works/groups",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const name = toCleanString(req.body?.name || "", 120);
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO chess_works_groups(org_id, name, created_by)
             VALUES ($1, $2, $3)
             RETURNING id, name, created_at, updated_at`,
            [String(orgId), name, createdBy]
          );
          const row = r.rows?.[0];
          return res.json({ ok: true, group: { id: String(row.id), name: String(row.name || name) } });
        } catch (e) {
          console.error("[chess-works] create group error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to create group", details: msg });
        }
      }
    );

    app.post(
      "/api/teachers/chess-works/groups/:groupId/members",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const groupId = toIdString(req.params.groupId || "");
          if (!groupId) return res.status(400).json({ ok: false, error: "Missing groupId" });
          const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(toIdString).filter(Boolean) : [];
          if (!studentIds.length) return res.status(400).json({ ok: false, error: "No studentIds" });
          const values = [];
          const params = [];
          let i = 0;
          studentIds.forEach((sid) => {
            i += 1;
            params.push(String(orgId), Number(groupId), String(sid));
            const base = (i - 1) * 3;
            values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
          });
          await pool.query(
            `INSERT INTO chess_works_group_members(org_id, group_id, student_id)
             VALUES ${values.join(", ")}
             ON CONFLICT (org_id, group_id, student_id) DO NOTHING`,
            params
          );
          await pool.query(`UPDATE chess_works_groups SET updated_at = NOW() WHERE org_id = $1 AND id = $2`, [String(orgId), Number(groupId)]);
          return res.json({ ok: true });
        } catch (e) {
          console.error("[chess-works] add group members error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to add members", details: msg });
        }
      }
    );

    app.delete(
      "/api/teachers/chess-works/groups/:groupId/members/:studentId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const groupId = toIdString(req.params.groupId || "");
          const studentId = toIdString(req.params.studentId || "");
          if (!groupId || !studentId) return res.status(400).json({ ok: false, error: "Missing ids" });
          await pool.query(
            `DELETE FROM chess_works_group_members WHERE org_id = $1 AND group_id = $2 AND student_id = $3`,
            [String(orgId), Number(groupId), String(studentId)]
          );
          await pool.query(`UPDATE chess_works_groups SET updated_at = NOW() WHERE org_id = $1 AND id = $2`, [String(orgId), Number(groupId)]);
          return res.json({ ok: true });
        } catch (e) {
          console.error("[chess-works] remove group member error:", e);
          return res.status(500).json({ ok: false, error: "Failed to remove member" });
        }
      }
    );

  }
}

module.exports = { registerChessWorksTeacherAssignRoutes };
export {};
