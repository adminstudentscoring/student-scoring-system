// Load environment variables
require('dotenv').config();

import type { Express, Request, Response, NextFunction } from 'express';

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const { openAiEnabled, openAiJson } = require('@student-scoring/platform');

const app: Express = express();

// ============================
// Process-level crash diagnostics (Railway)
// ============================
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
let readBlundersAiComments: any;
let writeBlundersAiComments: any;
let aiCommentCacheKey: any;
let aiCommentIsFresh: any;
let generateStudentAiCommentMonth: any;

// ===== Blunders: DB retry queue (moved to server/blunders/dbRetry.js) =====
let readBlundersDbRetry: any;
let writeBlundersDbRetry: any;
let enqueueBlundersDbRetry: any;
let blundersDbRetryTick: any;
let dbRetryBackoffMs: any;

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
const { createJsonStore } = require('@student-scoring/core');

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
const { hashPassword, comparePassword, generateToken, verifyToken } = require('@student-scoring/core');
const { authenticateUser, authorizeRole, optionalAuth } = require('@student-scoring/core');
const { createRequireOrganizationAccess, filterStudentsByOrganization, filterUsersByOrganization } = require('@student-scoring/core');
const { setupVcpChess } = require('@student-scoring/vcp');

// Billing (PayPal + Postgres)
const billingDb = require('@student-scoring/billing/src/db');
const paypal = require('@student-scoring/billing/src/paypal');
const billingAccess = require('@student-scoring/billing/src/access');
const { createPayPalBillingHelpers } = require('@student-scoring/billing');

