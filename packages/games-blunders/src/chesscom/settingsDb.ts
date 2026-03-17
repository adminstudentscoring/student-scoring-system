// Postgres-backed Chess.com settings store.
// Keeps data org-scoped, per student: chessId + optional password.

function createChessComSettingsDb(deps: any): any {
  const appDb = deps?.appDb;

  if (!appDb || typeof appDb.getPool !== 'function') {
    throw new Error('createChessComSettingsDb: missing deps.appDb');
  }

  async function ensureSchema() {
    const pool = appDb.getPool();
    if (!pool) return { ok: false, reason: 'no_db' };
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chesscom_settings (
        org_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        chess_id TEXT NOT NULL,
        password TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (org_id, student_id)
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS chesscom_settings_org_idx ON chesscom_settings(org_id);`);
    return { ok: true };
  }

  async function getOrgSettings(orgId) {
    const oid = String(orgId || '').trim();
    if (!oid) return {};
    const pool = appDb.getPool();
    if (!pool) return null;
    await ensureSchema();
    const res = await pool.query(
      `SELECT student_id, chess_id, password, updated_at
       FROM chesscom_settings
       WHERE org_id = $1`,
      [oid]
    );
    const out = {};
    for (const r of res.rows || []) {
      const sid = String(r.student_id || '').trim();
      if (!sid) continue;
      out[sid] = {
        chessId: r.chess_id != null ? String(r.chess_id) : '',
        password: r.password != null ? String(r.password) : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
      };
    }
    return out;
  }

  async function getAllSettings() {
    const pool = appDb.getPool();
    if (!pool) return null;
    await ensureSchema();
    const res = await pool.query(
      `SELECT org_id, student_id, chess_id, password, updated_at
       FROM chesscom_settings`,
      []
    );
    const orgs = {};
    for (const r of res.rows || []) {
      const oid = String(r.org_id || '').trim();
      const sid = String(r.student_id || '').trim();
      if (!oid || !sid) continue;
      if (!orgs[oid] || typeof orgs[oid] !== 'object') orgs[oid] = {};
      orgs[oid][sid] = {
        chessId: r.chess_id != null ? String(r.chess_id) : '',
        password: r.password != null ? String(r.password) : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
      };
    }
    return orgs;
  }

  async function upsertOrgSettings(orgId, mergedSettings) {
    const oid = String(orgId || '').trim();
    const settings = mergedSettings && typeof mergedSettings === 'object' ? mergedSettings : {};
    const pool = appDb.getPool();
    if (!pool) return { ok: false, reason: 'no_db' };
    await ensureSchema();

    const payload = [];
    for (const [studentId, _entry] of Object.entries(settings)) {
      const entry = _entry as any;
      const sid = String(studentId || '').trim();
      if (!sid) continue;
      const chessId = String(entry?.chessId ?? '').trim();
      if (!chessId) continue;
      const password = (entry && Object.prototype.hasOwnProperty.call(entry, 'password'))
        ? String(entry.password ?? '')
        : '';
      payload.push({
        org_id: oid,
        student_id: sid,
        chess_id: chessId,
        password: password.trim() ? password : null,
        updated_at: new Date().toISOString()
      });
    }

    if (!payload.length) return { ok: true, upserted: 0 };

    const sql = `
      WITH data AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb)
        AS t(org_id text, student_id text, chess_id text, password text, updated_at timestamptz)
      )
      INSERT INTO chesscom_settings(org_id, student_id, chess_id, password, updated_at)
      SELECT org_id, student_id, chess_id, password, updated_at
      FROM data
      ON CONFLICT (org_id, student_id) DO UPDATE SET
        chess_id = EXCLUDED.chess_id,
        password = EXCLUDED.password,
        updated_at = EXCLUDED.updated_at
    `;
    await pool.query(sql, [JSON.stringify(payload)]);
    return { ok: true, upserted: payload.length };
  }

  async function getStudentCredentials(orgId, studentId) {
    const oid = String(orgId || '').trim();
    const sid = String(studentId || '').trim();
    if (!oid || !sid) return null;
    const pool = appDb.getPool();
    if (!pool) return null;
    await ensureSchema();
    const res = await pool.query(
      `SELECT chess_id, password, updated_at
       FROM chesscom_settings
       WHERE org_id = $1 AND student_id = $2
       LIMIT 1`,
      [oid, sid]
    );
    const r = res.rows?.[0];
    if (!r) return null;
    return {
      chessId: r.chess_id != null ? String(r.chess_id) : '',
      password: r.password != null ? String(r.password) : '',
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null
    };
  }

  return {
    ensureSchema,
    getOrgSettings,
    getAllSettings,
    upsertOrgSettings,
    getStudentCredentials
  };
}

module.exports = { createChessComSettingsDb };


