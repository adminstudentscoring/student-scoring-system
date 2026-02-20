// Load environment variables
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
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

// Import authentication utilities
const { hashPassword, comparePassword, generateToken, verifyToken } = require('./auth');
const { authenticateUser, authorizeRole, optionalAuth } = require('./middleware/auth');
const { createRequireOrganizationAccess, filterStudentsByOrganization, filterUsersByOrganization } = require('./middleware/dataIsolation');

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

// Configure CORS based on environment
const corsOptions = {
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(origin => origin.trim()),
  credentials: true
};
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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
  // Only redirect in production environment
  if (NODE_ENV === 'production' && hostname === 'studentscoring.com') {
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
// Serve standalone project chess-pal (now in game directory)
app.use('/game/chess-pal', express.static(path.join(__dirname, 'game/chess-pal')));
// Serve standalone project monster-fight (now in game directory)
app.use('/game/monster-fight', express.static(path.join(__dirname, 'game/monster-fight')));

// ----------------------------
// Chess Pal (admin-editable hero config)
// ----------------------------
app.get('/api/chess-pal/heroes', async (req, res) => {
  try {
    const data = await readData();
    const overrides = (data && data.chessPal && data.chessPal.heroOverrides && typeof data.chessPal.heroOverrides === 'object')
      ? data.chessPal.heroOverrides
      : {};
    res.json({ overrides });
  } catch (e) {
    console.error('[chess-pal] GET /api/chess-pal/heroes failed:', e);
    res.status(500).json({ error: 'Failed to load Chess Pal heroes' });
  }
});

app.put('/api/admin/chess-pal/heroes', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const overrides = req.body && req.body.overrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return res.status(400).json({ error: 'Invalid overrides' });
    }

    // Basic validation: keys like "001".."999", values are objects.
    const cleaned = {};
    const keys = Object.keys(overrides);
    if (keys.length > 500) {
      return res.status(400).json({ error: 'Too many hero overrides' });
    }
    for (const k of keys) {
      const id = String(k || '').trim();
      if (!/^\d{3}$/.test(id)) continue;
      const v = overrides[k];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      cleaned[id] = v;
    }

    const data = await readData();
    if (!data.chessPal) data.chessPal = {};
    data.chessPal.heroOverrides = cleaned;
    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    res.json({ success: true, overrides: cleaned });
  } catch (e) {
    console.error('[chess-pal] PUT /api/admin/chess-pal/heroes failed:', e);
    res.status(500).json({ error: 'Failed to save Chess Pal heroes' });
  }
});

app.get('/api/chess-pal/monsters', async (req, res) => {
  try {
    const data = await readData();
    const overrides = (data && data.chessPal && data.chessPal.monsterOverrides && typeof data.chessPal.monsterOverrides === 'object')
      ? data.chessPal.monsterOverrides
      : {};
    res.json({ overrides });
  } catch (e) {
    console.error('[chess-pal] GET /api/chess-pal/monsters failed:', e);
    res.status(500).json({ error: 'Failed to load Chess Pal monsters' });
  }
});

app.put('/api/admin/chess-pal/monsters', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const overrides = req.body && req.body.overrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return res.status(400).json({ error: 'Invalid overrides' });
    }

    const cleaned = {};
    const keys = Object.keys(overrides);
    if (keys.length > 1000) {
      return res.status(400).json({ error: 'Too many monster overrides' });
    }
    for (const k of keys) {
      const id = String(k || '').trim();
      if (!/^\d{3}$/.test(id)) continue;
      const v = overrides[k];
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      cleaned[id] = v;
    }

    const data = await readData();
    if (!data.chessPal) data.chessPal = {};
    data.chessPal.monsterOverrides = cleaned;
    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    res.json({ success: true, overrides: cleaned });
  } catch (e) {
    console.error('[chess-pal] PUT /api/admin/chess-pal/monsters failed:', e);
    res.status(500).json({ error: 'Failed to save Chess Pal monsters' });
  }
});

// ----------------------------
// Chess Pal per-user cloud state
// ----------------------------
function sanitizeChessPalState(raw) {
  const out = {};
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  for (const [k, v] of Object.entries(src)) {
    const key = String(k || '').trim();
    if (!key || key.length > 80) continue;
    if (!/^chessPal[A-Za-z0-9_]+$/.test(key)) continue;
    if (typeof v !== 'string') continue;
    if (v.length > 2_000_000) continue;
    out[key] = v;
  }
  return out;
}

app.get('/api/chess-pal/state', authenticateUser, async (req, res) => {
  try {
    const uid = String(req?.user?.id || '').trim();
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const data = await readData();
    const st = data?.chessPal?.userState?.[uid];
    const state = sanitizeChessPalState(st?.state || {});
    const updatedAt = Number.isFinite(Number(st?.updatedAt)) ? Math.floor(Number(st.updatedAt)) : 0;
    res.json({ state, updatedAt });
  } catch (e) {
    console.error('[chess-pal] GET /api/chess-pal/state failed:', e);
    res.status(500).json({ error: 'Failed to load Chess Pal state' });
  }
});

