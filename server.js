// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const { openAiEnabled, openAiJson } = require('./ai/openai');

const app = express();

// ============================
// Process-level crash diagnostics (Railway)
// ============================
function logProcessContext(tag, extra) {
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

process.on('unhandledRejection', (reason) => {
  logProcessContext('unhandledRejection', { reason: String(reason?.stack || reason?.message || reason) });
});

process.on('uncaughtException', (err) => {
  logProcessContext('uncaughtException', { error: String(err?.stack || err?.message || err) });
  // In production, exit so Railway can restart a clean process.
  if ((process.env.NODE_ENV || 'development') === 'production') {
    try { setTimeout(() => process.exit(1), 500).unref?.(); } catch {}
  }
});

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATA_DIR = process.env.DATA_DIR || 'data';
const DATA_FILE = path.join(__dirname, process.env.DATA_FILE || path.join(DATA_DIR, 'students.txt'));
const SAVES_DIR = path.join(__dirname, process.env.SAVES_DIR || path.join(DATA_DIR, 'saves'));
const GAME_SAVES_DIR = path.join(__dirname, process.env.GAME_SAVES_DIR || path.join(DATA_DIR, 'game-saves'));
const RUNNING_QUEEN_LEADERBOARD_FILE = path.join(__dirname, process.env.RUNNING_QUEEN_LEADERBOARD_FILE || path.join(DATA_DIR, 'running-queen-leaderboard.txt'));
const ROYAL_EXCHANGE_LEADERBOARD_FILE = path.join(__dirname, process.env.ROYAL_EXCHANGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'royal-exchange-leaderboard.txt'));
const HOPE_MATE_LEADERBOARD_FILE = path.join(__dirname, process.env.HOPE_MATE_LEADERBOARD_FILE || path.join(DATA_DIR, 'hope-mate-leaderboard.txt'));
const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = path.join(__dirname, process.env.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'hope-mate-challenge-leaderboard.json'));
const HOPE_MATE_STAGE_PUZZLES_FILE = path.join(__dirname, process.env.HOPE_MATE_STAGE_PUZZLES_FILE || path.join(DATA_DIR, 'hope-mate-stage-puzzles.json'));
const VCP_CHESS_GAMES_FILE = path.join(__dirname, process.env.VCP_CHESS_GAMES_FILE || path.join(DATA_DIR, 'vcp-chess-games.jsonl'));
const CHESSCOM_SETTINGS_FILE = path.join(__dirname, process.env.CHESSCOM_SETTINGS_FILE || path.join(DATA_DIR, 'chesscom-settings.json'));
// AI coach comments (file cache; one per student per range)
const BLUNDERS_AI_COMMENTS_FILE = path.join(__dirname, process.env.BLUNDERS_AI_COMMENTS_FILE || path.join(DATA_DIR, 'blunders-ai-comments.json'));
// Best-effort DB sync retry queue (for when Postgres hiccups; keeps UI responsive)
const BLUNDERS_DB_RETRY_FILE = path.join(__dirname, process.env.BLUNDERS_DB_RETRY_FILE || path.join(DATA_DIR, 'blunders-db-retry.json'));

// ===== Blunders: AI coach comment (moved to server/blunders/ai.js) =====
let readBlundersAiComments = async () => ({});
let writeBlundersAiComments = async () => true;
let aiCommentCacheKey = () => '';
let aiCommentIsFresh = () => false;
let generateStudentAiCommentMonth = async () => ({ ok: false, error: 'ai not initialized' });

// ===== Blunders: DB retry queue (moved to server/blunders/dbRetry.js) =====
let readBlundersDbRetry = async () => ({ updatedAt: nowIso(), items: [] });
let writeBlundersDbRetry = async () => true;
let enqueueBlundersDbRetry = async () => false;
let blundersDbRetryTick = async () => {};
let dbRetryBackoffMs = () => 10_000;

// (initialized after Blunders storage + stats helpers are available)
const BLUNDERS_PUZZLES_FILE = path.join(__dirname, process.env.BLUNDERS_PUZZLES_FILE || path.join(DATA_DIR, 'blunders-puzzles.json'));
const BLUNDERS_STATS_FILE = path.join(__dirname, process.env.BLUNDERS_STATS_FILE || path.join(DATA_DIR, 'blunders-stats.json'));
const BLUNDERS_SETTINGS_FILE = path.join(__dirname, process.env.BLUNDERS_SETTINGS_FILE || path.join(DATA_DIR, 'blunders-settings.json'));
const BLUNDERS_MASTER_PROGRESS_FILE = path.join(__dirname, process.env.BLUNDERS_MASTER_PROGRESS_FILE || path.join(DATA_DIR, 'blunders-master-progress.json'));
const BLUNDERS_CHALLENGE_SESSIONS_FILE = path.join(__dirname, process.env.BLUNDERS_CHALLENGE_SESSIONS_FILE || path.join(DATA_DIR, 'blunders-challenge-sessions.json'));
const BLUNDERS_CHALLENGE_LEADERBOARD_FILE = path.join(__dirname, process.env.BLUNDERS_CHALLENGE_LEADERBOARD_FILE || path.join(DATA_DIR, 'blunders-challenge-leaderboard.json'));
const BLUNDERS_TEACHER_JOBS_FILE = path.join(__dirname, process.env.BLUNDERS_TEACHER_JOBS_FILE || path.join(DATA_DIR, 'blunders-teacher-jobs.json'));
const CHESSCOM_RATINGS_FILE = path.join(__dirname, process.env.CHESSCOM_RATINGS_FILE || path.join(DATA_DIR, 'chesscom-ratings.json'));
const TACTICS_FIGHTER_ATTEMPTS_FILE = path.join(__dirname, process.env.TACTICS_FIGHTER_ATTEMPTS_FILE || path.join(DATA_DIR, 'tactics-fighter-attempts.jsonl'));
const USERS_FILE = path.join(__dirname, process.env.USERS_FILE || path.join(DATA_DIR, 'users.txt'));
const ORGANIZATIONS_FILE = path.join(__dirname, process.env.ORGANIZATIONS_FILE || path.join(DATA_DIR, 'organizations.txt'));
const COURSES_FILE = path.join(__dirname, process.env.COURSES_FILE || path.join(DATA_DIR, 'courses.txt'));
const PACKAGES_FILE = path.join(__dirname, process.env.PACKAGES_FILE || path.join(DATA_DIR, 'packages.json'));
const SUBSCRIPTION_PRICES_FILE = path.join(__dirname, process.env.SUBSCRIPTION_PRICES_FILE || path.join(DATA_DIR, 'subscription-prices.json'));
const SUBSCRIPTION_PACKAGES_FILE = path.join(__dirname, process.env.SUBSCRIPTION_PACKAGES_FILE || path.join(DATA_DIR, 'subscription-packages.json'));
const SUBSCRIPTION_AUDIT_FILE = path.join(__dirname, process.env.SUBSCRIPTION_AUDIT_FILE || path.join(DATA_DIR, 'subscription-audit.jsonl'));
const TIMETABLE_FILE = path.join(__dirname, process.env.TIMETABLE_FILE || path.join(DATA_DIR, 'timetable.json'));
const ORDERS_FILE = path.join(__dirname, process.env.ORDERS_FILE || path.join(DATA_DIR, 'orders.json'));
const ENROLLMENTS_FILE = path.join(__dirname, process.env.ENROLLMENTS_FILE || path.join(DATA_DIR, 'enrollments.json'));
const ATTENDANCE_FILE = path.join(__dirname, process.env.ATTENDANCE_FILE || path.join(DATA_DIR, 'attendance.json'));
const TRANSACTIONS_FILE = path.join(__dirname, process.env.TRANSACTIONS_FILE || path.join(DATA_DIR, 'transactions.json'));
const EXPENSES_FILE = path.join(__dirname, process.env.EXPENSES_FILE || path.join(DATA_DIR, 'expenses.json'));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Generic JSON store factory
const { createJsonStore } = require('./server/storage/jsonStore');

// --- JSON stores for simple read/write pairs ---
const ordersStore = createJsonStore(ORDERS_FILE, []);
const enrollmentsStore = createJsonStore(ENROLLMENTS_FILE, []);
const attendanceStore = createJsonStore(ATTENDANCE_FILE, []);
const transactionsStore = createJsonStore(TRANSACTIONS_FILE, []);
const expensesStore = createJsonStore(EXPENSES_FILE, []);

// --- JSON stores for wrapped-field pairs (used internally by their wrapper functions) ---
const organizationsStore = createJsonStore(ORGANIZATIONS_FILE, { organizations: [], lastUpdate: null });
const usersStore = createJsonStore(USERS_FILE, { users: [], lastUpdate: null });
const coursesStore = createJsonStore(COURSES_FILE, { courses: [], lastUpdate: null });
const packagesStore = createJsonStore(PACKAGES_FILE, { packages: [], lastUpdate: null });
const subscriptionPricesStore = createJsonStore(SUBSCRIPTION_PRICES_FILE, { prices: [], lastUpdate: null });
const subscriptionPackagesStore = createJsonStore(SUBSCRIPTION_PACKAGES_FILE, { packages: [], lastUpdate: null });

