const { Pool } = require('pg');

function buildConnectionStringFromParts() {
  const host = String(process.env.PGHOST || '').trim();
  const port = String(process.env.PGPORT || '').trim();
  const user = String(process.env.PGUSER || '').trim();
  const password = String(process.env.PGPASSWORD || '').trim();
  const database = String(process.env.PGDATABASE || process.env.POSTGRES_DB || '').trim();
  if (!host || !user || !database) return '';
  const p = port ? `:${encodeURIComponent(port)}` : '';
  const pass = password ? `:${encodeURIComponent(password)}` : '';
  return `postgres://${encodeURIComponent(user)}${pass}@${encodeURIComponent(host)}${p}/${encodeURIComponent(database)}`;
}

function pickDatabaseUrl() {
  // Railway provides DATABASE_URL (internal) and DATABASE_PUBLIC_URL (public).
  // Prefer DATABASE_URL in Railway runtime.
  const direct = String(process.env.DATABASE_URL || '').trim();
  if (direct) return direct;
  const pub = String(process.env.DATABASE_PUBLIC_URL || '').trim();
  if (pub) return pub;
  const fromParts = buildConnectionStringFromParts();
  return fromParts;
}

function buildSslOption(connectionString) {
  const cs = String(connectionString || '');
  const sslMode = String(process.env.PGSSLMODE || '').trim().toLowerCase();
  if (sslMode === 'disable') return false;
  // Railway internal network doesn't need SSL; public URLs generally do.
  const isRailwayInternal = cs.includes('railway.internal');
  if (isRailwayInternal) return false;
  // Default to permissive SSL for managed services (Railway, Render, etc.).
  return { rejectUnauthorized: false };
}

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = pickDatabaseUrl();
  if (!connectionString) return null;
  pool = new Pool({ connectionString, ssl: buildSslOption(connectionString) });
  return pool;
}

async function dbQuery(text, params) {
  const p = getPool();
  if (!p) throw new Error('Postgres not configured (missing DATABASE_URL / DATABASE_PUBLIC_URL / PG* vars)');
  return p.query(text, params);
}

async function dbPing() {
  const res = await dbQuery('SELECT 1 AS ok', []);
  return !!res?.rows?.[0]?.ok;
}

module.exports = {
  getPool,
  dbQuery,
  dbPing
};


