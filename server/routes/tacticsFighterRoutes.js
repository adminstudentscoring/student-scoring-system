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

async function ensureTfStudentSchema(pool) {
  // Idempotent schema create for safety (still recommend DB migrations).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_student_progress (
      org_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      puzzle_id BIGINT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      completed_at TIMESTAMPTZ,
      last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts_count INT NOT NULL DEFAULT 0,
      wrong_count INT NOT NULL DEFAULT 0,
      meta JSONB,
      PRIMARY KEY (org_id, student_id, puzzle_id)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_student_progress_org_student_idx ON tactics_fighter_student_progress(org_id, student_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_student_attempts (
      id BIGSERIAL PRIMARY KEY,
      org_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      bucket TEXT,
      subtopic_id BIGINT,
      puzzle_id BIGINT NOT NULL,
      attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      moves_uci JSONB,
      move_uci TEXT,
      ply_index INT,
      correct_prefix BOOLEAN NOT NULL DEFAULT FALSE,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      chosen_line INT,
      meta JSONB
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_student_attempts_org_student_idx ON tactics_fighter_student_attempts(org_id, student_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_student_attempts_puzzle_idx ON tactics_fighter_student_attempts(puzzle_id);`);
}

async function ensureTfPhotoRecognizeSchema(pool) {
  // Idempotent schema create for safety (still recommend DB migrations).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tf_photo_recognize_jobs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      subtopic_id BIGINT NOT NULL,
      created_by TEXT,
      status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | error
      message TEXT,
      total_files INT NOT NULL DEFAULT 0,
      total_segments INT NOT NULL DEFAULT 0,
      total_fens INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tf_photo_recognize_jobs_org_id_idx ON tf_photo_recognize_jobs(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tf_photo_recognize_jobs_subtopic_id_idx ON tf_photo_recognize_jobs(subtopic_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tf_photo_recognize_items (
      id BIGSERIAL PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES tf_photo_recognize_jobs(id) ON DELETE CASCADE,
      idx INT NOT NULL,
      fen TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (job_id, idx)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tf_photo_recognize_items_job_id_idx ON tf_photo_recognize_items(job_id);`);
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

  // ===== Teacher debug: verify deployed routes (helps diagnose 404 on Railway) =====
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    app.get(
      '/api/teachers/tactics-fighter/debug/routes',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        // Keep this intentionally simple and stable.
        return res.json({
          ok: true,
          app: 'tactics-fighter',
          hasPhotoRecognize: true,
          endpoints: {
            photoUpload: '/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/photo-recognize/upload',
            photoJob: '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId',
            photoFens: '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId/fens'
          }
        });
      }
    );
  }

  async function requireDbReady(res) {
    if (!hasDb) {
      res.status(501).json({ ok: false, error: 'Postgres not configured' });
      return false;
    }
    try {
      // Surface connection errors clearly (these were showing up as 500 in UI).
      await pool.query('SELECT 1 AS ok', []);
      await ensureTfSchema(pool);
      await ensureTfStudentSchema(pool);
      await ensureTfPhotoRecognizeSchema(pool);
      return true;
    } catch (e) {
      console.error('[tactics-fighter] ensure schema failed:', e);
      const msg = String(e?.message || e);
      const isConn = /ECONNREFUSED|ENOTFOUND|timeout|terminating connection|connection/i.test(msg);
      res.status(isConn ? 503 : 500).json({ ok: false, error: isConn ? 'Postgres connection failed' : 'DB schema not ready', details: msg });
      return false;
    }
  }

  async function requirePublicStudent(req, res) {
    if (typeof readData !== 'function') {
      res.status(500).json({ ok: false, error: 'Server not configured (readData missing)' });
      return null;
    }
    const studentId = String(req?.params?.id || '').trim();
    const password =
      (req?.query && Object.prototype.hasOwnProperty.call(req.query, 'password')) ? String(req.query.password || '') :
      (req?.body && Object.prototype.hasOwnProperty.call(req.body, 'password')) ? String(req.body.password || '') :
      '';

    const data = await readData().catch(() => null);
    const students = Array.isArray(data?.students) ? data.students : [];
    const student = students.find((s) => String(s?.id || '') === studentId);
    if (!student) {
      res.status(404).json({ ok: false, error: 'Student not found' });
      return null;
    }

    // Password protection: same rules as /api/public/students/:id
    if (student.accessPassword) {
      if (!password || password !== student.accessPassword) {
        res.status(401).json({ ok: false, error: 'Invalid password' });
        return null;
      }
    }

    const orgId = String(student.organizationId || '').trim();
    if (!orgId) {
      res.status(403).json({ ok: false, error: 'Student not associated with organization' });
      return null;
    }

    return {
      studentId: String(student.id),
      orgId,
      student
    };
  }

  function normalizeBucket(b) {
    const s = String(b || '').trim().toLowerCase();
    if (!s) return 'beginner';
    return s;
  }

  function parseAcceptedLinesFromSolutions(solutions) {
    const sol = solutions && typeof solutions === 'object' ? solutions : {};
    const lines = Array.isArray(sol.acceptedLines) ? sol.acceptedLines : Array.isArray(sol.lines) ? sol.lines : [];
    // Expect each line to include pvUci[].
    const out = [];
    for (const ln of lines) {
      const pvUci = Array.isArray(ln?.pvUci) ? ln.pvUci : Array.isArray(ln?.uci) ? ln.uci : null;
      if (!pvUci || !pvUci.length) continue;
      out.push(pvUci.map((m) => String(m || '').trim().toLowerCase()).filter(Boolean));
    }
    return out;
  }

  function prefixMatches(line, moves) {
    if (!Array.isArray(line) || !Array.isArray(moves)) return false;
    if (moves.length > line.length) return false;
    for (let i = 0; i < moves.length; i++) {
      if (String(line[i] || '').toLowerCase() !== String(moves[i] || '').toLowerCase()) return false;
    }
    return true;
  }

  async function resolveOrgId(req) {
    if (!resolveOrgIdFromUser) return null;
    // resolveOrgIdFromUser may be sync (returns string) or async (returns Promise).
    // Normalize to Promise to avoid ".catch is not a function" runtime errors.
    return await Promise.resolve(resolveOrgIdFromUser(req.user)).catch(() => null);
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

  // ===== Public Student: Engine analyze (single best line) =====
  // Used by student practice runner: when student plays a wrong move, engine replies 1 move.
  if (sfAnalyzeFen && Chess) {
    app.post('/api/public/students/:id/tactics-fighter/engine/analyze', async (req, res) => {
      try {
        const ctx = await requirePublicStudent(req, res);
        if (!ctx) return;

        const fen = toCleanString(req?.body?.fen || '', 2000);
        if (!fen) return res.status(400).json({ ok: false, error: 'Missing fen' });

        // Validate FEN via chess.js
        try { new Chess(fen); } catch { return res.status(400).json({ ok: false, error: 'Invalid FEN' }); }

        // Clamp aggressively for public endpoint
        const depth = toRangeInt(req?.body?.depth, 4, 14, 12);
        const pvPlies = toRangeInt(req?.body?.pvPlies, 1, 16, 6);
        const multipv = 1;

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
        console.error('[tactics-fighter] public engine analyze error:', e);
        return res.status(500).json({ ok: false, error: 'Engine analyze failed' });
      }
    });
  }

  // ===== Public Student: Apply move (UCI -> SAN + next FEN) =====
  // Used by student practice runner to update the board and show SAN immediately.
  if (Chess) {
    app.post('/api/public/students/:id/tactics-fighter/apply-move', async (req, res) => {
      try {
        const ctx = await requirePublicStudent(req, res);
        if (!ctx) return;

        const fen = toCleanString(req?.body?.fen || '', 2000);
        const uci = toCleanString(req?.body?.uci || '', 50).toLowerCase();
        if (!fen) return res.status(400).json({ ok: false, error: 'Missing fen' });
        if (!uci) return res.status(400).json({ ok: false, error: 'Missing uci' });

        let ch;
        try { ch = new Chess(fen); } catch { return res.status(400).json({ ok: false, error: 'Invalid FEN' }); }

        const mv = parseUci(uci);
        if (!mv) return res.status(400).json({ ok: false, error: 'Invalid UCI' });

        const out = ch.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
        if (!out) return res.status(400).json({ ok: false, error: 'Illegal move' });

        return res.json({
          ok: true,
          uci,
          san: String(out.san || ''),
          fenAfter: String(ch.fen() || '')
        });
      } catch (e) {
        console.error('[tactics-fighter] public apply-move error:', e);
        return res.status(500).json({ ok: false, error: 'Failed to apply move' });
      }
    });
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

    app.delete(
      "/api/teachers/tactics-fighter/builder/puzzles/:puzzleId",
      authenticateUser,
      authorizeRole("teacher"),
      requireOrganizationAccess,
      async (req, res) => {
        if (!(await requireDbReady(res))) return;
        try {
          const orgId = await resolveOrgId(req);
          const id = String(req.params.puzzleId || '').trim();
          if (!orgId) return res.status(400).json({ ok: false, error: "Missing org" });
          if (!id) return res.status(400).json({ ok: false, error: "Missing puzzleId" });
          const r = await pool.query(
            `DELETE FROM tactics_fighter_puzzles WHERE org_id = $1 AND id = $2`,
            [orgId, id]
          );
          return res.json({ ok: true, deleted: Number(r.rowCount || 0) });
        } catch (e) {
          console.error('[tactics-fighter] delete puzzle error:', e);
          return res.status(500).json({ ok: false, error: "Delete puzzle failed" });
        }
      }
    );
  }

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

      // Stitch
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

      // Ensure this subtopic belongs to this org + bucket
      const okRes = await pool.query(
        `
        SELECT s.id AS subtopic_id
        FROM tactics_fighter_subtopics s
        JOIN tactics_fighter_topics t ON t.id = s.topic_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id
        WHERE s.org_id = $1 AND s.id = $2 AND c.bucket = $3
        LIMIT 1
        `,
        [orgId, subtopicId, bucket]
      );
      if (!okRes.rows.length) return res.status(404).json({ ok: false, error: 'Subtopic not found' });

      const page = toRangeInt(req.query?.page, 1, 1000000, 1);
      const pageSize = toRangeInt(req.query?.pageSize, 1, 50, 10);
      const offset = (page - 1) * pageSize;

      const puzzlesRes = await pool.query(
        `
        SELECT id, fen, solutions, created_at
        FROM tactics_fighter_puzzles
        WHERE org_id = $1 AND subtopic_id = $2
        ORDER BY created_at DESC, id DESC
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
        solutions: r.solutions && typeof r.solutions === 'object' ? r.solutions : {},
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        completed: completedIds.has(String(r.id))
      }));

      return res.json({
        ok: true,
        bucket,
        subtopicId: String(subtopicId),
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

  // ===== Public Student: Stats (Home) =====
  // Returns total completed puzzles for this student (optionally bucket scoped).
  app.get('/api/public/students/:id/tactics-fighter/stats', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.query?.bucket || '');

      const useBucket = !!String(req.query?.bucket || '').trim();
      if (!useBucket) {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS cnt
           FROM tactics_fighter_student_progress
           WHERE org_id = $1 AND student_id = $2 AND status = 'completed'`,
          [orgId, studentId]
        );
        return res.json({ ok: true, completedCount: Number(r.rows?.[0]?.cnt || 0) });
      }

      const r = await pool.query(
        `
        SELECT COUNT(*)::int AS cnt
        FROM tactics_fighter_student_progress p
        JOIN tactics_fighter_puzzles z ON z.id = p.puzzle_id AND z.org_id = p.org_id
        JOIN tactics_fighter_subtopics s ON s.id = z.subtopic_id AND s.org_id = z.org_id
        JOIN tactics_fighter_topics t ON t.id = s.topic_id AND t.org_id = s.org_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id AND c.org_id = t.org_id
        WHERE p.org_id = $1 AND p.student_id = $2 AND p.status = 'completed' AND c.bucket = $3
        `,
        [orgId, studentId, bucket]
      );
      return res.json({ ok: true, bucket, completedCount: Number(r.rows?.[0]?.cnt || 0) });
    } catch (e) {
      console.error('[tactics-fighter] public stats error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load stats' });
    }
  });

  app.post('/api/public/students/:id/tactics-fighter/puzzles/:puzzleId/attempt', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.body?.bucket || req.query?.bucket || 'beginner');
      const puzzleId = toRangeInt(req.params?.puzzleId, 1, 9_000_000_000_000, 0);
      if (!puzzleId) return res.status(400).json({ ok: false, error: 'Invalid puzzleId' });

      const movesUciRaw = Array.isArray(req.body?.movesUci) ? req.body.movesUci : [];
      const movesUci = movesUciRaw.map((m) => String(m || '').trim().toLowerCase()).filter(Boolean);
      const plyIndex = Number.isFinite(Number(req.body?.plyIndex)) ? Number(req.body.plyIndex) : (movesUci.length ? movesUci.length - 1 : null);
      const moveUci = String(req.body?.moveUci || (movesUci.length ? movesUci[movesUci.length - 1] : '') || '').trim().toLowerCase();
      const subtopicId = req.body?.subtopicId ? toRangeInt(req.body.subtopicId, 1, 1_000_000_000, 0) : null;
      const mode = String(req.body?.mode || '').trim().toLowerCase(); // 'practice' | 'ghost'

      const pRes = await pool.query(
        `SELECT id, subtopic_id, fen, solutions FROM tactics_fighter_puzzles WHERE org_id = $1 AND id = $2 LIMIT 1`,
        [orgId, puzzleId]
      );
      if (!pRes.rows.length) return res.status(404).json({ ok: false, error: 'Puzzle not found' });

      const puzzle = pRes.rows[0];
      const accepted = parseAcceptedLinesFromSolutions(puzzle.solutions);

      let correctPrefix = false;
      let completed = false;
      let chosenLine = null;
      let matchCount = 0;

      for (let i = 0; i < accepted.length; i++) {
        const line = accepted[i];
        if (!prefixMatches(line, movesUci)) continue;
        correctPrefix = true;
        matchCount++;
        if (chosenLine === null) chosenLine = i;
        if (movesUci.length === line.length) {
          completed = true;
          chosenLine = i;
          break;
        }
      }

      await pool.query(
        `
        INSERT INTO tactics_fighter_student_attempts
          (org_id, student_id, bucket, subtopic_id, puzzle_id, moves_uci, move_uci, ply_index, correct_prefix, completed, chosen_line, meta)
        VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12::jsonb)
        `,
        [
          orgId,
          studentId,
          bucket,
          (subtopicId || Number(puzzle.subtopic_id) || null),
          puzzleId,
          JSON.stringify(movesUci),
          moveUci || null,
          (plyIndex === null ? null : Math.trunc(plyIndex)),
          !!correctPrefix,
          !!completed,
          (chosenLine === null ? null : Math.trunc(chosenLine)),
          JSON.stringify({
            ua: toCleanString(req.get('user-agent') || '', 500),
            ip: toCleanString(req.ip || '', 200),
            mode: mode || null
          })
        ]
      );

      await pool.query(
        `
        INSERT INTO tactics_fighter_student_progress
          (org_id, student_id, puzzle_id, status, completed_at, last_attempt_at, attempts_count, wrong_count)
        VALUES
          ($1, $2, $3, $4, $5, NOW(), 1, $6)
        ON CONFLICT (org_id, student_id, puzzle_id) DO UPDATE SET
          status = CASE WHEN EXCLUDED.status = 'completed' THEN 'completed' ELSE tactics_fighter_student_progress.status END,
          completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN COALESCE(tactics_fighter_student_progress.completed_at, EXCLUDED.completed_at) ELSE tactics_fighter_student_progress.completed_at END,
          last_attempt_at = NOW(),
          attempts_count = tactics_fighter_student_progress.attempts_count + 1,
          wrong_count = tactics_fighter_student_progress.wrong_count + EXCLUDED.wrong_count
        `,
        [
          orgId,
          studentId,
          puzzleId,
          completed ? 'completed' : 'in_progress',
          completed ? new Date().toISOString() : null,
          correctPrefix ? 0 : 1
        ]
      );

      // Ghost: if completed, increment meta.ghostReplays (cap handled by query).
      if (completed && mode === 'ghost') {
        try {
          await pool.query(
            `
            UPDATE tactics_fighter_student_progress
            SET meta = jsonb_set(
              COALESCE(meta, '{}'::jsonb),
              '{ghostReplays}',
              to_jsonb(COALESCE((meta->>'ghostReplays')::int, 0) + 1),
              true
            )
            WHERE org_id = $1 AND student_id = $2 AND puzzle_id = $3
            `,
            [orgId, studentId, puzzleId]
          );
        } catch (e) {
          console.warn('[tactics-fighter] ghostReplays update failed:', e?.message || e);
        }
      }

      return res.json({
        ok: true,
        puzzleId: String(puzzleId),
        correctPrefix,
        completed,
        matches: matchCount,
        chosenLine
      });
    } catch (e) {
      console.error('[tactics-fighter] public attempt error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to record attempt' });
    }
  });

  // ===== Public Student: Challenge - Dancing with your Ghost =====
  // Returns puzzles that were ever answered incorrectly (wrong_count > 0) and have ghostReplays < 3.
  // Weighted priority by ghostReplays: 0 -> 60%, 1 -> 30%, 2 -> 10%.
  app.get('/api/public/students/:id/tactics-fighter/challenge/ghost', async (req, res) => {
    try {
      const ctx = await requirePublicStudent(req, res);
      if (!ctx) return;
      if (!(await requireDbReady(res))) return;

      const orgId = ctx.orgId;
      const studentId = ctx.studentId;
      const bucket = normalizeBucket(req.query?.bucket || 'beginner');
      const limit = toRangeInt(req.query?.limit, 1, 500, 120);

      const rowsRes = await pool.query(
        `
        SELECT
          z.id,
          z.fen,
          z.solutions,
          p.wrong_count,
          COALESCE((p.meta->>'ghostReplays')::int, 0) AS ghost_replays
        FROM tactics_fighter_student_progress p
        JOIN tactics_fighter_puzzles z ON z.id = p.puzzle_id AND z.org_id = p.org_id
        JOIN tactics_fighter_subtopics s ON s.id = z.subtopic_id AND s.org_id = z.org_id
        JOIN tactics_fighter_topics t ON t.id = s.topic_id AND t.org_id = s.org_id
        JOIN tactics_fighter_categories c ON c.id = t.category_id AND c.org_id = t.org_id
        WHERE
          p.org_id = $1
          AND p.student_id = $2
          AND c.bucket = $3
          AND p.wrong_count > 0
          AND COALESCE((p.meta->>'ghostReplays')::int, 0) < 3
        `,
        [orgId, studentId, bucket]
      );

      const rows = rowsRes.rows || [];
      if (!rows.length) return res.json({ ok: true, bucket, puzzles: [] });

      // Group by ghostReplays (0/1/2)
      const g0 = [];
      const g1 = [];
      const g2 = [];
      for (const r of rows) {
        const gr = Number(r.ghost_replays || 0);
        const item = {
          id: String(r.id),
          fen: String(r.fen || ''),
          solutions: (r.solutions && typeof r.solutions === 'object') ? r.solutions : {},
          ghostReplays: Math.max(0, Math.min(2, gr))
        };
        if (gr <= 0) g0.push(item);
        else if (gr === 1) g1.push(item);
        else g2.push(item);
      }

      // Shuffle helper
      function shuffleInPlace(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
      }
      shuffleInPlace(g0); shuffleInPlace(g1); shuffleInPlace(g2);

      const out = [];
      while (out.length < limit && (g0.length || g1.length || g2.length)) {
        // Determine available weights
        const choices = [];
        if (g0.length) choices.push({ w: 0.60, arr: g0 });
        if (g1.length) choices.push({ w: 0.30, arr: g1 });
        if (g2.length) choices.push({ w: 0.10, arr: g2 });
        const sum = choices.reduce((a, c) => a + c.w, 0);
        let r = Math.random() * (sum || 1);
        let picked = choices[choices.length - 1];
        for (const c of choices) {
          r -= c.w;
          if (r <= 0) { picked = c; break; }
        }
        const item = picked.arr.pop();
        if (item) out.push(item);
      }

      return res.json({ ok: true, bucket, puzzles: out });
    } catch (e) {
      console.error('[tactics-fighter] ghost challenge error:', e);
      return res.status(500).json({ ok: false, error: 'Failed to load ghost puzzles' });
    }
  });

  // ===== Teacher: Photo Recognize (upload -> job -> fens) =====
  // v1 implementation: uses OpenAI Vision to extract FEN lines from screenshots (source is consistent).
  // If side-to-move text is missing, defaults to 'w'.
  if (authenticateUser && authorizeRole && requireOrganizationAccess) {
    let multer = null;
    try { multer = require('multer'); } catch {}
    let OpenAI = null;
    try { OpenAI = require('openai'); } catch {}
    let sharp = null;
    try { sharp = require('sharp'); } catch {}

    const openAiKey = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
    const upload = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }) : null;

    function makeId(prefix = 'job') {
      return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    }

    function isPdfMime(m) {
      const s = String(m || '').toLowerCase();
      return s === 'application/pdf' || s === 'application/x-pdf';
    }

    function bufferToDataUrl(file) {
      const mime = String(file?.mimetype || 'image/png');
      const b64 = Buffer.from(file?.buffer || Buffer.alloc(0)).toString('base64');
      return `data:${mime};base64,${b64}`;
    }

    function clampInt(n, min, max) {
      const x = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : min;
      return Math.max(min, Math.min(max, x));
    }

    async function segmentBoardsFromImageBuffer(fileBuffer) {
      // Heuristic segmentation for long screenshots with many small diagrams.
      // Strategy:
      // - Resize to manageable width (<= 900)
      // - Convert to raw pixels
      // - Compute per-row non-white density on left region
      // - Find row segments with high density
      // - For each segment, compute x-range with high density, then square-crop
      if (!sharp) return [];
      const base = sharp(fileBuffer, { failOnError: false });
      const meta = await base.metadata().catch(() => null);
      const w0 = Number(meta?.width || 0);
      const h0 = Number(meta?.height || 0);
      if (!w0 || !h0) return [];

      const targetW = w0 > 900 ? 900 : w0;
      const scale = targetW / w0;

      const resized = (targetW !== w0) ? base.clone().resize({ width: targetW }) : base.clone();
      const rawObj = await resized.clone().raw().toBuffer({ resolveWithObject: true }).catch(() => null);
      if (!rawObj || !rawObj.data || !rawObj.info) return [];
      const data = rawObj.data;
      const info = rawObj.info;
      const width = info.width;
      const height = info.height;
      const channels = info.channels;

      const xLimit = clampInt(Math.floor(width * 0.55), 1, width);
      const rowCount = new Array(height).fill(0);
      // Non-white threshold (tune for screenshots)
      const lumThr = 240;
      for (let y = 0; y < height; y++) {
        let cnt = 0;
        const rowOff = y * width * channels;
        for (let x = 0; x < xLimit; x++) {
          const idx = rowOff + x * channels;
          const r = data[idx] || 0;
          const g = data[idx + 1] || 0;
          const b = data[idx + 2] || 0;
          // luminance approx
          const lum = (r * 3 + g * 4 + b) / 8;
          if (lum < lumThr) cnt++;
        }
        rowCount[y] = cnt;
      }

      // Dynamic threshold from percentile (simple)
      const sorted = rowCount.slice().sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0;
      const p90 = sorted[Math.floor(sorted.length * 0.90)] || 0;
      const thrRow = Math.max(25, Math.floor(p50 + (p90 - p50) * 0.55));

      const segments = [];
      let start = -1;
      let gap = 0;
      const maxGap = 6;
      for (let y = 0; y < height; y++) {
        const on = rowCount[y] >= thrRow;
        if (on) {
          if (start === -1) start = y;
          gap = 0;
        } else if (start !== -1) {
          gap++;
          if (gap > maxGap) {
            const end = y - gap;
            segments.push({ start, end });
            start = -1;
            gap = 0;
          }
        }
      }
      if (start !== -1) segments.push({ start, end: height - 1 });

      const out = [];
      for (const seg of segments) {
        const hSeg = seg.end - seg.start + 1;
        if (hSeg < 40 || hSeg > 520) continue;

        // Column density in segment (left region)
        const colCount = new Array(xLimit).fill(0);
        for (let y = seg.start; y <= seg.end; y++) {
          const rowOff = y * width * channels;
          for (let x = 0; x < xLimit; x++) {
            const idx = rowOff + x * channels;
            const r = data[idx] || 0;
            const g = data[idx + 1] || 0;
            const b = data[idx + 2] || 0;
            const lum = (r * 3 + g * 4 + b) / 8;
            if (lum < lumThr) colCount[x]++;
          }
        }
        const thrCol = Math.max(8, Math.floor(hSeg * 0.10));
        let x0 = -1;
        let x1 = -1;
        for (let x = 0; x < xLimit; x++) {
          if (colCount[x] >= thrCol) { x0 = x; break; }
        }
        for (let x = xLimit - 1; x >= 0; x--) {
          if (colCount[x] >= thrCol) { x1 = x; break; }
        }
        if (x0 === -1 || x1 === -1 || x1 <= x0) continue;
        const wSeg = x1 - x0 + 1;
        if (wSeg < 40) continue;

        // Square crop within segment
        const size = Math.min(wSeg, hSeg);
        const cy = (seg.start + seg.end) / 2;
        const cx = (x0 + x1) / 2;
        const topR = clampInt(Math.round(cy - size / 2), 0, height - size);
        const leftR = clampInt(Math.round(cx - size / 2), 0, width - size);

        // Map back to original coordinates and add small padding
        const pad = 2;
        const leftO = clampInt(Math.floor(leftR / scale) - pad, 0, w0 - 1);
        const topO = clampInt(Math.floor(topR / scale) - pad, 0, h0 - 1);
        const sizeO = clampInt(Math.floor(size / scale) + pad * 2, 10, Math.min(w0 - leftO, h0 - topO));

        out.push({ left: leftO, top: topO, width: sizeO, height: sizeO });
        if (out.length >= 140) break;
      }

      // De-dup overlapping crops (simple)
      const dedup = [];
      for (const c of out) {
        const overlaps = dedup.some((d) => {
          const ix = Math.max(0, Math.min(c.left + c.width, d.left + d.width) - Math.max(c.left, d.left));
          const iy = Math.max(0, Math.min(c.top + c.height, d.top + d.height) - Math.max(c.top, d.top));
          const inter = ix * iy;
          const area = Math.min(c.width * c.height, d.width * d.height);
          return area > 0 && inter / area > 0.65;
        });
        if (!overlaps) dedup.push(c);
      }

      return dedup;
    }

    function normalizeOpenAiBaseUrl(raw) {
      let u = String(raw || '').trim();
      if (!u) return 'https://api.openai.com/v1';
      // Common misconfig: user sets https://api.openai.com (missing /v1) -> causes 404.
      u = u.replace(/\/+$/, '');
      if (/^https:\/\/api\.openai\.com$/i.test(u)) return 'https://api.openai.com/v1';
      if (!/\/v1$/i.test(u)) u = `${u}/v1`;
      return u;
    }

    async function openAiExtractFensFromImage({ imageDataUrl, defaultSide = 'w' }) {
      if (!OpenAI) throw new Error('OpenAI SDK not installed');
      if (!openAiKey) throw new Error('OPENAI_API_KEY not configured');
      const baseURL = normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL);
      const client = new OpenAI({ apiKey: openAiKey, baseURL });
      const model = String(process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini');

      const prompt = [
        'You are extracting chess positions from screenshots of chess puzzles.',
        'Return ONLY valid FEN lines, one per line. No numbering, no commentary.',
        'Each line MUST be a 6-field FEN: "<placement> <side> - - 0 1".',
        `If side-to-move is not explicitly stated in nearby text, use "${defaultSide}".`,
        'If there are multiple chess diagrams in the image, output one FEN per diagram, in top-to-bottom order.',
        'If a diagram is too small/unclear, skip it.'
      ].join('\n');

      const resp = await client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
            ]
          }
        ]
      });

      const text = String(resp?.choices?.[0]?.message?.content || '').trim();
      if (!text) return [];
      return text.split(/\r?\n/).map((l) => String(l || '').trim()).filter(Boolean);
    }

    function normalizeFenLine(s, defaultSide = 'w') {
      const line = String(s || '').trim();
      if (!line) return '';
      const parts = line.split(/\s+/);
      if (parts.length < 2) return '';
      const placement = parts[0];
      const side = (parts[1] === 'b') ? 'b' : (parts[1] === 'w') ? 'w' : (String(defaultSide) === 'b' ? 'b' : 'w');
      return `${placement} ${side} - - 0 1`;
    }

    function validateFenWithChessJs(fen) {
      try { new Chess(fen); return true; } catch { return false; }
    }

    app.post(
      '/api/teachers/tactics-fighter/builder/subtopics/:subtopicId/photo-recognize/upload',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      ...(upload ? [upload.array('files', 20)] : []),
      async (req, res) => {
        try {
          if (!upload) return res.status(501).json({ ok: false, error: 'Upload not configured (multer missing)' });
          if (!(await requireDbReady(res))) return;

          const orgId = String(req.user.organizationId || req.organizationFilter || '');
          if (!orgId) return res.status(403).json({ ok: false, error: 'Missing org' });

          const subtopicId = toRangeInt(req.params?.subtopicId, 1, 1_000_000_000, 0);
          if (!subtopicId) return res.status(400).json({ ok: false, error: 'Invalid subtopicId' });

          const okRes = await pool.query(
            `SELECT id FROM tactics_fighter_subtopics WHERE org_id = $1 AND id = $2 LIMIT 1`,
            [orgId, subtopicId]
          );
          if (!okRes.rows.length) return res.status(404).json({ ok: false, error: 'Subtopic not found' });

          const files = Array.isArray(req.files) ? req.files : [];
          if (!files.length) return res.status(400).json({ ok: false, error: 'No files uploaded' });

          const jobId = makeId('tfpr');
          const createdBy = String(req.user.id || '');
          await pool.query(
            `INSERT INTO tf_photo_recognize_jobs (id, org_id, subtopic_id, created_by, status, total_files, updated_at)
             VALUES ($1, $2, $3, $4, 'queued', $5, NOW())`,
            [jobId, orgId, subtopicId, createdBy, files.length]
          );

          // Fire-and-forget background job
          setTimeout(async () => {
            try {
              await pool.query(`UPDATE tf_photo_recognize_jobs SET status='running', message=NULL, updated_at=NOW() WHERE id=$1 AND org_id=$2`, [jobId, orgId]);
              let outIdx = 0;
              let totalFens = 0;
              let totalSegments = 0;
              const defaultSide = 'w';

              for (let fi = 0; fi < files.length; fi++) {
                const f = files[fi];
                const mime = String(f?.mimetype || '');
                if (isPdfMime(mime)) {
                  throw new Error('PDF upload is not supported in this build yet. Please convert PDF pages to images.');
                }

                // Segment long screenshots into per-board crops for better accuracy.
                const buf = Buffer.from(f?.buffer || Buffer.alloc(0));
                let crops = [];
                try { crops = await segmentBoardsFromImageBuffer(buf); } catch { crops = []; }
                if (!crops.length) {
                  // fallback: treat as single image
                  crops = [{ left: 0, top: 0, width: null, height: null }];
                }

                for (let ci = 0; ci < crops.length; ci++) {
                  const c = crops[ci];
                  let imgBuf = buf;
                  if (sharp && c.width && c.height) {
                    imgBuf = await sharp(buf, { failOnError: false })
                      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
                      .png()
                      .toBuffer();
                  }

                  const imageDataUrl = `data:image/png;base64,${imgBuf.toString('base64')}`;
                  const extracted = await openAiExtractFensFromImage({ imageDataUrl, defaultSide });
                  totalSegments += 1;

                  const normalized = extracted.map((x) => normalizeFenLine(x, defaultSide)).filter(Boolean);
                  const valid = normalized.filter(validateFenWithChessJs);

                  for (const fen of valid) {
                    await pool.query(
                      `INSERT INTO tf_photo_recognize_items(job_id, idx, fen, meta)
                       VALUES ($1, $2, $3, $4::jsonb)
                       ON CONFLICT (job_id, idx) DO NOTHING`,
                      [jobId, outIdx++, fen, JSON.stringify({
                        fileName: String(f?.originalname || ''),
                        fileIndex: fi,
                        cropIndex: ci,
                        crop: (c.width && c.height) ? c : null
                      })]
                    );
                  }

                  totalFens += valid.length;
                  await pool.query(
                    `UPDATE tf_photo_recognize_jobs SET total_segments=$3, total_fens=$4, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
                    [jobId, orgId, totalSegments, totalFens]
                  );

                  // Keep job bounded
                  if (outIdx >= 3000) break;
                }
                if (outIdx >= 3000) break;
              }

              await pool.query(
                `UPDATE tf_photo_recognize_jobs SET status='done', message=NULL, total_segments=$3, total_fens=$4, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
                [jobId, orgId, totalSegments, totalFens]
              );
            } catch (e) {
              const msg = String(e?.message || e);
              console.error('[tactics-fighter] photo recognize job error:', msg);
              try {
                await pool.query(
                  `UPDATE tf_photo_recognize_jobs SET status='error', message=$3, updated_at=NOW() WHERE id=$1 AND org_id=$2`,
                  [jobId, orgId, msg.slice(0, 500)]
                );
              } catch {}
            }
          }, 30);

          return res.json({ ok: true, jobId });
        } catch (e) {
          console.error('[tactics-fighter] photo recognize upload error:', e);
          return res.status(500).json({ ok: false, error: 'Upload failed', details: String(e?.message || e) });
        }
      }
    );

    app.get(
      '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = String(req.user.organizationId || req.organizationFilter || '');
          const jobId = toCleanString(req.params?.jobId || '', 200);
          if (!orgId || !jobId) return res.status(400).json({ ok: false, error: 'Missing org/jobId' });

          const r = await pool.query(
            `SELECT id, subtopic_id, status, message, total_files, total_segments, total_fens, created_at, updated_at
             FROM tf_photo_recognize_jobs WHERE org_id=$1 AND id=$2 LIMIT 1`,
            [orgId, jobId]
          );
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Job not found' });
          return res.json({ ok: true, job: r.rows[0] });
        } catch (e) {
          console.error('[tactics-fighter] photo recognize job status error:', e);
          return res.status(500).json({ ok: false, error: 'Failed to load job' });
        }
      }
    );

    app.get(
      '/api/teachers/tactics-fighter/builder/photo-recognize/jobs/:jobId/fens',
      authenticateUser,
      authorizeRole('teacher'),
      requireOrganizationAccess,
      async (req, res) => {
        try {
          if (!(await requireDbReady(res))) return;
          const orgId = String(req.user.organizationId || req.organizationFilter || '');
          const jobId = toCleanString(req.params?.jobId || '', 200);
          const limit = toRangeInt(req.query?.limit, 1, 2000, 500);
          if (!orgId || !jobId) return res.status(400).json({ ok: false, error: 'Missing org/jobId' });

          const jr = await pool.query(`SELECT id FROM tf_photo_recognize_jobs WHERE org_id=$1 AND id=$2 LIMIT 1`, [orgId, jobId]);
          if (!jr.rows.length) return res.status(404).json({ ok: false, error: 'Job not found' });

          const items = await pool.query(
            `SELECT idx, fen FROM tf_photo_recognize_items WHERE job_id=$1 ORDER BY idx ASC LIMIT $2`,
            [jobId, limit]
          );
          const fens = (items.rows || []).map((r) => String(r.fen || '')).filter(Boolean);
          return res.json({ ok: true, jobId, fens, count: fens.length });
        } catch (e) {
          console.error('[tactics-fighter] photo recognize fens error:', e);
          return res.status(500).json({ ok: false, error: 'Failed to load fens' });
        }
      }
    );
  }
}

module.exports = { registerTacticsFighterRoutes };


