import type { Pool as PoolType } from 'pg';
const fs = require('fs');
const path = require('path');
const { getPool, dbQuery } = require('./postgres');

interface SqlMigration {
  name: string;
  fullPath: string;
}

interface MigrateResult {
  applied: number;
  total: number;
}

function listSqlMigrations(): SqlMigration[] {
  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f: string) => f.toLowerCase().endsWith('.sql'))
    .sort()
    .map((f: string) => ({ name: f, fullPath: path.join(dir, f) }));
}

async function ensureMigrationsTable(): Promise<void> {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  await ensureMigrationsTable();
  const res = await dbQuery('SELECT name FROM schema_migrations', []);
  return new Set((res.rows || []).map((r: { name?: string }) => String(r.name || '')).filter(Boolean));
}

async function applyMigration(name: string, sql: string): Promise<void> {
  const pool: PoolType | null = getPool();
  if (!pool) throw new Error('Postgres not configured (missing DATABASE_URL / DATABASE_PUBLIC_URL / PG* vars)');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function migrate(): Promise<MigrateResult> {
  const migrations = listSqlMigrations();
  if (!migrations.length) return { applied: 0, total: 0 };
  const appliedSet = await getAppliedMigrations();

  let applied = 0;
  for (const m of migrations) {
    if (appliedSet.has(m.name)) continue;
    const sql = fs.readFileSync(m.fullPath, 'utf8');
    await applyMigration(m.name, sql);
    applied++;
  }
  return { applied, total: migrations.length };
}

export { migrate };

