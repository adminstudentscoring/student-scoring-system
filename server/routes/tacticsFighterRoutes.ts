// Tactics Fighter routes (Builder + Engine + attempts)
// This file is now a thin wrapper that delegates to focused sub-modules.
"use strict";

const { registerTacticsFighterAdminRoutes } = require('./tacticsFighterAdmin');
const { registerTacticsFighterPuzzlesRoutes } = require('./tacticsFighterPuzzles');
const { registerTacticsFighterAttemptsRoutes } = require('./tacticsFighterAttempts');

function safeJsonParse(s: any): any {
  try { return JSON.parse(String(s || '')); } catch { return null; }
}

function nowIso(): string {
  return new Date().toISOString();
}

function toCleanString(v: any, maxLen = 5000): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toInt(v: any, dflt: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function toRangeInt(v: any, min: number, max: number, dflt: any): number {
  const n = toInt(v, dflt);
  return Math.max(min, Math.min(max, n));
}

async function ensureParentDir(fsPromises: any, path: any, filePath: string): Promise<void> {
  try {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  } catch {}
}

function parseUci(uci: any): any {
  const s = String(uci || '').trim().toLowerCase();
  const m = s.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!m) return null;
  return { from: m[1], to: m[2], promotion: m[3] || undefined };
}

function normalizeScore(score: any): any {
  if (!score || typeof score !== 'object') return { cp: 0 };
  if (Object.prototype.hasOwnProperty.call(score, 'mate')) return { mate: Number(score.mate) || 0 };
  return { cp: Number(score.cp) || 0 };
}

function parseFenSideToMove(fen: any): string | null {
  const parts = String(fen || '').trim().split(/\s+/);
  const side = parts[1] ? String(parts[1]).trim() : '';
  return (side === 'w' || side === 'b') ? side : null;
}

async function ensureTfSchema(pool: any): Promise<void> {
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
      message TEXT,
      solutions JSONB,
      meta JSONB,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_puzzles_org_idx ON tactics_fighter_puzzles(org_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_puzzles_subtopic_idx ON tactics_fighter_puzzles(subtopic_id);`);
  try { await pool.query(`ALTER TABLE tactics_fighter_puzzles ADD COLUMN IF NOT EXISTS message TEXT;`); } catch {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tactics_fighter_settings (
      org_id TEXT PRIMARY KEY,
      stockfish_depth_cap INT NOT NULL DEFAULT 14,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by TEXT
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS tactics_fighter_settings_org_idx ON tactics_fighter_settings(org_id);`);
}

async function ensureTfStudentSchema(pool: any): Promise<void> {
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

async function ensureTfPhotoRecognizeSchema(pool: any): Promise<void> {
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

function registerTacticsFighterRoutes(app: any, deps: any): void {
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

  async function getTfSettings(orgId) {
    if (!orgId) return { stockfishDepthCap: 14 };
    if (!hasDb) return { stockfishDepthCap: 14 };
    try { await ensureTfSchema(pool); } catch {}
    const r = await pool.query(
      `SELECT stockfish_depth_cap FROM tactics_fighter_settings WHERE org_id = $1 LIMIT 1`,
      [String(orgId)]
    );
    const cap = r.rows?.[0]?.stockfish_depth_cap;
    return { stockfishDepthCap: toRangeInt(cap, 4, 22, 14) };
  }

  async function upsertTfSettings(orgId, patch, updatedBy) {
    const cap = toRangeInt(patch?.stockfishDepthCap, 4, 22, 14);
    await pool.query(
      `
      INSERT INTO tactics_fighter_settings (org_id, stockfish_depth_cap, updated_at, updated_by)
      VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (org_id) DO UPDATE SET
        stockfish_depth_cap = EXCLUDED.stockfish_depth_cap,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
      `,
      [String(orgId), cap, updatedBy ? String(updatedBy) : null]
    );
    return { stockfishDepthCap: cap };
  }

  async function requireDbReady(res) {
    if (!hasDb) {
      res.status(501).json({ ok: false, error: 'Postgres not configured' });
      return false;
    }
    try {
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
    return await Promise.resolve(resolveOrgIdFromUser(req.user)).catch(() => null);
  }

  const shared = {
    pool, hasDb,
    getTfSettings, upsertTfSettings, requireDbReady, requirePublicStudent,
    normalizeBucket, parseAcceptedLinesFromSolutions, prefixMatches, resolveOrgId,
    safeJsonParse, nowIso, toCleanString, toInt, toRangeInt, ensureParentDir,
    parseUci, normalizeScore, parseFenSideToMove,
    ensureTfSchema, ensureTfStudentSchema, ensureTfPhotoRecognizeSchema,
    fsPromises, path, TACTICS_FIGHTER_ATTEMPTS_FILE, filterStudentsByOrganization
  };

  registerTacticsFighterAdminRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesRoutes(app, deps, shared);
  registerTacticsFighterAttemptsRoutes(app, deps, shared);
}

module.exports = { registerTacticsFighterRoutes };
