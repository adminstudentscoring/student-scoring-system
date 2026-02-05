// CLI runner: applies db/migrations/*.sql
require('dotenv').config();
const { migrate } = require('../db/migrate');

function isConnectionishError(e) {
  const msg = String(e?.message || e || '').toLowerCase();
  const code = String(e?.code || '').toUpperCase();
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') return true;
  if (msg.includes('etimedout') || msg.includes('econnrefused') || msg.includes('enotfound')) return true;
  if (msg.includes('timeout') || msg.includes('connect') || msg.includes('connection')) return true;
  if (msg.includes('postgres not configured')) return true;
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const strict = String(process.env.DB_MIGRATE_STRICT || '') === '1';
  const maxRetries = Math.max(0, parseInt(String(process.env.DB_MIGRATE_RETRIES || '4'), 10) || 4);
  let attempt = 0;
  // Exponential backoff: 1s, 2s, 4s, 8s...
  while (true) {
    try {
      const r = await migrate();
      console.log(`Migrations complete. Applied: ${r.applied} / ${r.total}`);
      process.exit(0);
      return;
    } catch (e) {
      attempt += 1;
      const connish = isConnectionishError(e);
      console.error('Migration failed:', e);
      if (!connish) {
        // Real SQL/migration error - always fail
        process.exit(1);
        return;
      }
      if (attempt > maxRetries) {
        if (strict) {
          console.error('Migration failed after retries (strict mode).');
          process.exit(1);
          return;
        }
        console.warn('Migration skipped (DB unreachable). Continuing without migrations.');
        process.exit(0);
        return;
      }
      const delayMs = Math.min(30000, Math.pow(2, attempt - 1) * 1000);
      console.warn(`DB unreachable, retrying migrations in ${delayMs}ms... (attempt ${attempt}/${maxRetries})`);
      await sleep(delayMs);
    }
  }
}

run();