// Import authentication utilities
const { hashPassword, comparePassword, generateToken, verifyToken } = require('./auth');
const { authenticateUser, authorizeRole, optionalAuth } = require('./middleware/auth');
const { createRequireOrganizationAccess, filterStudentsByOrganization, filterUsersByOrganization } = require('./middleware/dataIsolation');
const { setupVcpChess } = require('./server/vcp/vcpChess');

// Billing (PayPal + Postgres)
const billingDb = require('./billing/db');
const paypal = require('./billing/paypal');
const billingAccess = require('./billing/access');
const { createPayPalBillingHelpers } = require('./billing/paypalBillingService');

// App Postgres (optional, for future migrations/features)
const appDb = require('./db/postgres');
const appDbMigrate = require('./db/migrate');

// Note: requireOrganizationAccess will be created after readUsers function is defined

// Middleware
// Trust proxy for correct hostname/protocol detection behind reverse proxy (Railway, etc.)
if (NODE_ENV === 'production') {
  app.set('trust proxy', true);
}

// Optional HTTPS enforcement behind reverse proxies.
// Enable with FORCE_HTTPS=1.
if (String(process.env.FORCE_HTTPS || '') === '1') {
  app.use((req, res, next) => {
    try {
      const host = String(req.get('host') || req.hostname || '').toLowerCase();
      const isLocalHost = host.includes('localhost') || host.startsWith('127.0.0.1');
      if (isLocalHost) return next();
      const xfProto = String(req.get('x-forwarded-proto') || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      const xForwardedSsl = String(req.get('x-forwarded-ssl') || '').trim().toLowerCase();
      const cfVisitor = String(req.get('cf-visitor') || '').toLowerCase();
      const isHttps = !!req.secure
        || xfProto === 'https'
        || xForwardedSsl === 'on'
        || cfVisitor.includes('"scheme":"https"');
      if (isHttps) return next();
      const target = `https://${host}${req.originalUrl || req.url || '/'}`;
      if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(301, target);
      return res.redirect(308, target);
    } catch {
      return next();
    }
  });
}

// Configure CORS based on environment
const corsOptions = {
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(origin => origin.trim()),
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Avoid noisy 404s in DevTools when no favicon is provided
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Serve level badges explicitly (and log missing files) to make production debugging easy.
app.get('/assets/level-badge/:file', async (req, res) => {
  try {
    const raw = String(req.params.file || '');
    const file = path.basename(raw); // prevent path traversal
    const full = path.join(__dirname, 'public', 'assets', 'level-badge', file);
    await fs.access(full);
    return res.sendFile(full);
  } catch (e) {
    console.warn('GET /assets/level-badge/:file 404', {
      file: String(req.params.file || ''),
      error: String(e?.message || e)
    });
    return res.status(404).json({ error: 'Not found' });
  }
});

// Redirect root domain to www subdomain
// This handles the DNS limitation where @ (root domain) cannot have CNAME due to MX record conflict
//
// IMPORTANT:
// - Do NOT redirect API calls. Redirecting POST uploads with 301/302 can cause browsers to change POST -> GET.
// - Only redirect safe methods (GET/HEAD). For other methods, preserve method using 308.
app.use((req, res, next) => {
  // Get hostname from request, handling both with and without port
  let hostname = req.get('host') || req.hostname || '';
  
  // Remove port number if present (e.g., "studentscoring.com:3000" -> "studentscoring.com")
  if (hostname.includes(':')) {
    hostname = hostname.split(':')[0];
  }
  
  // Check if request is for root domain (without www)
  if (hostname === 'studentscoring.com') {
    const path = req.originalUrl || req.url || '';
    // Never redirect API endpoints (breaks POST/multipart uploads)
    if (String(path).startsWith('/api/')) return next();

    const protocol = req.protocol || (req.secure ? 'https' : 'http') || 'https';
    const redirectUrl = `${protocol}://www.studentscoring.com${path}`;

    // Use 301 permanent redirect for SEO only for safe methods.
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.redirect(301, redirectUrl);
    }
    // Preserve method/body for non-GET.
    return res.redirect(308, redirectUrl);
  }
  
  next();
});

// Serve static files using absolute paths (avoids 404s when server is started from a different cwd)
app.use(express.static(path.join(__dirname, 'public')));
// Serve game directory (all game-related files)
app.use('/game', express.static(path.join(__dirname, 'game')));
// Serve standalone project monster-fight (now in game directory)
app.use('/game/monster-fight', express.static(path.join(__dirname, 'game/monster-fight')));

// Log whether level-badge assets exist at startup (helps diagnose production 404s).
(async () => {
  try {
    const dir = path.join(__dirname, 'public', 'assets', 'level-badge');
    const items = await fs.readdir(dir);
    console.log(`[assets] level-badge: ${items.length} file(s)`);
  } catch (e) {
    console.warn('[assets] level-badge: missing/unreadable', String(e?.message || e));
  }
})();

// Ensure data directory exists
async function ensureDataDir() {
  const dirs = [
    path.dirname(DATA_FILE),
    SAVES_DIR,
    GAME_SAVES_DIR,
  ];

  const files = [
    { path: RUNNING_QUEEN_LEADERBOARD_FILE,    default: () => JSON.stringify([], null, 2) },
    { path: ROYAL_EXCHANGE_LEADERBOARD_FILE,    default: () => JSON.stringify([], null, 2) },
    { path: HOPE_MATE_LEADERBOARD_FILE,         default: () => JSON.stringify([], null, 2) },
    { path: HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, default: () => JSON.stringify([], null, 2) },
    { path: HOPE_MATE_STAGE_PUZZLES_FILE,       default: () => JSON.stringify({ puzzles: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: VCP_CHESS_GAMES_FILE,               default: () => '' },
    { path: CHESSCOM_SETTINGS_FILE,             default: () => JSON.stringify({ orgs: {} }, null, 2) },
    { path: BLUNDERS_PUZZLES_FILE,              default: () => JSON.stringify({ puzzles: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_STATS_FILE,                default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_SETTINGS_FILE,             default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_MASTER_PROGRESS_FILE,      default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_CHALLENGE_SESSIONS_FILE,   default: () => JSON.stringify({ sessions: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_CHALLENGE_LEADERBOARD_FILE, default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_TEACHER_JOBS_FILE,         default: () => JSON.stringify({ jobs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: CHESSCOM_RATINGS_FILE,              default: () => JSON.stringify({ orgs: {}, meta: { lastRunHkDay: null, lastRunAt: null } }, null, 2) },
    { path: USERS_FILE,                         default: () => JSON.stringify({ users: [] }, null, 2) },
    { path: ORGANIZATIONS_FILE,                 default: () => JSON.stringify({ organizations: [] }, null, 2) },
    { path: COURSES_FILE,                       default: () => JSON.stringify({ courses: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: TIMETABLE_FILE,                     default: () => JSON.stringify({ entries: [], metadata: { classNames: [], classrooms: [], lastUpdate: new Date().toISOString() } }, null, 2) },
    { path: SUBSCRIPTION_PRICES_FILE,           default: () => JSON.stringify({ prices: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: SUBSCRIPTION_PACKAGES_FILE,         default: () => JSON.stringify({ packages: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: SUBSCRIPTION_AUDIT_FILE,            default: () => '' },
  ];

  for (const dir of dirs) {
    try { await fs.access(dir); } catch { await fs.mkdir(dir, { recursive: true }); }
  }

  for (const entry of files) {
    try { await fs.access(entry.path); } catch { await fs.writeFile(entry.path, entry.default(), 'utf8'); }
  }
}

// Read organizations data
async function readOrganizations() {
  const data = await organizationsStore.read();
  return data.organizations || [];
}

// Write organizations data
async function writeOrganizations(organizations) {
  return organizationsStore.write({ organizations, lastUpdate: new Date().toISOString() });
}

// Read users data
async function readUsers() {
  const data = await usersStore.read();
  return data.users || [];
}

// Write users data
async function writeUsers(users) {
  return usersStore.write({ users, lastUpdate: new Date().toISOString() });
}

// ===== Chess.com settings storage (org-scoped) =====
// - Teacher Dashboard: stores chessId + password (for Student Dashboard "Chess.com" application)
// - Blunders: uses chessId mapping (studentId -> chessId) for username lookups
//
// Default behavior:
// - If Postgres is configured: store + read from Postgres
// - Else: fallback to JSON file at CHESSCOM_SETTINGS_FILE
let readChessComSettings = async () => ({});
let writeChessComSettings = async () => false; // file-store only fallback
let getOrgChessComSettings = async () => null;
let upsertOrgChessComSettings = async () => ({ ok: false, reason: 'not_initialized' });
let getStudentChessComCredentials = async () => null;
{
  const { createChessComSettingsStore } = require('./server/storage/chesscomSettings');
  const fileStore = createChessComSettingsStore({ fs, CHESSCOM_SETTINGS_FILE });

  const { createChessComSettingsDb } = require('./server/chesscom/settingsDb');
  const dbStore = createChessComSettingsDb({ appDb });

  writeChessComSettings = fileStore.writeChessComSettings;

  getOrgChessComSettings = async (orgId) => {
    const fromDb = await dbStore.getOrgSettings(orgId);
    if (fromDb !== null) return fromDb;
    const orgs = await fileStore.readChessComSettings();
    const oid = String(orgId || '');
    return (orgs && orgs[oid] && typeof orgs[oid] === 'object') ? orgs[oid] : {};
  };

  upsertOrgChessComSettings = async (orgId, mergedSettings) => {
    const out = await dbStore.upsertOrgSettings(orgId, mergedSettings);
    if (out && out.ok === true) return out;
    // File-store fallback (best-effort)
    try {
      const oid = String(orgId || '');
      if (!oid) return { ok: false, reason: 'missing_org' };
      const orgs = await fileStore.readChessComSettings();
      const prev = (orgs && orgs[oid] && typeof orgs[oid] === 'object') ? orgs[oid] : {};
      orgs[oid] = { ...prev, ...(mergedSettings && typeof mergedSettings === 'object' ? mergedSettings : {}) };
      const ok = await fileStore.writeChessComSettings(orgs);
      return { ok: !!ok, upserted: ok ? Object.keys(mergedSettings || {}).length : 0, source: 'file' };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  };

  getStudentChessComCredentials = async (orgId, studentId) => {
    const cred = await dbStore.getStudentCredentials(orgId, studentId);
    if (cred !== null) return cred;
    // File-store fallback (if present)
    try {
      const oid = String(orgId || '');
      const sid = String(studentId || '');
      const orgs = await fileStore.readChessComSettings();
      const bucket = (orgs && orgs[oid] && typeof orgs[oid] === 'object') ? orgs[oid] : {};
      const ent = bucket && bucket[sid] && typeof bucket[sid] === 'object' ? bucket[sid] : null;
      if (!ent) return null;
      return {
        chessId: ent.chessId != null ? String(ent.chessId) : '',
        password: ent.password != null ? String(ent.password) : '',
        updatedAt: ent.updatedAt != null ? String(ent.updatedAt) : null
      };
    } catch {
      return null;
    }
  };

  // Used by Blunders Chess.com helpers (needs all org mappings).
  readChessComSettings = async () => {
    const all = await dbStore.getAllSettings();
    if (all !== null) return all;
    return await fileStore.readChessComSettings();
  };
}

// ===== Blunders: storage/settings (moved to server/blunders/storage.js) =====
const { createBlundersStorage } = require('./server/blunders/storage');
const {
  // constants
  BLUNDERS_DEFAULTS,
  // settings helpers
  normalizeHkDayKey,
  defaultMastersPreset,
  sanitizeMasterEntry,
  getOrgBlundersSettings,
  getStudentBlundersConfig,
  getMasterBlundersConfig,
  // puzzles
  readBlundersPuzzles,
  writeBlundersPuzzles,
  // stats
  readBlundersStats,
  writeBlundersStats,
  blundersMarkGamesAnalyzed,
  // settings storage
  readBlundersSettings,
  writeBlundersSettings,
  // master progress
  readBlundersMasterProgress,
  writeBlundersMasterProgress,
  // challenge storage
  readBlundersChallengeSessions,
  writeBlundersChallengeSessions,
  readBlundersChallengeLeaderboard,
  writeBlundersChallengeLeaderboard,
  // teacher jobs storage
  readBlundersTeacherJobs,
  writeBlundersTeacherJobs
} = createBlundersStorage({
  fs,
  BLUNDERS_PUZZLES_FILE,
  BLUNDERS_STATS_FILE,
  BLUNDERS_SETTINGS_FILE,
  BLUNDERS_MASTER_PROGRESS_FILE,
  BLUNDERS_CHALLENGE_SESSIONS_FILE,
  BLUNDERS_CHALLENGE_LEADERBOARD_FILE,
  BLUNDERS_TEACHER_JOBS_FILE
});

// (AI init moved further down so it can depend on Blunders stats helpers)

let blundersTeacherJobQueue = [];
let blundersTeacherJobCancel = new Set(); // jobId
let blundersTeacherRunNextJob = async () => {};

function nowIso() { return new Date().toISOString(); }

function blundersChallengeDifficultyConfig(difficulty) {
  const d = String(difficulty || '').toLowerCase();
  // Per requirement:
  // - Easy: 3.0+ (exclude miss-mate)
  // - Medium: 2.0–2.9
  // - Hard: 1.0–1.9
  if (d === 'easy') return { key: 'easy', min: 3.0, max: Infinity, points: 1 };
  if (d === 'medium') return { key: 'medium', min: 2.0, max: 3.0, points: 2 };
  if (d === 'hard') return { key: 'hard', min: 1.0, max: 2.0, points: 3 };
  return null;
}

// ===== Blunders: puzzle/stats helpers (moved to server/blunders/puzzles.js + stats.js) =====
let puzzleSortKeyMs = () => 0;
let threeMonthsAgoMs = () => Date.now();
let puzzleDropPoints = () => 0;
let isMissMatePuzzle = () => false;
let isInvalidSameBestMovePuzzle = () => false;
let blundersBucketKeyOfPuzzle = () => 'd1';
let blundersRatingBucket = () => 'below400';
let pickStudentRatingFromCache = () => ({ rating: null, source: null });
let pickChallengePuzzlesFromAllBlunders = () => [];
let computeRolling3mStats = () => ({ cutoffIso: null, analyzedGames: 0, totalPlies: 0, avgOpponentRating: null, counts: {}, movesPer: {} });
let computeRollingWindowStats = () => ({ cutoffIso: null, analyzedGames: 0, totalPlies: 0, avgOpponentRating: null, counts: {}, movesPer: {} });
let computeStudentMonthStats = () => ({ range: 'month', cutoffIso: null, nowIso: null, current: {}, previous: {}, delta: {}, rolling30d: {} });

// ===== Chess.com helpers (moved to server/blunders/chesscom.js) =====
let HK_OFFSET_SEC = 8 * 3600;
let hkDayKeyFromEpochSec = () => '';
let todayHkKey = () => '';
let hkNow = () => ({ y: 1970, m: 1, d: 1, hh: 0, mm: 0, ss: 0 });
let formatHkTime = () => '';
let fetchJsonWithTimeout = async () => ({ ok: false, status: 0, data: { error: 'chesscom not initialized' } });

let CHESSCOM_RATINGS_REFRESH_HK_HOUR = Number(process.env.CHESSCOM_RATINGS_REFRESH_HK_HOUR || 5);
let CHESSCOM_RATINGS_REFRESH_HK_MIN = Number(process.env.CHESSCOM_RATINGS_REFRESH_HK_MIN || 0);
let readChessComRatings = async () => ({ orgs: {}, meta: {} });
let writeChessComRatings = async () => false;
let pickChessComRating = () => ({ rating: null, source: null });
let fetchChessComStats = async () => ({ ok: false, status: 0, data: { error: 'chesscom not initialized' } });
let getCachedChessComRating = async () => ({ rating: null, source: null, updatedAt: null });
let refreshChessComRatingsForOrg = async () => ({ ok: false, updated: 0 });
let computeNextRatingsRunIso = () => new Date().toISOString();
let maybeRunChessComRatingsRefreshAllOrgs = async () => ({ ok: true, skipped: true });

let BLUNDERS_DAILY_SYNC_HK_HOUR = Number(process.env.BLUNDERS_DAILY_SYNC_HK_HOUR || 4);
let BLUNDERS_DAILY_SYNC_HK_MIN = Number(process.env.BLUNDERS_DAILY_SYNC_HK_MIN || 0);
let blundersDailySyncMeta = { lastRunAt: null, lastRunHkDay: null, lastRunOk: 0, lastRunErr: 0 };
let computeNextBlundersDailyRunIso = () => new Date().toISOString();
let maybeRunBlundersDailySyncAllStudents = async () => ({ ok: true, skipped: true });

// ===== Course Management: Auto-renew (unpaid reserve) =====
let AUTO_RENEW_LEAD_DAYS = Number(process.env.AUTO_RENEW_LEAD_DAYS || 30);
let autoRenewMeta = { lastRunAt: null, lastRunHkDay: null, lastRunOk: 0, lastRunErr: 0 };

let chessComGetGamesForHkDay = async () => [];
let chessComGetTodayGames = async () => [];
let chessComGetRecentGames = async () => [];
let getChessComUsernameForStudent = async () => '';

// ===== Date/schedule helpers (moved to server/lib/dateUtils.js) =====
const { parseUciMove, dateStrFromYmd, parseDateStrToUtcMidnightMs, addDays, addMonths, DOW_NAME_TO_NUM, buildSkipDateSet, nextOccurrencesForEntry, packageLessonCount, computePackagePrice } = require('./server/lib/dateUtils');

function hkTodayDateStr() {
  const t = hkNow();
  return dateStrFromYmd(t.y, t.m, t.d);
}

async function maybeRunAutoRenewAllOrgs() {
  try {
    const hkDay = todayHkKey();
    if (autoRenewMeta.lastRunHkDay && autoRenewMeta.lastRunHkDay === hkDay) return { ok: true, skipped: true };

    // Run once per HK day (lightweight; dedupe via order meta anyway)
    const today = hkTodayDateStr();
    const [organizations, data, orders, enrollments, timetable, packages, courses] = await Promise.all([
      readOrganizations(),
      readData(),
      readOrders(),
      readEnrollments(),
      readTimetable(),
      readPackages(),
      readCourses()
    ]);

    const orgById = new Map(organizations.map(o => [String(o.id), o]));
    const ordersById = new Map(orders.map(o => [String(o.id), o]));
    const coursesById = new Map(courses.map(c => [String(c.id), c]));
    const packagesById = new Map(packages.map(p => [String(p.id), p]));
    const entryById = new Map((timetable?.entries || []).map(e => [String(e.id), e]));

    let createdOrders = 0;
    let createdEnrollments = 0;
    let skipped = 0;

    const students = Array.isArray(data?.students) ? data.students : [];
    for (const stu of students) {
      if (!stu || !stu.autoRenewEnabled) continue;
      const orgId = String(stu.organizationId || '');
      const timetableEntryId = String(stu.autoRenewTimetableEntryId || '');
      const packageId = String(stu.autoRenewPackageId || '');
      if (!orgId || !timetableEntryId || !packageId) { skipped++; continue; }

      const org = orgById.get(orgId);
      const entry = entryById.get(timetableEntryId);
      const pkg = packagesById.get(packageId);
      if (!org || !entry || !pkg) { skipped++; continue; }

      // Find the latest PAID order cycle for this student+entry+package by enrollments max date
      const paidEnrolls = enrollments.filter(e =>
        String(e.organizationId) === orgId &&
        String(e.studentId) === String(stu.id) &&
        String(e.timetableEntryId) === timetableEntryId &&
        e.orderId &&
        ordersById.get(String(e.orderId)) &&
        String(ordersById.get(String(e.orderId)).status) === 'paid'
      );
      if (paidEnrolls.length === 0) { skipped++; continue; }

      // Filter to cycles where the order includes the packageId
      const paidEnrollsWithPkg = paidEnrolls.filter(e => {
        const o = ordersById.get(String(e.orderId));
        const items = Array.isArray(o?.items) ? o.items : [];
        return items.some(it => String(it?.productData?.id || '') === packageId);
      });
      if (paidEnrollsWithPkg.length === 0) { skipped++; continue; }

      let last = null;
      for (const e of paidEnrollsWithPkg) {
        if (!e.date) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) continue;
        if (!last || String(e.date) > String(last.date)) last = e;
      }
      if (!last) { skipped++; continue; }

      const sourceOrderId = String(last.orderId);
      const sourceOrder = ordersById.get(sourceOrderId);
      if (!sourceOrder) { skipped++; continue; }

      // Compute last class date for this order+entry
      const sourceEnrolls = enrollments.filter(e =>
        String(e.organizationId) === orgId &&
        String(e.studentId) === String(stu.id) &&
        String(e.timetableEntryId) === timetableEntryId &&
        String(e.orderId) === sourceOrderId &&
        typeof e.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date)
      );
      if (sourceEnrolls.length === 0) { skipped++; continue; }
      const lastClassDate = sourceEnrolls.reduce((mx, e) => (!mx || e.date > mx ? e.date : mx), null);
      const generateOn = addDays(lastClassDate, -AUTO_RENEW_LEAD_DAYS);
      if (generateOn !== today) continue; // not due today

      // Dedupe: if we already created a renewal order from this source order, skip
      const already = orders.some(o =>
        String(o.organizationId) === orgId &&
        String(o.studentId) === String(stu.id) &&
        o?.meta?.autoRenew &&
        String(o.meta.autoRenew.sourceOrderId || '') === sourceOrderId
      );
      if (already) { skipped++; continue; }

      // Determine renewal class dates based on package rules
      let nextDates = [];
      if (String(pkg.priceStrategy) === 'monthly') {
        const periodMonths = Number(pkg.monthlyPeriod) || 1;
        const end = addMonths(lastClassDate, periodMonths);
        nextDates = nextOccurrencesForEntry({
          entry,
          startAfterDateStr: lastClassDate,
          endDateStrInclusive: end,
          orgSettings: org.settings || {}
        });
      } else {
        const n = packageLessonCount(pkg);
        if (n <= 0) { skipped++; continue; }
        nextDates = nextOccurrencesForEntry({
          entry,
          startAfterDateStr: lastClassDate,
          count: n,
          orgSettings: org.settings || {}
        });
      }
      if (!Array.isArray(nextDates) || nextDates.length === 0) { skipped++; continue; }

      // Avoid duplicating enrollments if already reserved manually
      const existingDateSet = new Set(enrollments
        .filter(e =>
          String(e.organizationId) === orgId &&
          String(e.studentId) === String(stu.id) &&
          String(e.timetableEntryId) === timetableEntryId &&
          typeof e.date === 'string')
        .map(e => e.date)
      );
      nextDates = nextDates.filter(d => !existingDateSet.has(d));
      if (nextDates.length === 0) { skipped++; continue; }

      // Build order item (package) similar to Sales UI
      const classCount = nextDates.length;
      const price = computePackagePrice({ pkg, coursesById, classCount });
      const orderItem = {
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        productType: 'package',
        productData: pkg,
        enrolledClasses: nextDates.map(ds => ({
          id: `${entry.id}_${Date.parse(`${ds}T00:00:00Z`)}`,
          dateString: ds,
          date: `${ds}T00:00:00.000Z`,
          entry: {
            id: entry.id,
            className: entry.className,
            startTime: entry.startTime,
            endTime: entry.endTime,
            classroom: entry.classroom || null
          }
        })),
        price
      };

      const newOrder = {
        id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        organizationId: orgId,
        studentId: String(stu.id),
        date: new Date().toISOString(),
        status: 'unpaid',
        paymentDetails: null,
        items: [orderItem],
        totalAmount: price,
        createdBy: 'system:autoRenew',
        meta: {
          autoRenew: {
            sourceOrderId,
            packageId,
            timetableEntryId,
            leadDays: AUTO_RENEW_LEAD_DAYS,
            generatedOnHk: today
          }
        }
      };

      orders.push(newOrder);
      ordersById.set(String(newOrder.id), newOrder);
      createdOrders++;

      // Write enrollments for reserved classes
      for (const ds of nextDates) {
        enrollments.push({
          id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          organizationId: orgId,
          studentId: String(stu.id),
          timetableEntryId: entry.id,
          date: ds,
          type: 'single',
          orderId: newOrder.id
        });
        createdEnrollments++;
      }
    }

    if (createdOrders > 0) await writeOrders(orders);
    if (createdEnrollments > 0) await writeEnrollments(enrollments);

    autoRenewMeta.lastRunAt = nowIso();
    autoRenewMeta.lastRunHkDay = hkDay;
    autoRenewMeta.lastRunOk = createdOrders;
    autoRenewMeta.lastRunErr = 0;
    return { ok: true, createdOrders, createdEnrollments, skipped };
  } catch (e) {
    autoRenewMeta.lastRunAt = nowIso();
    autoRenewMeta.lastRunErr = 1;
    console.error('Auto-renew tick error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// ===== Blunders: eval/verdict helpers (moved to server/blunders/eval.js) =====
let scoreToCp = () => 0;
let blundersVerdictFromScores = () => ({ verdict: 'good', ok: true, dropCp: 0, dropPoints: 0, tolCp: 0, bestLike: false });
let uciToSanAtFen = () => '';
let BLUNDERS_BEST_TOL_RATIO = 0.20;
let BLUNDERS_BEST_TOL_MIN_CP = 10;
let BLUNDERS_MATE_OR_HUGE_CP = 800;
let BLUNDERS_GOOD_IF_STILL_AHEAD_CP = 500;

{
  const { createBlundersEval } = require('./server/blunders/eval');
  const ev = createBlundersEval({ Chess, parseUciMove });
  scoreToCp = ev.scoreToCp;
  blundersVerdictFromScores = ev.blundersVerdictFromScores;
  uciToSanAtFen = ev.uciToSanAtFen;
  BLUNDERS_BEST_TOL_RATIO = ev.BLUNDERS_BEST_TOL_RATIO;
  BLUNDERS_BEST_TOL_MIN_CP = ev.BLUNDERS_BEST_TOL_MIN_CP;
  BLUNDERS_MATE_OR_HUGE_CP = ev.BLUNDERS_MATE_OR_HUGE_CP;
  BLUNDERS_GOOD_IF_STILL_AHEAD_CP = ev.BLUNDERS_GOOD_IF_STILL_AHEAD_CP;
}

// ===== Blunders: Chess.com sync (rapid/blitz) =====
const BLUNDERS_ALLOWED_TIME_CLASSES = new Set(['rapid', 'blitz']);
const BLUNDERS_MAX_GAMES_PER_DAY = 10;
// 0 = unlimited (no pruning). Set to a positive number to keep only the latest N puzzles per student.
const BLUNDERS_MAX_PUZZLES_PER_STUDENT = 0;
const BLUNDERS_DROP_POINTS = 1.0; // > 1.0 is blunder
const blundersLastStudentSync = new Map(); // studentId -> ms
const blundersLastStudentHistoryScan = new Map(); // studentId -> ms (teacher-triggered history scan throttle)
const blundersStudentLocks = new Map(); // studentId -> Promise
const blundersSyncState = new Map(); // studentId -> { running, startedAt, updatedAt, finishedAt, stage, gamesFetched, gamesProcessed, pliesProcessed, blundersAdded, lastError }

// ===== Chess.com helpers init (moved to server/blunders/chesscom.js) =====
{
  const { createBlundersChessCom } = require('./server/blunders/chesscom');
  const cc = createBlundersChessCom({
    fs,
    CHESSCOM_RATINGS_FILE,
    readData,
    readChessComSettings,
    getOrgBlundersSettings,
    normalizeHkDayKey,
    BLUNDERS_ALLOWED_TIME_CLASSES,
    BLUNDERS_MAX_GAMES_PER_DAY,
    blundersSyncState,
    nowIso,
    getSyncBlundersForStudent: () => syncBlundersForStudent
  });

  HK_OFFSET_SEC = cc.HK_OFFSET_SEC;
  hkDayKeyFromEpochSec = cc.hkDayKeyFromEpochSec;
  todayHkKey = cc.todayHkKey;
  hkNow = cc.hkNow;
  formatHkTime = cc.formatHkTime;
  fetchJsonWithTimeout = cc.fetchJsonWithTimeout;

  CHESSCOM_RATINGS_REFRESH_HK_HOUR = cc.CHESSCOM_RATINGS_REFRESH_HK_HOUR;
  CHESSCOM_RATINGS_REFRESH_HK_MIN = cc.CHESSCOM_RATINGS_REFRESH_HK_MIN;
  readChessComRatings = cc.readChessComRatings;
  writeChessComRatings = cc.writeChessComRatings;
  pickChessComRating = cc.pickChessComRating;
  fetchChessComStats = cc.fetchChessComStats;
  getCachedChessComRating = cc.getCachedChessComRating;
  refreshChessComRatingsForOrg = cc.refreshChessComRatingsForOrg;
  computeNextRatingsRunIso = cc.computeNextRatingsRunIso;
  maybeRunChessComRatingsRefreshAllOrgs = cc.maybeRunChessComRatingsRefreshAllOrgs;

  BLUNDERS_DAILY_SYNC_HK_HOUR = cc.BLUNDERS_DAILY_SYNC_HK_HOUR;
  BLUNDERS_DAILY_SYNC_HK_MIN = cc.BLUNDERS_DAILY_SYNC_HK_MIN;
  blundersDailySyncMeta = cc.blundersDailySyncMeta;
  computeNextBlundersDailyRunIso = cc.computeNextBlundersDailyRunIso;
  maybeRunBlundersDailySyncAllStudents = cc.maybeRunBlundersDailySyncAllStudents;

  chessComGetGamesForHkDay = cc.chessComGetGamesForHkDay;
  chessComGetTodayGames = cc.chessComGetTodayGames;
  chessComGetRecentGames = cc.chessComGetRecentGames;
  getChessComUsernameForStudent = cc.getChessComUsernameForStudent;
}

// (moved to server/blunders/puzzles.js)

// ===== Blunders: tagging (A) (moved to server/blunders/tagger.js) =====
let BLUNDERS_TAGGER_VERSION = 'v2';
let BLUNDERS_TAGS = {};
let tagBlunderPuzzle = () => [];

{
  const { createBlundersTagger } = require('./server/blunders/tagger');
  const t = createBlundersTagger({ Chess, parseUciMove, puzzleDropPoints, isMissMatePuzzle });
  BLUNDERS_TAGGER_VERSION = t.BLUNDERS_TAGGER_VERSION;
  BLUNDERS_TAGS = t.BLUNDERS_TAGS;
  tagBlunderPuzzle = t.tagBlunderPuzzle;
}

// ===== Blunders: DB helpers (moved to server/blunders/db.js) =====
let dbUpsertPuzzleTags = async () => ({ ok: false, error: 'db helpers not initialized' });
let dbUpsertPuzzlesFromObjects = async () => ({ ok: false, error: 'db helpers not initialized' });

{
  const { createBlundersDb } = require('./server/blunders/db');
  const db = createBlundersDb({
    nowIso,
    // Use a wrapper so the DB helpers always call the latest enqueue function (initialized later).
    enqueueBlundersDbRetry: (...args) => enqueueBlundersDbRetry(...args),
    puzzleSortKeyMs,
    BLUNDERS_TAGGER_VERSION
  });
  dbUpsertPuzzleTags = db.dbUpsertPuzzleTags;
  dbUpsertPuzzlesFromObjects = db.dbUpsertPuzzlesFromObjects;
}

// Now that appDb + dbUpsert* helpers exist, we can initialize the retry queue.
{
  const { createBlundersDbRetry } = require('./server/blunders/dbRetry');
  const r = createBlundersDbRetry({
    fs,
    appDb,
    nowIso,
    BLUNDERS_DB_RETRY_FILE,
    dbUpsertPuzzleTags,
    dbUpsertPuzzlesFromObjects
  });
  readBlundersDbRetry = r.readBlundersDbRetry;
  writeBlundersDbRetry = r.writeBlundersDbRetry;
  enqueueBlundersDbRetry = r.enqueueBlundersDbRetry;
  blundersDbRetryTick = r.blundersDbRetryTick;
  dbRetryBackoffMs = r.dbRetryBackoffMs;
}

// (moved to server/blunders/puzzles.js + stats.js)
let pruneStudentBlundersInPlace = () => ({ changed: false, removed: 0 });
let appendBlundersPuzzlesPreserveProgress = async () => ({ ok: false, error: 'blunders puzzles not initialized' });

// Init remaining Blunders helpers (puzzles + stats) before tagger/sync/routes use them.
{
  const { createBlundersPuzzles } = require('./server/blunders/puzzles');
  const pz = createBlundersPuzzles({
    readBlundersPuzzles,
    writeBlundersPuzzles,
    appDb,
    BLUNDERS_MAX_PUZZLES_PER_STUDENT,
    enqueueBlundersDbRetry
  });
  puzzleSortKeyMs = pz.puzzleSortKeyMs;
  threeMonthsAgoMs = pz.threeMonthsAgoMs;
  puzzleDropPoints = pz.puzzleDropPoints;
  isMissMatePuzzle = pz.isMissMatePuzzle;
  isInvalidSameBestMovePuzzle = pz.isInvalidSameBestMovePuzzle;
  blundersBucketKeyOfPuzzle = pz.blundersBucketKeyOfPuzzle;
  blundersRatingBucket = pz.blundersRatingBucket;
  pickStudentRatingFromCache = pz.pickStudentRatingFromCache;
  pickChallengePuzzlesFromAllBlunders = pz.pickChallengePuzzlesFromAllBlunders;
  pruneStudentBlundersInPlace = pz.pruneStudentBlundersInPlace;
  appendBlundersPuzzlesPreserveProgress = pz.appendBlundersPuzzlesPreserveProgress;

  const { createBlundersStats } = require('./server/blunders/stats');
  const st = createBlundersStats({
    threeMonthsAgoMs,
    puzzleSortKeyMs,
    puzzleDropPoints,
    isMissMatePuzzle,
    blundersBucketKeyOfPuzzle
  });
  computeRolling3mStats = st.computeRolling3mStats;
  computeRollingWindowStats = st.computeRollingWindowStats;
  computeStudentMonthStats = st.computeStudentMonthStats;
}

// ===== Blunders: AI coach comment init (moved to server/blunders/ai.js) =====
{
  const { createBlundersAi } = require('./server/blunders/ai');
  const ai = createBlundersAi({
    fs,
    BLUNDERS_AI_COMMENTS_FILE,
    nowIso,
    openAiEnabled,
    openAiJson,
    readBlundersPuzzles,
    readBlundersStats,
    computeStudentMonthStats
  });
  readBlundersAiComments = ai.readBlundersAiComments;
  writeBlundersAiComments = ai.writeBlundersAiComments;
  aiCommentCacheKey = ai.aiCommentCacheKey;
  aiCommentIsFresh = ai.aiCommentIsFresh;
  generateStudentAiCommentMonth = ai.generateStudentAiCommentMonth;
}

// (moved to server/blunders/chesscom.js)

// ===== Blunders: Stockfish runner (moved to server/blunders/stockfish.js) =====
const { createStockfishRunner } = require('./server/blunders/stockfish');
const { sfEvalFen, sfAnalyzeFen } = createStockfishRunner({ fs, path, spawn, processExecPath: process.execPath, baseDir: __dirname });

// ===== Blunders: sync (student/master) (moved to server/blunders/sync.js) =====
let syncBlundersForStudent = async () => ({ ok: false, error: 'sync not initialized' });
let syncBlundersForMaster = async () => ({ ok: false, error: 'sync not initialized' });

// Init Blunders sync functions before wiring up teacher jobs (jobs depend on sync).
{
  const { createBlundersSync } = require('./server/blunders/sync');
  const sync = createBlundersSync({
    // shared helpers + state
    Chess,
    normalizeHkDayKey,
    todayHkKey,
    blundersSyncState,
    blundersStudentLocks,
    blundersLastStudentSync,
    blundersLastStudentHistoryScan,

    // chess.com + settings
    getChessComUsernameForStudent,
    getStudentBlundersConfig,
    getMasterBlundersConfig,
    chessComGetRecentGames,
    chessComGetGamesForHkDay,
    fetchChessComStats,
    pickChessComRating,

    // storage
    readBlundersPuzzles,
    writeBlundersPuzzles,
    readBlundersStats,
    writeBlundersStats,
    appendBlundersPuzzlesPreserveProgress,

    // engine + scoring
    sfEvalFen,
    scoreToCp,
    blundersVerdictFromScores
  });
  syncBlundersForStudent = sync.syncBlundersForStudent;
  syncBlundersForMaster = sync.syncBlundersForMaster;
}

// ===== Blunders Teacher Jobs (async background processing) (moved to server/blunders/jobs.js) =====
{
  const { createBlundersTeacherJobs } = require('./server/blunders/jobs');
  const jobs = createBlundersTeacherJobs({
    readBlundersTeacherJobs,
    writeBlundersTeacherJobs,
    readData,
    syncBlundersForStudent,
    syncBlundersForMaster,
    getOrgBlundersSettings,
    readBlundersPuzzles,
    writeBlundersPuzzles,
    appDb,
    dbUpsertPuzzleTags,
    BLUNDERS_TAGGER_VERSION,
    tagBlunderPuzzle,
    nowIso
  });
  blundersTeacherJobQueue = jobs.blundersTeacherJobQueue;
  blundersTeacherJobCancel = jobs.blundersTeacherJobCancel;
  blundersTeacherRunNextJob = jobs.blundersTeacherRunNextJob;
}

// Read courses data
async function readCourses() {
  const data = await coursesStore.read();
  return data.courses || [];
}

// Write courses data
async function writeCourses(courses) {
  return coursesStore.write({ courses, lastUpdate: new Date().toISOString() });
}

// Read packages data
async function readPackages() {
  const data = await packagesStore.read();
  return data.packages || [];
}

// Write packages data
async function writePackages(packages) {
  return packagesStore.write({ packages, lastUpdate: new Date().toISOString() });
}

// Read subscription prices data (Admin Subscription Setting -> Price Setting)
async function readSubscriptionPrices() {
  const data = await subscriptionPricesStore.read();
  return Array.isArray(data.prices) ? data.prices : [];
}

// Write subscription prices data
async function writeSubscriptionPrices(prices) {
  return subscriptionPricesStore.write({ prices, lastUpdate: new Date().toISOString() });
}

// Read subscription packages data (Admin Subscription Setting -> Package Setting)
async function readSubscriptionPackages() {
  const data = await subscriptionPackagesStore.read();
  return Array.isArray(data.packages) ? data.packages : [];
}

// ===== Subscription helpers (moved to server/lib/subscriptionHelpers.js) =====
const {
  resolveOrgIdFromUser,
  normalizeSubscriptionStatus,
  normalizePublishState,
  normalizeCurrency,
  dateOnlyTodayString,
  createAppendSubscriptionAudit,
  createCheckExpiredPackages,
  createUpdatePackagesForDeletedCourse
} = require('./server/lib/subscriptionHelpers');

// PayPal subscription helpers (extracted)
const paypalBilling = createPayPalBillingHelpers({
  billingDb,
  paypal,
  readSubscriptionPrices
});

// Write subscription packages data
async function writeSubscriptionPackages(packages) {
  return subscriptionPackagesStore.write({ packages, lastUpdate: new Date().toISOString() });
}

const appendSubscriptionAudit = createAppendSubscriptionAudit({ fs, SUBSCRIPTION_AUDIT_FILE });
const checkExpiredPackages = createCheckExpiredPackages({ readPackages, writePackages });
const updatePackagesForDeletedCourse = createUpdatePackagesForDeletedCourse({ readPackages, writePackages });

// Read timetable data
async function readTimetable() {
  try {
    const content = await fs.readFile(TIMETABLE_FILE, 'utf8');
    const data = JSON.parse(content);
    return {
      entries: data.entries || [],
      metadata: data.metadata || { classNames: [], classrooms: [], lastUpdate: new Date().toISOString() }
    };
  } catch (error) {
    console.error('Error reading timetable:', error);
    return {
      entries: [],
      metadata: { classNames: [], classrooms: [], lastUpdate: new Date().toISOString() }
    };
  }
}

// Write timetable data
async function writeTimetable(timetableData) {
  try {
    timetableData.metadata.lastUpdate = new Date().toISOString();
    await fs.writeFile(TIMETABLE_FILE, JSON.stringify(timetableData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing timetable:', error);
    return false;
  }
}

// Create requireOrganizationAccess middleware with readUsers function
// This must be after readUsers is defined
const requireOrganizationAccess = createRequireOrganizationAccess(readUsers);

// (moved to server/routes/monsterFightGameRoutes.js)

// ===== Constants (moved to server/config/constants.js) =====
const { LEVELS, RANKS } = require('./server/config/constants');

// Initialize data file if it doesn't exist
async function initializeDataFile() {
  try {
    await fs.access(DATA_FILE);
    // Ensure challenge data exists and fix HP if needed
    const data = await readData();
    if (!data.challenge) {
      data.challenge = {
        currentLevel: 1,
        currentHP: LEVELS[0].maxHP,
        completedLevels: [],
        totalDamage: 0
      };
      await writeData(data);
    } else {
      // Fix currentHP if it exceeds maxHP (due to config changes)
      const currentLevelInfo = LEVELS[data.challenge.currentLevel - 1] || LEVELS[0];
      if (data.challenge.currentHP > currentLevelInfo.maxHP) {
        data.challenge.currentHP = currentLevelInfo.maxHP;
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
      }
      
      // Migrate existing students: add stats if missing
      let needsMigration = false;
      data.students.forEach(student => {
        if (!student.stats) {
          student.stats = {
            daily: {},
            weekly: {},
            monthly: {}
          };
          needsMigration = true;
        }
      });
      
      if (needsMigration) {
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        console.log('✅ Migrated student statistics data');
      }
    }
  } catch {
    const initialData = {
      students: [],
      battles: [],
      challenge: {
        currentLevel: 1,
        currentHP: LEVELS[0].maxHP,
        completedLevels: [],
        totalDamage: 0
      },
      lastUpdate: new Date().toISOString()
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

// Initialize student fields (add new fields if missing)
function initializeStudentFields(student) {
  // ===== One-time schema migration: studentId -> chessComId =====
  // Historically, `student.studentId` stored the Chess.com ID.
  // We now store it as `student.chessComId` and keep `student.id` as the system-generated unique ID.
  if (student && typeof student === 'object') {
    const hasChess = Object.prototype.hasOwnProperty.call(student, 'chessComId');
    const hasLegacy = Object.prototype.hasOwnProperty.call(student, 'studentId');
    if (!hasChess && hasLegacy) {
      const legacy = student.studentId;
      // Preserve empty string/null as-is; normalize to string otherwise.
      student.chessComId = legacy == null ? '' : String(legacy);
    }
    // Remove legacy field to avoid confusion going forward (all code should use chessComId).
    if (hasLegacy) {
      delete student.studentId;
    }
  }

  const newFields = {
    // Local name (e.g., Chinese name)
    localName: '',
    // Phone country settings (for WhatsApp / international support)
    // Store `contactPhone` as national number digits (no + prefix).
    contactPhoneCountry: 'HK',
    contactPhoneCountryCode: '+852',
    dateOfBirth: null,
    gender: null,
    chessComId: '',
    contactPhone: null,
    contactEmail: null,
    emergencyContactName: null,
    emergencyContactRelation: null,
    emergencyContactNumber: null,
    remark: null,
    membership: null,
    membershipStartDate: null,
    membershipEndDate: null
  };
  
  // Only add fields that don't exist
  Object.keys(newFields).forEach(key => {
    if (!(key in student)) {
      student[key] = newFields[key];
    }
  });
  
  return student;
}

// File operation queue to prevent concurrent read/write conflicts
let dataFileQueue = Promise.resolve();
let isWriting = false;

// Read data from txt file with queue protection
async function readData() {
  // Wait for any pending write operations to complete
  await dataFileQueue;
  
  try {
    const content = await fs.readFile(DATA_FILE, 'utf8');
    
    // Handle empty or whitespace-only files
    if (!content || content.trim() === '') {
      console.warn('Data file is empty, returning default data');
      return { students: [], battles: [], lastUpdate: new Date().toISOString() };
    }
    
    let data;
    try {
      data = JSON.parse(content);
    } catch (parseError) {
      // If JSON is incomplete, try to recover or return default
      console.error('JSON parse error - file may be corrupted or incomplete:', parseError.message);
      console.error('File content length:', content.length);
      console.error('File content preview:', content.substring(0, 200));
      
      // Try to read backup or return safe default
      return { students: [], battles: [], lastUpdate: new Date().toISOString() };
    }
    
    // Validate data structure
    if (!data || typeof data !== 'object') {
      console.error('Invalid data structure, returning default');
      return { students: [], battles: [], lastUpdate: new Date().toISOString() };
    }
    
    // One-time migration detection (before initializeStudentFields deletes legacy keys)
    const needsStudentIdMigration = !!(
      data.students &&
      Array.isArray(data.students) &&
      data.students.some(s => s && typeof s === 'object' && Object.prototype.hasOwnProperty.call(s, 'studentId'))
    );

    // Initialize new fields for all students (also performs studentId -> chessComId migration)
    if (data.students && Array.isArray(data.students)) {
      data.students.forEach(student => {
        initializeStudentFields(student);
      });
    }

    // Persist schema migration once so the data file is updated on disk.
    // This avoids having `studentId` reappear on process restart.
    if (needsStudentIdMigration) {
      try {
        await writeData(data);
      } catch (e) {
        console.warn('Unable to persist studentId->chessComId migration:', e?.message || e);
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error reading data:', error);
    // Return safe default instead of throwing
    return { students: [], battles: [], lastUpdate: new Date().toISOString() };
  }
}

// Write data to txt file with queue protection
async function writeData(data) {
  // Add write operation to queue
  dataFileQueue = dataFileQueue.then(async () => {
    isWriting = true;
    try {
      // Ensure all students have new fields initialized before writing
      if (data.students && Array.isArray(data.students)) {
        data.students.forEach(student => {
          initializeStudentFields(student);
        });
      }
      
      // Write to temporary file first, then rename (atomic operation)
      const tempFile = DATA_FILE + '.tmp';
      const jsonContent = JSON.stringify(data, null, 2);
      
      await fs.writeFile(tempFile, jsonContent, 'utf8');
      await fs.rename(tempFile, DATA_FILE);
      
      return true;
    } catch (error) {
      console.error('Error writing data:', error);
      // Try to clean up temp file if it exists
      try {
        await fs.unlink(DATA_FILE + '.tmp').catch(() => {});
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      return false;
    } finally {
      isWriting = false;
    }
  });
  
  // Wait for this write operation to complete
  return await dataFileQueue;
}

// (moved to server/routes/monsterFightGameRoutes.js)

// Broadcast to all WebSocket clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// (RANKS moved to server/config/constants.js)

// ===== Stats helpers (moved to server/lib/statsHelpers.js) =====
const { getDateKey, getWeekKey, getMonthKey, getYearKey, updateStudentStats, addRewardPointsToStats, getRankInfo } = require('./server/lib/statsHelpers');

// API Routes

// ==================== Authentication API ====================

// ===== Auth routes (moved to server/routes/authRoutes.js) =====
const { registerAuthRoutes } = require('./server/routes/authRoutes');
registerAuthRoutes(app, {
  authenticateUser,
  readUsers,
  writeUsers,
  readOrganizations,
  writeOrganizations,
  hashPassword,
  comparePassword,
  generateToken,
  billingAccess,
});

// ==================== Organization Management API ====================

// (moved to server/routes/organizationsRoutes.js)

// ==================== Admin Management API ====================

// ===== Admin organization routes (moved to server/routes/adminOrganizationsRoutes.js) =====
const { registerAdminOrganizationsRoutes } = require('./server/routes/adminOrganizationsRoutes');
registerAdminOrganizationsRoutes(app, {
  authenticateUser,
  authorizeRole,
  readOrganizations,
  writeOrganizations,
  readUsers,
  writeUsers,
  readData,
  writeData,
  broadcast,
  getRankInfo,
  hashPassword,
  generateToken
});

// ===== Admin subscription routes (moved to server/routes/adminSubscriptionRoutes.js) =====
const { registerAdminSubscriptionRoutes } = require('./server/routes/adminSubscriptionRoutes');
registerAdminSubscriptionRoutes(app, {
  authenticateUser,
  authorizeRole,
  readSubscriptionPrices,
  writeSubscriptionPrices,
  readSubscriptionPackages,
  writeSubscriptionPackages,
  appendSubscriptionAudit,
  normalizeSubscriptionStatus,
  normalizePublishState,
  normalizeCurrency,
  dateOnlyTodayString,
  fs,
  SUBSCRIPTION_AUDIT_FILE
});

// (moved to server/routes/organizationsRoutes.js)

// ==================== Teacher Management API ====================

// ===== Chess.com teacher routes (moved to server/routes/chesscomTeacherRoutes.js) =====
const { registerChessComTeacherRoutes } = require('./server/routes/chesscomTeacherRoutes');
registerChessComTeacherRoutes(app, {
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readChessComSettings,
  writeChessComSettings,
  getOrgChessComSettings,
  upsertOrgChessComSettings
});

// ===== Blunders: teacher routes (moved to server/routes/blundersTeacherRoutes.js) =====
const { registerBlundersTeacherRoutes } = require('./server/routes/blundersTeacherRoutes');
registerBlundersTeacherRoutes(app, {
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readData,
  readUsers,
  readChessComSettings,
  readChessComRatings,
  readBlundersPuzzles,
  writeBlundersPuzzles,
  readBlundersStats,
  readBlundersSettings,
  writeBlundersSettings,
  readBlundersTeacherJobs,
  writeBlundersTeacherJobs,
  getOrgBlundersSettings,
  getMasterBlundersConfig,
  sanitizeMasterEntry,
  defaultMastersPreset,
  formatHkTime,
  computeNextRatingsRunIso,
  computeNextBlundersDailyRunIso,
  CHESSCOM_RATINGS_REFRESH_HK_HOUR,
  CHESSCOM_RATINGS_REFRESH_HK_MIN,
  BLUNDERS_DAILY_SYNC_HK_HOUR,
  BLUNDERS_DAILY_SYNC_HK_MIN,
  blundersDailySyncMeta,
  BLUNDERS_DEFAULTS,
  nowIso,
  puzzleSortKeyMs,
  isInvalidSameBestMovePuzzle,
  normalizeHkDayKey,
  todayHkKey,
  syncBlundersForStudent,
  syncBlundersForMaster,
  blundersTeacherJobQueue,
  blundersTeacherRunNextJob,
  blundersTeacherJobCancel,
  BLUNDERS_TAGGER_VERSION,
  fs,
  BLUNDERS_PUZZLES_FILE,
  BLUNDERS_STATS_FILE,
  BLUNDERS_SETTINGS_FILE,
  BLUNDERS_TEACHER_JOBS_FILE,
  appDb
});

// ===== Teacher Class View routes (moved to server/routes/teacherClassViewRoutes.js) =====
const { registerTeacherClassViewRoutes } = require('./server/routes/teacherClassViewRoutes');
registerTeacherClassViewRoutes(app, {
  authenticateUser,
  authorizeRole,
  readUsers,
  writeUsers,
  readData
});

// ===== Organizations routes (moved to server/routes/organizationsRoutes.js) =====
const { registerOrganizationsRoutes } = require('./server/routes/organizationsRoutes');
registerOrganizationsRoutes(app, {
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readUsers,
  writeUsers,
  readOrganizations,
  writeOrganizations,
  readData,
  writeData,
  readCourses,
  writeCourses,
  readPackages,
  writePackages,
  checkExpiredPackages,
  updatePackagesForDeletedCourse,
  readTimetable,
  writeTimetable,
  readEnrollments,
  writeEnrollments,
  broadcast,
  getRankInfo,
  hashPassword,
  generateToken
});

// ==================== Student API (existing) ====================

// ===== Students routes (moved to server/routes/studentsRoutes.js) =====
const { registerStudentsRoutes } = require('./server/routes/studentsRoutes');
registerStudentsRoutes(app, {
  optionalAuth,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readData,
  writeData,
  readUsers,
  writeUsers,
  readOrganizations,
  writeOrganizations,
  filterStudentsByOrganization,
  getRankInfo,
  updateStudentStats,
  broadcast,
  LEVELS,
  generateToken,
  getStudentChessComCredentials,
  isValidDateFormat,
  isValidDate,
  isFutureDate,
  compareDates
});

// Helper function to validate date format DD/MM/YYYY
function isValidDateFormat(dateString) {
  if (!dateString || dateString.trim() === '') return true; // Empty is allowed
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  return regex.test(dateString);
}

// Helper function to validate date value (DD/MM/YYYY)
function isValidDate(dateString) {
  if (!dateString || dateString.trim() === '') return true; // Empty is allowed
  if (!isValidDateFormat(dateString)) return false;
  
  const parts = dateString.split('/');
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  
  // Check if date is valid
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return false;
  }
  
  return true;
}

// Helper function to check if date is in the future
function isFutureDate(dateString) {
  if (!dateString || dateString.trim() === '') return false;
  if (!isValidDate(dateString)) return false;
  
  const parts = dateString.split('/');
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return date > today;
}

// Helper function to compare dates (DD/MM/YYYY)
function compareDates(date1, date2) {
  if (!date1 || !date2) return 0;
  if (!isValidDate(date1) || !isValidDate(date2)) return 0;
  
  const parts1 = date1.split('/');
  const parts2 = date2.split('/');
  const d1 = new Date(parseInt(parts1[2]), parseInt(parts1[1]) - 1, parseInt(parts1[0]));
  const d2 = new Date(parseInt(parts2[2]), parseInt(parts2[1]) - 1, parseInt(parts2[0]));
  
  return d1 - d2;
}

// (moved to server/routes/studentsRoutes.js)

// ===== Blunders: public routes (moved to server/routes/blundersPublicRoutes.js) =====
const { registerBlundersPublicRoutes } = require('./server/routes/blundersPublicRoutes');
registerBlundersPublicRoutes(app, {
  // Middleware (used by some teacher-side helper endpoints that live near public routes)
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,

  // Core data
  readData,
  readUsers,
  readChessComSettings,
  readChessComRatings,

  // Blunders storage + helpers
  readBlundersPuzzles,
  writeBlundersPuzzles,
  readBlundersStats,
  pruneStudentBlundersInPlace,
  BLUNDERS_MAX_PUZZLES_PER_STUDENT,
  isInvalidSameBestMovePuzzle,
  computeRolling3mStats,
  puzzleSortKeyMs,
  blundersSyncState,
  blundersLastStudentSync,
  syncBlundersForStudent,

  // Chess.com integration
  getChessComUsernameForStudent,
  chessComGetGamesForHkDay,
  chessComGetRecentGames,
  todayHkKey,

  // Student/master configs
  getStudentBlundersConfig,
  getOrgBlundersSettings,
  defaultMastersPreset,
  readBlundersMasterProgress,
  writeBlundersMasterProgress,
  getMasterBlundersConfig,
  blundersBucketKeyOfPuzzle,

  // Challenge mode storage + selection
  readBlundersChallengeSessions,
  writeBlundersChallengeSessions,
  readBlundersChallengeLeaderboard,
  writeBlundersChallengeLeaderboard,
  blundersChallengeDifficultyConfig,
  pickStudentRatingFromCache,
  blundersRatingBucket,
  pickChallengePuzzlesFromAllBlunders,

  // Stockfish + move helpers
  sfEvalFen,
  scoreToCp,
  parseUciMove,
  uciToSanAtFen,
  blundersVerdictFromScores,

  // OpenAI comment
  openAiEnabled,
  openAiJson,
  nowIso,
  aiCommentCacheKey,
  aiCommentIsFresh,
  readBlundersAiComments,
  generateStudentAiCommentMonth,
  readBlundersDbRetry,

  // DB
  appDb,

  // Libs
  Chess
});

// (moved to server/routes/studentsRoutes.js)

// ===== Challenge routes (moved to server/routes/challengeRoutes.js) =====
const { registerChallengeRoutes } = require('./server/routes/challengeRoutes');
registerChallengeRoutes(app, {
  authenticateUser,
  readData,
  writeData,
  readOrganizations,
  broadcast,
  LEVELS,
  SAVES_DIR,
  fs,
  path
});

// ===== Statistics routes (moved to server/routes/statisticsRoutes.js) =====
const { registerStatisticsRoutes } = require('./server/routes/statisticsRoutes');
registerStatisticsRoutes(app, {
  readData,
  getDateKey,
  getWeekKey,
  getMonthKey
});

// ==================== Monster Fight / Game APIs (moved) ====================
const { registerGameRoutes } = require('./server/routes/gameRoutes');
registerGameRoutes(app, {
  fs,
  path,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readData,
  writeData,
  broadcast,
  filterStudentsByOrganization,
  resolveOrgIdFromUser,
  getRankInfo,
  addRewardPointsToStats,
  GAME_SAVES_DIR,
  RUNNING_QUEEN_LEADERBOARD_FILE,
  ROYAL_EXCHANGE_LEADERBOARD_FILE,
  HOPE_MATE_LEADERBOARD_FILE,
  HOPE_MATE_CHALLENGE_LEADERBOARD_FILE,
  HOPE_MATE_STAGE_PUZZLES_FILE
});

// ==================== Tactics Fighter APIs (scaffold) ====================
const { registerTacticsFighterRoutes } = require('./server/routes/tacticsFighterRoutes');
registerTacticsFighterRoutes(app, {
  fs,
  path,
  appDb,
  Chess,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readData,
  filterStudentsByOrganization,
  resolveOrgIdFromUser,
  sfAnalyzeFen,
  TACTICS_FIGHTER_ATTEMPTS_FILE
});

// ==================== Maze Runner APIs (scaffold) ====================
const { registerMazeRunnerRoutes } = require('./server/routes/mazeRunnerRoutes');
registerMazeRunnerRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ==================== Chess Light APIs (scaffold) ====================
const { registerChessLightRoutes } = require('./server/routes/chessLightRoutes');
registerChessLightRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ==================== Chess Solitaire APIs (scaffold) ====================
const { registerChessSolitaireRoutes } = require('./server/routes/chessSolitaireRoutes');
registerChessSolitaireRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ==================== Chess Works APIs (scaffold) ====================
const { registerChessWorksRoutes } = require('./server/routes/chessWorksRoutes');
registerChessWorksRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ============================
// Billing (PayPal subscriptions)
// ============================

// ===== PayPal routes (webhook + admin tools) (moved to server/routes/paypalRoutes.js) =====
const { registerPayPalRoutes } = require('./server/routes/paypalRoutes');
registerPayPalRoutes(app, {
  authenticateUser,
  authorizeRole,
  readSubscriptionPrices,
  writeSubscriptionPrices,
  ensurePayPalPlanForPrice: paypalBilling.ensurePayPalPlanForPrice,
  paypal,
  billingDb,
  refreshSubscriptionAndEntitlement: paypalBilling.refreshSubscriptionAndEntitlement
});

// Admin: sync active+live prices to PayPal (auto-create Product/Plans, store paypalPlanId back into price records)
// (moved to server/routes/paypalRoutes.js)

// (moved to server/routes/monsterFightGameRoutes.js)

// (moved to server/routes/organizationsBillingRoutes.js)

// (moved to server/routes/paypalRoutes.js)

// (moved to server/routes/monsterFightGameRoutes.js)

// (moved to server/routes/challengeRoutes.js)

// Reset all scores
app.post('/api/reset', async (req, res) => {
  try {
    const data = await readData();
    data.students.forEach(student => {
      student.answerCount = 0;
      student.totalAnswers = 0;
      student.correctAnswers = 0;
      student.score = 0;
      student.experience = 0;
      student.level = 1;
      student.rank = 'Wood';
      student.rankIndex = 0;
    });
    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    broadcast({ type: 'reset' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset scores' });
  }
});

// Read/write orders data (via jsonStore)
async function readOrders() { return ordersStore.read(); }
async function writeOrders(orders) { return ordersStore.write(orders); }

// Read/write enrollments data (via jsonStore)
async function readEnrollments() { return enrollmentsStore.read(); }
async function writeEnrollments(enrollments) { return enrollmentsStore.write(enrollments); }

// Read/write attendance data (via jsonStore)
async function readAttendance() { return attendanceStore.read(); }
async function writeAttendance(data) { return attendanceStore.write(data); }

// ===== Attendance routes (moved to server/routes/attendanceRoutes.js) =====
const { registerAttendanceRoutes } = require('./server/routes/attendanceRoutes');
registerAttendanceRoutes(app, {
  authenticateUser,
  requireOrganizationAccess,
  readTimetable,
  readAttendance,
  writeAttendance
});

// Read/write transactions data (via jsonStore)
async function readTransactions() { return transactionsStore.read(); }
async function writeTransactions(data) { return transactionsStore.write(data); }

// ===== Organizations billing + finance routes (moved to server/routes/organizationsBillingRoutes.js) =====
const { registerOrganizationsBillingRoutes } = require('./server/routes/organizationsBillingRoutes');
registerOrganizationsBillingRoutes(app, {
  // middleware
  authenticateUser,
  authorizeRole,

  // billing deps
  resolveOrgIdFromUser,
  readSubscriptionPrices,
  writeSubscriptionPrices,
  ensurePayPalPlanForPrice: paypalBilling.ensurePayPalPlanForPrice,
  upsertBillingSubscriptionFromPayPal: paypalBilling.upsertBillingSubscriptionFromPayPal,
  refreshSubscriptionAndEntitlement: paypalBilling.refreshSubscriptionAndEntitlement,
  computeEntitlementStatus: paypalBilling.computeEntitlementStatus,
  billingDb,
  paypal,

  // finance deps
  readUsers,
  readData,
  writeData,
  readTransactions,
  writeTransactions,
  readOrders,
  writeOrders,
  readExpenses,
  writeExpenses,
  readEnrollments,
  writeEnrollments,
  readTimetable,
  writeTimetable
});

// ===== My Own App routes (Admin utilities) =====
const { registerMyOwnAppRoutes } = require('./server/routes/myOwnAppRoutes');
registerMyOwnAppRoutes(app, {
  appDb,
  authenticateUser,
  authorizeRole
});

// (moved to server/routes/organizationsBillingRoutes.js)

// Read/write expenses data (via jsonStore)
async function readExpenses() { return expensesStore.read(); }
async function writeExpenses(data) { return expensesStore.write(data); }

// (moved to server/routes/organizationsBillingRoutes.js)

// (moved to server/routes/organizationsRoutes.js)

// Initialize server
async function startServer() {
  await ensureDataDir();
  await initializeDataFile();
  await billingDb.ensureBillingSchema();
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
  
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  // Graceful shutdown (Railway sends SIGTERM during deploy/restart)
  const shutdown = (signal) => {
    logProcessContext('shutdown', { signal });
    try { server.close(() => process.exit(0)); } catch { try { process.exit(0); } catch {} }
    try { setTimeout(() => process.exit(0), 5000).unref?.(); } catch {}
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // V.Chess Platform (WebSocket realtime) — extracted to server/vcp/vcpChess.js
  await setupVcpChess({ wss, WebSocket, fs, VCP_CHESS_GAMES_FILE, verifyToken, readData, readUsers, nowIso });

  // IMPORTANT for containers/PaaS (Railway, Render, Fly, etc.):
  // - bind to 0.0.0.0 so the platform can route traffic into the container
  // - still respect PORT provided by the platform
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`FORCE_HTTPS: ${String(process.env.FORCE_HTTPS || '') || '(unset)'}`);
    console.log(`Data file: ${DATA_FILE}`);
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
  global.wss = wss;
}

startServer();