// App Postgres (optional, for future migrations/features)
const appDb = require('@student-scoring/core/src/db/postgres');
const appDbMigrate = require('@student-scoring/core/src/db/migrate');

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
// Serve application/ (browser bundles for chess apps and mini-games)
app.use('/application', express.static(path.join(__dirname, 'application')));
// Monster Fight standalone entry (same tree; explicit mount for clarity)
app.use('/application/monster-fight', express.static(path.join(__dirname, 'application/monster-fight')));

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
async function ensureDataDir(): Promise<void> {
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
async function readOrganizations(): Promise<any[]> {
  const data = await organizationsStore.read();
  return data.organizations || [];
}

// Write organizations data
async function writeOrganizations(organizations: any[]): Promise<boolean> {
  return organizationsStore.write({ organizations, lastUpdate: new Date().toISOString() });
}

// Read users data
async function readUsers(): Promise<any[]> {
  const data = await usersStore.read();
  return data.users || [];
}

// Write users data
async function writeUsers(users: any[]): Promise<boolean> {
  return usersStore.write({ users, lastUpdate: new Date().toISOString() });
}

// ===== Chess.com settings storage (org-scoped) =====
// - Teacher Dashboard: stores chessId + password (for Student Dashboard "Chess.com" application)
// - Blunders: uses chessId mapping (studentId -> chessId) for username lookups
//
// Default behavior:
// - If Postgres is configured: store + read from Postgres
// - Else: fallback to JSON file at CHESSCOM_SETTINGS_FILE
let readChessComSettings: (...args: any[]) => Promise<any>;
let writeChessComSettings: (...args: any[]) => Promise<any>;
let getOrgChessComSettings: (...args: any[]) => Promise<any>;
let upsertOrgChessComSettings: (...args: any[]) => Promise<any>;
let getStudentChessComCredentials: (...args: any[]) => Promise<any>;
{
  const { createChessComSettingsStore } = require('@student-scoring/core');
  const fileStore = createChessComSettingsStore({ fs, CHESSCOM_SETTINGS_FILE });

  const { createChessComSettingsDb } = require('@student-scoring/application-blunders');
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
const { createBlundersStorage } = require('@student-scoring/application-blunders');
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

let blundersTeacherJobQueue: any;
let blundersTeacherJobCancel: any;
let blundersTeacherRunNextJob: any;

function nowIso(): string { return new Date().toISOString(); }

function blundersChallengeDifficultyConfig(difficulty: any): any {
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
// Stubs for puzzleSortKeyMs/puzzleDropPoints/isMissMatePuzzle are required because
// createBlundersTagger and createBlundersDb validate them before the puzzles init block runs.
let puzzleSortKeyMs: any = () => 0;
let threeMonthsAgoMs: any;
let puzzleDropPoints: any = () => 0;
let isMissMatePuzzle: any = () => false;
let isInvalidSameBestMovePuzzle: any;
let blundersBucketKeyOfPuzzle: any;
let blundersRatingBucket: any;
let pickStudentRatingFromCache: any;
let pickChallengePuzzlesFromAllBlunders: any;
let computeRolling3mStats: any;
let computeRollingWindowStats: any;
let computeStudentMonthStats: any;

// ===== Chess.com helpers (moved to server/blunders/chesscom.js) =====
let HK_OFFSET_SEC: number;
let hkDayKeyFromEpochSec: () => string;
let todayHkKey: () => string;
let hkNow: () => { y: number; m: number; d: number; hh: number; mm: number; ss: number };
let formatHkTime: () => string;
let fetchJsonWithTimeout: () => Promise<{ ok: boolean; status: number; data: { error?: string } }>;

let CHESSCOM_RATINGS_REFRESH_HK_HOUR: number;
let CHESSCOM_RATINGS_REFRESH_HK_MIN: number;
let readChessComRatings: () => Promise<{ orgs: Record<string, unknown>; meta: Record<string, unknown> }>;
let writeChessComRatings: () => Promise<boolean>;
let pickChessComRating: () => { rating: unknown; source: unknown };
let fetchChessComStats: () => Promise<{ ok: boolean; status: number; data: { error?: string } }>;
let getCachedChessComRating: () => Promise<{ rating: unknown; source: unknown; updatedAt: unknown }>;
let refreshChessComRatingsForOrg: () => Promise<{ ok: boolean; updated: number }>;
let computeNextRatingsRunIso: () => string;
let maybeRunChessComRatingsRefreshAllOrgs: () => Promise<{ ok: boolean; skipped: boolean }>;

let BLUNDERS_DAILY_SYNC_HK_HOUR: number;
let BLUNDERS_DAILY_SYNC_HK_MIN: number;
let blundersDailySyncMeta: {
  lastRunAt: unknown;
  lastRunHkDay: unknown;
  lastRunOk: number;
  lastRunErr: number;
};
let computeNextBlundersDailyRunIso: () => string;
let maybeRunBlundersDailySyncAllStudents: () => Promise<{ ok: boolean; skipped: boolean }>;

// ===== Course Management: Auto-renew (moved to server/services/autoRenew.js) =====
const { createAutoRenew } = require('@student-scoring/platform');
const AUTO_RENEW_LEAD_DAYS = Number(process.env.AUTO_RENEW_LEAD_DAYS || 30);
// autoRenewMeta + maybeRunAutoRenewAllOrgs are initialized after readOrders/writeOrders are defined (see below)
let autoRenewMeta = { lastRunAt: null, lastRunHkDay: null, lastRunOk: 0, lastRunErr: 0 };
let maybeRunAutoRenewAllOrgs = async () => ({ ok: true, skipped: true });

let chessComGetGamesForHkDay: () => Promise<unknown[]>;
let chessComGetTodayGames: () => Promise<unknown[]>;
let chessComGetRecentGames: () => Promise<unknown[]>;
let getChessComUsernameForStudent: () => Promise<string>;

// ===== Date/schedule helpers (moved to @student-scoring/core) =====
const { parseUciMove, dateStrFromYmd, parseDateStrToUtcMidnightMs, addDays, addMonths, DOW_NAME_TO_NUM, buildSkipDateSet, nextOccurrencesForEntry, packageLessonCount, computePackagePrice } = require('@student-scoring/core');

function hkTodayDateStr(): string {
  const t = hkNow();
  return dateStrFromYmd(t.y, t.m, t.d);
}

// ===== Blunders: eval/verdict helpers (moved to server/blunders/eval.js) =====
let scoreToCp: any;
let blundersVerdictFromScores: any;
let uciToSanAtFen: any;
let BLUNDERS_BEST_TOL_RATIO: any;
let BLUNDERS_BEST_TOL_MIN_CP: any;
let BLUNDERS_MATE_OR_HUGE_CP: any;
let BLUNDERS_GOOD_IF_STILL_AHEAD_CP: any;

{
  const { createBlundersEval } = require('@student-scoring/application-blunders');
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
  const { createBlundersChessCom } = require('@student-scoring/application-blunders');
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
let BLUNDERS_TAGGER_VERSION: any;
let BLUNDERS_TAGS: any;
let tagBlunderPuzzle: any;

{
  const { createBlundersTagger } = require('@student-scoring/application-blunders');
  const t = createBlundersTagger({ Chess, parseUciMove, puzzleDropPoints, isMissMatePuzzle });
  BLUNDERS_TAGGER_VERSION = t.BLUNDERS_TAGGER_VERSION;
  BLUNDERS_TAGS = t.BLUNDERS_TAGS;
  tagBlunderPuzzle = t.tagBlunderPuzzle;
}

// ===== Blunders: DB helpers (moved to server/blunders/db.js) =====
let dbUpsertPuzzleTags: any;
let dbUpsertPuzzlesFromObjects: any;

{
  const { createBlundersDb } = require('@student-scoring/application-blunders');
  const db = createBlundersDb({
    nowIso,
    // Use a wrapper so the DB helpers always call the latest enqueue function (initialized later).
    enqueueBlundersDbRetry: (...args: any[]) => enqueueBlundersDbRetry(...args),
    puzzleSortKeyMs,
    BLUNDERS_TAGGER_VERSION
  });
  dbUpsertPuzzleTags = db.dbUpsertPuzzleTags;
  dbUpsertPuzzlesFromObjects = db.dbUpsertPuzzlesFromObjects;
}

// Now that appDb + dbUpsert* helpers exist, we can initialize the retry queue.
{
  const { createBlundersDbRetry } = require('@student-scoring/application-blunders');
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
let pruneStudentBlundersInPlace: any;
let appendBlundersPuzzlesPreserveProgress: any;

// Init remaining Blunders helpers (puzzles + stats) before tagger/sync/routes use them.
{
  const { createBlundersPuzzles } = require('@student-scoring/application-blunders');
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

  const { createBlundersStats } = require('@student-scoring/application-blunders');
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
  const { createBlundersAi } = require('@student-scoring/application-blunders');
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
const { createStockfishRunner } = require('@student-scoring/application-blunders');
const { sfEvalFen, sfAnalyzeFen } = createStockfishRunner({ fs, path, spawn, processExecPath: process.execPath, baseDir: __dirname });

// ===== Blunders: sync (student/master) (moved to server/blunders/sync.js) =====
let syncBlundersForStudent: any;
let syncBlundersForMaster: any;

// Init Blunders sync functions before wiring up teacher jobs (jobs depend on sync).
{
  const { createBlundersSync } = require('@student-scoring/application-blunders');
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
  const { createBlundersTeacherJobs } = require('@student-scoring/application-blunders');
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
async function readCourses(): Promise<any[]> {
  const data = await coursesStore.read();
  return data.courses || [];
}

// Write courses data
async function writeCourses(courses: any[]): Promise<boolean> {
  return coursesStore.write({ courses, lastUpdate: new Date().toISOString() });
}

// Read packages data
async function readPackages(): Promise<any[]> {
  const data = await packagesStore.read();
  return data.packages || [];
}

// Write packages data
async function writePackages(packages: any[]): Promise<boolean> {
  return packagesStore.write({ packages, lastUpdate: new Date().toISOString() });
}

// Read subscription prices data (Admin Subscription Setting -> Price Setting)
async function readSubscriptionPrices(): Promise<any[]> {
  const data = await subscriptionPricesStore.read();
  return Array.isArray(data.prices) ? data.prices : [];
}

// Write subscription prices data
async function writeSubscriptionPrices(prices: any[]): Promise<boolean> {
  return subscriptionPricesStore.write({ prices, lastUpdate: new Date().toISOString() });
}

// Read subscription packages data (Admin Subscription Setting -> Package Setting)
async function readSubscriptionPackages(): Promise<any[]> {
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
} = require('@student-scoring/core');

// PayPal subscription helpers (extracted)
const paypalBilling = createPayPalBillingHelpers({
  billingDb,
  paypal,
  readSubscriptionPrices
});

// Write subscription packages data
async function writeSubscriptionPackages(packages: any[]): Promise<boolean> {
  return subscriptionPackagesStore.write({ packages, lastUpdate: new Date().toISOString() });
}

const appendSubscriptionAudit = createAppendSubscriptionAudit({ fs, SUBSCRIPTION_AUDIT_FILE });
const checkExpiredPackages = createCheckExpiredPackages({ readPackages, writePackages });
const updatePackagesForDeletedCourse = createUpdatePackagesForDeletedCourse({ readPackages, writePackages });

// Read timetable data
async function readTimetable(): Promise<any> {
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
async function writeTimetable(timetableData: any): Promise<boolean> {
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

// ===== Constants (moved to @student-scoring/core) =====
const { LEVELS, RANKS } = require('@student-scoring/core');

// ===== Data store (moved to @student-scoring/core) =====
const { createDataStore } = require('@student-scoring/core');
const _dataStore = createDataStore({ fs, DATA_FILE });
const initializeDataFile = _dataStore.initializeDataFile;
const initializeStudentFields = _dataStore.initializeStudentFields;
// readData and writeData need to be available before this point in the file
// (other init blocks reference them), so we use function declarations that hoist.
function readData(): Promise<any> { return _dataStore.readData(); }
function writeData(data: any): Promise<boolean> { return _dataStore.writeData(data); }

// (moved to server/routes/monsterFightGameRoutes.js)

// Broadcast to all WebSocket clients
let wss: any;
function broadcast(data: any): void {
  wss.clients.forEach((client: any) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// (RANKS moved to server/config/constants.js)

// ===== Stats helpers (moved to @student-scoring/core) =====
const { getDateKey, getWeekKey, getMonthKey, getYearKey, updateStudentStats, addRewardPointsToStats, getRankInfo } = require('@student-scoring/core');

// API Routes

// ==================== Authentication API ====================

// ===== Auth routes (moved to server/routes/authRoutes.js) =====
const { registerAuthRoutes } = require('@student-scoring/platform');
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
const { registerAdminOrganizationsRoutes } = require('@student-scoring/platform');
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
const { registerAdminSubscriptionRoutes } = require('@student-scoring/billing');
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
const { registerChessComTeacherRoutes } = require('@student-scoring/platform');
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
const { registerBlundersTeacherRoutes } = require('@student-scoring/application-blunders');
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
const { registerTeacherClassViewRoutes } = require('@student-scoring/class-view');
registerTeacherClassViewRoutes(app, {
  authenticateUser,
  authorizeRole,
  readUsers,
  writeUsers,
  readData
});

// ===== Organizations routes (moved to server/routes/organizationsRoutes.js) =====
const { registerOrganizationsRoutes } = require('@student-scoring/platform');
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
const { registerStudentsRoutes } = require('@student-scoring/platform');
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
function isValidDateFormat(dateString: string): boolean {
  if (!dateString || dateString.trim() === '') return true; // Empty is allowed
  const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  return regex.test(dateString);
}

// Helper function to validate date value (DD/MM/YYYY)
function isValidDate(dateString: string): boolean {
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
function isFutureDate(dateString: string): boolean {
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
function compareDates(date1: string, date2: string): number {
  if (!date1 || !date2) return 0;
  if (!isValidDate(date1) || !isValidDate(date2)) return 0;
  
  const parts1 = date1.split('/');
  const parts2 = date2.split('/');
  const d1 = new Date(parseInt(parts1[2]), parseInt(parts1[1]) - 1, parseInt(parts1[0]));
  const d2 = new Date(parseInt(parts2[2]), parseInt(parts2[1]) - 1, parseInt(parts2[0]));
  
  return d1.getTime() - d2.getTime();
}

// (moved to server/routes/studentsRoutes.js)

// ===== Blunders: public routes (moved to server/routes/blundersPublicRoutes.js) =====
const { registerBlundersPublicRoutes } = require('@student-scoring/application-blunders');
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
const { registerChallengeRoutes } = require('@student-scoring/class-view');
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
const { registerStatisticsRoutes } = require('@student-scoring/class-view');
registerStatisticsRoutes(app, {
  readData,
  getDateKey,
  getWeekKey,
  getMonthKey
});

// ==================== Monster Fight / Game APIs (moved to packages) ====================
const { registerMonsterFightRoutes } = require('@student-scoring/application-monster-fight');
registerMonsterFightRoutes(app, {
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

// ==================== Simple games (one package per game under packages/application/*) ====================
const { registerRunningQueenRoutes } = require('@student-scoring/application-running-queen');
const { registerRoyalExchangeRoutes } = require('@student-scoring/application-royal-exchange');
const { registerHopeMateRoutes, registerHopeMateAdminRoutes } = require('@student-scoring/application-hope-mate');
registerRunningQueenRoutes(app, { fs, RUNNING_QUEEN_LEADERBOARD_FILE });
registerRoyalExchangeRoutes(app, { fs, ROYAL_EXCHANGE_LEADERBOARD_FILE });
registerHopeMateRoutes(app, {
  fs,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  readData,
  filterStudentsByOrganization,
  resolveOrgIdFromUser,
  HOPE_MATE_LEADERBOARD_FILE,
  HOPE_MATE_CHALLENGE_LEADERBOARD_FILE
});
registerHopeMateAdminRoutes(app, {
  fs,
  authenticateUser,
  authorizeRole,
  HOPE_MATE_STAGE_PUZZLES_FILE
});

const { registerTruceboardRoutes } = require('@student-scoring/application-truceboard');
registerTruceboardRoutes(app);

// ==================== Tactics Fighter APIs (scaffold) ====================
const { registerTacticsFighterRoutes } = require('@student-scoring/application-tactics-fighter');
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
const { registerMazeRunnerRoutes } = require('@student-scoring/application-chess');
registerMazeRunnerRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ==================== Chess Light APIs (scaffold) ====================
const { registerChessLightRoutes } = require('@student-scoring/application-chess');
registerChessLightRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ==================== Chess Solitaire APIs (scaffold) ====================
const { registerChessSolitaireRoutes } = require('@student-scoring/application-chess');
registerChessSolitaireRoutes(app, {
  appDb,
  readData,
  authenticateUser,
  authorizeRole,
  requireOrganizationAccess,
  resolveOrgIdFromUser
});

// ==================== Chess Works APIs (scaffold) ====================
const { registerChessWorksRoutes } = require('@student-scoring/application-chess');
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
const { registerPayPalRoutes } = require('@student-scoring/billing');
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
app.post('/api/reset', authenticateUser, authorizeRole('admin'), async (req, res) => {
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
async function readOrders(): Promise<any> { return ordersStore.read(); }
async function writeOrders(orders: any): Promise<boolean> { return ordersStore.write(orders); }

// Read/write enrollments data (via jsonStore)
async function readEnrollments(): Promise<any> { return enrollmentsStore.read(); }
async function writeEnrollments(enrollments: any): Promise<boolean> { return enrollmentsStore.write(enrollments); }

// ===== Initialize auto-renew now that readOrders/writeOrders/etc. are defined =====
{
  const ar = createAutoRenew({
    todayHkKey: () => todayHkKey(),
    hkTodayDateStr,
    readOrganizations,
    readData,
    readOrders,
    writeOrders,
    readEnrollments,
    writeEnrollments,
    readTimetable,
    readPackages,
    readCourses,
    nowIso,
    AUTO_RENEW_LEAD_DAYS
  });
  maybeRunAutoRenewAllOrgs = ar.maybeRunAutoRenewAllOrgs;
  autoRenewMeta = ar.autoRenewMeta;
}

// Read/write attendance data (via jsonStore)
async function readAttendance(): Promise<any> { return attendanceStore.read(); }
async function writeAttendance(data: any): Promise<boolean> { return attendanceStore.write(data); }

// ===== Attendance routes (moved to server/routes/attendanceRoutes.js) =====
const { registerAttendanceRoutes } = require('@student-scoring/platform');
registerAttendanceRoutes(app, {
  authenticateUser,
  requireOrganizationAccess,
  readTimetable,
  readAttendance,
  writeAttendance
});

// Read/write transactions data (via jsonStore)
async function readTransactions(): Promise<any> { return transactionsStore.read(); }
async function writeTransactions(data: any): Promise<boolean> { return transactionsStore.write(data); }

// ===== Organizations billing + finance routes (moved to server/routes/organizationsBillingRoutes.js) =====
const { registerOrganizationsBillingRoutes } = require('@student-scoring/billing');
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
const { registerMyOwnAppRoutes } = require('@student-scoring/platform');
registerMyOwnAppRoutes(app, {
  appDb,
  authenticateUser,
  authorizeRole
});

// (moved to server/routes/organizationsBillingRoutes.js)

// Read/write expenses data (via jsonStore)
async function readExpenses(): Promise<any> { return expensesStore.read(); }
async function writeExpenses(data: any): Promise<boolean> { return expensesStore.write(data); }

// (moved to server/routes/organizationsBillingRoutes.js)

// (moved to server/routes/organizationsRoutes.js)

// Initialize server
async function startServer(): Promise<void> {
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
  wss = new WebSocket.Server({ server });

  // Graceful shutdown (Railway sends SIGTERM during deploy/restart)
  const shutdown = (signal: string) => {
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
  (global as any).wss = wss;
}

startServer().catch((error) => {
  logProcessContext('startupFailure', { error: formatError(error) });
  try {
    setTimeout(() => process.exit(1), 50).unref?.();
  } catch {
    process.exit(1);
  }
});