app.put('/api/chess-pal/state', authenticateUser, async (req, res) => {
  try {
    const uid = String(req?.user?.id || '').trim();
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const inState = sanitizeChessPalState(req?.body?.state || {});
    const payloadBytes = Buffer.byteLength(JSON.stringify(inState), 'utf8');
    if (payloadBytes > 2_500_000) {
      return res.status(400).json({ error: 'State payload too large' });
    }
    const now = Date.now();
    const data = await readData();
    if (!data.chessPal) data.chessPal = {};
    if (!data.chessPal.userState || typeof data.chessPal.userState !== 'object' || Array.isArray(data.chessPal.userState)) {
      data.chessPal.userState = {};
    }
    data.chessPal.userState[uid] = { state: inState, updatedAt: now };
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    res.json({ success: true, updatedAt: now });
  } catch (e) {
    console.error('[chess-pal] PUT /api/chess-pal/state failed:', e);
    res.status(500).json({ error: 'Failed to save Chess Pal state' });
  }
});

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
  const dataDir = path.dirname(DATA_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
  
  // Ensure saves directory exists
  try {
    await fs.access(SAVES_DIR);
  } catch {
    await fs.mkdir(SAVES_DIR, { recursive: true });
  }
  
  // Ensure game saves directory exists
  try {
    await fs.access(GAME_SAVES_DIR);
  } catch {
    await fs.mkdir(GAME_SAVES_DIR, { recursive: true });
  }

  try {
    await fs.access(RUNNING_QUEEN_LEADERBOARD_FILE);
  } catch {
    await fs.writeFile(RUNNING_QUEEN_LEADERBOARD_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  try {
    await fs.access(ROYAL_EXCHANGE_LEADERBOARD_FILE);
  } catch {
    await fs.writeFile(ROYAL_EXCHANGE_LEADERBOARD_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  try {
    await fs.access(HOPE_MATE_LEADERBOARD_FILE);
  } catch {
    await fs.writeFile(HOPE_MATE_LEADERBOARD_FILE, JSON.stringify([], null, 2), 'utf8');
  }

  try {
    await fs.access(HOPE_MATE_CHALLENGE_LEADERBOARD_FILE);
  } catch {
    await fs.writeFile(HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, JSON.stringify([], null, 2), 'utf8');
  }

  // Ensure Hope Mate stage puzzle file exists (admin-managed)
  try {
    await fs.access(HOPE_MATE_STAGE_PUZZLES_FILE);
  } catch {
    await fs.writeFile(HOPE_MATE_STAGE_PUZZLES_FILE, JSON.stringify({ puzzles: [], lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure VCP chess games history file exists (append-only JSONL)
  try {
    await fs.access(VCP_CHESS_GAMES_FILE);
  } catch {
    await fs.writeFile(VCP_CHESS_GAMES_FILE, '', 'utf8');
  }

  // Ensure Chess.com settings file exists (org-scoped)
  try {
    await fs.access(CHESSCOM_SETTINGS_FILE);
  } catch {
    await fs.writeFile(CHESSCOM_SETTINGS_FILE, JSON.stringify({ orgs: {} }, null, 2), 'utf8');
  }

  // Ensure Blunders puzzles file exists
  try {
    await fs.access(BLUNDERS_PUZZLES_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_PUZZLES_FILE, JSON.stringify({ puzzles: [], lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Blunders stats file exists (cumulative analyzed games)
  try {
    await fs.access(BLUNDERS_STATS_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_STATS_FILE, JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Blunders settings file exists (per-student config + masters list)
  try {
    await fs.access(BLUNDERS_SETTINGS_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_SETTINGS_FILE, JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Blunders master progress file exists (per-student completion for master puzzles)
  try {
    await fs.access(BLUNDERS_MASTER_PROGRESS_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_MASTER_PROGRESS_FILE, JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Blunders Challenge sessions file exists
  try {
    await fs.access(BLUNDERS_CHALLENGE_SESSIONS_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_CHALLENGE_SESSIONS_FILE, JSON.stringify({ sessions: {}, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Blunders Challenge leaderboard file exists
  try {
    await fs.access(BLUNDERS_CHALLENGE_LEADERBOARD_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_CHALLENGE_LEADERBOARD_FILE, JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Blunders Teacher jobs file exists (async history scan, etc.)
  try {
    await fs.access(BLUNDERS_TEACHER_JOBS_FILE);
  } catch {
    await fs.writeFile(BLUNDERS_TEACHER_JOBS_FILE, JSON.stringify({ jobs: {}, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure Chess.com ratings cache exists (daily refresh)
  try {
    await fs.access(CHESSCOM_RATINGS_FILE);
  } catch {
    await fs.writeFile(CHESSCOM_RATINGS_FILE, JSON.stringify({ orgs: {}, meta: { lastRunHkDay: null, lastRunAt: null } }, null, 2), 'utf8');
  }
  
  // Ensure users file exists
  try {
    await fs.access(USERS_FILE);
  } catch {
    await fs.writeFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
  
  // Ensure organizations file exists
  try {
    await fs.access(ORGANIZATIONS_FILE);
  } catch {
    await fs.writeFile(ORGANIZATIONS_FILE, JSON.stringify({ organizations: [] }, null, 2), 'utf8');
  }
  
  // Ensure courses file exists
  try {
    await fs.access(COURSES_FILE);
  } catch {
    await fs.writeFile(COURSES_FILE, JSON.stringify({ courses: [], lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }
  
  // Ensure timetable file exists
  try {
    await fs.access(TIMETABLE_FILE);
  } catch {
    await fs.writeFile(TIMETABLE_FILE, JSON.stringify({ 
      entries: [], 
      metadata: { 
        classNames: [], 
        classrooms: [], 
        lastUpdate: new Date().toISOString() 
      } 
    }, null, 2), 'utf8');
  }

  // Ensure subscription prices file exists
  try {
    await fs.access(SUBSCRIPTION_PRICES_FILE);
  } catch {
    await fs.writeFile(SUBSCRIPTION_PRICES_FILE, JSON.stringify({ prices: [], lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure subscription packages file exists
  try {
    await fs.access(SUBSCRIPTION_PACKAGES_FILE);
  } catch {
    await fs.writeFile(SUBSCRIPTION_PACKAGES_FILE, JSON.stringify({ packages: [], lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
  }

  // Ensure subscription audit log file exists
  try {
    await fs.access(SUBSCRIPTION_AUDIT_FILE);
  } catch {
    await fs.writeFile(SUBSCRIPTION_AUDIT_FILE, '', 'utf8');
  }
}

// Read organizations data
async function readOrganizations() {
  try {
    const content = await fs.readFile(ORGANIZATIONS_FILE, 'utf8');
    const data = JSON.parse(content);
    return data.organizations || [];
  } catch (error) {
    console.error('Error reading organizations:', error);
    return [];
  }
}

// Write organizations data
async function writeOrganizations(organizations) {
  try {
    await fs.writeFile(ORGANIZATIONS_FILE, JSON.stringify({ organizations, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing organizations:', error);
    return false;
  }
}

// Read users data
async function readUsers() {
  try {
    const content = await fs.readFile(USERS_FILE, 'utf8');
    const data = JSON.parse(content);
    return data.users || [];
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
}

// Write users data
async function writeUsers(users) {
  try {
    await fs.writeFile(USERS_FILE, JSON.stringify({ users, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing users:', error);
    return false;
  }
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

function parseUciMove(uci) {
  const s = String(uci || '').trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return null;
  const from = s.slice(0, 2);
  const to = s.slice(2, 4);
  const promotion = s.length === 5 ? s[4] : undefined;
  return { from, to, promotion, uci: s };
}

function dateStrFromYmd(y, m, d) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function hkTodayDateStr() {
  const t = hkNow();
  return dateStrFromYmd(t.y, t.m, t.d);
}

function parseDateStrToUtcMidnightMs(dateStr) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function addDays(dateStr, days) {
  const ms = parseDateStrToUtcMidnightMs(dateStr);
  if (ms == null) return null;
  const next = new Date(ms + (Number(days) || 0) * 86400000);
  return dateStrFromYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function addMonths(dateStr, months) {
  const ms = parseDateStrToUtcMidnightMs(dateStr);
  if (ms == null) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + (Number(months) || 0), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  target.setUTCDate(safeDay);
  return dateStrFromYmd(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}

const DOW_NAME_TO_NUM = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
};

function buildSkipDateSet(entry, orgSettings) {
  const s = new Set();
  const ex = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
  for (const d of ex) if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) s.add(d);
  const hol = orgSettings?.scheduleSettings?.holidays;
  if (Array.isArray(hol)) {
    for (const d of hol) if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) s.add(d);
  }
  return s;
}

function nextOccurrencesForEntry({ entry, startAfterDateStr, count, endDateStrInclusive, orgSettings }) {
  const skip = buildSkipDateSet(entry, orgSettings);
  const days = Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : [];
  const dowSet = new Set(days.map(d => DOW_NAME_TO_NUM[d]).filter(v => v !== undefined));
  if (!entry?.isRecurring) return [];
  if (dowSet.size <= 0) return [];

  const startMs = parseDateStrToUtcMidnightMs(startAfterDateStr);
  if (startMs == null) return [];

  const entryStartMs = entry.startDate ? parseDateStrToUtcMidnightMs(entry.startDate) : null;
  const entryEndMs = entry.endDate ? parseDateStrToUtcMidnightMs(entry.endDate) : null;
  const hardStopMs = entryEndMs ?? (startMs + 370 * 86400000); // safety guard ~1 year
  const endMs = endDateStrInclusive ? parseDateStrToUtcMidnightMs(endDateStrInclusive) : null;
  const limitMs = endMs != null ? Math.min(endMs, hardStopMs) : hardStopMs;

  const out = [];
  // start checking from the next day
  let curMs = startMs + 86400000;
  while (curMs <= limitMs) {
    const d = new Date(curMs);
    const ds = dateStrFromYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (entryStartMs != null && curMs < entryStartMs) { curMs += 86400000; continue; }
    if (entryEndMs != null && curMs > entryEndMs) break;
    if (!dowSet.has(d.getUTCDay())) { curMs += 86400000; continue; }
    if (skip.has(ds)) { curMs += 86400000; continue; }
    out.push(ds);
    if (count && out.length >= count) break;
    curMs += 86400000;
  }
  return out;
}

function packageLessonCount(pkg) {
  const courses = Array.isArray(pkg?.courses) ? pkg.courses : [];
  return courses.reduce((sum, c) => sum + (Number(c?.quantity) || 0), 0);
}

function computePackagePrice({ pkg, coursesById, classCount }) {
  const strategy = String(pkg?.priceStrategy || '');
  if (strategy === 'fixed') return Number(pkg?.fixedPrice) || 0;
  if (strategy === 'custom') return Number(pkg?.customPrice) || 0;
  if (strategy === 'monthly') return (Number(pkg?.monthlyLessonPrice) || 0) * (Number(classCount) || 0);
  if (strategy === 'discount') {
    const disc = Number(pkg?.discountPercentage) || 0;
    const base = (Array.isArray(pkg?.courses) ? pkg.courses : []).reduce((sum, c) => {
      const course = coursesById.get(String(c.courseId || ''));
      const qty = Number(c?.quantity) || 0;
      const p = Number(course?.price) || 0;
      return sum + qty * p;
    }, 0);
    const price = base * (1 - Math.max(0, Math.min(100, disc)) / 100);
    return Math.round(price * 100) / 100;
  }
  return 0;
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
  try {
    const content = await fs.readFile(COURSES_FILE, 'utf8');
    const data = JSON.parse(content);
    return data.courses || [];
  } catch (error) {
    console.error('Error reading courses:', error);
    return [];
  }
}

// Write courses data
async function writeCourses(courses) {
  try {
    await fs.writeFile(COURSES_FILE, JSON.stringify({ courses, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing courses:', error);
    return false;
  }
}

// Read packages data
async function readPackages() {
  try {
    const content = await fs.readFile(PACKAGES_FILE, 'utf8');
    const data = JSON.parse(content);
    return data.packages || [];
  } catch (error) {
    // If file doesn't exist, return empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error reading packages:', error);
    return [];
  }
}

// Write packages data
async function writePackages(packages) {
  try {
    await fs.writeFile(PACKAGES_FILE, JSON.stringify({ packages, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing packages:', error);
    return false;
  }
}

// Read subscription prices data (Admin Subscription Setting -> Price Setting)
async function readSubscriptionPrices() {
  try {
    const content = await fs.readFile(SUBSCRIPTION_PRICES_FILE, 'utf8');
    const data = JSON.parse(content || '{}');
    return Array.isArray(data.prices) ? data.prices : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error('Error reading subscription prices:', error);
    return [];
  }
}

// Write subscription prices data
async function writeSubscriptionPrices(prices) {
  try {
    await fs.writeFile(
      SUBSCRIPTION_PRICES_FILE,
      JSON.stringify({ prices, lastUpdate: new Date().toISOString() }, null, 2),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error('Error writing subscription prices:', error);
    return false;
  }
}

// Read subscription packages data (Admin Subscription Setting -> Package Setting)
async function readSubscriptionPackages() {
  try {
    const content = await fs.readFile(SUBSCRIPTION_PACKAGES_FILE, 'utf8');
    const data = JSON.parse(content || '{}');
    return Array.isArray(data.packages) ? data.packages : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error('Error reading subscription packages:', error);
    return [];
  }
}

function resolveOrgIdFromUser(user) {
  if (!user) return null;
  return user.organizationId || user.orgId || user.id || null;
}

// PayPal subscription helpers (extracted)
const paypalBilling = createPayPalBillingHelpers({
  billingDb,
  paypal,
  readSubscriptionPrices
});

// Write subscription packages data
async function writeSubscriptionPackages(packages) {
  try {
    await fs.writeFile(
      SUBSCRIPTION_PACKAGES_FILE,
      JSON.stringify({ packages, lastUpdate: new Date().toISOString() }, null, 2),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error('Error writing subscription packages:', error);
    return false;
  }
}

function normalizeSubscriptionStatus(v) {
  const s = String(v || 'inactive').toLowerCase();
  return ['active', 'inactive', 'archived'].includes(s) ? s : 'inactive';
}

function normalizePublishState(v) {
  const s = String(v || 'draft').toLowerCase();
  return ['draft', 'live'].includes(s) ? s : 'draft';
}

function normalizeCurrency(v) {
  const c = String(v || 'HKD').toUpperCase();
  return ['HKD', 'USD'].includes(c) ? c : 'HKD';
}

function dateOnlyTodayString() {
  // YYYY-MM-DD in server local time
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function appendSubscriptionAudit(req, record) {
  try {
    const actor = req?.user
      ? {
          id: req.user.id || req.user.userId || null,
          email: req.user.email || null,
          role: req.user.role || null
        }
      : null;
    const entry = {
      at: new Date().toISOString(),
      actor,
      ...record
    };
    await fs.appendFile(SUBSCRIPTION_AUDIT_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (e) {
    // audit must not break main flows
  }
}

// Check and update expired packages
async function checkExpiredPackages() {
  try {
    const packages = await readPackages();
    const now = new Date();
    let updated = false;

    for (const pkg of packages) {
      if (pkg.status === 'active' && pkg.endDate) {
        const endDate = new Date(pkg.endDate);
        if (endDate < now) {
          pkg.status = 'inactive';
          pkg.updatedAt = new Date().toISOString();
          updated = true;
        }
      }
    }

    if (updated) {
      await writePackages(packages);
    }

    return packages;
  } catch (error) {
    console.error('Error checking expired packages:', error);
    return [];
  }
}

// Check if package contains deleted courses and update status
async function updatePackagesForDeletedCourse(courseId) {
  try {
    const packages = await readPackages();
    let updated = false;

    for (const pkg of packages) {
      const hasDeletedCourse = pkg.courses && pkg.courses.some(c => c.courseId === courseId);
      if (hasDeletedCourse && pkg.status !== 'archived') {
        pkg.status = 'inactive';
        pkg.updatedAt = new Date().toISOString();
        updated = true;
      }
    }

    if (updated) {
      await writePackages(packages);
    }

    return updated;
  } catch (error) {
    console.error('Error updating packages for deleted course:', error);
    return false;
  }
}

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

// Challenge Level System Configuration
// HP calculation: Level 1=50, Level 2=100, Level 3=150, then each level = previous + previous-1
const LEVELS = [
  { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
  { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
  { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
  { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },        // 150 + 100
  { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' },         // 250 + 150
  { level: 6, name: 'Boss Lv1', maxHP: 650, reward: 60, emoji: '👑' },      // 400 + 250
  { level: 7, name: 'Boss Lv2', maxHP: 1050, reward: 75, emoji: '👑' },     // 650 + 400
  { level: 8, name: 'Boss Lv3', maxHP: 1700, reward: 100, emoji: '👑' },    // 1050 + 650
  { level: 9, name: 'Boss Lv4', maxHP: 2750, reward: 125, emoji: '👑' },    // 1700 + 1050
  { level: 10, name: 'Final Boss', maxHP: 4450, reward: 150, emoji: '👑' }  // 2750 + 1700
];

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

// Rank system configuration
// Wood starts at 50, then each rank multiplies by 2 times the previous rank's max score
const RANKS = [
  { name: 'Wood', maxScore: 50 },                                    // 0-50
  { name: 'Bronze', maxScore: 50 * 2 },                              // 50-100
  { name: 'Silver', maxScore: 50 * Math.pow(2, 2) },                // 100-200
  { name: 'Gold', maxScore: 50 * Math.pow(2, 3) },                  // 200-400
  { name: 'Platinum', maxScore: 50 * Math.pow(2, 4) },              // 400-800
  { name: 'Diamond', maxScore: 50 * Math.pow(2, 5) },               // 800-1600
  { name: 'Candidate Master', maxScore: 50 * Math.pow(2, 6) },      // 1600-3200
  { name: 'Master', maxScore: 50 * Math.pow(2, 7) },                // 3200-6400
  { name: 'International Master', maxScore: 50 * Math.pow(2, 8) },  // 6400-12800
  { name: 'Grand Master', maxScore: Infinity }                       // 12800+
];

// Statistics Helper Functions
function getDateKey(date = new Date()) {
  // Returns YYYY-MM-DD format
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekKey(date = new Date()) {
  // Returns YYYY-Www format (Monday as start of week)
  // Simple approach: calculate week number based on days since year start
  const d = new Date(date);
  const year = d.getFullYear();
  
  // Get the Monday of the current week
  const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // Calculate days to Monday: if Sunday (0), go back 6 days; if Monday (1), 0 days; otherwise go back (dayOfWeek - 1) days
  const daysToMonday = dayOfWeek === 0 ? -6 : (dayOfWeek === 1 ? 0 : 1 - dayOfWeek);
  const mondayDate = new Date(d);
  mondayDate.setDate(d.getDate() + daysToMonday);
  
  // Get January 1st of the year
  const jan1 = new Date(year, 0, 1);
  const jan1DayOfWeek = jan1.getDay();
  
  // Calculate first Monday of the year
  const daysToFirstMonday = jan1DayOfWeek === 0 ? 1 : (jan1DayOfWeek === 1 ? 0 : 8 - jan1DayOfWeek);
  const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
  
  // Calculate week number
  const daysDiff = Math.floor((mondayDate - firstMonday) / (24 * 60 * 60 * 1000));
  let weekNumber = Math.floor(daysDiff / 7) + 1;
  
  // Ensure week number is valid
  if (weekNumber < 1) {
    weekNumber = 1;
  }
  if (weekNumber > 52) {
    weekNumber = 52;
  }
  
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

function getMonthKey(date = new Date()) {
  // Returns YYYY-MM format
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getYearKey(date = new Date()) {
  // Returns YYYY format
  const d = new Date(date);
  return d.getFullYear().toString();
}

function updateStudentStats(student, points) {
  // Initialize stats if not exists
  if (!student.stats) {
    student.stats = {
      daily: {},
      weekly: {},
      monthly: {},
      yearly: {}
    };
  }
  
  const now = new Date();
  const dateKey = getDateKey(now);
  const weekKey = getWeekKey(now);
  const monthKey = getMonthKey(now);
  const yearKey = getYearKey(now);
  
  // Update daily stats
  if (!student.stats.daily[dateKey]) {
    student.stats.daily[dateKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.daily[dateKey].answerCount += 1;
  student.stats.daily[dateKey].totalPoints += points;
  
  // Update weekly stats
  if (!student.stats.weekly[weekKey]) {
    student.stats.weekly[weekKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.weekly[weekKey].answerCount += 1;
  student.stats.weekly[weekKey].totalPoints += points;
  
  // Update monthly stats
  if (!student.stats.monthly[monthKey]) {
    student.stats.monthly[monthKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.monthly[monthKey].answerCount += 1;
  student.stats.monthly[monthKey].totalPoints += points;

  // Update yearly stats
  if (!student.stats.yearly) student.stats.yearly = {};
  if (!student.stats.yearly[yearKey]) {
    student.stats.yearly[yearKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.yearly[yearKey].answerCount += 1;
  student.stats.yearly[yearKey].totalPoints += points;
}

function addRewardPointsToStats(student, points) {
  if (!student.stats) {
    student.stats = {
      daily: {},
      weekly: {},
      monthly: {},
      yearly: {}
    };
  }

  const now = new Date();
  const dateKey = getDateKey(now);
  const weekKey = getWeekKey(now);
  const monthKey = getMonthKey(now);
  const yearKey = getYearKey(now);

  if (!student.stats.daily[dateKey]) {
    student.stats.daily[dateKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.daily[dateKey].totalPoints += points;

  if (!student.stats.weekly[weekKey]) {
    student.stats.weekly[weekKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.weekly[weekKey].totalPoints += points;

  if (!student.stats.monthly[monthKey]) {
    student.stats.monthly[monthKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.monthly[monthKey].totalPoints += points;

  if (!student.stats.yearly) student.stats.yearly = {};
  if (!student.stats.yearly[yearKey]) {
    student.stats.yearly[yearKey] = { answerCount: 0, totalPoints: 0 };
  }
  student.stats.yearly[yearKey].totalPoints += points;
}

// Get rank information based on score
function getRankInfo(score) {
  for (let i = 0; i < RANKS.length; i++) {
    if (score <= RANKS[i].maxScore) {
      const currentRank = RANKS[i];
      const prevRank = i > 0 ? RANKS[i - 1] : { maxScore: 0 };
      const progress = i === 0 
        ? (score / currentRank.maxScore) * 100
        : ((score - prevRank.maxScore) / (currentRank.maxScore - prevRank.maxScore)) * 100;
      const nextRank = i < RANKS.length - 1 ? RANKS[i + 1] : null;
      
      return {
        rank: currentRank.name,
        rankIndex: i,
        currentScore: score,
        minScore: i === 0 ? 0 : prevRank.maxScore,
        maxScore: currentRank.maxScore,
        progress: Math.min(100, Math.max(0, progress)),
        nextRank: nextRank ? nextRank.name : null,
        // Points needed to reach the next rank threshold (end of current rank range).
        // Example: Silver maxScore=200 → if score=150, need 50 more points.
        scoreToNext: nextRank && Number.isFinite(currentRank.maxScore) ? Math.max(0, currentRank.maxScore - score) : 0
      };
    }
  }
  return {
    rank: 'Grand Master',
    rankIndex: RANKS.length - 1,
    currentScore: score,
    minScore: RANKS[RANKS.length - 2].maxScore,
    maxScore: Infinity,
    progress: 100,
    nextRank: null,
    scoreToNext: 0
  };
}

// API Routes

// ==================== Authentication API ====================

// Organization Registration (only organizations can self-register)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { organizationName, email, phone, password } = req.body;
    
    // Validation
    if (!organizationName || !email || !phone || !password) {
      return res.status(400).json({ error: 'Organization name, email, phone, and password are required' });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Password validation (minimum 6 characters)
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if organization email already exists
    const users = await readUsers();
    const existingUser = users.find(u => u.email === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: 'Organization with this email already exists' });
    }
    
    // Check if organization name already exists
    const organizations = await readOrganizations();
    const existingOrg = organizations.find(o => o.name === organizationName);
    if (existingOrg) {
      return res.status(400).json({ error: 'Organization with this name already exists' });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create organization
    const organizationId = Date.now().toString();
    const newOrganization = {
      id: organizationId,
      name: organizationName,
      email: email.toLowerCase(),
      phone,
      createdAt: new Date().toISOString(),
      teachers: [],
      students: []
    };
    
    organizations.push(newOrganization);
    await writeOrganizations(organizations);
    
    // Create organization user account
    const newUser = {
      id: Date.now().toString(),
      email: email.toLowerCase(),
      password: hashedPassword,
      name: organizationName,
      role: 'organization',
      organizationId: organizationId,
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    await writeUsers(users);

    // Provision 14-day trial for newly registered organization
    try {
      await billingAccess.ensureTrialForOrg(organizationId, 14);
    } catch (e) {
      // Trial provisioning should not block registration
      console.warn('Trial provisioning failed:', e.message || e);
    }
    
    // Generate token
    const token = generateToken(newUser);
    
    // Return user info (without password)
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({
      user: userWithoutPassword,
      organization: newOrganization,
      token
    });
  } catch (error) {
    console.error('Error registering organization:', error);
    res.status(500).json({ error: 'Failed to register organization' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    
    // Validation - support both email and username login
    const loginIdentifier = email || username;
    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    // Find user by email or username
    const users = await readUsers();
    console.log(`[LOGIN] Attempting login with: ${loginIdentifier}`);
    console.log(`[LOGIN] Total users: ${users.length}`);
    
    const user = users.find(u => 
      u.email === loginIdentifier.toLowerCase() || 
      u.username === loginIdentifier
    );
    
    if (!user) {
      console.log(`[LOGIN] User not found: ${loginIdentifier}`);
      console.log(`[LOGIN] Available emails: ${users.map(u => u.email).join(', ')}`);
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }
    
    console.log(`[LOGIN] User found: ${user.email} (${user.role})`);
    
    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    console.log(`[LOGIN] Password valid: ${isValidPassword}`);
    
    if (!isValidPassword) {
      console.log(`[LOGIN] Password verification failed for: ${user.email}`);
      return res.status(401).json({ error: 'Invalid email/username or password' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Return user info (without password)
    const { password: _, ...userWithoutPassword } = user;
    
    // Include organization info if user is organization or teacher
    if ((user.role === 'organization' || user.role === 'teacher') && user.organizationId) {
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === user.organizationId);
      if (organization) {
        userWithoutPassword.organization = organization;
      }
    }
    
    res.json({
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user info (requires authentication)
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    const users = await readUsers();
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // If organization, include organization details
    if (user.role === 'organization' && user.organizationId) {
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === user.organizationId);
      const { password: _, ...userWithoutPassword } = user;
      return res.json({ ...userWithoutPassword, organization });
    }
    
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ==================== Organization Management API ====================

// (moved to server/routes/organizationsRoutes.js)

// ==================== Admin Management API ====================

// Get all organizations (admin only)
app.get('/api/admin/organizations', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const organizations = await readOrganizations();
    const users = await readUsers();
    
    // Enrich organizations with user counts
    const data = await readData();
    const enrichedOrgs = organizations.map(org => {
      const orgUsers = users.filter(u => u.organizationId === org.id);
      const teachers = orgUsers.filter(u => u.role === 'teacher');
      const students = data.students ? data.students.filter(s => s.organizationId === org.id) : [];
      
      return {
        ...org,
        teacherCount: teachers.length,
        studentCount: students.length,
        userCount: orgUsers.length
      };
    });
    
    res.json(enrichedOrgs);
  } catch (error) {
    console.error('Error getting organizations:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

// Update organization (admin only)
app.put('/api/admin/organizations/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Update organization
    if (name) organization.name = name;
    if (email) organization.email = email;
    if (phone) organization.phone = phone;
    organization.updatedAt = new Date().toISOString();
    
    await writeOrganizations(organizations);
    
    // Update organization user email if changed
    if (email) {
      const users = await readUsers();
      const orgUser = users.find(u => u.organizationId === id && u.role === 'organization');
      if (orgUser) {
        orgUser.email = email.toLowerCase();
        await writeUsers(users);
      }
    }
    
    res.json(organization);
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Admin updates organization password
app.patch('/api/admin/organizations/:id/password', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const users = await readUsers();
    const orgUserIndex = users.findIndex(u => u.organizationId === id && u.role === 'organization');
    if (orgUserIndex === -1) {
      return res.status(404).json({ error: 'Organization user account not found' });
    }

    const hashedPassword = await hashPassword(password);
    users[orgUserIndex].password = hashedPassword;
    users[orgUserIndex].updatedAt = new Date().toISOString();
    await writeUsers(users);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating organization password:', error);
    res.status(500).json({ error: 'Failed to update organization password' });
  }
});

// Get organization details (admin only)
app.get('/api/admin/organizations/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Get related users and students
    const users = await readUsers();
    const orgUsers = users.filter(u => u.organizationId === id);
    const teachers = orgUsers.filter(u => u.role === 'teacher');
    
    const data = await readData();
    const students = data.students.filter(s => s.organizationId === id);
    
    res.json({
      ...organization,
      teachers: teachers.map(t => {
        const { password: _, ...teacherWithoutPassword } = t;
        return teacherWithoutPassword;
      }),
      students: students
    });
  } catch (error) {
    console.error('Error getting organization details:', error);
    res.status(500).json({ error: 'Failed to get organization details' });
  }
});

// Delete organization (admin only)
app.delete('/api/admin/organizations/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const organizations = await readOrganizations();
    const orgIndex = organizations.findIndex(o => o.id === id);
    if (orgIndex === -1) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const organization = organizations[orgIndex];
    const users = await readUsers();
    const removedUsers = users.filter(u => u.organizationId === id);
    const remainingUsers = users.filter(u => u.organizationId !== id);

    const data = await readData();
    const removedStudents = data.students.filter(s => s.organizationId === id);
    const removedStudentIds = new Set(removedStudents.map(s => s.id));
    data.students = data.students.filter(s => s.organizationId !== id);

    if (data.challenge && Array.isArray(data.challenge.selectedStudentIds)) {
      data.challenge.selectedStudentIds = data.challenge.selectedStudentIds.filter(studentId => !removedStudentIds.has(studentId));
    }

    if (data.gameState && data.gameState.current && Array.isArray(data.gameState.current.players)) {
      data.gameState.current.players = data.gameState.current.players.filter(player => !removedStudentIds.has(player.studentId));
    }

    data.lastUpdate = new Date().toISOString();

    organizations.splice(orgIndex, 1);

    await writeUsers(remainingUsers);
    await writeData(data);
    await writeOrganizations(organizations);

    if (removedStudents.length > 0) {
      broadcast({ type: 'studentsRemoved', studentIds: Array.from(removedStudentIds) });
    }
    broadcast({ type: 'organizationDeleted', organizationId: id });

    res.json({
      message: 'Organization deleted successfully',
      removedStudents: removedStudents.length,
      removedUsers: removedUsers.length,
      organizationName: organization.name
    });
  } catch (error) {
    console.error('Error deleting organization:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// Admin login as organization
app.post('/api/admin/organizations/:id/login-as', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[DEBUG] Admin Login As OrgID: ${id}`);
    
    const users = await readUsers();
    
    // Find the user with role 'organization' and organizationId matching the param
    const targetUser = users.find(u => 
      u.role === 'organization' && 
      u.organizationId === id
    );
    
    if (!targetUser) {
      console.log(`[DEBUG] No Org User found for OrgID: ${id}`);
      return res.status(404).json({ error: 'Organization user not found' });
    }
    
    console.log(`[DEBUG] Found Org User: ${targetUser.name} (ID: ${targetUser.id})`);
    
    const token = generateToken(targetUser);
    console.log(`[DEBUG] Generated Token Payload ID: ${targetUser.id}`);
    
    const { password: _, ...userWithoutPassword } = targetUser;
    
    res.json({
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Error logging in as organization:', error);
    res.status(500).json({ error: 'Failed to login as organization' });
  }
});

// Admin creates a teacher for an organization
app.post('/api/admin/organizations/:id/teachers', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, teacherId, gender, username, password } = req.body;

    if (!name || !teacherId || !gender || !username || !password) {
      return res.status(400).json({ error: 'Name, teacher ID, gender, username, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const users = await readUsers();
    const normalizedUsername = username.toLowerCase();
    const existingUser = users.find(u => u.email === normalizedUsername || u.username === normalizedUsername);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingTeacher = users.find(u =>
      u.organizationId === id &&
      u.role === 'teacher' &&
      u.teacherId === teacherId
    );
    if (existingTeacher) {
      return res.status(400).json({ error: 'Teacher ID already exists in this organization' });
    }

    const hashedPassword = await hashPassword(password);
    const newTeacher = {
      id: Date.now().toString(),
      email: normalizedUsername,
      username: normalizedUsername,
      password: hashedPassword,
      name,
      teacherId,
      gender,
      role: 'teacher',
      organizationId: id,
      createdAt: new Date().toISOString(),
      classViewStudents: [],
      assignedStudents: []
    };

    users.push(newTeacher);
    await writeUsers(users);

    organization.teachers = organization.teachers || [];
    organization.teachers.push(newTeacher.id);
    organization.updatedAt = new Date().toISOString();
    await writeOrganizations(organizations);

    const { password: _, ...teacherWithoutPassword } = newTeacher;
    res.status(201).json({
      teacher: teacherWithoutPassword
    });
  } catch (error) {
    console.error('Error creating teacher as admin:', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// Admin creates a student for an organization
app.post('/api/admin/organizations/:id/students', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, studentId, score = 0 } = req.body;

    if (!name || !studentId) {
      return res.status(400).json({ error: 'Name and Student ID are required' });
    }

    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const data = await readData();
    const existingStudent = data.students.find(s =>
      s.organizationId === id &&
      s.studentId === studentId
    );
    if (existingStudent) {
      return res.status(400).json({ error: 'Student ID already exists in this organization' });
    }

    const scoreNumber = Number(score || 0);
    const rankInfo = getRankInfo(scoreNumber);
    const newStudent = {
      id: Date.now().toString(),
      name,
      studentId,
      organizationId: id,
      answerCount: 0,
      totalAnswers: 0,
      correctAnswers: 0,
      level: rankInfo.rankIndex + 1,
      rank: rankInfo.rank,
      rankIndex: rankInfo.rankIndex,
      experience: scoreNumber,
      score: scoreNumber,
      createdAt: new Date().toISOString(),
      stats: {
        daily: {},
        weekly: {},
        monthly: {},
        yearly: {}
      }
    };

    data.students.push(newStudent);
    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    organization.students = organization.students || [];
    organization.students.push(newStudent.id);
    organization.updatedAt = new Date().toISOString();
    await writeOrganizations(organizations);

    broadcast({ type: 'studentAdded', student: newStudent });
    res.status(201).json(newStudent);
  } catch (error) {
    console.error('Error creating student as admin:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// (moved to server/routes/organizationsRoutes.js)

// Admin updates a student's score
app.patch('/api/admin/organizations/:orgId/students/:studentId', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { orgId, studentId } = req.params;
    const { score } = req.body;

    if (score === undefined || score === null || isNaN(Number(score))) {
      return res.status(400).json({ error: 'Valid score is required' });
    }

    const data = await readData();
    const student = data.students.find(s => s.id === studentId && s.organizationId === orgId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found in this organization' });
    }

    const numericScore = Number(score);
    student.score = numericScore;
    student.experience = numericScore;
    const rankInfo = getRankInfo(numericScore);
    student.rank = rankInfo.rank;
    student.rankIndex = rankInfo.rankIndex;
    student.level = rankInfo.rankIndex + 1;
    student.updatedAt = new Date().toISOString();

    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    broadcast({ type: 'studentUpdated', student });
    res.json(student);
  } catch (error) {
    console.error('Error updating student score as admin:', error);
    res.status(500).json({ error: 'Failed to update student score' });
  }
});

// ==================== Admin Organization Settings API ====================

// Get organization settings (admin only)
app.get('/api/admin/organizations/:id/settings', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Return admin settings or default
    const defaultSettings = {
      accountLimits: {
        maxTeachers: -1,
        maxStudents: -1,
        storageLimitMB: -1,
        apiRateLimitPerHour: -1
      },
      accountStatus: {
        status: 'active',
        expiryDate: null,
        isTrial: false,
        suspensionReason: ''
      },
      featurePermissions: {
        canUseClassView: true,
        canUseChallengeMode: true,
        canUseGameFeatures: true,
        canExportData: true,
        canUseCustomSettings: true,
        canUseBackup: true
      },
      dataManagement: {
        backupFrequencyLimit: 'daily',
        dataRetentionDays: 365,
        maxBackupCount: 10
      },
      securityCompliance: {
        forcePasswordPolicy: false,
        loginAttemptLimit: 5,
        sessionTimeoutMs: 3600000,
        ipWhitelist: []
      },
      notifications: {
        sendSystemNotifications: true,
        sendWarningEmails: true,
        sendExpiryReminders: true,
        activityMonitoring: true
      },
      billing: {
        subscriptionPlan: 'free',
        billingCycle: 'monthly',
        autoRenew: false,
        paymentStatus: 'unpaid',
        nextBillingDate: null
      }
    };
    
    const adminSettings = organization.adminSettings || defaultSettings;
    res.json(adminSettings);
  } catch (error) {
    console.error('Error getting organization settings:', error);
    res.status(500).json({ error: 'Failed to get organization settings' });
  }
});

// Update organization settings (admin only)
app.put('/api/admin/organizations/:id/settings', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { adminSettings } = req.body;
    
    if (!adminSettings || typeof adminSettings !== 'object') {
      return res.status(400).json({ error: 'adminSettings data is required' });
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Update admin settings
    organization.adminSettings = adminSettings;
    organization.updatedAt = new Date().toISOString();
    
    const orgIndex = organizations.findIndex(o => o.id === id);
    organizations[orgIndex] = organization;
    await writeOrganizations(organizations);
    
    res.json({
      message: 'Settings saved successfully',
      adminSettings: organization.adminSettings
    });
  } catch (error) {
    console.error('Error updating organization settings:', error);
    res.status(500).json({ error: 'Failed to update organization settings' });
  }
});

// Get organization statistics (admin only)
app.get('/api/admin/organizations/:id/statistics', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    const users = await readUsers();
    const data = await readData();
    
    const orgUsers = users.filter(u => u.organizationId === id);
    const teachers = orgUsers.filter(u => u.role === 'teacher');
    const students = data.students ? data.students.filter(s => s.organizationId === id) : [];
    
    const adminSettings = organization.adminSettings || {};
    const accountLimits = adminSettings.accountLimits || {};
    
    // Calculate statistics
    const stats = {
      teacherCount: teachers.length,
      studentCount: students.length,
      maxTeachers: accountLimits.maxTeachers || -1,
      maxStudents: accountLimits.maxStudents || -1,
      storageUsedMB: 0, // TODO: Calculate actual storage
      storageLimitMB: accountLimits.storageLimitMB || -1,
      apiCalls24h: 0, // TODO: Track API calls
      apiRateLimitPerHour: accountLimits.apiRateLimitPerHour || -1,
      activeUsers7d: orgUsers.length, // TODO: Calculate actual active users
      activeTeachers7d: teachers.length,
      activeStudents7d: students.length,
      lastLogin: null, // TODO: Track last login
      dataCreated: organization.createdAt,
      lastActivity: organization.updatedAt || organization.createdAt,
      studentGrowth: 0, // TODO: Calculate growth
      teacherGrowth: 0 // TODO: Calculate growth
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting organization statistics:', error);
    res.status(500).json({ error: 'Failed to get organization statistics' });
  }
});

// Get organization audit logs (admin only)
app.get('/api/admin/organizations/:id/audit-logs', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Get audit logs from organization or return empty array
    let auditLogs = organization.auditLogs || [];
    
    // Filter by date range if provided
    if (startDate || endDate) {
      auditLogs = auditLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        if (startDate && logDate < new Date(startDate)) return false;
        if (endDate && logDate > new Date(endDate + 'T23:59:59')) return false;
        return true;
      });
    }
    
    // Sort by timestamp descending (newest first)
    auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    res.json(auditLogs);
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Batch operations on organizations (admin only)
app.post('/api/admin/organizations/batch', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { organizationIds, action, options } = req.body;
    
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      return res.status(400).json({ error: 'organizationIds array is required' });
    }
    
    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }
    
    const organizations = await readOrganizations();
    let affectedCount = 0;
    
    for (const orgId of organizationIds) {
      const orgIndex = organizations.findIndex(o => o.id === orgId);
      if (orgIndex === -1) continue;
      
      const org = organizations[orgIndex];
      
      if (!org.adminSettings) {
        org.adminSettings = {};
      }
      if (!org.adminSettings.accountStatus) {
        org.adminSettings.accountStatus = {};
      }
      
      switch(action) {
        case 'activate':
          org.adminSettings.accountStatus.status = 'active';
          org.adminSettings.accountStatus.suspensionReason = '';
          affectedCount++;
          break;
        case 'suspend':
          org.adminSettings.accountStatus.status = 'suspended';
          org.adminSettings.accountStatus.suspensionReason = options || 'Suspended by admin';
          affectedCount++;
          break;
        case 'disable':
          org.adminSettings.accountStatus.status = 'disabled';
          org.adminSettings.accountStatus.suspensionReason = options || 'Disabled by admin';
          affectedCount++;
          break;
        case 'sendNotification':
          // TODO: Implement notification sending
          affectedCount++;
          break;
        case 'exportData':
          // TODO: Implement data export
          affectedCount++;
          break;
      }
      
      org.updatedAt = new Date().toISOString();
      organizations[orgIndex] = org;
    }
    
    await writeOrganizations(organizations);
    
    res.json({
      message: `Batch operation completed`,
      action: action,
      affectedCount: affectedCount
    });
  } catch (error) {
    console.error('Error executing batch operation:', error);
    res.status(500).json({ error: 'Failed to execute batch operation' });
  }
});

// Batch update organization settings (admin only)
app.post('/api/admin/organizations/batch-settings', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const { organizationIds, settingKey, settingValue } = req.body;
    
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      return res.status(400).json({ error: 'organizationIds array is required' });
    }
    
    if (!settingKey || settingValue === undefined) {
      return res.status(400).json({ error: 'settingKey and settingValue are required' });
    }
    
    const organizations = await readOrganizations();
    let affectedCount = 0;
    
    for (const orgId of organizationIds) {
      const orgIndex = organizations.findIndex(o => o.id === orgId);
      if (orgIndex === -1) continue;
      
      const org = organizations[orgIndex];
      
      if (!org.adminSettings) {
        org.adminSettings = {};
      }
      
      // Update setting based on key path
      const keyParts = settingKey.split('.');
      let target = org.adminSettings;
      
      for (let i = 0; i < keyParts.length - 1; i++) {
        if (!target[keyParts[i]]) {
          target[keyParts[i]] = {};
        }
        target = target[keyParts[i]];
      }
      
      // Convert value to appropriate type
      let finalValue = settingValue;
      if (!isNaN(settingValue) && settingValue !== '') {
        finalValue = Number(settingValue);
      }
      
      target[keyParts[keyParts.length - 1]] = finalValue;
      org.updatedAt = new Date().toISOString();
      organizations[orgIndex] = org;
      affectedCount++;
    }
    
    await writeOrganizations(organizations);
    
    res.json({
      message: 'Settings updated successfully',
      settingKey: settingKey,
      affectedCount: affectedCount
    });
  } catch (error) {
    console.error('Error updating batch settings:', error);
    res.status(500).json({ error: 'Failed to update batch settings' });
  }
});

// ----------------------------
// Admin - Subscription Setting (Price Setting)
// Remote storage (JSON file) to avoid localStorage usage on frontend.
// ----------------------------
function slugifySubscriptionCode(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'price';
}

function ensureUniquePriceCode(existingPrices, baseCode, excludeId = null) {
  const existing = new Set(
    existingPrices
      .filter(p => (excludeId ? p.id !== excludeId : true))
      .map(p => String(p.code || '').toLowerCase())
  );
  let code = baseCode;
  let i = 2;
  while (existing.has(code.toLowerCase())) {
    code = `${baseCode}_${i++}`;
  }
  return code;
}

function normalizeBillingType(bt) {
  const v = String(bt || 'monthly').toLowerCase();
  return ['monthly', 'yearly', 'one-time'].includes(v) ? v : 'monthly';
}

function normalizePricePayload(body, existingPrices, { excludeId = null } = {}) {
  const name = String(body?.name || '').trim();
  const amount = Number(body?.amount ?? body?.price ?? 0);
  const billingType = normalizeBillingType(body?.billingType);
  const currency = normalizeCurrency(body?.currency);
  const status = normalizeSubscriptionStatus(body?.status);
  const publishState = normalizePublishState(body?.publishState);
  const features = {
    classView: Boolean(body?.features?.classView),
    challengeMode: Boolean(body?.features?.challengeMode)
  };
  const limits = {
    teacherSeats: Math.max(0, parseInt(body?.limits?.teacherSeats ?? 0, 10) || 0),
    studentSeats: Math.max(0, parseInt(body?.limits?.studentSeats ?? 0, 10) || 0)
  };

  let code = String(body?.code || '').trim();
  if (!code) {
    code = `${slugifySubscriptionCode(name)}_${billingType}`;
  }
  code = ensureUniquePriceCode(existingPrices, code, excludeId);

  return { name, amount, billingType, currency, status, publishState, code, features, limits };
}

app.get('/api/admin/subscription/prices', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const prices = await readSubscriptionPrices();
    const filtered = !q
      ? prices
      : prices.filter(p =>
          String(p.name || '').toLowerCase().includes(q) || String(p.code || '').toLowerCase().includes(q)
        );
    res.json(filtered);
  } catch (error) {
    console.error('Error listing subscription prices:', error);
    res.status(500).json({ error: 'Failed to load prices' });
  }
});

app.post('/api/admin/subscription/prices', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const prices = await readSubscriptionPrices();
    const payload = normalizePricePayload(req.body, prices);

    if (!payload.name) return res.status(400).json({ error: 'Name is required' });
    if (!Number.isFinite(payload.amount) || payload.amount < 0) return res.status(400).json({ error: 'Price must be >= 0' });

    const id = `price_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const now = new Date().toISOString();
    const price = {
      id,
      ...payload,
      createdAt: now,
      updatedAt: now
    };

    prices.push(price);
    await writeSubscriptionPrices(prices);
    await appendSubscriptionAudit(req, { action: 'create', entityType: 'price', entityId: id, after: price });
    res.json(price);
  } catch (error) {
    console.error('Error creating subscription price:', error);
    res.status(500).json({ error: 'Failed to create price' });
  }
});

app.put('/api/admin/subscription/prices/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const prices = await readSubscriptionPrices();
    const idx = prices.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Price not found' });

    const before = prices[idx];
    const payload = normalizePricePayload(req.body, prices, { excludeId: id });
    if (!payload.name) return res.status(400).json({ error: 'Name is required' });
    if (!Number.isFinite(payload.amount) || payload.amount < 0) return res.status(400).json({ error: 'Price must be >= 0' });

    prices[idx] = {
      ...prices[idx],
      ...payload,
      updatedAt: new Date().toISOString()
    };

    await writeSubscriptionPrices(prices);
    await appendSubscriptionAudit(req, { action: 'update', entityType: 'price', entityId: id, before, after: prices[idx] });
    res.json(prices[idx]);
  } catch (error) {
    console.error('Error updating subscription price:', error);
    res.status(500).json({ error: 'Failed to update price' });
  }
});

app.delete('/api/admin/subscription/prices/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const prices = await readSubscriptionPrices();
    const before = prices.find(p => p.id === id) || null;
    const next = prices.filter(p => p.id !== id);
    await writeSubscriptionPrices(next);
    await appendSubscriptionAudit(req, { action: 'delete', entityType: 'price', entityId: id, before });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting subscription price:', error);
    res.status(500).json({ error: 'Failed to delete price' });
  }
});

app.post('/api/admin/subscription/prices/bulk-delete', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids is required' });

    const prices = await readSubscriptionPrices();
    const set = new Set(ids);
    const deleted = prices.filter(p => set.has(p.id));
    const next = prices.filter(p => !set.has(p.id));
    await writeSubscriptionPrices(next);
    await appendSubscriptionAudit(req, { action: 'bulk_delete', entityType: 'price', meta: { ids, deletedCount: deleted.length }, before: deleted });
    res.json({ ok: true, deletedCount: prices.length - next.length });
  } catch (error) {
    console.error('Error bulk deleting subscription prices:', error);
    res.status(500).json({ error: 'Failed to delete prices' });
  }
});

function normalizeDiscountType(t) {
  const v = String(t || 'none').toLowerCase();
  return ['none', 'percent', 'fixed'].includes(v) ? v : 'none';
}

function normalizeDateOnly(d) {
  const v = String(d || '').trim();
  if (!v) return '';
  // Expect YYYY-MM-DD from <input type="date">
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return v;
}

function normalizeSubscriptionPackagePayload(body) {
  const name = String(body?.name || '').trim();
  const priceId = String(body?.priceId || '').trim();
  const priceCode = String(body?.priceCode || '').trim();
  const quantity = Math.max(1, parseInt(body?.quantity ?? 1, 10) || 1);
  const discountType = normalizeDiscountType(body?.discountType);
  const discountValueRaw = Number(body?.discountValue ?? 0);
  const discountValue = Number.isFinite(discountValueRaw) && discountValueRaw >= 0 ? discountValueRaw : 0;
  const validFrom = normalizeDateOnly(body?.validFrom);
  const validTo = normalizeDateOnly(body?.validTo);
  const status = normalizeSubscriptionStatus(body?.status);
  const publishState = normalizePublishState(body?.publishState);
  return { name, priceId, priceCode, quantity, discountType, discountValue, validFrom, validTo, status, publishState };
}

app.get('/api/admin/subscription/packages', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const packages = await readSubscriptionPackages();
    const today = dateOnlyTodayString();
    let mutated = false;
    for (const pkg of packages) {
      const expired = pkg.validTo && String(pkg.validTo) < today;
      pkg.expired = Boolean(expired);
      if (expired && normalizeSubscriptionStatus(pkg.status) === 'active') {
        pkg.status = 'inactive';
        pkg.updatedAt = new Date().toISOString();
        mutated = true;
      }
    }
    if (mutated) {
      await writeSubscriptionPackages(packages);
    }
    const filtered = !q
      ? packages
      : packages.filter(p =>
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.priceCode || '').toLowerCase().includes(q)
        );
    res.json(filtered);
  } catch (error) {
    console.error('Error listing subscription packages:', error);
    res.status(500).json({ error: 'Failed to load packages' });
  }
});

app.post('/api/admin/subscription/packages', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const packages = await readSubscriptionPackages();
    const payload = normalizeSubscriptionPackagePayload(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Package Name is required' });
    if (!payload.priceId && !payload.priceCode) return res.status(400).json({ error: 'Price Code is required' });

    // Validate referenced price (best-effort)
    const prices = await readSubscriptionPrices();
    const found = payload.priceId ? prices.find(p => p.id === payload.priceId) : prices.find(p => p.code === payload.priceCode);
    if (!found) return res.status(400).json({ error: 'Selected Price Code not found' });

    const now = new Date().toISOString();
    const id = `spkg_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const pkg = {
      id,
      name: payload.name,
      priceId: found.id,
      priceCode: found.code,
      currency: normalizeCurrency(found.currency),
      quantity: payload.quantity,
      status: payload.status,
      publishState: payload.publishState,
      discountType: payload.discountType,
      discountValue: payload.discountType === 'none' ? 0 : payload.discountValue,
      validFrom: payload.validFrom,
      validTo: payload.validTo,
      expired: payload.validTo ? String(payload.validTo) < dateOnlyTodayString() : false,
      createdAt: now,
      updatedAt: now
    };

    packages.push(pkg);
    await writeSubscriptionPackages(packages);
    await appendSubscriptionAudit(req, { action: 'create', entityType: 'package', entityId: id, after: pkg });
    res.json(pkg);
  } catch (error) {
    console.error('Error creating subscription package:', error);
    res.status(500).json({ error: 'Failed to create package' });
  }
});

app.put('/api/admin/subscription/packages/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;
    const packages = await readSubscriptionPackages();
    const idx = packages.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Package not found' });

    const before = packages[idx];
    const payload = normalizeSubscriptionPackagePayload(req.body);
    if (!payload.name) return res.status(400).json({ error: 'Package Name is required' });
    if (!payload.priceId && !payload.priceCode) return res.status(400).json({ error: 'Price Code is required' });

    const prices = await readSubscriptionPrices();
    const found = payload.priceId ? prices.find(p => p.id === payload.priceId) : prices.find(p => p.code === payload.priceCode);
    if (!found) return res.status(400).json({ error: 'Selected Price Code not found' });

    packages[idx] = {
      ...packages[idx],
      name: payload.name,
      priceId: found.id,
      priceCode: found.code,
      currency: normalizeCurrency(found.currency),
      quantity: payload.quantity,
      status: payload.status,
      publishState: payload.publishState,
      discountType: payload.discountType,
      discountValue: payload.discountType === 'none' ? 0 : payload.discountValue,
      validFrom: payload.validFrom,
      validTo: payload.validTo,
      expired: payload.validTo ? String(payload.validTo) < dateOnlyTodayString() : false,
      updatedAt: new Date().toISOString()
    };

    await writeSubscriptionPackages(packages);
    await appendSubscriptionAudit(req, { action: 'update', entityType: 'package', entityId: id, before, after: packages[idx] });
    res.json(packages[idx]);
  } catch (error) {
    console.error('Error updating subscription package:', error);
    res.status(500).json({ error: 'Failed to update package' });
  }
});

app.post('/api/admin/subscription/packages/bulk-delete', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'ids is required' });

    const packages = await readSubscriptionPackages();
    const set = new Set(ids);
    const deleted = packages.filter(p => set.has(p.id));
    const next = packages.filter(p => !set.has(p.id));
    await writeSubscriptionPackages(next);
    await appendSubscriptionAudit(req, { action: 'bulk_delete', entityType: 'package', meta: { ids, deletedCount: deleted.length }, before: deleted });
    res.json({ ok: true, deletedCount: packages.length - next.length });
  } catch (error) {
    console.error('Error bulk deleting subscription packages:', error);
    res.status(500).json({ error: 'Failed to delete packages' });
  }
});

app.get('/api/admin/subscription/audit', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const entityType = String(req.query.entityType || '').trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '100', 10) || 100));

    const raw = await fs.readFile(SUBSCRIPTION_AUDIT_FILE, 'utf8').catch(() => '');
    const lines = raw.split('\n').filter(Boolean);
    const parsed = [];
    for (let i = lines.length - 1; i >= 0 && parsed.length < limit; i--) {
      try {
        const item = JSON.parse(lines[i]);
        parsed.push(item);
      } catch (e) {
        // skip bad line
      }
    }

    const filtered = parsed.filter(item => {
      if (entityType && item.entityType !== entityType) return false;
      if (!q) return true;
      const blob = JSON.stringify(item).toLowerCase();
      return blob.includes(q);
    });

    res.json(filtered);
  } catch (error) {
    console.error('Error reading subscription audit log:', error);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
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

// Get challenge/level information
app.get('/api/challenge', authenticateUser, async (req, res) => {
  try {
    console.log(`[DEBUG] GET /api/challenge for user ${req.user.id} (Role: ${req.user.role})`);
    
    const data = await readData();
    const challenge = data.challenge || {
      currentLevel: 1,
      currentHP: 200,
      completedLevels: [],
      totalDamage: 0,
      selectedStudentIds: []
    };
    // Ensure selectedStudentIds exists
    if (!challenge.selectedStudentIds) {
      challenge.selectedStudentIds = [];
    }

    // Load Game Config
    let levels = LEVELS; // Default
    if (req.user && req.user.organizationId) {
        const organizations = await readOrganizations();
        const org = organizations.find(o => o.id === req.user.organizationId);
        
        if (org) {
            console.log(`[DEBUG] Found Org: ${org.id}`);
            if (org.settings && org.settings.challengeLevels && org.settings.challengeLevels.levels && org.settings.challengeLevels.levels.length > 0) {
                console.log(`[DEBUG] Using org.settings.challengeLevels (${org.settings.challengeLevels.levels.length} levels)`);
                levels = org.settings.challengeLevels.levels;
            } else if (org.gameConfig && org.gameConfig.classicLevels && org.gameConfig.classicLevels.length > 0) {
                console.log(`[DEBUG] Using org.gameConfig.classicLevels`);
                levels = org.gameConfig.classicLevels;
            } else {
                console.log('[DEBUG] No custom levels found, using default');
            }
        } else {
            console.log('[DEBUG] Org not found in database');
        }
    } else {
        console.log('[DEBUG] No organizationId in request user');
    }

    const currentLevelIndex = challenge.currentLevel - 1;
    const currentLevelInfo = levels[currentLevelIndex] || levels[levels.length - 1] || LEVELS[0];
    
    // Fix currentHP
    if (!challenge.currentHP && challenge.currentHP !== 0) challenge.currentHP = currentLevelInfo.maxHP;
    
    if (challenge.currentHP > currentLevelInfo.maxHP) {
      challenge.currentHP = currentLevelInfo.maxHP;
      data.challenge = challenge;
      await writeData(data);
    }
    
    res.json({
      ...challenge,
      levelInfo: currentLevelInfo,
      allLevels: levels
    });
  } catch (error) {
    console.error('Error getting challenge:', error);
    res.status(500).json({ error: 'Failed to get challenge info' });
  }
});

// Set selected students for Class View
app.post('/api/challenge/selected-students', async (req, res) => {
  try {
    const { selectedStudentIds } = req.body;
    
    if (!Array.isArray(selectedStudentIds)) {
      return res.status(400).json({ error: 'selectedStudentIds must be an array' });
    }
    
    const data = await readData();
    if (!data.challenge) {
      data.challenge = {
        currentLevel: 1,
        currentHP: LEVELS[0].maxHP,
        completedLevels: [],
        totalDamage: 0,
        selectedStudentIds: []
      };
    }
    
    // Update selected student IDs
    data.challenge.selectedStudentIds = selectedStudentIds;
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ 
      type: 'selectedStudentsUpdated', 
      selectedStudentIds: selectedStudentIds 
    });
    
    res.json({ success: true, selectedStudentIds: selectedStudentIds });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update selected students' });
  }
});

// Statistics API - Get most active students (MUST be before /api/statistics/:period to avoid route conflict)
app.get('/api/statistics/active-students', async (req, res) => {
  try {
    // Get period from query parameter
    let period = req.query.period || 'daily';
    
    // Ensure period is a string
    if (Array.isArray(period)) {
      period = period[0];
    }
    if (typeof period !== 'string') {
      period = String(period || 'daily');
    }
    
    // Clean period parameter (remove any trailing characters like :1)
    period = period.split(':')[0].trim().toLowerCase();
    
    // Validate period
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      console.error('Invalid period validation failed:', {
        original: req.query.period,
        cleaned: period
      });
      return res.status(400).json({ 
        error: 'Invalid period. Use: daily, weekly, or monthly',
        received: req.query.period,
        cleaned: period
      });
    }
    
    const data = await readData();
    const students = data.students || [];
    
    let currentKey;
    try {
      if (period === 'daily') {
        currentKey = getDateKey();
      } else if (period === 'weekly') {
        currentKey = getWeekKey();
      } else {
        currentKey = getMonthKey();
      }
    } catch (error) {
      console.error(`Error calculating ${period} key:`, error);
      return res.status(500).json({ error: `Failed to calculate ${period} key` });
    }
    
    // Get active students for the period
    const statsKey = period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly';
    
    const activeStudents = students
      .map(student => {
        if (!student.stats || !student.stats[statsKey]) return null;
        
        const periodStats = student.stats[statsKey];
        
        if (periodStats && periodStats[currentKey]) {
          return {
            id: student.id,
            name: student.name,
            studentId: student.studentId,
            answerCount: periodStats[currentKey].answerCount || 0,
            totalPoints: periodStats[currentKey].totalPoints || 0
          };
        }
        return null;
      })
      .filter(s => s !== null && s !== undefined)
      .sort((a, b) => {
        // Sort by answerCount first, then by totalPoints
        if (b.answerCount !== a.answerCount) {
          return b.answerCount - a.answerCount;
        }
        return b.totalPoints - a.totalPoints;
      })
      .map((student, index) => ({
        ...student,
        rank: index + 1
      }));
    
    // Always return a valid response, even if no active students
    res.json({
      period,
      periodKey: currentKey,
      students: activeStudents || []
    });
  } catch (error) {
    console.error('Error getting active students:', error);
    res.status(500).json({ error: 'Failed to get active students' });
  }
});

// Statistics API - Get statistics for a specific period
app.get('/api/statistics/:period', async (req, res) => {
  try {
    let { period } = req.params; // daily, weekly, or monthly
    
    // Clean period parameter
    if (typeof period === 'string') {
      period = period.split(':')[0].trim().toLowerCase(); // Remove any :number suffix
    }
    
    // Validate period
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      console.error(`Invalid period received: ${req.params.period} (cleaned: ${period})`);
      return res.status(400).json({ 
        error: 'Invalid period. Use: daily, weekly, or monthly',
        received: req.params.period,
        cleaned: period
      });
    }
    
    const data = await readData();
    const students = data.students || [];
    
    let keyFunction, currentKey;
    try {
      if (period === 'daily') {
        keyFunction = getDateKey;
        currentKey = getDateKey();
      } else if (period === 'weekly') {
        keyFunction = getWeekKey;
        currentKey = getWeekKey();
      } else {
        keyFunction = getMonthKey;
        currentKey = getMonthKey();
      }
    } catch (error) {
      console.error(`Error calculating ${period} key:`, error);
      return res.status(500).json({ error: `Failed to calculate ${period} key` });
    }
    
    // Aggregate statistics from all students
    let totalAnswerCount = 0;
    let totalPoints = 0;
    let studentCount = 0;
    
    students.forEach(student => {
      if (!student.stats) return;
      
      const statsKey = period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly';
      const periodStats = student.stats[statsKey];
      
      if (periodStats && periodStats[currentKey]) {
        totalAnswerCount += periodStats[currentKey].answerCount || 0;
        totalPoints += periodStats[currentKey].totalPoints || 0;
        studentCount += 1;
      }
    });
    
    const averageAnswerCount = studentCount > 0 ? (totalAnswerCount / studentCount).toFixed(2) : 0;
    const averagePoints = studentCount > 0 ? (totalPoints / studentCount).toFixed(2) : 0;
    
    res.json({
      period,
      periodKey: currentKey,
      totalAnswerCount,
      totalPoints,
      averageAnswerCount: parseFloat(averageAnswerCount),
      averagePoints: parseFloat(averagePoints),
      activeStudents: studentCount
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
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

// Reset challenge (start from level 1)
app.post('/api/challenge/reset', async (req, res) => {
  try {
    const data = await readData();
    // Preserve selectedStudentIds when resetting challenge
    const selectedStudentIds = data.challenge?.selectedStudentIds || [];
    data.challenge = {
      currentLevel: 1,
      currentHP: LEVELS[0].maxHP,
      completedLevels: [],
      totalDamage: 0,
      selectedStudentIds: selectedStudentIds
    };
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    broadcast({ type: 'challengeReset', challenge: data.challenge });
    res.json(data.challenge);
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset challenge' });
  }
});

// Save challenge progress
app.post('/api/challenge/save', async (req, res) => {
  try {
    const { day, time } = req.body;
    
    if (!day || !time) {
      return res.status(400).json({ error: 'Day and time are required' });
    }
    
    // Validate day
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({ error: 'Invalid day' });
    }
    
    // Validate time format (HHMM or HH:MM)
    const timeMatch = time.match(/^(\d{2}):?(\d{2})$/);
    if (!timeMatch) {
      return res.status(400).json({ error: 'Invalid time format' });
    }
    
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    
    if (hours < 8 || hours > 22 || (hours === 22 && minutes > 0) || minutes % 30 !== 0) {
      return res.status(400).json({ error: 'Time must be between 08:00 and 22:00, in 30-minute intervals' });
    }
    
    // Get current challenge data
    const data = await readData();
    const challengeData = data.challenge || {
      currentLevel: 1,
      currentHP: LEVELS[0].maxHP,
      completedLevels: [],
      totalDamage: 0,
      selectedStudentIds: []
    };
    // Ensure selectedStudentIds exists
    if (!challengeData.selectedStudentIds) {
      challengeData.selectedStudentIds = [];
    }
    
    // Format time for filename (HHMM)
    const timeFormatted = `${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
    const filename = `save_${day}_${timeFormatted}.txt`;
    const filepath = path.join(SAVES_DIR, filename);
    
    // Save challenge data (only challenge, not students)
    const saveData = {
      day,
      time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      savedAt: new Date().toISOString(),
      challenge: challengeData
    };
    
    await fs.writeFile(filepath, JSON.stringify(saveData, null, 2), 'utf8');
    
    res.json({ success: true, filename, message: 'Challenge progress saved successfully' });
  } catch (error) {
    console.error('Error saving challenge:', error);
    res.status(500).json({ error: 'Failed to save challenge progress' });
  }
});

// Get all saves list
app.get('/api/challenge/saves', async (req, res) => {
  try {
    const files = await fs.readdir(SAVES_DIR);
    const saveFiles = files.filter(f => f.startsWith('save_') && f.endsWith('.txt'));
    
    const saves = [];
    for (const file of saveFiles) {
      try {
        const filepath = path.join(SAVES_DIR, file);
        const content = await fs.readFile(filepath, 'utf8');
        const saveData = JSON.parse(content);
        
        // Get file stats for sorting
        const stats = await fs.stat(filepath);
        
        saves.push({
          filename: file,
          day: saveData.day,
          time: saveData.time,
          savedAt: saveData.savedAt,
          modifiedAt: stats.mtime.toISOString(),
          challenge: {
            currentLevel: saveData.challenge?.currentLevel || 1,
            currentHP: saveData.challenge?.currentHP || 0,
            completedLevels: saveData.challenge?.completedLevels || []
          }
        });
      } catch (error) {
        console.error(`Error reading save file ${file}:`, error);
      }
    }
    
    // Sort by modified time (newest first)
    saves.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    
    res.json(saves);
  } catch (error) {
    console.error('Error listing saves:', error);
    res.status(500).json({ error: 'Failed to list saves' });
  }
});

// Load challenge from save
app.post('/api/challenge/load', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    
    // Security: prevent directory traversal
    if (filename.includes('..') || !filename.startsWith('save_') || !filename.endsWith('.txt')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filepath = path.join(SAVES_DIR, filename);
    
    // Read save file
    const content = await fs.readFile(filepath, 'utf8');
    const saveData = JSON.parse(content);
    
    // Update current challenge data
    const data = await readData();
    data.challenge = saveData.challenge;
    // Ensure selectedStudentIds exists
    if (!data.challenge.selectedStudentIds) {
      data.challenge.selectedStudentIds = [];
    }
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    // Broadcast update
    broadcast({ type: 'challengeLoaded', challenge: data.challenge });
    
    res.json({
      success: true,
      challenge: data.challenge,
      saveInfo: {
        day: saveData.day,
        time: saveData.time,
        savedAt: saveData.savedAt
      }
    });
  } catch (error) {
    console.error('Error loading challenge:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Save file not found' });
    } else {
      res.status(500).json({ error: 'Failed to load challenge' });
    }
  }
});

// Delete save
app.delete('/api/challenge/saves/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security: prevent directory traversal
    if (filename.includes('..') || !filename.startsWith('save_') || !filename.endsWith('.txt')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filepath = path.join(SAVES_DIR, filename);
    await fs.unlink(filepath);
    
    res.json({ success: true, message: 'Save file deleted successfully' });
  } catch (error) {
    console.error('Error deleting save:', error);
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Save file not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete save file' });
    }
  }
});

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

// Read orders data
async function readOrders() {
  try {
    const content = await fs.readFile(ORDERS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Error reading orders:', error);
    return [];
  }
}

// Write orders data
async function writeOrders(orders) {
  try {
    await fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing orders:', error);
    return false;
  }
}

// Read enrollments data
async function readEnrollments() {
  try {
    const content = await fs.readFile(ENROLLMENTS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Error reading enrollments:', error);
    return [];
  }
}

// Write enrollments data
async function writeEnrollments(enrollments) {
  try {
    await fs.writeFile(ENROLLMENTS_FILE, JSON.stringify(enrollments, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing enrollments:', error);
    return false;
  }
}

// Read attendance data
async function readAttendance() {
  try {
    const content = await fs.readFile(ATTENDANCE_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Error reading attendance:', error);
    return [];
  }
}

// Write attendance data
async function writeAttendance(data) {
  try {
    await fs.writeFile(ATTENDANCE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing attendance:', error);
    return false;
  }
}

// ===== Attendance routes (moved to server/routes/attendanceRoutes.js) =====
const { registerAttendanceRoutes } = require('./server/routes/attendanceRoutes');
registerAttendanceRoutes(app, {
  authenticateUser,
  requireOrganizationAccess,
  readTimetable,
  readAttendance,
  writeAttendance
});

// Read transactions data
async function readTransactions() {
  try {
    const content = await fs.readFile(TRANSACTIONS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Error reading transactions:', error);
    return [];
  }
}

// Write transactions data
async function writeTransactions(data) {
  try {
    await fs.writeFile(TRANSACTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing transactions:', error);
    return false;
  }
}

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

// Read expenses data
async function readExpenses() {
  try {
    const content = await fs.readFile(EXPENSES_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Error reading expenses:', error);
    return [];
  }
}

// Write expenses data
async function writeExpenses(data) {
  try {
    await fs.writeFile(EXPENSES_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing expenses:', error);
    return false;
  }
}

// (moved to server/routes/organizationsBillingRoutes.js)

// (moved to server/routes/organizationsRoutes.js)

// Initialize server
async function startServer() {
  await ensureDataDir();
  await initializeDataFile();
  await loadVcpChessGameHistoryIndex();
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

  // ============================
  // V.Chess Platform (WebSocket realtime)
  // ============================
  const VCP_IDLE_MS = 3 * 60 * 1000;
  const vcp = {
    studentsByOrg: new Map(), // orgId -> Map(studentUserId -> presence)
    teachersByOrg: new Map(), // orgId -> Set(ws)
    invites: new Map(), // inviteId -> invite
    sessions: new Map(), // sessionId -> session
    watchersBySession: new Map() // sessionId -> Set(ws)
  };

  function wsSend(ws, payload) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    } catch {}
  }

  function vcpOrgStudentsMap(orgId) {
    const key = String(orgId || '');
    if (!vcp.studentsByOrg.has(key)) vcp.studentsByOrg.set(key, new Map());
    return vcp.studentsByOrg.get(key);
  }

  function vcpOrgTeachersSet(orgId) {
    const key = String(orgId || '');
    if (!vcp.teachersByOrg.has(key)) vcp.teachersByOrg.set(key, new Set());
    return vcp.teachersByOrg.get(key);
  }

  function vcpSnapshotForOrg(orgId) {
    const students = Array.from(vcpOrgStudentsMap(orgId).values()).map((p) => ({
      id: p.id,
      name: p.name,
      studentId: p.studentId || '',
      status: p.status,
      lastActivity: p.lastActivity,
      inGame: !!p.inGame
    }));
    // Stable sort: in-game, online, idle
    const order = { 'in-game': 0, online: 1, idle: 2 };
    students.sort((a, b) => {
      const oa = order[a.status] ?? 9;
      const ob = order[b.status] ?? 9;
      if (oa !== ob) return oa - ob;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return students;
  }

  function vcpBroadcastPresence(orgId) {
    const payload = { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) };
    for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, payload);
  }

  async function resolveOrgIdFromToken(decoded) {
    const orgId = decoded?.organizationId || null;
    if (orgId) return String(orgId);
    // Student tokens might not carry orgId; fallback to student record lookup.
    if (String(decoded?.role || '') === 'student') {
      const data = await readData();
      const students = Array.isArray(data?.students) ? data.students : [];
      const sid = String(decoded?.id || '');
      const s = students.find(st => String(st?.id) === sid);
      if (s?.organizationId) return String(s.organizationId);
    }
    return '';
  }

  async function resolveUserName(decoded) {
    const name = String(decoded?.name || '').trim();
    if (name) return name;
    try {
      const users = await readUsers();
      const u = users.find(x => String(x?.id) === String(decoded?.id));
      if (u?.name) return String(u.name);
    } catch {}
    return 'Unknown';
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function updateStudentPresence(orgId, student) {
    const map = vcpOrgStudentsMap(orgId);
    map.set(String(student.id), student);
    vcpBroadcastPresence(orgId);
  }

  function setStudentStatus(orgId, studentId, status, inGame = false) {
    const map = vcpOrgStudentsMap(orgId);
    const cur = map.get(String(studentId));
    if (!cur) return;
    cur.status = status;
    cur.inGame = !!inGame;
    map.set(String(studentId), cur);
  }

  // Periodic idle checker
  const vcpIdleTicker = setInterval(() => {
    const now = Date.now();
    for (const [orgId, smap] of vcp.studentsByOrg.entries()) {
      let changed = false;
      for (const st of smap.values()) {
        if (!st || st.inGame) continue;
        const last = Number(st.lastActivityTs || 0);
        const shouldIdle = last && (now - last) >= VCP_IDLE_MS;
        if (shouldIdle && st.status !== 'idle') {
          st.status = 'idle';
          st.lastActivity = nowIso();
          changed = true;
        }
        if (!shouldIdle && st.status === 'idle') {
          st.status = 'online';
          st.lastActivity = nowIso();
          changed = true;
        }
      }
      if (changed) vcpBroadcastPresence(orgId);
    }
  }, 15000);
  vcpIdleTicker.unref?.();

  // Periodic chess timeout checker (keeps clocks accurate even without moves)
  const vcpChessClockTicker = setInterval(() => {
    const now = Date.now();
    for (const session of vcp.sessions.values()) {
      if (!session || String(session.mode) !== 'chess') continue;
      if (String(session.status) !== 'active') continue;
      const st = session.chessState;
      if (!st || st.gameOver) continue;
      const turn = String(st.turn || 'w');
      const elapsed = Math.max(0, now - Number(st.turnStartTs || now));
      const wMs0 = Number(st.clocks?.wMs ?? 0);
      const bMs0 = Number(st.clocks?.bMs ?? 0);
      const wMs = turn === 'w' ? Math.max(0, wMs0 - elapsed) : wMs0;
      const bMs = turn === 'b' ? Math.max(0, bMs0 - elapsed) : bMs0;

      // keep clients in sync even if no moves are made
      if (now - Number(st._lastSyncTs || 0) >= 1000) {
        st._lastSyncTs = now;
        session.chessState = st;
        vcp.sessions.set(String(session.id), session);
        vcpBroadcastChessSync(session);
        vcpBroadcastLiveGames(String(session.orgId));
      }

      if (wMs <= 0 || bMs <= 0) {
        st.clocks.wMs = wMs;
        st.clocks.bMs = bMs;
        st.gameOver = true;
        st.gameOverReason = 'Time out';
        session.chessState = st;
        vcp.sessions.set(String(session.id), session);
        // End session + record game history
        vcpEndChessSession(String(session.orgId), session, 'Time out');
      }
    }
  }, 1000);
  vcpChessClockTicker.unref?.();

  // ----------------------------
  // Normal Chess (MVP) helpers
  // ----------------------------
  const VCP_FILES = 'abcdefgh';

  // ----------------------------
  // VCP Chess game history (persisted)
  // ----------------------------
  const vcpChessGameIdIndex = new Set(); // gameId (sessionId) -> recorded

  async function loadVcpChessGameHistoryIndex() {
    try {
      const raw = await fs.readFile(VCP_CHESS_GAMES_FILE, 'utf8');
      const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const id = String(obj?.id || '');
          if (id) vcpChessGameIdIndex.add(id);
        } catch {}
      }
    } catch {}
  }

  function vcpComputeChessResult(session) {
    const st = session?.chessState || {};
    const reason = String(st.gameOverReason || '');
    const cfg = session?.config || {};
    const whiteId = String(cfg.whiteStudentId || '');
    const blackId = String(cfg.blackStudentId || '');
    const wMs = Number(st?.clocks?.wMs ?? 0);
    const bMs = Number(st?.clocks?.bMs ?? 0);

    if (/Draw agreed/i.test(reason)) return { result: '1/2-1/2', winnerColor: null, reason };
    if (/White resigned/i.test(reason)) return { result: '0-1', winnerColor: 'b', reason };
    if (/Black resigned/i.test(reason)) return { result: '1-0', winnerColor: 'w', reason };
    if (/Time out/i.test(reason)) {
      if (wMs <= 0 && bMs <= 0) return { result: '1/2-1/2', winnerColor: null, reason };
      if (wMs <= 0) return { result: '0-1', winnerColor: 'b', reason };
      if (bMs <= 0) return { result: '1-0', winnerColor: 'w', reason };
      return { result: '1/2-1/2', winnerColor: null, reason };
    }
    if (/Player left/i.test(reason)) {
      // Unknown winner for MVP; treat as loss for leaver if available; otherwise show unknown.
      const endedBy = String(session?.endedByUserId || '');
      if (endedBy && endedBy === whiteId) return { result: '0-1', winnerColor: 'b', reason };
      if (endedBy && endedBy === blackId) return { result: '1-0', winnerColor: 'w', reason };
      return { result: '1/2-1/2', winnerColor: null, reason };
    }
    // Default fallback
    return { result: '1/2-1/2', winnerColor: null, reason: reason || 'ended' };
  }

  async function appendVcpChessGameRecord(record) {
    try {
      const id = String(record?.id || '');
      if (!id) return;
      if (vcpChessGameIdIndex.has(id)) return;
      const line = JSON.stringify(record);
      await fs.appendFile(VCP_CHESS_GAMES_FILE, `${line}\n`, 'utf8');
      vcpChessGameIdIndex.add(id);
    } catch (e) {
      console.error('Failed to append VCP chess game record:', e);
    }
  }

  function vcpBuildPgnFromSanMoves(sanMoves) {
    const m = Array.isArray(sanMoves) ? sanMoves.filter(x => String(x || '').trim()) : [];
    if (!m.length) return '';
    const parts = [];
    for (let i = 0; i < m.length; i += 2) {
      const moveNo = Math.floor(i / 2) + 1;
      const w = m[i] ? String(m[i]) : '';
      const b = m[i + 1] ? String(m[i + 1]) : '';
      parts.push(`${moveNo}. ${w}${b ? ` ${b}` : ''}`);
    }
    return parts.join(' ');
  }

  function vcpBuildTimelineBoards(session) {
    try {
      const base = vcpCreateInitialChessState(session);
      // keep a clean clock to avoid side effects
      base.clocks = { wMs: 0, bMs: 0 };
      base.turnStartTs = 0;
      const boards = [vcpCloneBoard(base.board)];
      let cur = base;
      const moves = Array.isArray(session?.chessState?.history) ? session.chessState.history : [];
      for (const mv of moves) {
        const next = vcpApplyMoveToState(cur, String(mv.from || ''), String(mv.to || ''), String(mv.promo || 'q'));
        if (!next) break;
        cur = next;
        boards.push(vcpCloneBoard(cur.board));
      }
      return boards;
    } catch {
      return null;
    }
  }

  function vcpBuildTimelineClocks(session) {
    try {
      const cfg = session?.config || {};
      const minutes = Math.max(1, Math.min(60, Number(cfg?.minutes) || 3));
      const inc = Math.max(0, Math.min(60, Number(cfg?.incrementSec) || 0));
      let wMs = minutes * 60 * 1000;
      let bMs = minutes * 60 * 1000;
      let turn = 'w';
      const out = [{ wMs, bMs, turn }];
      const moves = Array.isArray(session?.chessState?.history) ? session.chessState.history : [];
      for (const mv of moves) {
        const spent = Math.max(0, Number(mv?.spentMs ?? 0) || 0);
        if (turn === 'w') wMs = Math.max(0, wMs - spent) + inc * 1000;
        else bMs = Math.max(0, bMs - spent) + inc * 1000;
        turn = vcpOpp(turn);
        out.push({ wMs, bMs, turn });
      }
      return out;
    } catch {
      return null;
    }
  }

  async function readVcpChessGameHistory(orgId, userId) {
    try {
      const raw = await fs.readFile(VCP_CHESS_GAMES_FILE, 'utf8');
      const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      const out = [];
      const oid = String(orgId || '');
      const uid = String(userId || '');
      for (const line of lines) {
        try {
          const g = JSON.parse(line);
          if (!g) continue;
          if (String(g.orgId || '') !== oid) continue;
          if (String(g.whiteId || '') !== uid && String(g.blackId || '') !== uid) continue;
          out.push(g);
        } catch {}
      }
      // newest first
      out.sort((a, b) => Number(new Date(b.endedAt || b.startedAt || 0)) - Number(new Date(a.endedAt || a.startedAt || 0)));
      return out;
    } catch {
      return [];
    }
  }

  async function readVcpChessGameById(orgId, gameId) {
    try {
      const raw = await fs.readFile(VCP_CHESS_GAMES_FILE, 'utf8');
      const lines = String(raw || '').split('\n').map(s => s.trim()).filter(Boolean);
      const oid = String(orgId || '');
      const gid = String(gameId || '');
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const g = JSON.parse(lines[i]);
          if (String(g?.id || '') !== gid) continue;
          if (String(g?.orgId || '') !== oid) return null;
          return g;
        } catch {}
      }
      return null;
    } catch {
      return null;
    }
  }

  function vcpCoordToRc(coord) {
    const s = String(coord || '');
    const f = VCP_FILES.indexOf(s[0]);
    const rank = Number(s[1] || 0);
    if (f < 0 || rank < 1 || rank > 8) return null;
    return { r: 8 - rank, c: f };
  }

  function vcpRcToCoord(r, c) {
    return `${VCP_FILES[c]}${8 - r}`;
  }

  function vcpPieceColor(p) {
    if (!p) return null;
    return p === p.toUpperCase() ? 'w' : 'b';
  }

  function vcpOpp(c) {
    return c === 'w' ? 'b' : 'w';
  }

  function vcpInBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function vcpCloneBoard(b) {
    return b.map(row => row.slice());
  }

  function vcpInitialBoard() {
    const b = Array.from({ length: 8 }, () => Array(8).fill(''));
    const backW = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    const backB = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    b[7] = backW.slice();
    b[6] = Array(8).fill('P');
    b[0] = backB.slice();
    b[1] = Array(8).fill('p');
    return b;
  }

  function vcpFindKing(board, color) {
    const k = color === 'w' ? 'K' : 'k';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return { r, c };
    return null;
  }

  function vcpIsSquareAttacked(board, r, c, byColor) {
    // pawns
    const pawnDir = byColor === 'w' ? -1 : 1;
    const pawn = byColor === 'w' ? 'P' : 'p';
    for (const dc of [-1, 1]) {
      const rr = r + pawnDir, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === pawn) return true;
    }
    // knights
    const knight = byColor === 'w' ? 'N' : 'n';
    const kd = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of kd) {
      const rr = r + dr, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === knight) return true;
    }
    // king
    const king = byColor === 'w' ? 'K' : 'k';
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (vcpInBounds(rr, cc) && board[rr][cc] === king) return true;
    }
    // sliding
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (vcpInBounds(rr, cc)) {
        const p = board[rr][cc];
        if (p) {
          const col = vcpPieceColor(p);
          if (col === byColor) {
            const up = p.toUpperCase();
            if ((dr === 0 || dc === 0) && (up === 'R' || up === 'Q')) return true;
            if ((dr !== 0 && dc !== 0) && (up === 'B' || up === 'Q')) return true;
          }
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  }

  function vcpIsInCheck(board, color) {
    const k = vcpFindKing(board, color);
    if (!k) return false;
    return vcpIsSquareAttacked(board, k.r, k.c, vcpOpp(color));
  }

  function vcpHasAnyLegalMove(state, color) {
    const board = state?.board;
    if (!board) return false;
    // brute force (64x64 max) but only used on check situations for SAN suffix
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || vcpPieceColor(p) !== color) continue;
        const from = vcpRcToCoord(r, c);
        for (let rr = 0; rr < 8; rr++) {
          for (let cc = 0; cc < 8; cc++) {
            if (rr === r && cc === c) continue;
            const to = vcpRcToCoord(rr, cc);
            // Promotions: try all four; otherwise default 'q'
            const isPawn = p.toUpperCase() === 'P';
            const lastRank = color === 'w' ? 8 : 1;
            const toRank = Number(String(to)[1] || 0);
            const promos = (isPawn && toRank === lastRank) ? ['q', 'r', 'b', 'n'] : ['q'];
            for (const promo of promos) {
              if (vcpLegalMove(state, from, to, color, promo)) return true;
            }
          }
        }
      }
    }
    return false;
  }

  function vcpSanForMove(state, from, to, promo, moverColor) {
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return '';
    const board = state?.board;
    if (!board) return '';
    const p = board[a.r][a.c];
    if (!p) return '';
    const up = p.toUpperCase();

    // Castling
    if (up === 'K' && String(from) === (moverColor === 'w' ? 'e1' : 'e8')) {
      if (String(to) === (moverColor === 'w' ? 'g1' : 'g8')) return 'O-O';
      if (String(to) === (moverColor === 'w' ? 'c1' : 'c8')) return 'O-O-O';
    }

    const destPiece = board[z.r][z.c];
    const isPawn = up === 'P';
    const isCapture = (() => {
      if (destPiece) return true;
      // En passant capture: pawn moves diagonally onto empty square equal to ep target
      const ep = state?.ep;
      if (!ep || !isPawn) return false;
      if (String(ep) !== String(to)) return false;
      if (a.c === z.c) return false;
      return true;
    })();

    const pieceLetter = isPawn ? '' : up;

    // Disambiguation for pieces (except pawns)
    let disamb = '';
    if (!isPawn && up !== 'K') {
      const candidates = [];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (r === a.r && c === a.c) continue;
          const pp = board[r][c];
          if (!pp) continue;
          if (vcpPieceColor(pp) !== moverColor) continue;
          if (pp.toUpperCase() !== up) continue;
          const cf = vcpRcToCoord(r, c);
          if (vcpLegalMove(state, cf, to, moverColor, String(promo || 'q'))) {
            candidates.push({ r, c, coord: cf });
          }
        }
      }
      if (candidates.length) {
        const fromFile = String(from)[0];
        const fromRank = String(from)[1];
        const sameFile = candidates.some(x => String(x.coord)[0] === fromFile);
        const sameRank = candidates.some(x => String(x.coord)[1] === fromRank);
        if (!sameFile) disamb = fromFile;
        else if (!sameRank) disamb = fromRank;
        else disamb = `${fromFile}${fromRank}`;
      }
    }

    // Pawn capture includes file of origin
    const originFile = String(from)[0];
    const capturePrefix = isPawn && isCapture ? originFile : '';

    // Promotion
    const promoStr = (() => {
      const toRank = Number(String(to)[1] || 0);
      if (!isPawn) return '';
      if (moverColor === 'w' && toRank !== 8) return '';
      if (moverColor === 'b' && toRank !== 1) return '';
      const pr = String(promo || 'q').toLowerCase();
      const ok = ['q', 'r', 'b', 'n'].includes(pr) ? pr : 'q';
      return `=${ok.toUpperCase()}`;
    })();

    let san = `${pieceLetter}${disamb}${capturePrefix}${isCapture ? 'x' : ''}${String(to)}${promoStr}`;

    // Check / mate suffix
    try {
      const next = vcpApplyMoveToState(state, from, to, promo);
      const opp = vcpOpp(moverColor);
      if (next && vcpIsInCheck(next.board, opp)) {
        const hasReply = vcpHasAnyLegalMove(next, opp);
        san += hasReply ? '+' : '#';
      }
    } catch {}

    return san;
  }

  function vcpApplyMoveToBoard(board, from, to, promo) {
    const b = vcpCloneBoard(board);
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return null;
    const p = b[a.r][a.c];
    b[a.r][a.c] = '';
    let placed = p;
    if ((p === 'P' && z.r === 0) || (p === 'p' && z.r === 7)) {
      placed = vcpPieceColor(p) === 'w' ? 'Q' : 'q';
      const up = String(promo || 'q').toLowerCase();
      if (['q','r','b','n'].includes(up)) placed = vcpPieceColor(p) === 'w' ? up.toUpperCase() : up;
    }
    b[z.r][z.c] = placed;
    return b;
  }

  function vcpGenPseudoMoves(board, from, color) {
    const a = vcpCoordToRc(from);
    if (!a) return [];
    const p = board[a.r][a.c];
    if (!p || vcpPieceColor(p) !== color) return [];
    const up = p.toUpperCase();
    const moves = [];
    const add = (rr, cc) => {
      if (!vcpInBounds(rr, cc)) return;
      const t = board[rr][cc];
      if (!t) moves.push({ to: vcpRcToCoord(rr, cc) });
      else if (vcpPieceColor(t) !== color) moves.push({ to: vcpRcToCoord(rr, cc) });
    };

    if (up === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const oneR = a.r + dir;
      if (vcpInBounds(oneR, a.c) && !board[oneR][a.c]) {
        moves.push({ to: vcpRcToCoord(oneR, a.c) });
        const twoR = a.r + dir * 2;
        if (a.r === startRow && vcpInBounds(twoR, a.c) && !board[twoR][a.c]) moves.push({ to: vcpRcToCoord(twoR, a.c) });
      }
      for (const dc of [-1, 1]) {
        const rr = a.r + dir, cc = a.c + dc;
        if (!vcpInBounds(rr, cc)) continue;
        const t = board[rr][cc];
        if (t && vcpPieceColor(t) !== color) moves.push({ to: vcpRcToCoord(rr, cc) });
      }
      return moves;
    }

    if (up === 'N') {
      const d = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr, dc] of d) add(a.r + dr, a.c + dc);
      return moves;
    }

    if (up === 'K') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        add(a.r + dr, a.c + dc);
      }
      return moves;
    }

    const dirs = [];
    if (up === 'B' || up === 'Q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    if (up === 'R' || up === 'Q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
    for (const [dr, dc] of dirs) {
      let rr = a.r + dr, cc = a.c + dc;
      while (vcpInBounds(rr, cc)) {
        const t = board[rr][cc];
        if (!t) moves.push({ to: vcpRcToCoord(rr, cc) });
        else {
          if (vcpPieceColor(t) !== color) moves.push({ to: vcpRcToCoord(rr, cc) });
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return moves;
  }

  function vcpHasCastleRight(castling, right) {
    return String(castling || '').includes(right);
  }

  function vcpIsCastleMove(piece, from, to) {
    if (!piece) return false;
    if (piece.toUpperCase() !== 'K') return false;
    return (
      (from === 'e1' && (to === 'g1' || to === 'c1')) ||
      (from === 'e8' && (to === 'g8' || to === 'c8'))
    );
  }

  function vcpUpdateCastlingRights(castling, from, to, movedPiece, capturedPiece) {
    let s = String(castling || '');
    const remove = (ch) => { s = s.replace(ch, ''); };

    if (movedPiece === 'K') { remove('K'); remove('Q'); }
    if (movedPiece === 'k') { remove('k'); remove('q'); }

    if (movedPiece === 'R') {
      if (from === 'h1') remove('K');
      if (from === 'a1') remove('Q');
    }
    if (movedPiece === 'r') {
      if (from === 'h8') remove('k');
      if (from === 'a8') remove('q');
    }

    if (capturedPiece === 'R') {
      if (to === 'h1') remove('K');
      if (to === 'a1') remove('Q');
    }
    if (capturedPiece === 'r') {
      if (to === 'h8') remove('k');
      if (to === 'a8') remove('q');
    }
    return s;
  }

  function vcpApplyMoveToState(state, from, to, promo) {
    const board = state.board;
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return null;
    const piece = board[a.r][a.c];
    const captured = board[z.r][z.c] || '';

    const next = {
      ...state,
      board: vcpCloneBoard(board),
      ep: null,
      castling: String(state.castling || '')
    };

    // castling
    if (vcpIsCastleMove(piece, from, to)) {
      next.board[a.r][a.c] = '';
      next.board[z.r][z.c] = piece;
      if (to === 'g1') { next.board[7][7] = ''; next.board[7][5] = 'R'; }
      if (to === 'c1') { next.board[7][0] = ''; next.board[7][3] = 'R'; }
      if (to === 'g8') { next.board[0][7] = ''; next.board[0][5] = 'r'; }
      if (to === 'c8') { next.board[0][0] = ''; next.board[0][3] = 'r'; }
      next.castling = vcpUpdateCastlingRights(next.castling, from, to, piece, captured);
      return next;
    }

    // en passant capture
    if (piece && piece.toUpperCase() === 'P' && String(state.ep || '') === to && !captured) {
      if (piece === 'P') {
        const capR = z.r + 1;
        if (vcpInBounds(capR, z.c)) next.board[capR][z.c] = '';
      } else {
        const capR = z.r - 1;
        if (vcpInBounds(capR, z.c)) next.board[capR][z.c] = '';
      }
    }

    // normal move + promotion
    next.board[a.r][a.c] = '';
    let placed = piece;
    if ((piece === 'P' && z.r === 0) || (piece === 'p' && z.r === 7)) {
      let up = String(promo || 'q').toLowerCase();
      if (!['q', 'r', 'b', 'n'].includes(up)) up = 'q';
      placed = vcpPieceColor(piece) === 'w' ? up.toUpperCase() : up;
    }
    next.board[z.r][z.c] = placed;

    next.castling = vcpUpdateCastlingRights(next.castling, from, to, piece, captured);

    // set ep square on double pawn push
    if (piece && piece.toUpperCase() === 'P') {
      const color = vcpPieceColor(piece);
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (a.r === startRow && z.r === a.r + dir * 2) {
        const epR = a.r + dir;
        next.ep = vcpRcToCoord(epR, a.c);
      }
    }
    return next;
  }

  function vcpIsCastlePathSafe(board, color, to, castling) {
    if (vcpIsInCheck(board, color)) return false;
    if (color === 'w') {
      if (to === 'g1') {
        if (!vcpHasCastleRight(castling, 'K')) return false;
        const f1 = vcpCoordToRc('f1'), g1 = vcpCoordToRc('g1'), h1 = vcpCoordToRc('h1');
        if (!f1 || !g1 || !h1) return false;
        if (board[f1.r][f1.c] || board[g1.r][g1.c]) return false;
        if (board[h1.r][h1.c] !== 'R') return false;
        if (vcpIsSquareAttacked(board, f1.r, f1.c, 'b')) return false;
        if (vcpIsSquareAttacked(board, g1.r, g1.c, 'b')) return false;
        return true;
      }
      if (to === 'c1') {
        if (!vcpHasCastleRight(castling, 'Q')) return false;
        const d1 = vcpCoordToRc('d1'), c1 = vcpCoordToRc('c1'), b1 = vcpCoordToRc('b1'), a1 = vcpCoordToRc('a1');
        if (!d1 || !c1 || !b1 || !a1) return false;
        if (board[d1.r][d1.c] || board[c1.r][c1.c] || board[b1.r][b1.c]) return false;
        if (board[a1.r][a1.c] !== 'R') return false;
        if (vcpIsSquareAttacked(board, d1.r, d1.c, 'b')) return false;
        if (vcpIsSquareAttacked(board, c1.r, c1.c, 'b')) return false;
        return true;
      }
    } else {
      if (to === 'g8') {
        if (!vcpHasCastleRight(castling, 'k')) return false;
        const f8 = vcpCoordToRc('f8'), g8 = vcpCoordToRc('g8'), h8 = vcpCoordToRc('h8');
        if (!f8 || !g8 || !h8) return false;
        if (board[f8.r][f8.c] || board[g8.r][g8.c]) return false;
        if (board[h8.r][h8.c] !== 'r') return false;
        if (vcpIsSquareAttacked(board, f8.r, f8.c, 'w')) return false;
        if (vcpIsSquareAttacked(board, g8.r, g8.c, 'w')) return false;
        return true;
      }
      if (to === 'c8') {
        if (!vcpHasCastleRight(castling, 'q')) return false;
        const d8 = vcpCoordToRc('d8'), c8 = vcpCoordToRc('c8'), b8 = vcpCoordToRc('b8'), a8 = vcpCoordToRc('a8');
        if (!d8 || !c8 || !b8 || !a8) return false;
        if (board[d8.r][d8.c] || board[c8.r][c8.c] || board[b8.r][b8.c]) return false;
        if (board[a8.r][a8.c] !== 'r') return false;
        if (vcpIsSquareAttacked(board, d8.r, d8.c, 'w')) return false;
        if (vcpIsSquareAttacked(board, c8.r, c8.c, 'w')) return false;
        return true;
      }
    }
    return false;
  }

  function vcpLegalMove(state, from, to, color, promo) {
    const board = state.board;
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return false;
    const piece = board[a.r][a.c];
    if (!piece || vcpPieceColor(piece) !== color) return false;

    if (vcpIsCastleMove(piece, from, to)) {
      if (!vcpIsCastlePathSafe(board, color, to, state.castling)) return false;
      const next = vcpApplyMoveToState(state, from, to, promo);
      if (!next) return false;
      return !vcpIsInCheck(next.board, color);
    }

    const pseudo = vcpGenPseudoMoves(board, from, color);
    const canEP = piece.toUpperCase() === 'P' && String(state.ep || '') === String(to || '');
    if (!pseudo.some(m => m.to === to) && !canEP) return false;

    if (canEP) {
      const dir = color === 'w' ? -1 : 1;
      if (z.r !== a.r + dir) return false;
      if (Math.abs(z.c - a.c) !== 1) return false;
      if (board[z.r][z.c]) return false;
    }

    const next = vcpApplyMoveToState(state, from, to, promo);
    if (!next) return false;
    return !vcpIsInCheck(next.board, color);
  }

  function vcpCreateInitialChessState(session) {
    const minutes = Math.max(1, Math.min(60, Number(session?.config?.minutes) || 3));
    const wMs = minutes * 60 * 1000;
    const bMs = minutes * 60 * 1000;
    return {
      board: vcpInitialBoard(),
      turn: 'w',
      turnStartTs: Date.now(),
      clocks: { wMs, bMs },
      moveNumber: 1,
      castling: 'KQkq',
      ep: null,
      drawOffer: null, // { from: 'w'|'b', atTs }
      gameOver: false,
      gameOverReason: null,
      history: [] // [{ from,to,promo,by,atTs,moveNumber }]
    };
  }

  function vcpUpdateClocksForMove(state, incrementSec) {
    const now = Date.now();
    const turn = String(state.turn || 'w');
    const elapsed = Math.max(0, now - Number(state.turnStartTs || now));
    if (turn === 'w') state.clocks.wMs = Math.max(0, Number(state.clocks.wMs || 0) - elapsed);
    else state.clocks.bMs = Math.max(0, Number(state.clocks.bMs || 0) - elapsed);
    // add increment to the mover after move
    if (turn === 'w') state.clocks.wMs += incrementSec * 1000;
    else state.clocks.bMs += incrementSec * 1000;
    state.turnStartTs = now;
  }

  function vcpApplyChessMove(session, moverId, { from, to, promo }) {
    const cfg = session.config || {};
    const whiteId = String(cfg.whiteStudentId || '');
    const blackId = String(cfg.blackStudentId || '');
    const moverColor = String(moverId) === whiteId ? 'w' : String(moverId) === blackId ? 'b' : null;
    if (!moverColor) return { ok: false, error: 'Not a player' };

    const st = session.chessState;
    if (!st || st.gameOver) return { ok: false, error: 'Game not active' };
    if (String(st.turn || 'w') !== moverColor) return { ok: false, error: 'Not your turn' };

    // Time spent on this move (A: per-move thinking time)
    const nowTs = Date.now();
    const spentMs = Math.max(0, nowTs - Number(st.turnStartTs || nowTs));

    const board = st.board;
    const a = vcpCoordToRc(from);
    const z = vcpCoordToRc(to);
    if (!a || !z) return { ok: false, error: 'Invalid coordinates' };
    const piece = board[a.r][a.c];
    if (!piece || vcpPieceColor(piece) !== moverColor) return { ok: false, error: 'Invalid piece' };

    if (!vcpLegalMove(st, from, to, moverColor, promo)) return { ok: false, error: 'Illegal move' };

    // SAN (PGN) record based on current state before applying move
    const san = vcpSanForMove(st, from, to, promo, moverColor);

    const inc = Math.max(0, Math.min(60, Number(cfg.incrementSec) || 0));
    // clock update for mover (uses current turn)
    vcpUpdateClocksForMove(st, inc);

    // apply move (incl castling / en passant / promotion / ep / castling rights)
    const next = vcpApplyMoveToState(st, from, to, promo);
    if (!next) return { ok: false, error: 'Illegal move' };
    st.board = next.board;
    st.castling = next.castling;
    st.ep = next.ep;
    st.drawOffer = null; // clear any outstanding draw offer on move
    if (!Array.isArray(st.history)) st.history = [];
    st.history.push({
      from: String(from),
      to: String(to),
      promo: String(promo || 'q').toLowerCase(),
      san: String(san || ''),
      spentMs,
      by: String(moverId),
      atTs: Date.now(),
      moveNumber: Number(st.moveNumber || 1)
    });
    st.turn = vcpOpp(String(st.turn || 'w'));
    st.moveNumber = Number(st.moveNumber || 1) + 1;

    // timeout check (if mover used all time before moving)
    if (Number(st.clocks.wMs || 0) <= 0 || Number(st.clocks.bMs || 0) <= 0) {
      st.gameOver = true;
      st.gameOverReason = 'Time out';
    }

    // Checkmate / stalemate detection (server-authoritative)
    if (!st.gameOver) {
      const sideToMove = String(st.turn || 'w');
      const hasMove = vcpHasAnyLegalMove(st, sideToMove);
      if (!hasMove) {
        const inCheck = vcpIsInCheck(st.board, sideToMove);
        st.gameOver = true;
        st.gameOverReason = inCheck ? 'Checkmate' : 'Stalemate';
      }
    }

    session.chessState = st;
    vcp.sessions.set(String(session.id), session);
    return { ok: true };
  }

  function vcpBroadcastChessSync(session) {
    const payload = { type: 'vcp_chess_sync', sessionId: String(session.id), state: session.chessState };
    // teacher who created session
    for (const tws of vcpOrgTeachersSet(String(session.orgId))) {
      if (tws?.vcp?.kind === 'teacher' && String(tws.vcp.userId) === String(session.teacherId)) wsSend(tws, payload);
    }
    // students
    const smap = vcpOrgStudentsMap(String(session.orgId));
    for (const sid of session.studentIds || []) {
      const pres = smap.get(String(sid));
      if (!pres) continue;
      for (const sWs of pres.connections) wsSend(sWs, payload);
    }

    // spectators (watchers)
    try {
      const set = vcp.watchersBySession.get(String(session.id));
      if (set && set.size) {
        for (const w of Array.from(set)) wsSend(w, payload);
      }
    } catch {}
  }

  // Live games (org-wide spectator snapshots)
  function vcpLiveGamesSnapshotForOrg(orgId) {
    const out = [];
    const smap = vcpOrgStudentsMap(String(orgId));
    for (const s of vcp.sessions.values()) {
      if (!s || String(s.orgId) !== String(orgId)) continue;
      if (String(s.mode) !== 'chess') continue;
      if (String(s.status) !== 'active') continue;
      const st = s.chessState;
      if (!st) continue;
      const cfg = s.config || {};
      const whiteId = String(cfg.whiteStudentId || '');
      const blackId = String(cfg.blackStudentId || '');
      const wp = smap.get(whiteId);
      const bp = smap.get(blackId);
      out.push({
        sessionId: String(s.id),
        teacherId: String(s.teacherId || ''),
        teacherName: String(s.teacherName || ''),
        whiteId,
        blackId,
        whiteName: wp ? String(wp.name || 'White') : (String(s.whiteName || '') || (whiteId === String(s.teacherId || '') ? String(s.teacherName || 'Teacher') : 'White')),
        blackName: bp ? String(bp.name || 'Black') : (String(s.blackName || '') || (blackId === String(s.teacherId || '') ? String(s.teacherName || 'Teacher') : 'Black')),
        whiteStudentId: wp ? String(wp.studentId || '') : '',
        blackStudentId: bp ? String(bp.studentId || '') : '',
        config: { minutes: Number(cfg.minutes || 3), incrementSec: Number(cfg.incrementSec || 0) },
        state: {
          board: st.board,
          turn: st.turn,
          turnStartTs: st.turnStartTs,
          clocks: st.clocks,
          castling: st.castling,
          ep: st.ep,
          drawOffer: st.drawOffer,
          moveNumber: st.moveNumber,
          gameOver: st.gameOver,
          gameOverReason: st.gameOverReason
        }
      });
    }
    return out;
  }

  function vcpBroadcastLiveGames(orgId) {
    const payload = { type: 'vcp_live_games_snapshot', games: vcpLiveGamesSnapshotForOrg(orgId) };
    // teachers
    for (const tws of vcpOrgTeachersSet(String(orgId))) wsSend(tws, payload);
    // students
    const smap = vcpOrgStudentsMap(String(orgId));
    for (const pres of smap.values()) {
      if (!pres?.connections) continue;
      for (const sWs of pres.connections) wsSend(sWs, payload);
    }
  }

  function vcpEndChessSession(orgId, session, reason) {
    try {
      session.status = 'ended';
      if (session.chessState && !session.chessState.gameOver) {
        session.chessState.gameOver = true;
        session.chessState.gameOverReason = String(reason || 'ended');
      }
      vcp.sessions.set(String(session.id), session);
    } catch {}

    // Persist game record (append-only)
    try {
      const st = session?.chessState || {};
      const cfg = session?.config || {};
      const resultInfo = vcpComputeChessResult(session);
      const sanMoves = Array.isArray(st.history) ? st.history.map(m => String(m?.san || '').trim()).filter(Boolean) : [];
      const pgn = vcpBuildPgnFromSanMoves(sanMoves);
      const timelineBoards = vcpBuildTimelineBoards(session) || null;
      const timelineClocks = vcpBuildTimelineClocks(session) || null;
      const record = {
        id: String(session.id || ''),
        orgId: String(orgId || ''),
        mode: 'chess',
        startedAt: String(session?.startedAt || session?.createdAt || ''),
        endedAt: new Date().toISOString(),
        teacherId: String(session.teacherId || ''),
        teacherName: String(session.teacherName || ''),
        whiteId: String(cfg.whiteStudentId || ''),
        blackId: String(cfg.blackStudentId || ''),
        whiteName: String(session.whiteName || ''),
        blackName: String(session.blackName || ''),
        whiteStudentId: String(session.whiteStudentId || ''),
        blackStudentId: String(session.blackStudentId || ''),
        config: { minutes: Number(cfg.minutes || 3), incrementSec: Number(cfg.incrementSec || 0) },
        result: String(resultInfo.result || '1/2-1/2'),
        resultReason: String(resultInfo.reason || st.gameOverReason || ''),
        endedByUserId: String(session.endedByUserId || ''),
        sanMoves,
        pgn,
        timelineBoards,
        timelineClocks,
        state: {
          board: st.board,
          clocks: st.clocks,
          turn: st.turn,
          moveNumber: st.moveNumber,
          castling: st.castling,
          ep: st.ep,
          gameOver: !!st.gameOver,
          gameOverReason: st.gameOverReason
        },
        moves: Array.isArray(st.history) ? st.history : []
      };
      // Fill missing names from presence snapshot if available
      const smap = vcpOrgStudentsMap(orgId);
      const wp = smap.get(String(cfg.whiteStudentId || ''));
      const bp = smap.get(String(cfg.blackStudentId || ''));
      if (!record.whiteName) record.whiteName = wp ? String(wp.name || 'White') : 'White';
      if (!record.blackName) record.blackName = bp ? String(bp.name || 'Black') : 'Black';
      if (!record.whiteStudentId) record.whiteStudentId = wp ? String(wp.studentId || '') : '';
      if (!record.blackStudentId) record.blackStudentId = bp ? String(bp.studentId || '') : '';
      appendVcpChessGameRecord(record);
    } catch {}

    // Mark players back online
    for (const sid of session.studentIds || []) {
      setStudentStatus(orgId, String(sid), 'online', false);
      const smap = vcpOrgStudentsMap(orgId);
      const pres = smap.get(String(sid));
      if (pres) {
        pres.lastActivityTs = Date.now();
        pres.lastActivity = nowIso();
        smap.set(String(sid), pres);
      }
    }
    vcpBroadcastPresence(orgId);
    vcpBroadcastChessSync(session);
    vcpBroadcastLiveGames(orgId);
  }

  wss.on('connection', (ws) => {
    ws.vcp = null; // { kind, orgId, userId, name }

    ws.on('message', async (raw) => {
      let msg = null;
      try {
        msg = JSON.parse(String(raw || ''));
      } catch {
        return;
      }
      const type = String(msg?.type || '');

      if (type === 'vcp_hello') {
        const token = String(msg?.token || '');
        const decoded = verifyToken(token);
        if (!decoded) {
          wsSend(ws, { type: 'vcp_error', error: 'Unauthorized' });
          return;
        }
        const role = String(decoded?.role || '');
        const kind = role === 'teacher' ? 'teacher' : role === 'student' ? 'student' : '';
        if (!kind) {
          wsSend(ws, { type: 'vcp_error', error: 'Role not supported', role });
          return;
        }

        const orgId = await resolveOrgIdFromToken(decoded);
        if (!orgId) {
          wsSend(ws, { type: 'vcp_error', error: 'Organization not found' });
          return;
        }

        const name = await resolveUserName(decoded);
        ws.vcp = { kind, orgId, userId: String(decoded?.id || ''), name, role };

        if (kind === 'teacher') {
          vcpOrgTeachersSet(orgId).add(ws);
          wsSend(ws, { type: 'vcp_ready', kind, orgId, name, userId: String(decoded?.id || '') });
          wsSend(ws, { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) });
        } else {
          // Student presence
          const studentId = String(decoded?.id || '');
          const studentPublicId = String(decoded?.studentId || '');
          const map = vcpOrgStudentsMap(orgId);
          const existing = map.get(studentId);
          const presence = existing || {
            id: studentId,
            name,
            studentId: studentPublicId,
            status: 'online',
            inGame: false,
            lastActivity: nowIso(),
            lastActivityTs: Date.now(),
            connections: new Set()
          };
          presence.name = name;
          presence.studentId = presence.studentId || studentPublicId;
          // If the student is already in an active session, keep them in-game after refresh/reconnect.
          const inActiveSession = Array.from(vcp.sessions.values()).some((s) => {
            return s && String(s.orgId) === String(orgId) && String(s.mode) === 'chess' && String(s.status) === 'active'
              && Array.isArray(s.studentIds) && s.studentIds.includes(String(studentId));
          });
          presence.inGame = !!inActiveSession;
          presence.status = inActiveSession ? 'in-game' : 'online';
          presence.lastActivity = nowIso();
          presence.lastActivityTs = Date.now();
          presence.connections.add(ws);
          map.set(studentId, presence);
          wsSend(ws, { type: 'vcp_ready', kind, orgId, name, status: presence.status, userId: studentId, studentId: studentPublicId });
          vcpBroadcastPresence(orgId);
        }
        return;
      }

      // Require hello first
      if (!ws.vcp) {
        wsSend(ws, { type: 'vcp_error', error: 'Not initialized' });
        return;
      }

      const { kind, orgId, userId, name } = ws.vcp;

      if (type === 'vcp_activity') {
        if (kind !== 'student') return;
        const map = vcpOrgStudentsMap(orgId);
        const p = map.get(String(userId));
        if (!p) return;
        p.lastActivityTs = Date.now();
        p.lastActivity = nowIso();
        if (!p.inGame && p.status !== 'online') p.status = 'online';
        map.set(String(userId), p);
        // Throttle: do not broadcast every activity; only if status changed
        if (String(msg?.statusChanged) === 'true') vcpBroadcastPresence(orgId);
        return;
      }

      if (type === 'vcp_ping') {
        // App-level heartbeat to keep connections alive behind proxies.
        if (kind === 'student') {
          const map = vcpOrgStudentsMap(orgId);
          const p = map.get(String(userId));
          if (p) {
            p.lastActivityTs = Date.now();
            p.lastActivity = nowIso();
            if (!p.inGame && p.status !== 'online') p.status = 'online';
            map.set(String(userId), p);
          }
        }
        wsSend(ws, { type: 'vcp_pong', ts: Date.now() });
        return;
      }

      if (type === 'vcp_get_presence') {
        // Allow both teacher and student to refresh presence snapshot.
        wsSend(ws, { type: 'vcp_presence_snapshot', students: vcpSnapshotForOrg(orgId) });
        return;
      }

      if (type === 'vcp_get_live_games') {
        wsSend(ws, { type: 'vcp_live_games_snapshot', games: vcpLiveGamesSnapshotForOrg(orgId) });
        return;
      }

      if (type === 'vcp_get_session') {
        const sessionId = String(msg?.sessionId || '');
        if (!sessionId) {
          wsSend(ws, { type: 'vcp_error', error: 'sessionId is required' });
          return;
        }
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) {
          wsSend(ws, { type: 'vcp_error', error: 'Session not found' });
          return;
        }
        // Send the full session snapshot (for spectator viewer)
        wsSend(ws, { type: 'vcp_session_snapshot', sessionId, session });
        return;
      }

      if (type === 'vcp_watch_session') {
        const sessionId = String(msg?.sessionId || '');
        if (!sessionId) return;
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (!ws.vcpWatched) ws.vcpWatched = new Set();
        ws.vcpWatched.add(sessionId);
        if (!vcp.watchersBySession.has(sessionId)) vcp.watchersBySession.set(sessionId, new Set());
        vcp.watchersBySession.get(sessionId).add(ws);
        return;
      }

      if (type === 'vcp_unwatch_session') {
        const sessionId = String(msg?.sessionId || '');
        if (!sessionId) return;
        try { ws.vcpWatched?.delete?.(sessionId); } catch {}
        try { vcp.watchersBySession.get(sessionId)?.delete?.(ws); } catch {}
        return;
      }

      if (type === 'vcp_get_game_history') {
        const targetUserId = String(msg?.targetUserId || '');
        const pageRaw = Number(msg?.page || 1);
        const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
        const pageSize = 10;
        if (!targetUserId) {
          wsSend(ws, { type: 'vcp_error', error: 'targetUserId is required' });
          return;
        }
        const all = await readVcpChessGameHistory(orgId, targetUserId);
        const totalItems = all.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const cur = Math.min(page, totalPages);
        const start = (cur - 1) * pageSize;
        const games = all.slice(start, start + pageSize).map((g) => ({
          id: String(g.id || ''),
          endedAt: String(g.endedAt || ''),
          startedAt: String(g.startedAt || ''),
          whiteId: String(g.whiteId || ''),
          blackId: String(g.blackId || ''),
          whiteName: String(g.whiteName || 'White'),
          blackName: String(g.blackName || 'Black'),
          whiteStudentId: String(g.whiteStudentId || ''),
          blackStudentId: String(g.blackStudentId || ''),
          result: String(g.result || '1/2-1/2'),
          resultReason: String(g.resultReason || '')
        }));
        wsSend(ws, {
          type: 'vcp_game_history',
          targetUserId,
          page: cur,
          pageSize,
          totalItems,
          totalPages,
          games
        });
        return;
      }

      if (type === 'vcp_get_game_record') {
        const gameId = String(msg?.gameId || '');
        if (!gameId) {
          wsSend(ws, { type: 'vcp_error', error: 'gameId is required' });
          return;
        }
        const g = await readVcpChessGameById(orgId, gameId);
        if (!g) {
          wsSend(ws, { type: 'vcp_error', error: 'Game not found' });
          return;
        }
        wsSend(ws, { type: 'vcp_game_record', game: g });
        return;
      }

      if (type === 'vcp_invite_create') {
        if (kind !== 'teacher') return;
        const mode = String(msg?.mode || '');
        const studentIds = Array.isArray(msg?.studentIds) ? msg.studentIds.map(x => String(x)) : [];
        const config = msg?.config || {};

        if (mode !== 'chess') {
          wsSend(ws, { type: 'vcp_error', error: 'Only Normal Chess is supported for now' });
          return;
        }
        if (studentIds.length !== 2) {
          wsSend(ws, { type: 'vcp_error', error: 'Normal Chess requires exactly 2 students' });
          return;
        }

        const smap = vcpOrgStudentsMap(orgId);
        const p1 = smap.get(studentIds[0]);
        const p2 = smap.get(studentIds[1]);
        if (!p1 || !p2) {
          wsSend(ws, { type: 'vcp_error', error: 'One or more students are not online' });
          return;
        }
        if (p1.inGame || p2.inGame) {
          wsSend(ws, { type: 'vcp_error', error: 'One or more students are already in-game' });
          return;
        }

        const minutes = Math.max(1, Math.min(60, Number(config?.minutes) || 3));
        const incrementSec = Math.max(0, Math.min(60, Number(config?.incrementSec) || 2));
        const whiteStudentId = String(config?.whiteStudentId || studentIds[0]);
        const blackStudentId = String(config?.blackStudentId || studentIds[1]);
        if (![studentIds[0], studentIds[1]].includes(whiteStudentId) || ![studentIds[0], studentIds[1]].includes(blackStudentId) || whiteStudentId === blackStudentId) {
          wsSend(ws, { type: 'vcp_error', error: 'Invalid color assignment' });
          return;
        }

        const inviteId = `vcp_inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const invite = {
          id: inviteId,
          orgId,
          teacher: { id: String(userId), name: String(name || 'Teacher') },
          mode: 'chess',
          studentIds: [studentIds[0], studentIds[1]],
          config: { minutes, incrementSec, whiteStudentId, blackStudentId },
          createdAt: nowIso(),
          status: 'pending',
          responses: {}
        };
        vcp.invites.set(inviteId, invite);

        // Send invite to students
        const payload = { type: 'vcp_invite', invite };
        for (const sid of invite.studentIds) {
          const pres = smap.get(String(sid));
          if (!pres) continue;
          for (const sWs of pres.connections) wsSend(sWs, payload);
        }
        wsSend(ws, { type: 'vcp_invite_sent', inviteId });
        return;
      }

      // Teacher vs Student match (teacher plays as a player; only 1 student needs to accept)
      if (type === 'vcp_invite_teacher_match') {
        if (kind !== 'teacher') return;
        const mode = String(msg?.mode || '');
        const studentId = String(msg?.studentId || '');
        const config = msg?.config || {};

        if (mode !== 'chess') {
          wsSend(ws, { type: 'vcp_error', error: 'Only Normal Chess is supported for now' });
          return;
        }
        if (!studentId) {
          wsSend(ws, { type: 'vcp_error', error: 'studentId is required' });
          return;
        }

        const smap = vcpOrgStudentsMap(orgId);
        const p1 = smap.get(studentId);
        if (!p1) {
          wsSend(ws, { type: 'vcp_error', error: 'Student is not online' });
          return;
        }
        if (p1.inGame) {
          wsSend(ws, { type: 'vcp_error', error: 'Student is already in-game' });
          return;
        }

        const minutes = Math.max(1, Math.min(60, Number(config?.minutes) || 3));
        const incrementSec = Math.max(0, Math.min(60, Number(config?.incrementSec) || 2));
        const teacherId = String(userId || '');
        const whiteStudentId = String(config?.whiteStudentId || teacherId);
        const blackStudentId = String(config?.blackStudentId || studentId);
        const ids = [teacherId, studentId];
        if (!ids.includes(whiteStudentId) || !ids.includes(blackStudentId) || whiteStudentId === blackStudentId) {
          wsSend(ws, { type: 'vcp_error', error: 'Invalid color assignment' });
          return;
        }

        const inviteId = `vcp_inv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const invite = {
          id: inviteId,
          orgId,
          teacher: { id: teacherId, name: String(name || 'Teacher') },
          mode: 'chess',
          studentIds: [studentId],
          config: { minutes, incrementSec, whiteStudentId, blackStudentId },
          createdAt: nowIso(),
          status: 'pending',
          responses: {}
        };
        vcp.invites.set(inviteId, invite);

        const payload = { type: 'vcp_invite', invite };
        for (const sWs of p1.connections || []) wsSend(sWs, payload);
        wsSend(ws, { type: 'vcp_invite_sent', inviteId });
        return;
      }

      if (type === 'vcp_invite_respond') {
        if (kind !== 'student') return;
        const inviteId = String(msg?.inviteId || '');
        const response = String(msg?.response || '');
        const invite = vcp.invites.get(inviteId);
        if (!invite || String(invite.orgId) !== String(orgId)) return;
        if (!invite.studentIds.includes(String(userId))) return;
        if (!['accept', 'decline'].includes(response)) return;

        invite.responses[String(userId)] = response;
        // Notify teachers in org (simple broadcast)
        for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, { type: 'vcp_invite_update', inviteId, studentId: String(userId), response });

        if (response === 'decline') {
          invite.status = 'declined';
          vcp.invites.set(inviteId, invite);
          return;
        }

        // If accepted -> start session (2-student or teacher-vs-student)
        const r1 = invite.responses[invite.studentIds[0]];
        const r2 = invite.studentIds.length > 1 ? invite.responses[invite.studentIds[1]] : null;
        const allAccepted = invite.studentIds.length === 1
          ? (r1 === 'accept')
          : (r1 === 'accept' && r2 === 'accept');

        if (allAccepted) {
          invite.status = 'accepted';
          vcp.invites.set(inviteId, invite);

          const sessionId = `vcp_sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const startedAt = nowIso();
          const smap2 = vcpOrgStudentsMap(orgId);
          const whiteId = String(invite.config?.whiteStudentId || invite.studentIds[0]);
          const blackId = String(invite.config?.blackStudentId || (invite.studentIds[1] || invite.teacher?.id || ''));
          const wp = smap2.get(whiteId);
          const bp = smap2.get(blackId);
          const session = {
            id: sessionId,
            orgId,
            teacherId: invite.teacher.id,
            teacherName: String(invite.teacher?.name || ''),
            mode: invite.mode,
            studentIds: invite.studentIds.slice(),
            config: invite.config,
            chessState: null,
            createdAt: startedAt,
            startedAt,
            whiteName: wp ? String(wp.name || 'White') : (whiteId === String(invite.teacher?.id || '') ? String(invite.teacher?.name || 'Teacher') : 'White'),
            blackName: bp ? String(bp.name || 'Black') : (blackId === String(invite.teacher?.id || '') ? String(invite.teacher?.name || 'Teacher') : 'Black'),
            whiteStudentId: wp ? String(wp.studentId || '') : '',
            blackStudentId: bp ? String(bp.studentId || '') : '',
            status: 'active'
          };
          if (String(session.mode) === 'chess') session.chessState = vcpCreateInitialChessState(session);
          vcp.sessions.set(sessionId, session);

          // Mark students in-game
          for (const sid of session.studentIds) {
            setStudentStatus(orgId, sid, 'in-game', true);
          }
          vcpBroadcastPresence(orgId);

          const startPayload = { type: 'vcp_session_start', session };
          // Notify teacher sockets
          for (const tws of vcpOrgTeachersSet(orgId)) {
            if (tws?.vcp?.kind === 'teacher' && String(tws.vcp.userId) === String(session.teacherId)) wsSend(tws, startPayload);
          }
          // Notify students
          const smap = vcpOrgStudentsMap(orgId);
          for (const sid of session.studentIds) {
            const pres = smap.get(String(sid));
            if (!pres) continue;
            for (const sWs of pres.connections) wsSend(sWs, startPayload);
          }

          // Broadcast live games snapshot
          vcpBroadcastLiveGames(orgId);
        }
        return;
      }

      if (type === 'vcp_leave_session') {
        const sessionId = String(msg?.sessionId || '');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (kind === 'student') {
          // End session if any player leaves (MVP)
          session.endedByUserId = String(userId);
          vcpEndChessSession(orgId, session, 'Player left');

          // Notify teacher that student left
          for (const tws of vcpOrgTeachersSet(orgId)) wsSend(tws, { type: 'vcp_session_update', sessionId, studentId: String(userId), action: 'left' });
        }
        return;
      }

      // Normal Chess: server-authoritative state
      if (type === 'vcp_chess_move') {
        const sessionId = String(msg?.sessionId || '');
        const from = String(msg?.from || '');
        const to = String(msg?.to || '');
        const promo = String(msg?.promo || 'q');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;

        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;

        // Only participants can move:
        // - students must be in session.studentIds
        // - teachers can only move if they are one of the two players (teacher vs student match)
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }

        // Ensure chess state exists
        if (!session.chessState) {
          session.chessState = vcpCreateInitialChessState(session);
          vcp.sessions.set(sessionId, session);
        }
        const result = vcpApplyChessMove(session, String(userId), { from, to, promo });
        if (!result?.ok) {
          wsSend(ws, { type: 'vcp_error', error: String(result?.error || 'Illegal move') });
          return;
        }

        if (session.chessState?.gameOver) {
          vcpEndChessSession(orgId, session, String(session.chessState.gameOverReason || 'ended'));
          return;
        }

        vcpBroadcastChessSync(session);
        vcpBroadcastLiveGames(orgId);
        return;
      }

      if (type === 'vcp_chess_offer_draw') {
        const sessionId = String(msg?.sessionId || '');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;
        if (String(session.status) !== 'active') return;
        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }
        if (!session.chessState || session.chessState.gameOver) return;

        const moverColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
        if (!moverColor) return;

        session.chessState.drawOffer = { from: moverColor, atTs: Date.now() };
        vcp.sessions.set(String(session.id), session);
        vcpBroadcastChessSync(session);
        vcpBroadcastLiveGames(orgId);
        return;
      }

      if (type === 'vcp_chess_draw_response') {
        const sessionId = String(msg?.sessionId || '');
        const accept = String(msg?.accept || '') === 'true';
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;
        if (String(session.status) !== 'active') return;
        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }
        if (!session.chessState || session.chessState.gameOver) return;

        const myColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
        if (!myColor) return;

        const offer = session.chessState.drawOffer;
        if (!offer || !offer.from) return;
        if (String(offer.from) === String(myColor)) return; // cannot respond to own offer

        if (accept) {
          session.chessState.drawOffer = null;
          vcpEndChessSession(orgId, session, 'Draw agreed');
        } else {
          session.chessState.drawOffer = null;
          vcp.sessions.set(String(session.id), session);
          vcpBroadcastChessSync(session);
          vcpBroadcastLiveGames(orgId);
        }
        return;
      }

      if (type === 'vcp_chess_resign') {
        const sessionId = String(msg?.sessionId || '');
        const session = vcp.sessions.get(sessionId);
        if (!session || String(session.orgId) !== String(orgId)) return;
        if (String(session.mode) !== 'chess') return;
        if (String(session.status) !== 'active') return;
        const cfg = session.config || {};
        const whitePlayerId = String(cfg.whiteStudentId || '');
        const blackPlayerId = String(cfg.blackStudentId || '');
        const isPlayer = String(userId) === whitePlayerId || String(userId) === blackPlayerId;
        if (kind === 'student') {
          if (!Array.isArray(session.studentIds) || !session.studentIds.includes(String(userId))) return;
        } else if (kind === 'teacher') {
          if (!isPlayer) return;
        } else {
          return;
        }
        if (!session.chessState || session.chessState.gameOver) return;

        const myColor = String(userId) === String(cfg.whiteStudentId || '') ? 'w' : String(userId) === String(cfg.blackStudentId || '') ? 'b' : null;
        if (!myColor) return;

        vcpEndChessSession(orgId, session, `${myColor === 'w' ? 'White' : 'Black'} resigned`);
        return;
      }
    });

    ws.on('close', () => {
      if (!ws.vcp) return;
      const { kind, orgId, userId } = ws.vcp;
      // Cleanup any spectator watches
      try {
        if (ws.vcpWatched && ws.vcpWatched.size) {
          for (const sessionId of Array.from(ws.vcpWatched)) {
            try { vcp.watchersBySession.get(String(sessionId))?.delete?.(ws); } catch {}
          }
        }
      } catch {}
      if (kind === 'teacher') {
        try { vcpOrgTeachersSet(orgId).delete(ws); } catch {}
        return;
      }
      if (kind === 'student') {
        const smap = vcpOrgStudentsMap(orgId);
        const p = smap.get(String(userId));
        if (p && p.connections) {
          try { p.connections.delete(ws); } catch {}
          if (p.connections.size <= 0) {
            smap.delete(String(userId));
            vcpBroadcastPresence(orgId);
          } else {
            smap.set(String(userId), p);
          }
        }
      }
    });
  });

  // IMPORTANT for containers/PaaS (Railway, Render, Fly, etc.):
  // - bind to 0.0.0.0 so the platform can route traffic into the container
  // - still respect PORT provided by the platform
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
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
