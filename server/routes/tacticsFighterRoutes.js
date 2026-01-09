// Tactics Fighter routes (Builder + Engine + attempts)
"use strict";

function safeJsonParse(s) {
  try { return JSON.parse(String(s || '')); } catch { return null; }
}

function nowIso() {
  return new Date().toISOString();
}

function toCleanString(v, maxLen = 5000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toInt(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function toRangeInt(v, min, max, dflt) {
  const n = toInt(v, dflt);
  return Math.max(min, Math.min(max, n));
}

async function ensureParentDir(fsPromises, path, filePath) {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  } catch {}
}

function parseUci(uci) {
  const s = String(uci || '').trim().toLowerCase();
  const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!m) return null;
  return { from: m[1], to: m[2], promotion: m[3] || undefined };
}

function normalizeScore(score) {
  if (!score || typeof score !== 'object') return { cp: 0 };
  if (Object.prototype.hasOwnProperty.call(score, 'mate')) return { mate: Number(score.mate) || 0 };
  return { cp: Number(score.cp) || 0 };
}

function parseFenSideToMove(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  const side = parts[1] ? String(parts[1]).trim() : '';
  return (side === 'w' || side === 'b') ? side : null;
}

async function ensureTfSchema(pool) {
  // Idempotent schema create for safety (still recommend DB migrations).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_categories (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      bucket TEXT NOT NULL DEFAULT 'beginner',
      name TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_id, name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_categories_org_idx ON tactics_fighter_categories(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_categories_org_bucket_idx ON tactics_fighter_categories(org_id, bucket);`);
  // Migrate uniqueness to (org_id, bucket, name) if the older constraint exists.
  try { await pool.query(`ALTER TABLE tactics_fighter_categories ADD COLUMN IF NOT EXISTS bucket TEXT NOT NULL DEFAULT 'beginner';`); } catch {}
  try { await pool.query(`ALTER TABLE tactics_fighter_categories DROP CONSTRAINT IF EXISTS tactics_fighter_categories_org_id_name_key;`); } catch {}
  try { await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS tactics_fighter_categories_org_bucket_name_uq ON tactics_fighter_categories(org_id, bucket, name);`); } catch {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_topics (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      category_id BIGINT NOT NULL REFERENCES tactics_fighter_categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (category_id, name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_topics_org_idx ON tactics_fighter_topics(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_topics_category_idx ON tactics_fighter_topics(category_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_subtopics (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      topic_id BIGINT NOT NULL REFERENCES tactics_fighter_topics(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (topic_id, name)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_subtopics_org_idx ON tactics_fighter_subtopics(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_subtopics_topic_idx ON tactics_fighter_subtopics(topic_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_puzzles (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      subtopic_id BIGINT NOT NULL REFERENCES tactics_fighter_subtopics(id) ON DELETE CASCADE,
      fen TEXT NOT NULL,
      side_to_move CHAR(1),
      engine_depth INT,
      multipv INT,
      pv_plies INT,
      solutions JSONB,
      meta JSONB,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_puzzles_org_idx ON tactics_fighter_puzzles(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_puzzles_subtopic_idx ON tactics_fighter_puzzles(subtopic_id);`);
}

function registerTacticsFighterRoutes(app, deps) {
  if (!app) throw new Error("registerTacticsFighterRoutes: missing app");
  const fsPromises = deps?.fs;
  const path = deps?.path;
  const appDb = deps?.appDb;
  const Chess = deps?.Chess;
  const sfAnalyzeFen = deps?.sfAnalyzeFen;
  const authenticateUser = deps?.authenticateUser;
  const authorizeRole = deps?.authorizeRole;
  const requireOrganizationAccess = deps?.requireOrganizationAccess;
  const readData = deps?.readData;
  const filterStudentsByOrganization = deps?.filterStudentsByOrganization;
  const resolveOrgIdFromUser = deps?.resolveOrgIdFromUser;
  const TACTICS_FIGHTER_ATTEMPTS_FILE = deps?.TACTICS_FIGHTER_ATTEMPTS_FILE;

  const pool = appDb?.getPool?.();
  const hasDb = !!pool;

  async function requireDbReady(res) {
    if (!hasDb) {
      res.status(501).json({ ok: false, error: 'Postgres not configured' });
      return false;
    }
    try {
      // Surface connection errors clearly (these were showing up as 500 in UI).
      await pool.query('SELECT 1 AS ok', []);
      await ensureTfSchema(pool);
      return true;
    } catch (e) {
      console.error('[tactics-fighter] ensure schema failed:', e);
      const msg = String(e?.message || e);
      const isConn = /ECONNREFUSED|ENOTFOUND|timeout|terminating connection|connection/i.test(msg);
      res.status(isConn ? 503 : 500).json({ ok: false, error: isConn ? 'Postgres connection failed' : 'DB schema not ready', details: msg });
      return false;
    }
  }

  async function resolveOrgId(req) {
    if (!resolveOrgIdFromUser) return null;
    return await resolveOrgIdFromUser(req.user).catch(() => null);
  }

  // Public (used by game-window UI)
  app.get("/api/tactics-fighter/config", async (req, res) => {
    res.json({
      ok: true,
      app: "tactics-fighter",
      version: "v1",
      updatedAt: nowIso(),
      endpoints: {
        logAttempt: "/api/tactics-fighter/attempts",
        teacherAttempts: "/api/teachers/tactics-fighter/attempts",
        builderTree: "/api/teachers/tactics-fighter/builder/tree",
        engineAnalyze: "/api/teachers/tactics-fighter/engine/analyze"
      }
    });
  });

  // Public: minimal attempt logger (file-based analytics/debug)
  app.post("/api/tactics-fighter/attempts", async (req, res) => {
    try {
      if (!fsPromises || !path) return res.json({ ok: true });
      const studentId = toCleanString(req?.body?.studentId || "", 200);
      if (!studentId) return res.status(400).json({ ok: false, error: "Missing studentId" });

      // Best-effort validate student existence (prevents random spam)
      if (typeof readData === "function") {
        const data = await readData().catch(() => null);
        const students = Array.isArray(data?.students) ? data.students : [];
        const exists = students.some((s) => String(s?.id || "") === studentId);
        if (!exists) return res.status(404).json({ ok: false, error: "Student not found" });
      }

      const entry = {
        ts: nowIso(),
        studentId,
        puzzleId: toCleanString(req?.body?.puzzleId || "", 200),
        answer: toCleanString(req?.body?.answer || "", 2000),
        correct: req?.body?.correct === true,
        meta: req?.body?.meta && typeof req.body.meta === "object" ? req.body.meta : undefined,
        ua: toCleanString(req.get("user-agent") || "", 500),
        ip: toCleanString(req.ip || "", 200)
      };

      if (TACTICS_FIGHTER_ATTEMPTS_FILE) {
        await ensureParentDir(fsPromises, path, TACTICS_FIGHTER_ATTEMPTS_FILE);
        await fsPromises.appendFile(TACTICS_FIGHTER_ATTEMPTS_FILE, JSON.stringify(entry) + "\n", "utf8");
      }

      return res.json({ ok: true });
    } catch (e) {
      console.error("[tactics-fighter] log attempt error:", e);
      return res.status(500).json({ ok: false, error: "Failed to log attempt" });
    }
  });

  // Teacher: read attempts (simple file scan)
  if (authenticateUser && authorizeRole && requireOrganizationAccess && resolveOrgIdFromUser) {
    app.get(
      "/api/teachers/tactics-fighter/attempts",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!fsPromises || !path || !TACTICS_FIGHTER_ATTEMPTS_FILE) return res.json({ ok: true, attempts: [] });

          const orgId = await resolveOrgId(req);
          const studentId = toCleanString(req.query?.studentId || "", 200);

          // If a studentId is provided, enforce same-org access.
          if (studentId && orgId && typeof filterStudentsByOrganization === "function" && typeof readData === "function") {
            const data = await readData().catch(() => null);
            const students = Array.isArray(data?.students) ? data.students : [];
            const orgStudents = filterStudentsByOrganization(students, orgId);
            const ok = orgStudents.some((s) => String(s?.id || "") === studentId);
            if (!ok) return res.status(403).json({ ok: false, error: "Student not in organization" });
          }

          const text = await fsPromises.readFile(TACTICS_FIGHTER_ATTEMPTS_FILE, "utf8").catch(() => "");
          const lines = String(text || "").split("\n").filter(Boolean);

          // Keep response bounded.
          const tail = lines.slice(Math.max(0, lines.length - 2000));
          const parsed = tail
            .map((l) => safeJsonParse(l))
            .filter(Boolean)
            .filter((a) => (studentId ? String(a.studentId || "") === studentId : true));

          return res.json({ ok: true, attempts: parsed.slice(-500) });
        } catch (e) {
          console.error("[tactics-fighter] teacher attempts error:", e);
          return res.status(500).json({ ok: false, error: "Failed to load attempts" });
        }
      }
    );
  }

  // ===== Teacher: Engine analyze (MultiPV + PV length) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess && sfAnalyzeFen && Chess) {
    app.post(
      "/api/teachers/tactics-fighter/engine/analyze",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          const fen = toCleanString(req?.body?.fen || "", 2000);
          if (!fen) return res.status(400).json({ ok: false, error: "Missing fen" });

          // Validate FEN quickly via chess.js
          try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: "Invalid FEN" }); }

          const depth = toRangeInt(req?.body?.depth, 4, 22, 16);
          const multipv = toRangeInt(req?.body?.multipv, 1, 10, 1);
          const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 32, 8);

          const r = await sfAnalyzeFen(fen, { depth, multiPv: multipv, pvPlies });
          const lines = Array.isArray(r?.lines) ? r.lines : [];

          const withSan = lines.map((ln) => {
            const pvUci = Array.isArray(ln?.pv) ? ln.pv : [];
            const pvSan = [];
            try {
              const ch = new Chess(fen);
              for (const u of pvUci) {
                const mv = parseUci(u);
                if (!mv) break;
                const out = ch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
                if (!out) break;
                pvSan.push(String(out.san || ''));
              }
            } catch {}
            return {
              multiPv: Number(ln?.multiPv || 1),
              score: normalizeScore(ln?.score),
              bestMove: ln?.bestMove ? String(ln.bestMove) : null,
              pvUci,
              pvSan
            };
          });

          return res.json({
            ok: true,
            fen,
            depth,
            multipv,
            pvPlies,
            bestMove: r?.bestMove ? String(r.bestMove) : null,
            lines: withSan
          });
        } catch (e) {
          console.error('[tactics-fighter] analyze error:', e);
          return res.status(500).json({ ok: false, error: "Engine analyze failed" });
        }
      }
    );
  }

  // ===== Teacher: Builder CRUD (Postgres) =====
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
            `SELECT id, topic_id, name, created_at, updated_at
             FROM tactics_fighter_subtopics
             WHERE org_id = $1 AND topic_id = ANY($2::bigint[])
             ORDER BY name ASC`,
            [orgId, topicIds]
          ) : { rows: [] };

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

    // Categories
    app.post(
      "/api/teachers/tactics-fighter/builder/categories",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const name = toCleanString(req?.body?.name || '', 120);
          const bucket = toCleanString(req?.body?.bucket || 'beginner', 32) || 'beginner';
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const createdBy = req?.user?.id ? String(req.user.id) : null;
          const r = await pool.query(
            `INSERT INTO tactics_fighter_categories(org_id, bucket, name, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id, bucket, name, created_at, updated_at`,
            [orgId, bucket, name, createdBy]
          );
          const row = r.rows?.[0];
          return res.json({ ok: true, category: { id: String(row.id), bucket: String(row.bucket || bucket), name: String(row.name), createdAt: row.created_at?.toISOString?.() || nowIso(), updatedAt: row.updated_at?.toISOString?.() || nowIso() } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Category already exists" : "Create category failed" });
        }
      }
    );

    app.patch(
      "/api/teachers/tactics-fighter/builder/categories/:categoryId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.categoryId || '').trim();
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const r = await pool.query(
            `UPDATE tactics_fighter_categories
             SET name = $1, updated_at = NOW()
             WHERE org_id = $2 AND id = $3
             RETURNING id, name, created_at, updated_at`,
            [name, orgId, id]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({ ok: true, category: { id: String(row.id), name: String(row.name), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() } });
        } catch (e) {
          const msg = String(e?.message || e);
          const isDup = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate');
          return res.status(isDup ? 409 : 500).json({ ok: false, error: isDup ? "Category already exists" : "Rename failed" });
        }
      }
    );

    app.delete(
      "/api/teachers/tactics-fighter/builder/categories/:categoryId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.categoryId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(`DELETE FROM tactics_fighter_categories WHERE org_id = $1 AND id = $2`, [orgId, id]);
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          return res.status(500).json({ ok: false, error: "Delete failed" });
        }
      }
    );

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
          const name = toCleanString(req?.body?.name || '', 120);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
          if (!name) return res.status(400).json({ ok: false, error: "Missing name" });
          const r = await pool.query(
            `UPDATE tactics_fighter_subtopics
             SET name = $1, updated_at = NOW()
             WHERE org_id = $2 AND id = $3
             RETURNING id, topic_id, name, created_at, updated_at`,
            [name, orgId, id]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Not found" });
          return res.json({ ok: true, subtopic: { id: String(row.id), topicId: String(row.topic_id), name: String(row.name) } });
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

    // Puzzles under a subtopic
    app.get(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/puzzles",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const subtopicId = String(req.params.subtopicId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          const r = await pool.query(
            `SELECT id, fen, solutions, created_at, updated_at
             FROM tactics_fighter_puzzles
             WHERE org_id = $1 AND subtopic_id = $2
             ORDER BY created_at DESC
             LIMIT 200`,
            [orgId, subtopicId]
          );
          const puzzles = (r.rows || []).map((p) => ({
            id: String(p.id),
            fen: String(p.fen || ''),
            solutions: p.solutions || null,
            createdAt: p.created_at ? new Date(p.created_at).toISOString() : null,
            updatedAt: p.updated_at ? new Date(p.updated_at).toISOString() : null
          }));
          return res.json({ ok: true, puzzles });
        } catch (e) {
          console.error('[tactics-fighter] list puzzles error:', e);
          return res.status(500).json({ ok: false, error: "Failed to load puzzles" });
        }
      }
    );

    app.post(
      "/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/puzzles",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const subtopicId = String(req.params.subtopicId || '').trim();
          const fen = toCleanString(req?.body?.fen || '', 2000);
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!subtopicId) return res.status(400).json({ ok: false, error: "Missing subtopicId" });
          if (!fen) return res.status(400).json({ ok: false, error: "Missing fen" });

          try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: "Invalid FEN" }); }

          const side = parseFenSideToMove(fen);
          const engineDepth = toRangeInt(req?.body?.engineDepth, 4, 22, 16);
          const multipv = toRangeInt(req?.body?.multipv, 1, 10, 1);
          const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 32, 8);
          const solutions = (req?.body?.solutions && typeof req.body.solutions === 'object') ? req.body.solutions : null;
          const meta = (req?.body?.meta && typeof req.body.meta === 'object') ? req.body.meta : null;
          const createdBy = req?.user?.id ? String(req.user.id) : null;

          const r = await pool.query(
            `INSERT INTO tactics_fighter_puzzles(org_id, subtopic_id, fen, side_to_move, engine_depth, multipv, pv_plies, solutions, meta, created_by)
             SELECT $1, s.id, $3, $4, $5, $6, $7, $8, $9, $10
             FROM tactics_fighter_subtopics s
             WHERE s.org_id = $1 AND s.id = $2
             RETURNING id, fen, created_at, updated_at`,
            [orgId, subtopicId, fen, side, engineDepth, multipv, pvPlies, solutions ? JSON.stringify(solutions) : null, meta ? JSON.stringify(meta) : null, createdBy]
          );
          const row = r.rows?.[0];
          if (!row) return res.status(404).json({ ok: false, error: "Subtopic not found" });
          return res.json({ ok: true, puzzle: { id: String(row.id), fen: String(row.fen), createdAt: new Date(row.created_at).toISOString() } });
        } catch (e) {
          console.error('[tactics-fighter] create puzzle error:', e);
          return res.status(500).json({ ok: false, error: "Create puzzle failed" });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterRoutes };


