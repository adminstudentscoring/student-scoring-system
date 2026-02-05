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
  // Some hosts provide both:
  // - DATABASE_URL: internal/private network URL (may be unreachable from non-co-located services)
  // - DATABASE_PUBLIC_URL: public URL
  // We pick the best option heuristically, with override via DATABASE_URL_PREFER.
  const direct = String(process.env.DATABASE_URL || '').trim();
  const pub = String(process.env.DATABASE_PUBLIC_URL || '').trim();
  const prefer = String(process.env.DATABASE_URL_PREFER || '').trim().toLowerCase(); // public | internal

  const isPrivateHost = (hostname) => {
    const h = String(hostname || '').trim().toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    const m172 = h.match(/^172\.(\d+)\./);
    if (m172) {
      const n = Number(m172[1]);
      if (Number.isFinite(n) && n >= 16 && n <= 31) return true;
    }
    // IPv6 ULA (fd00::/8, fc00::/8) / link-local
    if (h.startsWith('fd') || h.startsWith('fc') || h.startsWith('fe80')) return true;
    // Generic internal domains
    if (h.endsWith('.internal')) return true;
    return false;
  };

  const hostOf = (url) => {
    try {
      return new URL(String(url || '')).hostname || '';
    } catch {
      return '';
    }
  };

  if (prefer === 'public' && pub) return pub;
  if ((prefer === 'internal' || prefer === 'direct') && direct) return direct;

  if (direct && pub) {
    // If the direct URL points to Railway internal DNS, it's generally safe to use in Railway runtime.
    if (direct.includes('railway.internal')) return direct;
    // If direct host is private/ULA, prefer the public URL to avoid ETIMEDOUT in external runtimes.
    const directHost = hostOf(direct);
    if (isPrivateHost(directHost)) return pub;
    return direct;
  }

  if (direct) return direct;
  if (pub) return pub;
  return buildConnectionStringFromParts();
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
  // Fail fast on bad/unreachable DB during deploy (avoid long hangs).
  pool = new Pool({
    connectionString,
    ssl: buildSslOption(connectionString),
    connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS || 8000) || 8000
  });
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


