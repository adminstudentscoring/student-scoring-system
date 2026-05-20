// Shared helpers for Chess Works routes
"use strict";

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

function createChessWorksShared(deps: any) {
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
        (req?.body && Object.prototype.hasOwnProperty.call(req.body, "password")) ? String(req.body.password || "") :
        (req?.headers && req.headers["x-student-password"]) ? String(req.headers["x-student-password"]) :
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

  return {
    pool, hasDb, readData, authenticateUser, authorizeRole, requireOrganizationAccess,
    resolveOrgIdFromUser, requireDbReady, resolveOrgId, requirePublicStudent,
    listOrgStudents, isAssignedToStudent, nowIso, toCleanString, toInt, toIdString
  };
}

module.exports = { createChessWorksShared, ensureCwSchema, nowIso, toCleanString, toInt, toIdString };
export {};
