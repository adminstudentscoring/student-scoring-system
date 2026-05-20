const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

const PORT = process.env.PORT || 7001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATA_DIR = process.env.DATA_DIR || 'data';
const DATA_FILE = path.join(ROOT_DIR, process.env.DATA_FILE || path.join(DATA_DIR, 'students.txt'));
const SAVES_DIR = path.join(ROOT_DIR, process.env.SAVES_DIR || path.join(DATA_DIR, 'saves'));
const GAME_SAVES_DIR = path.join(ROOT_DIR, process.env.GAME_SAVES_DIR || path.join(DATA_DIR, 'game-saves'));
const RUNNING_QUEEN_LEADERBOARD_FILE = path.join(ROOT_DIR, process.env.RUNNING_QUEEN_LEADERBOARD_FILE || path.join(DATA_DIR, 'running-queen-leaderboard.txt'));
const ROYAL_EXCHANGE_LEADERBOARD_FILE = path.join(ROOT_DIR, process.env.ROYAL_EXCHANGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'royal-exchange-leaderboard.txt'));
const HOPE_MATE_LEADERBOARD_FILE = path.join(ROOT_DIR, process.env.HOPE_MATE_LEADERBOARD_FILE || path.join(DATA_DIR, 'hope-mate-leaderboard.txt'));
const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = path.join(ROOT_DIR, process.env.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'hope-mate-challenge-leaderboard.json'));
const HOPE_MATE_STAGE_PUZZLES_FILE = path.join(ROOT_DIR, process.env.HOPE_MATE_STAGE_PUZZLES_FILE || path.join(DATA_DIR, 'hope-mate-stage-puzzles.json'));
const VCP_CHESS_GAMES_FILE = path.join(ROOT_DIR, process.env.VCP_CHESS_GAMES_FILE || path.join(DATA_DIR, 'vcp-chess-games.jsonl'));
const CHESSCOM_SETTINGS_FILE = path.join(ROOT_DIR, process.env.CHESSCOM_SETTINGS_FILE || path.join(DATA_DIR, 'chesscom-settings.json'));
// AI coach comments (file cache; one per student per range)
const BLUNDERS_AI_COMMENTS_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_AI_COMMENTS_FILE || path.join(DATA_DIR, 'blunders-ai-comments.json'));
// Best-effort DB sync retry queue (for when Postgres hiccups; keeps UI responsive)
const BLUNDERS_DB_RETRY_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_DB_RETRY_FILE || path.join(DATA_DIR, 'blunders-db-retry.json'));


// (initialized after Blunders storage + stats helpers are available)
const BLUNDERS_PUZZLES_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_PUZZLES_FILE || path.join(DATA_DIR, 'blunders-puzzles.json'));
const BLUNDERS_STATS_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_STATS_FILE || path.join(DATA_DIR, 'blunders-stats.json'));
const BLUNDERS_SETTINGS_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_SETTINGS_FILE || path.join(DATA_DIR, 'blunders-settings.json'));
const BLUNDERS_MASTER_PROGRESS_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_MASTER_PROGRESS_FILE || path.join(DATA_DIR, 'blunders-master-progress.json'));
const BLUNDERS_CHALLENGE_SESSIONS_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_CHALLENGE_SESSIONS_FILE || path.join(DATA_DIR, 'blunders-challenge-sessions.json'));
const BLUNDERS_CHALLENGE_LEADERBOARD_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_CHALLENGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'blunders-challenge-leaderboard.json'));
const BLUNDERS_TEACHER_JOBS_FILE = path.join(ROOT_DIR, process.env.BLUNDERS_TEACHER_JOBS_FILE || path.join(DATA_DIR, 'blunders-teacher-jobs.json'));
const CHESSCOM_RATINGS_FILE = path.join(ROOT_DIR, process.env.CHESSCOM_RATINGS_FILE || path.join(DATA_DIR, 'chesscom-ratings.json'));
const TACTICS_FIGHTER_ATTEMPTS_FILE = path.join(ROOT_DIR, process.env.TACTICS_FIGHTER_ATTEMPTS_FILE || path.join(DATA_DIR, 'tactics-fighter-attempts.jsonl'));
const USERS_FILE = path.join(ROOT_DIR, process.env.USERS_FILE || path.join(DATA_DIR, 'users.txt'));
const ORGANIZATIONS_FILE = path.join(ROOT_DIR, process.env.ORGANIZATIONS_FILE || path.join(DATA_DIR, 'organizations.txt'));
const COURSES_FILE = path.join(ROOT_DIR, process.env.COURSES_FILE || path.join(DATA_DIR, 'courses.txt'));
const PACKAGES_FILE = path.join(ROOT_DIR, process.env.PACKAGES_FILE || path.join(DATA_DIR, 'packages.json'));
const SUBSCRIPTION_PRICES_FILE = path.join(ROOT_DIR, process.env.SUBSCRIPTION_PRICES_FILE || path.join(DATA_DIR, 'subscription-prices.json'));
const SUBSCRIPTION_PACKAGES_FILE = path.join(ROOT_DIR, process.env.SUBSCRIPTION_PACKAGES_FILE || path.join(DATA_DIR, 'subscription-packages.json'));
const SUBSCRIPTION_AUDIT_FILE = path.join(ROOT_DIR, process.env.SUBSCRIPTION_AUDIT_FILE || path.join(DATA_DIR, 'subscription-audit.jsonl'));
const TIMETABLE_FILE = path.join(ROOT_DIR, process.env.TIMETABLE_FILE || path.join(DATA_DIR, 'timetable.json'));
const ORDERS_FILE = path.join(ROOT_DIR, process.env.ORDERS_FILE || path.join(DATA_DIR, 'orders.json'));
const VCHESS_INVOICE_IMPORTS_FILE = path.join(
  ROOT_DIR,
  process.env.VCHESS_INVOICE_IMPORTS_FILE || path.join(DATA_DIR, 'vchess-invoice-imports.json')
);
const ENROLLMENTS_FILE = path.join(ROOT_DIR, process.env.ENROLLMENTS_FILE || path.join(DATA_DIR, 'enrollments.json'));
const ATTENDANCE_FILE = path.join(ROOT_DIR, process.env.ATTENDANCE_FILE || path.join(DATA_DIR, 'attendance.json'));
const TRANSACTIONS_FILE = path.join(ROOT_DIR, process.env.TRANSACTIONS_FILE || path.join(DATA_DIR, 'transactions.json'));
const EXPENSES_FILE = path.join(ROOT_DIR, process.env.EXPENSES_FILE || path.join(DATA_DIR, 'expenses.json'));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

