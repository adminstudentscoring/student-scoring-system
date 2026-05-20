import type { Express } from 'express';

const http = require('http');
const WebSocket = require('ws');
const bootstrap = require('./bootstrap');
const stores = require('./stores');
const blunders = require('./blundersInit');
const { setWss } = require('./ws');
const { setupVcpChess } = require('@student-scoring/vcp');
const { verifyToken } = require('@student-scoring/core');
const appDbMigrate = require('@student-scoring/core/src/db/migrate');

const {
  PORT,
  NODE_ENV,
  DATA_FILE,
  VCP_CHESS_GAMES_FILE,
  logProcessContext,
  formatError,
  isRecoverableDbStartupError,
  isRecoverableFsStartupError
} = bootstrap;

const {
  ensureDataDir,
  initializeDataFile,
  billingDb,
  appDb,
  readData,
  readUsers
} = stores;

const {
  nowIso,
  maybeRunChessComRatingsRefreshAllOrgs,
  maybeRunBlundersDailySyncAllStudents,
  maybeRunAutoRenewAllOrgs,
  blundersDbRetryTick
} = blunders;

async function startServer(app: Express): Promise<void> {
  let fileStorageReady = true;
  try {
    await ensureDataDir();
    await initializeDataFile();
  } catch (e) {
    if (isRecoverableFsStartupError(e)) {
      fileStorageReady = false;
      console.warn('File storage unavailable at startup; continuing with file-backed features degraded:', formatError(e));
    } else {
      throw e;
    }
  }
  let billingSchemaReady = true;
  try {
    await billingDb.ensureBillingSchema();
  } catch (e) {
    if (appDb.getPool() && isRecoverableDbStartupError(e)) {
      billingSchemaReady = false;
      console.warn('Billing schema unavailable at startup; continuing with billing features degraded:', formatError(e));
    } else {
      throw e;
    }
  }
  // Optional: run app migrations (disabled by default; enable explicitly when ready).
  try {
    if (String(process.env.DB_AUTO_MIGRATE || '') === '1') {
      const r = await appDbMigrate.migrate();
      console.log(`Postgres migrations applied: ${Number(r?.applied || 0)} / ${Number(r?.total || 0)}`);
    }
  } catch (e) {
    console.error('DB_AUTO_MIGRATE failed:', e);
  }
  // Best-effort: expose DB connectivity in logs (does not crash server if DB missing).
  try {
    if (appDb.getPool()) {
      await appDb.dbPing();
      console.log('Postgres: connected.');
    } else {
      console.log('Postgres: not configured (skipping).');
    }
  } catch (e) {
    console.warn('Postgres: ping failed:', String(e?.message || e));
  }
  if (!billingSchemaReady) {
    console.warn('Billing: degraded mode (startup skipped billing schema because Postgres is unreachable).');
  }
  if (!fileStorageReady) {
    console.warn('File storage: degraded mode (startup skipped writable data initialization due to filesystem permissions).');
  }
  
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  // Graceful shutdown (Railway sends SIGTERM during deploy/restart)
  const shutdown = (signal: string) => {
    logProcessContext('shutdown', { signal });
    try { server.close(() => process.exit(0)); } catch { try { process.exit(0); } catch {} }
    try { setTimeout(() => process.exit(0), 5000).unref?.(); } catch {}
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // V.Chess Platform (WebSocket realtime) — extracted to server/vcp/vcpChess.js
  await setupVcpChess({ wss, WebSocket, fs: stores.fs, VCP_CHESS_GAMES_FILE, verifyToken, readData, readUsers, nowIso });

  // IMPORTANT for containers/PaaS (Railway, Render, Fly, etc.):
  // - bind to 0.0.0.0 so the platform can route traffic into the container
  // - still respect PORT provided by the platform
  await new Promise<void>((resolve, reject) => {
    const onError = (error: any) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      console.log(`FORCE_HTTPS: ${String(process.env.FORCE_HTTPS || '') || '(unset)'}`);
      console.log(`Data file: ${DATA_FILE}`);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(PORT, '0.0.0.0');
  });

  // Daily Chess.com ratings refresh (HK time). Safe + lightweight (cached).
  // - Runs after the configured HK time once per HK day.
  // - Also safe to call on-demand via teacher UI (we use cached values there).
  try {
    setInterval(() => {
      maybeRunChessComRatingsRefreshAllOrgs().catch(() => {});
      maybeRunBlundersDailySyncAllStudents().catch(() => {});
      maybeRunAutoRenewAllOrgs().catch(() => {});
    }, 5 * 60 * 1000);
  } catch {}

  // Best-effort DB sync retries (tags/puzzles) so UI doesn't depend on transient Postgres availability.
  try {
    const t = setInterval(() => {
      blundersDbRetryTick().catch(() => {});
    }, 15 * 1000);
    // Don't keep the process alive just for retries.
    t.unref?.();
  } catch {}

  // Make wss available globally for broadcast
  setWss(wss);
  (global as any).wss = wss;
}

export {};

module.exports = { startServer };
