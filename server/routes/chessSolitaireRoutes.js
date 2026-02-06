// Chess Solitaire routes (Stage library)
"use strict";

function nowIso() {
  return new Date().toISOString();
}

function toCleanString(v, maxLen = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeDifficulty(d) {
  const s = String(d || "").trim().toLowerCase();
  const ok = new Set(["easy", "medium", "hard", "extremelyhard", "master"]);
  const canon =
    s === "extremely hard" || s === "extremely_hard" || s === "extremely-hard" ? "extremelyhard" : s;
  return ok.has(canon) ? canon : "easy";
}

async function ensureCsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_solitaire_stages (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'easy',
      stage_no INT NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, difficulty, stage_no)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_solitaire_stages_org_idx ON chess_solitaire_stages(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS chess_solitaire_stages_org_diff_idx ON chess_solitaire_stages(org_id, difficulty);`);
}

function registerChessSolitaireRoutes(app, deps) {
  if (!app) throw new Error("registerChessSolitaireRoutes: missing app");
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
      await ensureCsSchema(pool);
      return true;
    } catch (e) {
      console.error("[chess-solitaire] ensure schema failed:", e);
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

  // ===== Teacher: Stages (org scoped) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.get(
      "/api/teachers/chess-solitaire/stages",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const difficulty = normalizeDifficulty(req.query?.difficulty || "easy");
          const r = await pool.query(
            `SELECT id, stage_no, updated_at
             FROM chess_solitaire_stages
             WHERE org_id = $1 AND difficulty = $2
             ORDER BY stage_no ASC`,
            [String(orgId), difficulty]
          );
          const stages = (r.rows || []).map((x) => ({
            id: String(x.id),
            stageNo: Number(x.stage_no),
            updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
          }));
          return res.json({ ok: true, difficulty, stages });
        } catch (e) {
          console.error("[chess-solitaire] list stages error:", e);
          return res.status(500).json({ ok: false, error: "Failed to list stages" });
        }
      }
    );

    app.get(
      "/api/teachers/chess-solitaire/stages/:stageId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const stageId = String(req.params.stageId || "").trim();
          if (!stageId) return res.status(400).json({ ok: false, error: "Missing stageId" });
          const r = await pool.query(
            `SELECT id, difficulty, stage_no, config, created_at, updated_at
             FROM chess_solitaire_stages
             WHERE org_id = $1 AND id = $2
             LIMIT 1`,
            [String(orgId), String(stageId)]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Stage not found" });
          return res.json({
            ok: true,
            stage: {
              id: String(row.id),
              difficulty: String(row.difficulty || "easy"),
              stageNo: Number(row.stage_no),
              config: row.config && typeof row.config === "object" ? row.config : {},
              createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
            }
          });
        } catch (e) {
          console.error("[chess-solitaire] get stage error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load stage" });
        }
      }
    );

    app.post(
      "/api/teachers/chess-solitaire/stages",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const difficulty = normalizeDifficulty(req.body?.difficulty || "easy");
          const config = (req.body && typeof req.body.config === "object" && req.body.config) ? req.body.config : {};
          const createdBy = req?.user?.id ? String(req.user.id) : null;

          const maxR = await pool.query(
            `SELECT COALESCE(MAX(stage_no), 0) AS mx
             FROM chess_solitaire_stages
             WHERE org_id = $1 AND difficulty = $2`,
            [String(orgId), difficulty]
          );
          const nextNo = Number(maxR.rows?.[0]?.mx || 0) + 1;

          const r = await pool.query(
            `INSERT INTO chess_solitaire_stages(org_id, difficulty, stage_no, config, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, difficulty, stage_no, created_at, updated_at`,
            [String(orgId), difficulty, nextNo, config, createdBy]
          );
          const row = r.rows?.[0];
          return res.json({
            ok: true,
            stage: {
              id: String(row.id),
              difficulty: String(row.difficulty || difficulty),
              stageNo: Number(row.stage_no),
              createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error("[chess-solitaire] create stage error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to create stage", details: msg });
        }
      }
    );

    app.patch(
      "/api/teachers/chess-solitaire/stages/:stageId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const stageId = String(req.params.stageId || "").trim();
          if (!stageId) return res.status(400).json({ ok: false, error: "Missing stageId" });
          const config = (req.body && typeof req.body.config === "object" && req.body.config) ? req.body.config : null;
          if (!config) return res.status(400).json({ ok: false, error: "Missing config" });

          const r = await pool.query(
            `UPDATE chess_solitaire_stages
             SET config = $3, updated_at = NOW()
             WHERE org_id = $1 AND id = $2
             RETURNING id, difficulty, stage_no, updated_at`,
            [String(orgId), String(stageId), config]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Stage not found" });
          return res.json({
            ok: true,
            stage: {
              id: String(row.id),
              difficulty: String(row.difficulty || "easy"),
              stageNo: Number(row.stage_no),
              updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso()
            }
          });
        } catch (e) {
          console.error("[chess-solitaire] update stage error:", e);
          const msg = toCleanString(e?.message || e);
          return res.status(500).json({ ok: false, error: "Failed to update stage", details: msg });
        }
      }
    );
  }

  // ===== Public student: Stages (org scoped via student org) =====
  app.get("/api/public/students/:id/chess-solitaire/stages", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const difficulty = normalizeDifficulty(req.query?.difficulty || "easy");
      const r = await pool.query(
        `SELECT id, stage_no, updated_at
         FROM chess_solitaire_stages
         WHERE org_id = $1 AND difficulty = $2
         ORDER BY stage_no ASC`,
        [String(auth.orgId), difficulty]
      );
      const stages = (r.rows || []).map((x) => ({
        id: String(x.id),
        stageNo: Number(x.stage_no),
        updatedAt: x.updated_at ? new Date(x.updated_at).toISOString() : nowIso()
      }));
      return res.json({ ok: true, difficulty, stages });
    } catch (e) {
      console.error("[chess-solitaire] public list stages error:", e);
      return res.status(500).json({ ok: false, error: "Failed to list stages" });
    }
  });

  app.get("/api/public/students/:id/chess-solitaire/stages/:stageId", async (req, res) => {
    if (!(await requireDbReady(res))) return;
    const auth = await requirePublicStudent(req, res);
    if (!auth) return;
    try {
      const stageId = String(req.params.stageId || "").trim();
      if (!stageId) return res.status(400).json({ ok: false, error: "Missing stageId" });
      const r = await pool.query(
        `SELECT id, difficulty, stage_no, config, created_at, updated_at
         FROM chess_solitaire_stages
         WHERE org_id = $1 AND id = $2
         LIMIT 1`,
        [String(auth.orgId), String(stageId)]
      );
      const row = r.rows?.[0];
      if (!row) return res.status(404).json({ ok: false, error: "Stage not found" });
      return res.json({
        ok: true,
        stage: {
          id: String(row.id),
          difficulty: String(row.difficulty || "easy"),
          stageNo: Number(row.stage_no),
          config: row.config && typeof row.config === "object" ? row.config : {},
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
          updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
        }
      });
    } catch (e) {
      console.error("[chess-solitaire] public get stage error:", e);
      return res.status(500).json({ ok: false, error: "Failed to load stage" });
    }
  });
}

module.exports = { registerChessSolitaireRoutes };

