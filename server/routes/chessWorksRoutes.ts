// Chess Works routes (folders + works + assignments + groups + submissions + reviews)
"use strict";
import type { Request, Response } from 'express';

function nowIso() {
  return new Date().toISOString();
}

function toCleanString(v, maxLen = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toInt(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function toIdString(v) {
  return String(v ?? "").trim();
}

async function ensureCwSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_folders (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      sort_no INT NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_folders_org_idx ON chess_works_folders(org_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_works (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      folder_id BIGINT,
      title TEXT NOT NULL DEFAULT '',
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_works_org_idx ON chess_works_works(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_works_org_folder_idx ON chess_works_works(org_id, folder_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_groups (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_groups_org_idx ON chess_works_groups(org_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_group_members (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      group_id BIGINT NOT NULL,
      student_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, group_id, student_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_group_members_org_idx ON chess_works_group_members(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_group_members_group_idx ON chess_works_group_members(group_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_group_members_student_idx ON chess_works_group_members(student_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_assignments (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      work_id BIGINT NOT NULL,
      assigned_to_type TEXT NOT NULL,
      assigned_to_id TEXT NOT NULL,
      assigned_by TEXT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, work_id, assigned_to_type, assigned_to_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_assignments_org_idx ON chess_works_assignments(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_assignments_work_idx ON chess_works_assignments(work_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_assignments_to_idx ON chess_works_assignments(assigned_to_type, assigned_to_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_submissions (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      work_id BIGINT NOT NULL,
      student_id TEXT NOT NULL,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, work_id, student_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_submissions_org_idx ON chess_works_submissions(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_submissions_work_student_idx ON chess_works_submissions(work_id, student_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_works_reviews (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      work_id BIGINT NOT NULL,
      student_id TEXT NOT NULL,
      marks JSONB NOT NULL DEFAULT '[]'::jsonb,
      finished BOOLEAN NOT NULL DEFAULT FALSE,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, work_id, student_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_reviews_org_idx ON chess_works_reviews(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_works_reviews_work_student_idx ON chess_works_reviews(work_id, student_id);`);
}

function registerChessWorksRoutes(app: any, deps: any): void {
  if (!app) throw new Error("registerChessWorksRoutes: missing app");
  const appDb = deps?.appDb;
  const readData = deps?.readData;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;

  const pool = appDb?.getPool?.();
  const hasDb = !!pool;

  async function requireDbReady(res) {
    if (!hasDb) {
      res.status(501).json({ ok: false, error: "Postgres not configured" });
      return false;
    }
    try {
      await pool.query("SELECT 1 AS ok", []);
      await ensureCwSchema(pool);
      return true;
    } catch (e) {
      console.error("[chess-works] ensure schema failed:", e);
      const msg = String(e?.message || e);
      const isConn = /ECONNREFUSED|ENOTFOUND|timeout|terminating connection|connection/i.test(msg);
      res.status(isConn ? 503 : 500).json({
        ok: false,
        error: isConn ? "Postgres connection failed" : "DB schema not ready",
        details: msg
      });
      return false;
    }
  }

  async function resolveOrgId(req) {
    if (!resolveOrgIdFromUser) return null;
    return await Promise.resolve(resolveOrgIdFromUser(req.user)).catch(() => null);
  }

  async function requirePublicStudent(req, res) {
    if (typeof readData !== "function") {
      res.status(500).json({ ok: false, error: "Server not configured (readData missing)" });
      return null;
    }
    const studentId = String(req?.params?.id || "").trim();
    const password =
      (req?.query && Object.prototype.hasOwnProperty.call(req.query, "password")) ? String(req.query.password || "") :
      (req?.body && Object.prototype.hasOwnProperty.call(req.body, "password")) ? String(req.body.password || "") :
      "";

    const data = await readData().catch(() => null);
    const students = Array.isArray(data?.students) ? data.students : [];
    const student = students.find((s) => String(s?.id || "") === studentId);
    if (!student) {
      res.status(404).json({ ok: false, error: "Student not found" });
      return null;
    }
    if (student.accessPassword) {
      if (!password || password !== student.accessPassword) {
        res.status(401).json({ ok: false, error: "Invalid password" });
        return null;
      }
    }
    const orgId = String(student.organizationId || "").trim();
    if (!orgId) {
      res.status(403).json({ ok: false, error: "Student not associated with organization" });
      return null;
    }
    return { studentId: String(student.id), orgId, student };
  }

  async function listOrgStudents(orgId) {
    if (typeof readData !== "function") return [];
    const data = await readData().catch(() => null);
    const students = Array.isArray(data?.students) ? data.students : [];
    return students
      .filter((s) => String(s?.organizationId || "").trim() === String(orgId))
      .map((s) => ({ id: String(s.id), name: String(s.name || ""), chessComId: String(s.chessComId || "") }));
  }

  async function isAssignedToStudent({ orgId, workId, studentId }) {
    // direct assignment
    const a1 = await pool.query(
      `SELECT 1 AS ok
       FROM chess_works_assignments
       WHERE org_id = $1 AND work_id = $2 AND assigned_to_type = 'student' AND assigned_to_id = $3
       LIMIT 1`,
      [String(orgId), Number(workId), String(studentId)]
    );
    if (a1.rows?.[0]) return true;

    // group assignment
    const a2 = await pool.query(
      `SELECT 1 AS ok
       FROM chess_works_assignments a
       JOIN chess_works_group_members m
         ON m.org_id = a.org_id AND m.group_id = CAST(a.assigned_to_id AS BIGINT)
       WHERE a.org_id = $1 AND a.work_id = $2 AND a.assigned_to_type = 'group' AND m.student_id = $3
       LIMIT 1`,
      [String(orgId), Number(workId), String(studentId)]
    );
    return !!a2.rows?.[0];
  }

  // ===== Teacher APIs =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    // students list (for assign/group management UI)
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
              params.push(folderId);
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

    // per-work students status (assigned students + submission/review)
    app.get(
      "/api/teachers/chess-works/works/:workId/students",
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

          const students = await listOrgStudents(orgId);
          const groupsR = await pool.query(
            `SELECT a.assigned_to_type, a.assigned_to_id
             FROM chess_works_assignments a
             WHERE a.org_id = $1 AND a.work_id = $2`,
            [String(orgId), Number(workId)]
          );
          const direct = new Set();
          const groupIds = new Set();
          for (const row of (groupsR.rows || [])) {
            const t = String(row.assigned_to_type || "");
            const id = String(row.assigned_to_id || "");
            if (t === "student") direct.add(id);
            if (t === "group") groupIds.add(id);
          }
          let members = new Set();
          if (groupIds.size) {
            const gids = Array.from(groupIds).map((x) => Number(x)).filter(Number.isFinite);
            if (gids.length) {
              const mR = await pool.query(
                `SELECT student_id FROM chess_works_group_members WHERE org_id = $1 AND group_id = ANY($2::bigint[])`,
                [String(orgId), gids]
              );
              for (const r0 of (mR.rows || [])) members.add(String(r0.student_id || ""));
            }
          }
          const assigned = new Set([...direct, ...members].map(String));

          const subR = await pool.query(
            `SELECT student_id, updated_at FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          const subMap = new Map((subR.rows || []).map((x) => [String(x.student_id || ""), x.updated_at ? new Date(x.updated_at).toISOString() : null]));

          const revR = await pool.query(
            `SELECT student_id, finished, updated_at FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2`,
            [String(orgId), Number(workId)]
          );
          const revMap = new Map((revR.rows || []).map((x) => [String(x.student_id || ""), { finished: !!x.finished, updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : null }]));

          const out = students
            .filter((s) => assigned.has(String(s.id)))
            .map((s) => ({
              id: String(s.id),
              name: String(s.name || ""),
              hasSubmission: subMap.has(String(s.id)),
              submissionUpdatedAt: subMap.get(String(s.id)) || null,
              review: revMap.get(String(s.id)) || { finished: false, updatedAt: null }
            }));

          return res.json({ ok: true, students: out });
        } catch (e) {
          console.error("[chess-works] work students error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load students for work" });
        }
      }
    );

    // teacher: get a student's submission + review marks
    app.get(
      "/api/teachers/chess-works/works/:workId/submissions/:studentId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          const studentId = toIdString(req.params.studentId || "");
          if (!workId || !studentId) return res.status(400).json({ ok: false, error: "Missing ids" });

          const sR = await pool.query(
            `SELECT answers, updated_at FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
            [String(orgId), Number(workId), String(studentId)]
          );
          const sub = sR.rows?.[0] || null;
          const rR = await pool.query(
            `SELECT marks, finished, reviewed_at, updated_at
             FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
            [String(orgId), Number(workId), String(studentId)]
          );
          const rev = rR.rows?.[0] || null;
          return res.json({
            ok: true,
            submission: sub ? { answers: sub.answers && typeof sub.answers === "object" ? sub.answers : {}, updatedAt: sub.updated_at ? new Date(sub.updated_at).toISOString() : null } : null,
            review: rev ? { marks: rev.marks && typeof rev.marks === "object" ? rev.marks : [], finished: !!rev.finished, reviewedAt: rev.reviewed_at ? new Date(rev.reviewed_at).toISOString() : null } : null
          });
        } catch (e) {
          console.error("[chess-works] get submission error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load submission" });
        }
      }
    );

    // teacher: upsert review
    app.patch(
      "/api/teachers/chess-works/works/:workId/reviews/:studentId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const workId = toIdString(req.params.workId || "");
          const studentId = toIdString(req.params.studentId || "");
          if (!workId || !studentId) return res.status(400).json({ ok: false, error: "Missing ids" });
          const marks = Array.isArray(req.body?.marks) ? req.body.marks : [];
          const finished = !!req.body?.finished;
          const reviewedBy = req?.user?.id ? String(req.user.id) : null;
          const marksJson = (() => {
            try { return JSON.stringify(marks); } catch { return "[]"; }
          })();
          await pool.query(
            `INSERT INTO chess_works_reviews(org_id, work_id, student_id, marks, finished, reviewed_by, reviewed_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, CASE WHEN $5 THEN NOW() ELSE NULL END, NOW())
             ON CONFLICT (org_id, work_id, student_id)
             DO UPDATE SET
               marks = EXCLUDED.marks,
               finished = EXCLUDED.finished,
               reviewed_by = EXCLUDED.reviewed_by,
               reviewed_at = CASE WHEN EXCLUDED.finished THEN NOW() ELSE chess_works_reviews.reviewed_at END,
               updated_at = NOW()`,
            [String(orgId), Number(workId), String(studentId), marksJson, finished, reviewedBy]
          );
          return res.json({ ok: true });
        } catch (e) {
          console.error("[chess-works] save review error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to save review", details: msg });
        }
      }
    );
  }

  // ===== Public student APIs =====
  app.get("/api/public/students/:id/chess-works/works", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const r = await pool.query(
        `SELECT w.id, w.title, w.updated_at
         FROM chess_works_works w
         WHERE w.org_id = $1
           AND (
             EXISTS (
               SELECT 1 FROM chess_works_assignments a
               WHERE a.org_id = w.org_id AND a.work_id = w.id
                 AND a.assigned_to_type = 'student' AND a.assigned_to_id = $2
             )
             OR EXISTS (
               SELECT 1 FROM chess_works_assignments a
               JOIN chess_works_group_members m
                 ON m.org_id = a.org_id AND m.group_id = CAST(a.assigned_to_id AS BIGINT)
               WHERE a.org_id = w.org_id AND a.work_id = w.id
                 AND a.assigned_to_type = 'group' AND m.student_id = $2
             )
           )
         ORDER BY w.updated_at DESC, w.id DESC`,
        [String(auth.orgId), String(auth.studentId)]
      );
      // Hide works already finished-reviewed in history
      const revR = await pool.query(
        `SELECT work_id FROM chess_works_reviews WHERE org_id = $1 AND student_id = $2 AND finished = TRUE`,
        [String(auth.orgId), String(auth.studentId)]
      );
      const done = new Set((revR.rows || []).map((x) => String(x.work_id)));
      const works = (r.rows || [])
        .map((x) => ({
          id: String(x.id),
          title: String(x.title || ""),
          updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
        }))
        .filter((w) => !done.has(String(w.id)));
      return res.json({ ok: true, works });
    } catch (e) {
      console.error("[chess-works] student list works error:", e);
      return res.status(500).json({ ok: false, error: "Failed to list works" });
    }
  });

  app.get("/api/public/students/:id/chess-works/works/:workId", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const workId = toIdString(req.params.workId || "");
      if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
      const assigned = await isAssignedToStudent({ orgId: auth.orgId, workId, studentId: auth.studentId });
      if (!assigned) return res.status(403).json({ ok: false, error: "Not assigned" });
      const r = await pool.query(
        `SELECT id, title, items, updated_at FROM chess_works_works WHERE org_id = $1 AND id = $2 LIMIT 1`,
        [String(auth.orgId), Number(workId)]
      );
      const row = r.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Work not found" });
      return res.json({
        ok: true,
        work: {
          id: String(row.id),
          title: String(row.title || ""),
          items: row.items && typeof row.items === "object" ? row.items : [],
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
        }
      });
    } catch (e) {
      console.error("[chess-works] student get work error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load work" });
    }
  });

  // student save submission (draft)
  app.patch("/api/public/students/:id/chess-works/works/:workId/submission", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const workId = toIdString(req.params.workId || "");
      if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
      const assigned = await isAssignedToStudent({ orgId: auth.orgId, workId, studentId: auth.studentId });
      if (!assigned) return res.status(403).json({ ok: false, error: "Not assigned" });
      const answers = (req.body && typeof req.body.answers === "object" && req.body.answers) ? req.body.answers : {};
      await pool.query(
        `INSERT INTO chess_works_submissions(org_id, work_id, student_id, answers, started_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (org_id, work_id, student_id)
         DO UPDATE SET answers = EXCLUDED.answers, updated_at = NOW()`,
        [String(auth.orgId), Number(workId), String(auth.studentId), answers]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("[chess-works] student save submission error:", e);
      const msg = toCleanString(e?.message || e);
      return res.status(500).json({ ok: false, error: "Failed to save", details: msg });
    }
  });

  // student get submission (draft) + review status (if any)
  app.get("/api/public/students/:id/chess-works/works/:workId/submission", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const workId = toIdString(req.params.workId || "");
      if (!workId) return res.status(400).json({ ok: false, error: "Missing workId" });
      const assigned = await isAssignedToStudent({ orgId: auth.orgId, workId, studentId: auth.studentId });
      if (!assigned) return res.status(403).json({ ok: false, error: "Not assigned" });
      const sR = await pool.query(
        `SELECT answers, updated_at FROM chess_works_submissions WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
        [String(auth.orgId), Number(workId), String(auth.studentId)]
      );
      const sub = sR.rows?.[0] || null;
      const rR = await pool.query(
        `SELECT marks, finished, reviewed_at FROM chess_works_reviews WHERE org_id = $1 AND work_id = $2 AND student_id = $3 LIMIT 1`,
        [String(auth.orgId), Number(workId), String(auth.studentId)]
      );
      const rev = rR.rows?.[0] || null;
      return res.json({
        ok: true,
        submission: sub ? { answers: sub.answers && typeof sub.answers === "object" ? sub.answers : {}, updatedAt: sub.updated_at ? new Date(sub.updated_at).toISOString() : null } : null,
        review: rev ? { marks: rev.marks && typeof rev.marks === "object" ? rev.marks : [], finished: !!rev.finished, reviewedAt: rev.reviewed_at ? new Date(rev.reviewed_at).toISOString() : null } : null
      });
    } catch (e) {
      console.error("[chess-works] student get submission error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load submission" });
    }
  });

  // student history
  app.get("/api/public/students/:id/chess-works/history", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const r = await pool.query(
        `SELECT r.work_id, r.marks, r.reviewed_at, w.title
         FROM chess_works_reviews r
         JOIN chess_works_works w ON w.org_id = r.org_id AND w.id = r.work_id
         WHERE r.org_id = $1 AND r.student_id = $2 AND r.finished = TRUE
         ORDER BY r.reviewed_at DESC NULLS LAST, r.updated_at DESC`,
        [String(auth.orgId), String(auth.studentId)]
      );
      const items = (r.rows || []).map((x) => ({
        workId: String(x.work_id),
        title: String(x.title || ""),
        marks: x.marks && typeof x.marks === "object" ? x.marks : [],
        reviewedAt: x.reviewed_at ? new Date(x.reviewed_at).toISOString() : null
      }));
      return res.json({ ok: true, items });
    } catch (e) {
      console.error("[chess-works] student history error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load history" });
    }
  });
}

module.exports = { registerChessWorksRoutes };