function logProcessContext(tag: string, extra?: Record<string, any>): void {
  try {
    const mem = process.memoryUsage ? process.memoryUsage() : null;
    console.error(`[${new Date().toISOString()}] ${tag}`, {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.round(process.uptime ? process.uptime() : 0),
      rssMB: mem ? Math.round((mem.rss || 0) / 1024 / 1024) : null,
      heapUsedMB: mem ? Math.round((mem.heapUsed || 0) / 1024 / 1024) : null,
      ...((extra && typeof extra === 'object') ? extra : {})
    });
  } catch {}
}

function formatError(error: any): string {
  return String(error?.stack || error?.message || error || 'Unknown error');
}

function isRecoverableDbStartupError(error: any): boolean {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  const message = formatError(error).toLowerCase();
  return [
    'econnrefused',
    'connect etimedout',
    'connection terminated unexpectedly',
    'timeout expired',
    'getaddrinfo',
    'the database system is starting up'
  ].some(fragment => message.includes(fragment));
}

function isRecoverableFsStartupError(error: any): boolean {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (['EACCES', 'EPERM', 'EROFS'].includes(code)) {
    return true;
  }

  const message = formatError(error).toLowerCase();
  return [
    'permission denied',
    'read-only file system',
    'operation not permitted',
    'eacces',
    'eperm',
    'erofs'
  ].some(fragment => message.includes(fragment));
}

process.on('unhandledRejection', (reason) => {
  logProcessContext('unhandledRejection', { reason: formatError(reason) });
});

process.on('uncaughtException', (err) => {
  logProcessContext('uncaughtException', { error: formatError(err) });
  // In production, exit so Railway can restart a clean process.
  if ((process.env.NODE_ENV || 'development') === 'production') {
    try { setTimeout(() => process.exit(1), 500).unref?.(); } catch {}
  }
});

module.exports = {
  ROOT_DIR,
  PORT,
  NODE_ENV,
  DATA_DIR,
  DATA_FILE,
  SAVES_DIR,
  GAME_SAVES_DIR,
  RUNNING_QUEEN_LEADERBOARD_FILE,
  ROYAL_EXCHANGE_LEADERBOARD_FILE,
  HOPE_MATE_LEADERBOARD_FILE,
  HOPE_MATE_CHALLENGE_LEADERBOARD_FILE,
  HOPE_MATE_STAGE_PUZZLES_FILE,
  VCP_CHESS_GAMES_FILE,
  CHESSCOM_SETTINGS_FILE,
  BLUNDERS_AI_COMMENTS_FILE,
  BLUNDERS_DB_RETRY_FILE,
  BLUNDERS_PUZZLES_FILE,
  BLUNDERS_STATS_FILE,
  BLUNDERS_SETTINGS_FILE,
  BLUNDERS_MASTER_PROGRESS_FILE,
  BLUNDERS_CHALLENGE_SESSIONS_FILE,
  BLUNDERS_CHALLENGE_LEADERBOARD_FILE,
  BLUNDERS_TEACHER_JOBS_FILE,
  CHESSCOM_RATINGS_FILE,
  TACTICS_FIGHTER_ATTEMPTS_FILE,
  USERS_FILE,
  ORGANIZATIONS_FILE,
  COURSES_FILE,
  PACKAGES_FILE,
  SUBSCRIPTION_PRICES_FILE,
  SUBSCRIPTION_PACKAGES_FILE,
  SUBSCRIPTION_AUDIT_FILE,
  TIMETABLE_FILE,
  ORDERS_FILE,
  VCHESS_INVOICE_IMPORTS_FILE,
  ENROLLMENTS_FILE,
  ATTENDANCE_FILE,
  TRANSACTIONS_FILE,
  EXPENSES_FILE,
  CORS_ORIGIN,
  logProcessContext,
  formatError,
  isRecoverableDbStartupError,
  isRecoverableFsStartupError
};

export {};
