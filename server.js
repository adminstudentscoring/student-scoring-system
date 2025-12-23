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

const app = express();

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
const BLUNDERS_PUZZLES_FILE = path.join(__dirname, process.env.BLUNDERS_PUZZLES_FILE || path.join(DATA_DIR, 'blunders-puzzles.json'));
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

// Redirect root domain to www subdomain
// This handles the DNS limitation where @ (root domain) cannot have CNAME due to MX record conflict
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
    const protocol = req.protocol || (req.secure ? 'https' : 'http') || 'https';
    const path = req.originalUrl || req.url;
    const redirectUrl = `${protocol}://www.studentscoring.com${path}`;
    
    // Use 301 permanent redirect for SEO
    return res.redirect(301, redirectUrl);
  }
  
  next();
});

app.use(express.static('public'));
// Serve game directory (all game-related files)
app.use('/game', express.static('game'));
// Serve standalone project puzzle-monster-fight (now in game directory)
app.use('/game/puzzle-monster-fight', express.static('game/puzzle-monster-fight'));
// Serve standalone project monster-fight (now in game directory)
app.use('/game/monster-fight', express.static('game/monster-fight'));

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

// Read Chess.com settings (org-scoped)
async function readChessComSettings() {
  try {
    const content = await fs.readFile(CHESSCOM_SETTINGS_FILE, 'utf8');
    const data = JSON.parse(content);
    const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
    return orgs && typeof orgs === 'object' ? orgs : {};
  } catch (error) {
    console.error('Error reading chesscom settings:', error);
    return {};
  }
}

async function writeChessComSettings(orgs) {
  try {
    const clean = orgs && typeof orgs === 'object' ? orgs : {};
    await fs.writeFile(CHESSCOM_SETTINGS_FILE, JSON.stringify({ orgs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing chesscom settings:', error);
    return false;
  }
}

// ===== Blunders: Puzzle storage (JSON file) =====
async function readBlundersPuzzles() {
  try {
    const content = await fs.readFile(BLUNDERS_PUZZLES_FILE, 'utf8');
    const data = JSON.parse(content);
    const puzzles = data && typeof data === 'object' ? (data.puzzles || []) : [];
    return Array.isArray(puzzles) ? puzzles : [];
  } catch (error) {
    console.error('Error reading blunders puzzles:', error);
    return [];
  }
}

async function writeBlundersPuzzles(puzzles) {
  try {
    const arr = Array.isArray(puzzles) ? puzzles : [];
    await fs.writeFile(BLUNDERS_PUZZLES_FILE, JSON.stringify({ puzzles: arr, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing blunders puzzles:', error);
    return false;
  }
}

function parseUciMove(uci) {
  const s = String(uci || '').trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return null;
  const from = s.slice(0, 2);
  const to = s.slice(2, 4);
  const promotion = s.length === 5 ? s[4] : undefined;
  return { from, to, promotion, uci: s };
}

function scoreToCp(score) {
  if (!score) return 0;
  if (typeof score.mate === 'number' && Number.isFinite(score.mate)) {
    const sign = score.mate === 0 ? 0 : (score.mate > 0 ? 1 : -1);
    return sign * 100000; // treat mate as huge advantage
  }
  if (typeof score.cp === 'number' && Number.isFinite(score.cp)) return score.cp;
  return 0;
}

// ===== Blunders: Chess.com sync (rapid/blitz) =====
const BLUNDERS_ALLOWED_TIME_CLASSES = new Set(['rapid', 'blitz']);
const BLUNDERS_MAX_GAMES_PER_DAY = 10;
const BLUNDERS_DROP_POINTS = 1.0; // > 1.0 is blunder
const blundersLastStudentSync = new Map(); // studentId -> ms
const blundersStudentLocks = new Map(); // studentId -> Promise

async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'student-scoring-system/1.0' } });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  } finally {
    clearTimeout(t);
  }
}

function utcDayKeyFromEpochSec(sec) {
  const d = new Date(Number(sec || 0) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function todayUtcKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

async function chessComGetTodayGames(username) {
  const u = String(username || '').trim();
  if (!u) return [];
  const archivesUrl = `https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`;
  const a = await fetchJsonWithTimeout(archivesUrl, 15000);
  const archives = Array.isArray(a.data?.archives) ? a.data.archives : [];
  if (!archives.length) return [];
  const lastArchiveUrl = String(archives[archives.length - 1] || '');
  if (!lastArchiveUrl) return [];
  const g = await fetchJsonWithTimeout(lastArchiveUrl, 20000);
  const games = Array.isArray(g.data?.games) ? g.data.games : [];
  const todayKey = todayUtcKey();
  const filtered = games
    .filter((x) => x && BLUNDERS_ALLOWED_TIME_CLASSES.has(String(x.time_class || '').toLowerCase()))
    .filter((x) => utcDayKeyFromEpochSec(x.end_time) === todayKey)
    .filter((x) => {
      const w = String(x?.white?.username || '').toLowerCase();
      const b = String(x?.black?.username || '').toLowerCase();
      const me = u.toLowerCase();
      return w === me || b === me;
    })
    .sort((a, b) => Number(b.end_time || 0) - Number(a.end_time || 0))
    .slice(0, BLUNDERS_MAX_GAMES_PER_DAY);
  return filtered;
}

async function syncBlundersForStudent(student) {
  const sid = String(student?.id || '');
  if (!sid) return { ok: false, reason: 'missing student id' };

  // Throttle: at most once per hour per student (for GET auto-refresh)
  const now = Date.now();
  const last = blundersLastStudentSync.get(sid) || 0;
  if (now - last < 60 * 60 * 1000) return { ok: true, skipped: true };

  if (blundersStudentLocks.has(sid)) return blundersStudentLocks.get(sid);

  const task = (async () => {
    blundersLastStudentSync.set(sid, now);
    const orgId = String(student.organizationId || '');
    if (!orgId) return { ok: false, reason: 'missing org' };

    const orgs = await readChessComSettings();
    const orgSettings = orgs && orgs[orgId] ? orgs[orgId] : {};
    const entry = orgSettings && orgSettings[sid] ? orgSettings[sid] : null;
    const username = String(entry?.chessId || '').trim();
    if (!username) return { ok: false, reason: 'missing chess.com username' };

    const games = await chessComGetTodayGames(username);
    if (!games.length) return { ok: true, games: 0, added: 0 };

    const puzzles = await readBlundersPuzzles();
    const existingKeys = new Set(puzzles.map((p) => String(p.key || '')).filter(Boolean));
    let added = 0;

    for (const game of games) {
      const pgn = String(game.pgn || '');
      if (!pgn) continue;
      const me = username.toLowerCase();
      const whiteU = String(game?.white?.username || '').toLowerCase();
      const blackU = String(game?.black?.username || '').toLowerCase();
      const studentColor = whiteU === me ? 'w' : (blackU === me ? 'b' : '');
      if (!studentColor) continue;

      // Parse PGN and replay to find blunders on student's moves
      let full = null;
      try {
        full = new Chess();
        full.loadPgn(pgn, { sloppy: true });
      } catch {
        full = null;
      }
      if (!full) continue;
      const moves = full.history({ verbose: true }) || [];
      const replay = new Chess();
      for (let ply = 0; ply < moves.length; ply++) {
        const beforeFen = replay.fen();
        const turn = replay.turn();
        const mv = moves[ply];
        // Apply the move as recorded
        const applied = replay.move(mv);
        if (!applied) break;

        if (turn !== studentColor) continue; // only student's moves

        const afterFen = replay.fen();
        // Evaluate best at beforeFen (student to move)
        const best = await sfEvalFen(beforeFen, 16);
        const bestMove = String(best.bestMove || '');
        const bestCp = scoreToCp(best.score);
        // Evaluate afterFen (opponent to move), invert to student's POV
        const after = await sfEvalFen(afterFen, 16);
        const userCp = -scoreToCp(after.score);
        const dropCp = bestCp - userCp;
        const dropPoints = dropCp / 100;
        if (dropPoints <= BLUNDERS_DROP_POINTS) continue;

        const key = `${orgId}|${sid}|${String(game.url || game.uuid || '')}|${ply}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        puzzles.push({
          id: `bl_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          key,
          orgId,
          studentId: sid,
          chessComUsername: username,
          gameUrl: String(game.url || ''),
          timeClass: String(game.time_class || ''),
          endTime: Number(game.end_time || 0),
          studentColor,
          startFEN: beforeFen,
          blunderMoveUci: `${String(mv.from || '').toLowerCase()}${String(mv.to || '').toLowerCase()}${mv.promotion ? String(mv.promotion).toLowerCase() : ''}`,
          blunderSan: String(mv.san || ''),
          bestMoveUci: bestMove,
          bestCp,
          afterCp: userCp,
          dropCp,
          dropPoints,
          status: 'pending',
          createdAt: new Date().toISOString(),
          attempts: []
        });
        added++;
      }
    }

    if (added) await writeBlundersPuzzles(puzzles);
    return { ok: true, games: games.length, added };
  })().finally(() => {
    blundersStudentLocks.delete(sid);
  });

  blundersStudentLocks.set(sid, task);
  return task;
}

// ===== Blunders: Stockfish runner (spawn node + wasm engine JS) =====
let sfEngineJsPath = null;
let sfProc = null;
let sfInitPromise = null;
let sfQueue = Promise.resolve();

async function findStockfishEngineJs() {
  if (sfEngineJsPath) return sfEngineJsPath;
  const dir = path.join(__dirname, 'node_modules', 'stockfish', 'src');
  const list = await fs.readdir(dir).catch(() => []);
  // Prefer lite-single build (smaller, single wasm)
  const liteSingle = list.find((f) => /^stockfish-.*-lite-single-.*\.js$/i.test(f));
  const lite = list.find((f) => /^stockfish-.*-lite-.*\.js$/i.test(f));
  const any = list.find((f) => /^stockfish-.*\.js$/i.test(f));
  const chosen = liteSingle || lite || any;
  if (!chosen) throw new Error('Stockfish engine JS not found in node_modules/stockfish/src');
  sfEngineJsPath = path.join(dir, chosen);
  return sfEngineJsPath;
}

function sfSpawnIfNeeded() {
  if (sfProc && !sfProc.killed) return sfProc;
  sfProc = null;
  sfInitPromise = null;
  return null;
}

async function sfInit() {
  if (sfInitPromise) return sfInitPromise;
  sfInitPromise = (async () => {
    const engineJs = await findStockfishEngineJs();
    const p = spawn(process.execPath, [engineJs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
    sfProc = p;

    p.on('exit', () => {
      sfProc = null;
      sfInitPromise = null;
    });

    // Basic UCI init
    await new Promise((resolve, reject) => {
      let buf = '';
      const onData = (chunk) => {
        buf += String(chunk || '');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          const s = line.trim();
          if (s === 'uciok') {
            cleanup();
            resolve();
            return;
          }
        }
      };
      const onErr = () => {};
      const onExit = () => {
        cleanup();
        reject(new Error('Stockfish process exited during init'));
      };
      const cleanup = () => {
        try { p.stdout.off('data', onData); } catch {}
        try { p.stderr.off('data', onErr); } catch {}
        try { p.off('exit', onExit); } catch {}
      };
      p.stdout.on('data', onData);
      p.stderr.on('data', onErr);
      p.on('exit', onExit);
      try {
        p.stdin.write('uci\n');
      } catch (e) {
        cleanup();
        reject(e);
      }
    });

    // Tune for analysis
    try {
      p.stdin.write('setoption name Threads value 1\n');
      p.stdin.write('setoption name Hash value 64\n');
      p.stdin.write('setoption name MultiPV value 1\n');
      p.stdin.write('ucinewgame\n');
      p.stdin.write('isready\n');
    } catch {}

    // Wait for readyok
    await new Promise((resolve) => {
      let buf = '';
      const onData = (chunk) => {
        buf += String(chunk || '');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.trim() === 'readyok') {
            cleanup();
            resolve();
            return;
          }
        }
      };
      const cleanup = () => {
        try { p.stdout.off('data', onData); } catch {}
      };
      p.stdout.on('data', onData);
    });

    return true;
  })();
  return sfInitPromise;
}

async function sfEvalFen(fen, depth = 16) {
  // serialize all engine work
  sfQueue = sfQueue.then(async () => {
    sfSpawnIfNeeded();
    await sfInit();
    const p = sfProc;
    if (!p) throw new Error('Stockfish process not available');

    return await new Promise((resolve, reject) => {
      let buf = '';
      let lastScore = { cp: 0 };
      let lastPvMove = null;

      const onData = (chunk) => {
        buf += String(chunk || '');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          if (line.startsWith('info ')) {
            // score cp X / score mate X ; pv <move> ...
            const mCp = line.match(/\bscore\s+cp\s+(-?\d+)\b/);
            const mMate = line.match(/\bscore\s+mate\s+(-?\d+)\b/);
            if (mMate) lastScore = { mate: Number(mMate[1]) };
            else if (mCp) lastScore = { cp: Number(mCp[1]) };
            const pv = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)\b/);
            if (pv) lastPvMove = pv[1];
          }
          if (line.startsWith('bestmove ')) {
            const bm = line.split(/\s+/)[1] || null;
            cleanup();
            resolve({ bestMove: (bm && bm !== '(none)') ? bm : (lastPvMove || null), score: lastScore });
            return;
          }
        }
      };
      const onErr = (chunk) => {
        // keep stderr for debugging but don't fail immediately
        try { /* noop */ } catch {}
      };
      const onExit = () => {
        cleanup();
        reject(new Error('Stockfish process exited during analysis'));
      };
      const cleanup = () => {
        try { p.stdout.off('data', onData); } catch {}
        try { p.stderr.off('data', onErr); } catch {}
        try { p.off('exit', onExit); } catch {}
      };

      p.stdout.on('data', onData);
      p.stderr.on('data', onErr);
      p.on('exit', onExit);

      try {
        p.stdin.write(`position fen ${fen}\n`);
        p.stdin.write(`go depth ${Number(depth) || 16}\n`);
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  });
  return sfQueue;
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

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function resolveOrgIdFromUser(user) {
  if (!user) return null;
  return user.organizationId || user.orgId || user.id || null;
}

function computeEntitlementStatus(now, end, graceUntil) {
  const t = now.getTime();
  const endMs = end ? new Date(end).getTime() : 0;
  const graceMs = graceUntil ? new Date(graceUntil).getTime() : 0;
  if (!endMs) return 'inactive';
  if (t <= endMs) return 'active';
  if (graceMs && t <= graceMs) return 'grace';
  return 'expired';
}

async function ensurePayPalProductId() {
  const key = `paypal_product_id_${paypal.PAYPAL_ENV}`;
  const existing = await billingDb.getMeta(key);
  if (existing) return existing;
  const productName = process.env.PAYPAL_PRODUCT_NAME || 'StudentScoring Subscription';
  const productId = await paypal.createProductIfNeeded(productName);
  await billingDb.setMeta(key, productId);
  return productId;
}

async function ensurePayPalPlanForPrice(price) {
  const productId = price.paypalProductId || (await ensurePayPalProductId());
  const billingType = String(price.billingType || 'monthly');
  const currency = String(price.currency || 'HKD').toUpperCase();
  const amount = Number(price.amount || 0);
  const planName = `${price.name} ${billingType.toUpperCase()} ${currency}`;

  const expected = {
    interval_unit: billingType === 'yearly' ? 'YEAR' : 'MONTH',
    currency,
    amount: Number(amount.toFixed(2))
  };

  // If existing plan matches, reuse.
  if (price.paypalPlanId) {
    const existingPlan = await paypal.getPlan(price.paypalPlanId);
    if (existingPlan && planMatchesPayPalPlan(existingPlan, expected)) {
      return { paypalProductId: productId, paypalPlanId: price.paypalPlanId, reused: true };
    }
  }

  const planSpec = paypal.toPayPalPlanSpec({
    productId,
    name: planName,
    billingType,
    currency,
    amount
  });
  const newPlanId = await paypal.createPlan(planSpec);
  return { paypalProductId: productId, paypalPlanId: newPlanId, reused: false };
}

function planMatchesPayPalPlan(plan, expected) {
  return paypal.planMatches(plan, expected);
}

async function upsertBillingSubscriptionFromPayPal({ orgId, priceId, paypalSubscriptionId, paypalPlanId, status, billingType, currency, currentPeriodEnd }) {
  const graceUntil = currentPeriodEnd ? addDays(currentPeriodEnd, 7).toISOString() : null;
  await billingDb.query(
    `
    INSERT INTO billing_subscriptions(org_id, price_id, paypal_subscription_id, paypal_plan_id, status, currency, billing_type, current_period_end, grace_until, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (paypal_subscription_id) DO UPDATE SET
      org_id=EXCLUDED.org_id,
      price_id=COALESCE(EXCLUDED.price_id, billing_subscriptions.price_id),
      paypal_plan_id=COALESCE(EXCLUDED.paypal_plan_id, billing_subscriptions.paypal_plan_id),
      status=EXCLUDED.status,
      currency=COALESCE(EXCLUDED.currency, billing_subscriptions.currency),
      billing_type=COALESCE(EXCLUDED.billing_type, billing_subscriptions.billing_type),
      current_period_end=EXCLUDED.current_period_end,
      grace_until=EXCLUDED.grace_until,
      updated_at=NOW()
  `,
    [orgId, priceId || null, paypalSubscriptionId, paypalPlanId || null, status || null, currency || null, billingType || null, currentPeriodEnd || null, graceUntil]
  );
}

async function upsertEntitlementFromPrice({ orgId, price, currentPeriodEnd }) {
  const graceUntil = currentPeriodEnd ? addDays(currentPeriodEnd, 7).toISOString() : null;
  const now = new Date();
  const status = computeEntitlementStatus(now, currentPeriodEnd, graceUntil);
  const limits = price?.limits || {};
  const teacherSeats = Number(limits.teacherSeats || 0);
  const studentSeats = Number(limits.studentSeats || 0);
  const features = price?.features || {};

  await billingDb.query(
    `
    INSERT INTO billing_entitlements(org_id, status, teacher_seats, student_seats, features, current_period_end, grace_until, updated_at)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NOW())
    ON CONFLICT (org_id) DO UPDATE SET
      status=EXCLUDED.status,
      teacher_seats=EXCLUDED.teacher_seats,
      student_seats=EXCLUDED.student_seats,
      features=EXCLUDED.features,
      current_period_end=EXCLUDED.current_period_end,
      grace_until=EXCLUDED.grace_until,
      updated_at=NOW()
  `,
    [orgId, status, teacherSeats, studentSeats, JSON.stringify(features), currentPeriodEnd || null, graceUntil]
  );
}

async function refreshSubscriptionAndEntitlement(subscriptionId) {
  // Load existing row as fallback (important for cancelled subscriptions where next_billing_time may be missing).
  const existingRowRes = await billingDb.query(
    'SELECT * FROM billing_subscriptions WHERE paypal_subscription_id=$1 LIMIT 1',
    [subscriptionId]
  );
  const existingRow = existingRowRes.rows[0] || null;

  const details = await paypal.getSubscription(subscriptionId);
  const orgId = String(details.custom_id || existingRow?.org_id || '');
  const planId = details.plan_id || details.plan?.id || null;
  const status = details.status || null;

  let currentPeriodEnd = null;
  if (details?.billing_info?.next_billing_time) {
    currentPeriodEnd = new Date(details.billing_info.next_billing_time).toISOString();
  } else if (existingRow?.current_period_end) {
    currentPeriodEnd = new Date(existingRow.current_period_end).toISOString();
  } else {
    // If PayPal does not provide a next billing time for terminal states,
    // treat it as ended "now" so our grace logic can kick in.
    const s = String(status || '').toUpperCase();
    if (['CANCELLED', 'SUSPENDED', 'EXPIRED'].includes(s)) {
      currentPeriodEnd = new Date().toISOString();
    }
  }

  // Map plan_id back to our price
  const prices = await readSubscriptionPrices();
  const matchedPrice = prices.find(p => String(p.paypalPlanId || '') === String(planId || '')) || null;
  const priceId = matchedPrice?.id || null;

  await upsertBillingSubscriptionFromPayPal({
    orgId,
    priceId,
    paypalSubscriptionId: subscriptionId,
    paypalPlanId: planId,
    status,
    billingType: matchedPrice?.billingType || null,
    currency: matchedPrice?.currency || null,
    currentPeriodEnd
  });

  if (orgId && matchedPrice && currentPeriodEnd) {
    await upsertEntitlementFromPrice({ orgId, price: matchedPrice, currentPeriodEnd });
  }

  return { orgId, priceId, status, currentPeriodEnd };
}

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

// Monster Fight Game Configuration
const GAME_CONFIG = {
  // Default damage multiplier
  damageMultiplier: 0.2,
  
  // Default crit settings
  critRate: 0.10, // 10%
  critDamage: 2.0, // 2x damage
  
  // Default revive settings
  baseReviveRate: 0.01, // 1%
  reviveRateDecay: 0.95, // 0.95 multiplier per point
  maxReviveRate: 0.66, // 66% max
  
  // Difficulty curve
  difficultyCurve: {
    1: { monstersPerStudent: 1, strengthMultiplier: 1.0 },
    2: { monstersPerStudent: 1.5, strengthMultiplier: 1.2 },
    3: { monstersPerStudent: 2.0, strengthMultiplier: 1.5 }
  }
};

// Player Character Classes
const PLAYER_CLASSES = [
  {
    id: 'archer',
    name: 'Archer',
    emoji: '🏹',
    baseAttack: 10,
    baseHP: 80,
    skills: [
      { id: 'passive_1', name: 'Precision Shot', type: 'passive', description: 'Damage increased by 1.2-1.5x', effect: { damageMultiplier: { min: 1.2, max: 1.5 } } },
      { id: 'active_1', name: 'Multi Shot', type: 'active', cooldown: 4, description: 'Attack multiple enemies', emoji: '🎯', effect: { targetCount: 3 } },
      { id: 'active_2', name: 'Critical Strike', type: 'active', cooldown: 4, description: 'Guaranteed critical hit', emoji: '💢', effect: { guaranteedCrit: true } }
    ]
  },
  {
    id: 'warrior',
    name: 'Warrior',
    emoji: '⚔️',
    baseAttack: 12,
    baseHP: 100,
    skills: [
      { id: 'passive_1', name: 'Berserker', type: 'passive', description: 'Attack increases when HP is low', effect: { lowHPBonus: true } },
      { id: 'active_1', name: 'Power Strike', type: 'active', cooldown: 2, description: 'Deal 1.5x damage', emoji: '⚡', effect: { damageMultiplier: 1.5 } },
      { id: 'active_2', name: 'Charge', type: 'active', cooldown: 3, description: 'Attack and stun enemy for 2 turns', emoji: '🐎', effect: { stunTurns: 2, damageMultiplier: 1.5 } }
    ]
  },
  {
    id: 'wizard',
    name: 'Wizard',
    emoji: '🔮',
    baseAttack: 15,
    baseHP: 60,
    skills: [
      {
        id: 'passive_1',
        name: 'Arcane Surge',
        type: 'passive',
        description: 'Attacks deal 1.0-3.0x damage (higher multipliers are rarer; 3.0x ≈1%)',
        effect: {
          randomMultiplier: {
            ranges: [
              { chance: 0.01, min: 3.0, max: 3.0 },
              { chance: 0.04, min: 2.5, max: 2.99 },
              { chance: 0.10, min: 2.0, max: 2.49 },
              { chance: 0.25, min: 1.5, max: 1.99 },
              { chance: 0.60, min: 1.0, max: 1.49 }
            ]
          }
        }
      },
      { id: 'active_1', name: 'Fireball', type: 'active', cooldown: 3, description: 'Area damage to all enemies (ignores taunt)', emoji: '🔥', effect: { areaDamage: true, ignoreTaunt: true, damageMultiplier: 0.35 } },
      { id: 'active_2', name: 'Freeze', type: 'active', cooldown: 4, description: 'Single-target damage with 40% chance to freeze for 1 turn (ignores taunt)', emoji: '❄️', effect: { freezeChance: 0.4, freezeDuration: 1, damageMultiplier: 1.2, ignoreTaunt: true } }
    ]
  },
  {
    id: 'priest',
    name: 'Priest',
    emoji: '✨',
    baseAttack: 8,
    baseHP: 90,
    skills: [
      { id: 'passive_1', name: 'Divine Blessing', type: 'passive', description: 'Regenerate HP each turn', effect: { regenPerTurn: 5 } },
      { id: 'active_1', name: 'Heal', type: 'active', cooldown: 2, description: 'Restore HP to ally', effect: { heal: 30 } },
      { id: 'active_2', name: 'Revive', type: 'active', cooldown: 5, description: 'Revive fallen ally', effect: { revive: true } }
    ]
  },
  {
    id: 'assassin',
    name: 'Assassin',
    emoji: '🗡️',
    baseAttack: 14,
    baseHP: 70,
    skills: [
      { id: 'passive_1', name: 'Shadow Step', type: 'passive', description: 'Critical rate increased by 30%', effect: { critRateBonus: 0.30 } },
      { id: 'active_1', name: 'Backstab', type: 'active', cooldown: 3, description: 'High damage from behind', emoji: '🗡️', effect: { damageMultiplier: 2.0 } },
      { id: 'active_2', name: 'Poison', type: 'active', cooldown: 4, description: 'Apply poison damage over time', emoji: '☠️', effect: { dotMultiplier: 0.2, dotTurns: 3 } }
    ]
  },
  {
    id: 'shield_warrior',
    name: 'Shield Warrior',
    emoji: '🛡️',
    baseAttack: 9,
    baseHP: 120,
    skills: [
      { id: 'passive_1', name: 'Shield Block', type: 'passive', description: 'Reduce damage by 30%', effect: { damageReduction: 0.3 } },
      { id: 'active_1', name: 'Shield Bash', type: 'active', cooldown: 3, description: 'Attack and reduce enemy attack', emoji: '🔰', effect: { debuff: 'attack', damageMultiplier: 1.1 } },
      { id: 'active_2', name: 'Shield Smash', type: 'active', cooldown: 4, description: 'Attack with 30% chance to stun', emoji: '🥊', effect: { damageMultiplier: 1.2, stunChance: 0.3, stunTurns: 1 } }
    ]
  }
];

// Monster Types
const MONSTER_TYPES = [
  {
    id: 'shaman',
    name: 'Shaman',
    emoji: '🧙',
    baseAttack: 12,
    baseHP: 80,
    skills: [
      {
        id: 'passive_1',
        name: 'Vital Infusion',
        type: 'passive',
        description: 'Each turn heal the lowest HP ally (including self) for 10% max HP with a chance to critically amplify heals',
        effect: { healLowestAllyFraction: 0.1, critHealChance: 0.4, critHealMultiplier: 2.5 }
      },
      {
        id: 'active_1',
        name: 'Vital Storm',
        type: 'active',
        cooldown: 3,
        description: 'Heal all allies for 40% of their missing HP',
        effect: { areaHeal: true, missingHpFraction: 0.4 }
      }
    ]
  },
  {
    id: 'slime',
    name: 'Slime',
    emoji: '🟢',
    baseAttack: 8,
    baseHP: 60,
    skills: [
      { id: 'passive_1', name: 'Split', type: 'passive', description: 'On first death split into mini slimes', effect: { splitOnDeath: true, splitMin: 2, splitMax: 4 } },
      { id: 'active_1', name: 'Acid Spit', type: 'active', cooldown: 2, description: 'Deal damage over time', effect: { dot: true } }
    ]
  },
  {
    id: 'mini_slime',
    name: 'Mini Slime',
    emoji: '🟢',
    baseAttack: 8,
    baseHP: 20,
    skills: []
  },
  {
    id: 'goblin',
    name: 'Goblin',
    emoji: '👺',
    baseAttack: 10,
    baseHP: 70,
    skills: [
      {
        id: 'passive_1',
        name: 'Cunning Momentum',
        type: 'passive',
        description: 'Gains +1 attack permanently each time it lands a successful strike',
        effect: { attackIncreaseOnHit: 1 }
      },
      {
        id: 'active_1',
        name: 'Shadow Stab',
        type: 'active',
        cooldown: 2,
        description: 'Strike a non-shield foe, ignoring taunt',
        effect: { damageMultiplier: 1, ignoreTaunt: true, preferNonShield: true }
      }
    ]
  },
  {
    id: 'brute',
    name: 'Brute',
    emoji: '👹',
    baseAttack: 15,
    baseHP: 120,
    skills: [
      { id: 'passive_1', name: 'Tough', type: 'passive', description: 'Reduce damage by 20% and taunt player attacks', effect: { damageReduction: 0.2, tauntPlayers: true } },
      {
        id: 'active_1',
        name: 'Bone Slam',
        type: 'active',
        cooldown: 2,
        description: 'Devastating 2.5× single-target smash (taunt applies)',
        effect: { damageMultiplier: 2.5 }
      }
    ]
  },
  {
    id: 'dark_mage',
    name: 'Dark Mage',
    emoji: '🧛',
    baseAttack: 18,
    baseHP: 90,
    skills: [
      { id: 'passive_1', name: 'Dark Aura', type: 'passive', description: 'Inflict 3-turn bleed on attack', effect: { applyBleed: { turns: 3, damageFraction: 0.01 } } },
      {
        id: 'active_1',
        name: 'Dark Bolt',
        type: 'active',
        cooldown: 3,
        description: 'Force a player to strike an ally with their last attack power',
        effect: { forcePlayerAttack: true }
      }
    ]
  },
  {
    id: 'tiger',
    name: 'Evil Tiger',
    emoji: '🐅',
    baseAttack: 14,
    baseHP: 100,
    skills: [
      {
        id: 'passive_1',
        name: 'Bleeding Claw',
        type: 'passive',
        description: 'Attack ×1.5 when HP ≤ 50% and normal attacks inflict a stacking bleed over time',
        effect: {
          lowHPBonus: { threshold: 0.5, multiplier: 1.5 },
          bleedingClaw: { damageFraction: 0.2, turns: 2 }
        }
      },
      {
        id: 'active_1',
        name: 'Savage Roar',
        type: 'active',
        cooldown: 3,
        description: 'Deal 2× damage and silence the target for 1 turn (40% chance)',
        effect: { damageMultiplier: 2, silenceChance: 0.4, silenceDuration: 1 }
      }
    ]
  },
  {
    id: 'dragon',
    name: 'Evil Dragon',
    emoji: '🐉',
    isBoss: true,
    baseAttack: 25,
    baseHP: 300,
    skills: [
      {
        id: 'passive_1',
        name: 'Firestorm Aura',
        type: 'passive',
        description: '20% chance to dodge normal attacks and scorch foes before they act',
        effect: {
          dodgeChance: 0.2,
          firestormAura: { baseFraction: 0.02, enragedFraction: 0.05, threshold: 0.5 }
        }
      },
      {
        id: 'active_1',
        name: 'Fire Breath',
        type: 'active',
        cooldown: 2,
        description: 'Unleash 2× attack damage to all players, ignoring taunt',
        effect: { areaDamage: true, damageMultiplier: 2, ignoreTaunt: true }
      }
    ]
  },
  {
    id: 'three_headed_wolf',
    name: 'Three-Headed Wolf',
    emoji: '🐺',
    isBoss: true,
    baseAttack: 22,
    baseHP: 250,
    skills: [
      { id: 'passive_1', name: 'Triple Attack', type: 'passive', description: 'Attack 3 times per turn (0.8x damage)', effect: { attackCount: 3, attackMultiplier: 0.8 } },
      {
        id: 'active_1',
        name: 'Fatal Bite',
        type: 'active',
        cooldown: 2,
        description: 'Ignore taunt and rip away 80% of the target’s remaining HP',
        effect: { reduceRemainingHpFraction: 0.8, ignoreTaunt: true }
      }
    ]
  }
];

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
  const newFields = {
    dateOfBirth: null,
    gender: null,
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
    
    // Initialize new fields for all students
    if (data.students && Array.isArray(data.students)) {
      data.students.forEach(student => {
        initializeStudentFields(student);
      });
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

async function readRunningQueenLeaderboard() {
  try {
    const raw = await fs.readFile(RUNNING_QUEEN_LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      return dedupeRunningQueenLeaderboard(parsed);
    }
    return [];
  } catch (error) {
    console.error('Error reading Running Queen leaderboard:', error);
    return [];
  }
}

function isBetterRunningQueenEntry(candidate, current) {
  if (!current) return true;
  if ((candidate.score || 0) !== (current.score || 0)) return (candidate.score || 0) > (current.score || 0);
  // Timed mode uses lower duration as tie-breaker (faster is better)
  if (candidate.mode === 'timed' && current.mode === 'timed') {
    if ((candidate.duration || 0) !== (current.duration || 0)) return (candidate.duration || 0) < (current.duration || 0);
  }
  // Otherwise prefer newer
  return new Date(candidate.createdAt || 0) > new Date(current.createdAt || 0);
}

function normalizeRunningQueenEntry(entry, playerOverride = null) {
  const mode = entry?.mode === 'infinite' ? 'infinite' : 'timed';
  const queenCount = Number(entry?.queenCount);
  const timerDurationMs = Number(entry?.timerDurationMs || entry?.timerDuration);
  const player = playerOverride || null;
  return {
    players: player ? [player] : (Array.isArray(entry?.players) ? entry.players : []),
    mode,
    score: Number(entry?.score) || 0,
    duration: Number(entry?.duration) || 0,
    status: entry?.status || 'success',
    queenCount: Number.isFinite(queenCount) && queenCount > 0 ? queenCount : null,
    timerDurationMs: Number.isFinite(timerDurationMs) && timerDurationMs > 0 ? timerDurationMs : 0,
    createdAt: entry?.createdAt || new Date().toISOString()
  };
}

function getRunningQueenPlayerKey(player) {
  // Prefer internal student id; fall back to studentId or name if needed.
  if (player?.id) return String(player.id);
  if (player?.studentId) return String(player.studentId);
  return String(player?.name || 'unknown');
}

function dedupeRunningQueenLeaderboard(entries) {
  const bestByKey = new Map();
  const list = Array.isArray(entries) ? entries : [];

  for (const entry of list) {
    const players = Array.isArray(entry?.players) ? entry.players : [];
    // If stored entry has multiple players, treat it as multiple per-player entries.
    if (players.length > 0) {
      for (const player of players) {
        const normalizedPlayer = {
          name: player?.name || 'Unknown',
          studentId: player?.studentId || '',
          id: player?.id || null
        };
        const normalized = normalizeRunningQueenEntry(entry, normalizedPlayer);
        const key = `${normalized.mode}:${getRunningQueenPlayerKey(normalizedPlayer)}`;
        const current = bestByKey.get(key);
        if (isBetterRunningQueenEntry(normalized, current)) {
          bestByKey.set(key, normalized);
        }
      }
    } else {
      // No players list; keep as-is under a generic key
      const normalized = normalizeRunningQueenEntry(entry);
      const key = `${normalized.mode}:unknown`;
      const current = bestByKey.get(key);
      if (isBetterRunningQueenEntry(normalized, current)) {
        bestByKey.set(key, normalized);
      }
    }
  }

  const deduped = Array.from(bestByKey.values());
  deduped.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((a.mode === 'timed' || b.mode === 'timed') && a.mode === b.mode) {
      return (a.duration || 0) - (b.duration || 0);
    }
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
  return deduped;
}

async function writeRunningQueenLeaderboard(entries) {
  try {
    await fs.writeFile(RUNNING_QUEEN_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing Running Queen leaderboard:', error);
    return false;
  }
}

async function addRunningQueenLeaderboardEntry(entry) {
  // Start from current deduped leaderboard
  const existing = await readRunningQueenLeaderboard();

  const incomingPlayers = Array.isArray(entry?.players) ? entry.players : [];
  const perPlayerEntries = incomingPlayers.map(player => {
    const normalizedPlayer = {
      name: player?.name || 'Unknown',
      studentId: player?.studentId || '',
      id: player?.id || null
    };
    return { normalizedPlayer, normalizedEntry: normalizeRunningQueenEntry(entry, normalizedPlayer) };
  });

  // Rebuild best map from existing (already deduped) + incoming
  const bestByKey = new Map();
  for (const existingEntry of existing) {
    const player = Array.isArray(existingEntry.players) ? existingEntry.players[0] : null;
    const key = `${existingEntry.mode}:${getRunningQueenPlayerKey(player)}`;
    bestByKey.set(key, existingEntry);
  }
  for (const { normalizedPlayer, normalizedEntry } of perPlayerEntries) {
    const key = `${normalizedEntry.mode}:${getRunningQueenPlayerKey(normalizedPlayer)}`;
    const current = bestByKey.get(key);
    if (isBetterRunningQueenEntry(normalizedEntry, current)) {
      bestByKey.set(key, normalizedEntry);
    }
  }

  const updated = Array.from(bestByKey.values());
  updated.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((a.mode === 'timed' || b.mode === 'timed') && a.mode === b.mode) {
      return (a.duration || 0) - (b.duration || 0);
    }
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
  await writeRunningQueenLeaderboard(updated);
  return updated;
}

async function readRoyalExchangeLeaderboard() {
  try {
    const raw = await fs.readFile(ROYAL_EXCHANGE_LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    console.error('Error reading Royal Exchange leaderboard:', error);
    return [];
  }
}

function getRoyalExchangeEntryKey(entry) {
  const players = Array.isArray(entry?.players) ? entry.players : [];
  if (players.length === 0) return 'unknown';
  const ids = players
    .map(p => String(p?.id || p?.studentId || p?.name || 'unknown').trim())
    .filter(Boolean)
    .sort();
  // If a single player, the key is that player. If multiple players, treat as a team key.
  return ids.join('|') || 'unknown';
}

function isBetterRoyalExchangeEntry(a, b) {
  // true if a is better than b (lower steps, then lower duration, then earlier createdAt)
  const aSteps = Number(a?.steps) || 0;
  const bSteps = Number(b?.steps) || 0;
  if (aSteps !== bSteps) return aSteps < bSteps;
  const aDur = Number(a?.duration) || 0;
  const bDur = Number(b?.duration) || 0;
  if (aDur !== bDur) return aDur < bDur;
  const aTime = new Date(a?.createdAt || 0).getTime() || 0;
  const bTime = new Date(b?.createdAt || 0).getTime() || 0;
  return aTime < bTime;
}

function dedupeRoyalExchangeLeaderboardEntries(entries) {
  const bestByDifficulty = new Map(); // difficulty -> Map(key -> entry)
  (Array.isArray(entries) ? entries : []).forEach(entry => {
    if (!entry) return;
    const difficulty = entry.difficulty || 'normal';
    const key = getRoyalExchangeEntryKey(entry);
    if (!bestByDifficulty.has(difficulty)) bestByDifficulty.set(difficulty, new Map());
    const bucket = bestByDifficulty.get(difficulty);
    const existing = bucket.get(key);
    if (!existing || isBetterRoyalExchangeEntry(entry, existing)) {
      bucket.set(key, entry);
    }
  });

  const deduped = [];
  for (const [difficulty, bucket] of bestByDifficulty.entries()) {
    for (const entry of bucket.values()) {
      deduped.push({ ...entry, difficulty });
    }
  }
  return deduped;
}

async function writeRoyalExchangeLeaderboard(entries) {
  try {
    await fs.writeFile(ROYAL_EXCHANGE_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing Royal Exchange leaderboard:', error);
    return false;
  }
}

async function addRoyalExchangeLeaderboardEntry(entry) {
  const entries = await readRoyalExchangeLeaderboard();
  const normalized = {
    success: entry.success === true,
    players: entry.players || [],
    steps: Number(entry.steps) || 0,
    duration: Number(entry.duration) || 0,
    difficulty: entry.difficulty || 'normal',
    createdAt: entry.createdAt || new Date().toISOString()
  };
  entries.push(normalized);
  const deduped = dedupeRoyalExchangeLeaderboardEntries(entries).filter(e => e && e.success === true);
  deduped.sort((a, b) => {
    if ((a.difficulty || 'normal') !== (b.difficulty || 'normal')) {
      return String(a.difficulty || 'normal').localeCompare(String(b.difficulty || 'normal'));
    }
    if (Number(a.steps) !== Number(b.steps)) return Number(a.steps) - Number(b.steps);
    if (Number(a.duration) !== Number(b.duration)) return Number(a.duration) - Number(b.duration);
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
  await writeRoyalExchangeLeaderboard(deduped);
  return deduped;
}

// ============================
// Hope Mate leaderboard (scoped per teacher + org)
// ============================

async function readHopeMateLeaderboard() {
  try {
    const raw = await fs.readFile(HOPE_MATE_LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading Hope Mate leaderboard:', error);
    return [];
  }
}

async function readHopeMateStagePuzzlesFile() {
  try {
    const raw = await fs.readFile(HOPE_MATE_STAGE_PUZZLES_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.puzzles)) return parsed;
    return { puzzles: [], lastUpdate: new Date().toISOString() };
  } catch (error) {
    console.error('Error reading Hope Mate stage puzzles:', error);
    return { puzzles: [], lastUpdate: new Date().toISOString() };
  }
}

async function writeHopeMateStagePuzzlesFile(puzzlesObj) {
  try {
    const out = {
      puzzles: Array.isArray(puzzlesObj?.puzzles) ? puzzlesObj.puzzles : [],
      lastUpdate: new Date().toISOString()
    };
    await fs.writeFile(HOPE_MATE_STAGE_PUZZLES_FILE, JSON.stringify(out, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing Hope Mate stage puzzles:', error);
    return false;
  }
}

function validateFen8x8(fen) {
  const s = String(fen || '').trim();
  if (!s) return { ok: false, reason: 'FEN is required.' };
  const parts = s.split(/\s+/);
  if (parts.length < 2) return { ok: false, reason: 'FEN must include at least: board + side-to-move.' };
  const board = parts[0];
  const stm = parts[1];
  if (stm !== 'b') return { ok: false, reason: 'Side to move must be "b" (black to move).' };

  const ranks = board.split('/');
  if (ranks.length !== 8) return { ok: false, reason: 'Board must have 8 ranks separated by "/".' };

  const allowedPiece = new Set('pnbrqkPNBRQK'.split(''));
  let blackKingCount = 0;
  for (const rank of ranks) {
    let sum = 0;
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        sum += Number(ch);
      } else if (allowedPiece.has(ch)) {
        sum += 1;
        if (ch === 'k') blackKingCount += 1;
      } else {
        return { ok: false, reason: `Invalid FEN character in board: "${ch}".` };
      }
    }
    if (sum !== 8) return { ok: false, reason: 'Each rank must sum to 8 squares.' };
  }
  if (blackKingCount !== 1) return { ok: false, reason: 'FEN must contain exactly one black king ("k").' };
  return { ok: true, fen: s };
}

async function writeHopeMateLeaderboard(entries) {
  try {
    await fs.writeFile(HOPE_MATE_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing Hope Mate leaderboard:', error);
    return false;
  }
}

function normalizeHopeMateEntry(entry) {
  return {
    orgId: String(entry?.orgId || ''),
    teacherId: String(entry?.teacherId || ''),
    student: {
      id: String(entry?.student?.id || ''),
      name: String(entry?.student?.name || 'Unknown'),
      studentId: String(entry?.student?.studentId || '')
    },
    totalScore: Number(entry?.totalScore) || 0,
    updatedAt: entry?.updatedAt || new Date().toISOString(),
    createdAt: entry?.createdAt || new Date().toISOString()
  };
}

function getHopeMateKey(entry) {
  const orgId = String(entry?.orgId || '');
  const teacherId = String(entry?.teacherId || '');
  const studentId = String(entry?.student?.id || '');
  return `${orgId}:${teacherId}:${studentId}`;
}

// ============================
// Hope Mate Challenge leaderboard (scoped per teacher + org + durationSec)
// ============================
const HOPE_MATE_CHALLENGE_DURATIONS = new Set([60, 120, 180]);

async function readHopeMateChallengeLeaderboard() {
  try {
    const raw = await fs.readFile(HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading Hope Mate Challenge leaderboard:', error);
    return [];
  }
}

async function writeHopeMateChallengeLeaderboard(entries) {
  try {
    await fs.writeFile(HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing Hope Mate Challenge leaderboard:', error);
    return false;
  }
}

function normalizeHopeMateChallengeEntry(entry) {
  const durationSec = Number(entry?.durationSec);
  return {
    orgId: String(entry?.orgId || ''),
    teacherId: String(entry?.teacherId || ''),
    durationSec: HOPE_MATE_CHALLENGE_DURATIONS.has(durationSec) ? durationSec : 60,
    student: {
      id: String(entry?.student?.id || ''),
      name: String(entry?.student?.name || 'Unknown'),
      studentId: String(entry?.student?.studentId || '')
    },
    totalSolved: Number(entry?.totalSolved) || 0,
    bestLevel: Number(entry?.bestLevel) || 1,
    bestTimeLeftSec: Number(entry?.bestTimeLeftSec) || 0,
    updatedAt: entry?.updatedAt || new Date().toISOString(),
    createdAt: entry?.createdAt || new Date().toISOString()
  };
}

function getHopeMateChallengeKey(entry) {
  const orgId = String(entry?.orgId || '');
  const teacherId = String(entry?.teacherId || '');
  const durationSec = Number(entry?.durationSec) || 60;
  const studentId = String(entry?.student?.id || '');
  return `${orgId}:${teacherId}:${durationSec}:${studentId}`;
}

function isBetterHopeMateChallenge(candidate, current) {
  if (!current) return true;
  if ((candidate.totalSolved || 0) !== (current.totalSolved || 0)) return (candidate.totalSolved || 0) > (current.totalSolved || 0);
  if ((candidate.bestLevel || 0) !== (current.bestLevel || 0)) return (candidate.bestLevel || 0) > (current.bestLevel || 0);
  if ((candidate.bestTimeLeftSec || 0) !== (current.bestTimeLeftSec || 0)) return (candidate.bestTimeLeftSec || 0) > (current.bestTimeLeftSec || 0);
  return new Date(candidate.updatedAt || 0) > new Date(current.updatedAt || 0);
}

async function upsertHopeMateChallengeEntry(entry) {
  const all = await readHopeMateChallengeLeaderboard();
  const normalized = normalizeHopeMateChallengeEntry(entry);
  const key = getHopeMateChallengeKey(normalized);
  const map = new Map();
  for (const e of (Array.isArray(all) ? all : [])) {
    const ne = normalizeHopeMateChallengeEntry(e);
    map.set(getHopeMateChallengeKey(ne), ne);
  }
  const current = map.get(key);
  if (!current || isBetterHopeMateChallenge(normalized, current)) {
    normalized.updatedAt = new Date().toISOString();
    normalized.createdAt = current?.createdAt || normalized.createdAt;
    map.set(key, normalized);
  }
  const next = Array.from(map.values());
  await writeHopeMateChallengeLeaderboard(next);
  return next;
}

function dedupeHopeMateLeaderboard(entries) {
  const bestByKey = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const n = normalizeHopeMateEntry(e);
    if (!n.orgId || !n.teacherId || !n.student.id) continue;
    const key = getHopeMateKey(n);
    const cur = bestByKey.get(key);
    // Keep highest totalScore; if tie, keep most recent updatedAt
    if (!cur) {
      bestByKey.set(key, n);
      continue;
    }
    if ((n.totalScore || 0) > (cur.totalScore || 0)) {
      bestByKey.set(key, { ...cur, ...n, createdAt: cur.createdAt || n.createdAt });
      continue;
    }
    if ((n.totalScore || 0) === (cur.totalScore || 0)) {
      const nt = new Date(n.updatedAt || 0).getTime() || 0;
      const ct = new Date(cur.updatedAt || 0).getTime() || 0;
      if (nt > ct) {
        bestByKey.set(key, { ...cur, ...n, createdAt: cur.createdAt || n.createdAt });
      }
    }
  }
  return Array.from(bestByKey.values());
}

async function upsertHopeMateLeaderboardEntry({ orgId, teacherId, student, totalScore }) {
  const existing = await readHopeMateLeaderboard();
  const deduped = dedupeHopeMateLeaderboard(existing);

  const key = `${String(orgId)}:${String(teacherId)}:${String(student?.id || '')}`;
  const nowIso = new Date().toISOString();
  const incomingTotal = Number(totalScore);

  const next = deduped.map(e => normalizeHopeMateEntry(e));
  const idx = next.findIndex(e => getHopeMateKey(e) === key);
  if (idx === -1) {
    next.push(normalizeHopeMateEntry({
      orgId,
      teacherId,
      student,
      totalScore: Number.isFinite(incomingTotal) ? incomingTotal : 0,
      createdAt: nowIso,
      updatedAt: nowIso
    }));
  } else {
    const cur = next[idx];
    const curTotal = Number(cur.totalScore) || 0;
    // Allow idempotent resend (same total), or incremental +1 only.
    if (incomingTotal < curTotal) {
      // ignore decreasing updates
    } else if (incomingTotal === curTotal || incomingTotal === curTotal + 1) {
      next[idx] = normalizeHopeMateEntry({
        ...cur,
        student,
        totalScore: incomingTotal,
        updatedAt: nowIso
      });
    } else {
      // reject suspicious jump (client bug or tampering)
      const err = new Error('Invalid score update (jump too large)');
      err.code = 'SCORE_JUMP';
      throw err;
    }
  }

  const final = dedupeHopeMateLeaderboard(next);
  final.sort((a, b) => {
    if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
    return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
  });
  await writeHopeMateLeaderboard(final);
  return final;
}

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
        scoreToNext: nextRank ? nextRank.maxScore - score : 0
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

// Organization creates a teacher (requires organization authentication)
app.post('/api/organizations/teachers', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { name, teacherId, gender, username, password } = req.body;
    
    // Validation
    if (!name || !teacherId || !gender || !username || !password) {
      return res.status(400).json({ error: 'Name, teacher ID, gender, username, and password are required' });
    }
    
    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Get organization
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Check if username already exists
    const existingUser = users.find(u => u.email === username.toLowerCase() || u.username === username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    // Check if teacher ID already exists in this organization
    const existingTeacher = users.find(u => 
      u.organizationId === orgUser.organizationId && 
      u.role === 'teacher' && 
      u.teacherId === teacherId
    );
    if (existingTeacher) {
      return res.status(400).json({ error: 'Teacher ID already exists in this organization' });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create teacher user
    const newTeacher = {
      id: Date.now().toString(),
      email: username.toLowerCase(),
      username: username,
      password: hashedPassword,
      name,
      teacherId,
      gender,
      role: 'teacher',
      organizationId: orgUser.organizationId,
      createdAt: new Date().toISOString(),
      classViewStudents: [], // Students selected for Class View
      assignedStudents: [] // Students assigned by organization (many-to-many)
    };
    
    users.push(newTeacher);
    await writeUsers(users);
    
    // Update organization
    organization.teachers.push(newTeacher.id);
    await writeOrganizations(organizations);
    
    // Return teacher info (without password)
    const { password: _, ...teacherWithoutPassword } = newTeacher;
    res.status(201).json({
      teacher: teacherWithoutPassword
    });
  } catch (error) {
    console.error('Error creating teacher:', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// Organization creates a student (requires organization authentication or teacher permission)
app.post('/api/organizations/students', authenticateUser, authorizeRole('organization', 'teacher'), async (req, res) => {
  try {
    const { name, studentId, gender, dateOfBirth, contactPhone, contactEmail, emergencyContactName, emergencyContactRelation, emergencyContactNumber } = req.body;
    
    // Validation
    if (!name) {
      return res.status(400).json({ error: 'Student Name is required' });
    }
    
    // Get user and check permissions if teacher
    const users = await readUsers();
    const currentUser = users.find(u => u.id === req.user.id);
    
    if (!currentUser || !currentUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    // Teacher Permission Check
    if (currentUser.role === 'teacher') {
        if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.addStudent) {
            return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to add students.' });
        }
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === currentUser.organizationId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Check if student already exists in this organization (only if studentId provided)
    const data = await readData();
    if (studentId) {
    const existingStudent = data.students.find(s => 
      s.organizationId === currentUser.organizationId && 
      s.studentId === studentId
    );
    if (existingStudent) {
      return res.status(400).json({ error: 'Student ID already exists in this organization' });
        }
    }
    
    // Create student record
    const initialRankInfo = getRankInfo(0);
    const newStudent = {
      id: Date.now().toString(),
      name,
      studentId: studentId || '', // Allow empty
      gender: gender || '',
      dateOfBirth: dateOfBirth || '',
      contactPhone: contactPhone || '',
      contactEmail: contactEmail || '',
      emergencyContactName: emergencyContactName || '',
      emergencyContactRelation: emergencyContactRelation || '',
      emergencyContactNumber: emergencyContactNumber || '',
      organizationId: currentUser.organizationId,
      answerCount: 0,
      totalAnswers: 0,
      correctAnswers: 0,
      level: 1,
      rank: 'Wood',
      rankIndex: 0,
      experience: 0,
      score: 0,
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
    
    // Update organization
    organization.students.push(newStudent.id);
    await writeOrganizations(organizations);

    // If Teacher created it, Auto-Assign
    if (currentUser.role === 'teacher') {
        if (!currentUser.assignedStudents) {
            currentUser.assignedStudents = [];
        }
        if (!currentUser.assignedStudents.includes(newStudent.id)) {
            currentUser.assignedStudents.push(newStudent.id);
            // Save updated teacher user
            const teacherIndex = users.findIndex(u => u.id === currentUser.id);
            if (teacherIndex !== -1) {
                users[teacherIndex] = currentUser;
                await writeUsers(users);
            }
        }
    }
    
    broadcast({ type: 'studentAdded', student: newStudent });
    res.status(201).json(newStudent);
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Bulk create students
app.post('/api/organizations/students/bulk', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const studentsList = req.body;
    if (!Array.isArray(studentsList)) {
        return res.status(400).json({ error: 'Expected array of students' });
    }
    
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) return res.status(403).json({ error: 'Organization not found' });
    
    const data = await readData();
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    
    let createdCount = 0;
    let errors = [];
    
    for (const s of studentsList) {
        if (!s.name) {
            errors.push({ student: s, error: 'Name missing' });
            continue;
        }
        
        if (s.studentId && s.studentId.trim() !== '') {
            const exists = data.students.find(ex => ex.organizationId === orgUser.organizationId && ex.studentId === s.studentId);
            if (exists) {
                errors.push({ student: s, error: `ID ${s.studentId} already exists` });
                continue;
            }
        }
        
        const newStudent = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: s.name,
            studentId: s.studentId || '',
            gender: s.gender || '',
            dateOfBirth: s.dateOfBirth || '',
            contactPhone: s.contactPhone || '',
            contactEmail: s.contactEmail || '',
            emergencyContactName: s.emergencyContactName || '',
            emergencyContactRelation: s.emergencyContactRelation || '',
            emergencyContactNumber: s.emergencyContactNumber || '',
            organizationId: orgUser.organizationId,
            answerCount: 0,
            totalAnswers: 0,
            correctAnswers: 0,
            level: 1,
            rank: 'Wood',
            rankIndex: 0,
            experience: 0,
            score: 0,
            createdAt: new Date().toISOString(),
            stats: { daily: {}, weekly: {}, monthly: {}, yearly: {} }
        };
        
        data.students.push(newStudent);
        organization.students.push(newStudent.id);
        createdCount++;
    }
    
    if (createdCount > 0) {
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        await writeOrganizations(organizations);
    }
    
    res.json({ createdCount, errors });
    
  } catch (error) {
      console.error('Bulk import error:', error);
      res.status(500).json({ error: 'Bulk import failed' });
  }
});

// Bulk create students
app.post('/api/organizations/students/bulk', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const studentsData = req.body; // Array of students
    if (!Array.isArray(studentsData)) {
        return res.status(400).json({ error: 'Expected an array of students' });
    }
    
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) return res.status(403).json({ error: 'Organization not found' });
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    if (!organization) return res.status(404).json({ error: 'Organization not found' });
    
    const data = await readData();
    let createdCount = 0;
    let errors = [];
    
    for (const s of studentsData) {
        // Validate Name
        if (!s.name) {
            errors.push({ student: s, error: 'Name missing' });
            continue;
        }
        
        // Check ID uniqueness (if provided)
        if (s.studentId) {
            const exists = data.students.find(ex => ex.organizationId === orgUser.organizationId && ex.studentId === s.studentId);
            if (exists) {
                errors.push({ student: s, error: `ID ${s.studentId} already exists` });
                continue;
            }
        }
        
        // Create
        const newStudent = {
          id: `student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: s.name,
          studentId: s.studentId || '',
          gender: s.gender || '',
          dateOfBirth: s.dateOfBirth || '',
          contactPhone: s.contactPhone || '',
          contactEmail: s.contactEmail || '',
          emergencyContactName: s.emergencyContactName || '',
          emergencyContactRelation: s.emergencyContactRelation || '',
          emergencyContactNumber: s.emergencyContactNumber || '',
          organizationId: orgUser.organizationId,
          answerCount: 0,
          totalAnswers: 0,
          correctAnswers: 0,
          level: 1,
          rank: 'Wood',
          rankIndex: 0,
          experience: 0,
          score: 0,
          createdAt: new Date().toISOString(),
          stats: { daily: {}, weekly: {}, monthly: {}, yearly: {} }
        };
        
        data.students.push(newStudent);
        organization.students.push(newStudent.id);
        createdCount++;
    }
    
    if (createdCount > 0) {
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        await writeOrganizations(organizations);
        broadcast({ type: 'studentsBulkAdded', count: createdCount });
    }
    
    res.json({ createdCount, errors });
    
  } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Bulk import failed' });
  }
});

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

// Check if student ID is available in an organization
app.get('/api/organizations/:orgId/students/check-id/:studentId', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
  try {
    const { orgId, studentId } = req.params;
    const { excludeId } = req.query; // Optional: exclude this student ID when checking (for editing)
    
    // Verify organization access
    if (req.user.role === 'organization' && req.user.organizationId !== orgId) {
      return res.status(403).json({ error: 'You can only check student IDs in your organization' });
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    const data = await readData();
    const existingStudent = data.students.find(s => 
      s.organizationId === orgId && 
      s.studentId === studentId &&
      s.id !== excludeId // Exclude current student when editing
    );
    
    res.json({ available: !existingStudent });
  } catch (error) {
    console.error('Error checking student ID:', error);
    res.status(500).json({ error: 'Failed to check student ID' });
  }
});

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

// ==================== Organization Management API (continued) ====================

// Initialize teacher fields (ensure contactPhone and remark exist)
function initializeTeacherFields(teacher) {
  if (!teacher || teacher.role !== 'teacher') return teacher;
  
  if (teacher.contactPhone === undefined) {
    teacher.contactPhone = null;
  }
  if (teacher.remark === undefined) {
    teacher.remark = null;
  }
  
  return teacher;
}

// Get organization's teachers (organization only)
app.get('/api/organizations/teachers', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const users = await readUsers();
    console.log(`[DEBUG] GET /teachers. Req User ID: ${req.user.id}`);
    
    const orgUser = users.find(u => u.id === req.user.id);
    
    if (!orgUser) {
        console.log(`[DEBUG] Org User NOT FOUND in users list. ID: ${req.user.id}`);
        return res.status(403).json({ error: 'Organization user not found in DB' });
    }
    
    if (!orgUser.organizationId) {
        console.log(`[DEBUG] Org User has NO organizationId. ID: ${req.user.id}`);
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    // Get all teachers in this organization
    const teachers = users.filter(u => 
      u.organizationId === orgUser.organizationId && 
      u.role === 'teacher'
    );
    
    console.log(`[DEBUG] GET /teachers: Found ${teachers.length} teachers for Org ${orgUser.organizationId}`);
    
    // Initialize teacher fields and remove passwords
    const teachersWithoutPasswords = teachers.map(t => {
      initializeTeacherFields(t);
      const { password: _, ...teacherWithoutPassword } = t;
      return teacherWithoutPassword;
    });
    
    res.json(teachersWithoutPasswords);
  } catch (error) {
    console.error('Error getting teachers:', error);
    res.status(500).json({ error: 'Failed to get teachers' });
  }
});

// Update teacher permissions
app.put('/api/organizations/teachers/:teacherId/permissions', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    const permissions = req.body; // Expect { addStudent: true/false, ... }

    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
    if (teacherIndex === -1) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Initialize if not exists
    if (!users[teacherIndex].teacherPermissions) {
        users[teacherIndex].teacherPermissions = {};
    }

    // Merge permissions
    users[teacherIndex].teacherPermissions = {
        ...users[teacherIndex].teacherPermissions,
        ...permissions
    };

    await writeUsers(users);

    res.json({ message: 'Permissions updated', permissions: users[teacherIndex].teacherPermissions });
  } catch (error) {
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Organization deletes a teacher
app.delete('/api/organizations/teachers/:teacherId', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Get organization
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    // Verify teacher belongs to organization
    const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
    if (teacherIndex === -1) {
      return res.status(404).json({ error: 'Teacher not found or does not belong to your organization' });
    }
    
    // Remove teacher from users
    users.splice(teacherIndex, 1);
    await writeUsers(users);
    
    // Remove teacher from organization
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    if (organization) {
      organization.teachers = organization.teachers.filter(id => id !== teacherId);
      await writeOrganizations(organizations);
    }
    
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('Error deleting teacher:', error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// Organization or Admin login as teacher (impersonation)
app.post('/api/organizations/teachers/:teacherId/login-as', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Get users
    const users = await readUsers();
    const teacher = users.find(u => u.id === teacherId && u.role === 'teacher');
    
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // Verify organization access
    // If current user is organization (not admin), verify teacher belongs to their organization
    if (req.user.role === 'organization') {
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }
      
      if (teacher.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'You don\'t have permission to login as this teacher' });
      }
    }
    // Admin can login as any teacher
    
    // Generate token for teacher
    const token = generateToken(teacher);
    
    // Return user info (without password)
    const { password: _, ...teacherWithoutPassword } = teacher;
    
    // Include organization info if teacher has organizationId
    if (teacher.organizationId) {
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === teacher.organizationId);
      if (organization) {
        teacherWithoutPassword.organization = organization;
      }
    }
    
    res.json({
      user: teacherWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Error logging in as teacher:', error);
    res.status(500).json({ error: 'Failed to login as teacher' });
  }
});

// Update teacher information (organization and admin)
app.put('/api/organizations/teachers/:teacherId', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { name, teacherId: newTeacherId, gender, email, contactPhone, remark } = req.body;
    
    // Get users
    const users = await readUsers();
    const teacherIndex = users.findIndex(u => u.id === teacherId && u.role === 'teacher');
    
    if (teacherIndex === -1) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    const teacher = users[teacherIndex];
    
    // Verify organization access
    if (req.user.role === 'organization') {
      const orgUser = users.find(u => u.id === req.user.id);
      if (!orgUser || !orgUser.organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }
      
      if (teacher.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'You don\'t have permission to update this teacher' });
      }
    }
    // Admin can update any teacher
    
    // Validation
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Teacher name is required' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'Teacher name must be 100 characters or less' });
      }
      teacher.name = name.trim();
    }
    
    if (newTeacherId !== undefined) {
      if (!newTeacherId || newTeacherId.trim().length === 0) {
        return res.status(400).json({ error: 'Teacher ID is required' });
      }
      if (newTeacherId.length > 50) {
        return res.status(400).json({ error: 'Teacher ID must be 50 characters or less' });
      }
      
      // Check if teacher ID already exists in this organization (excluding current teacher)
      const existingTeacher = users.find(u => 
        u.id !== teacherId &&
        u.organizationId === teacher.organizationId &&
        u.role === 'teacher' &&
        u.teacherId === newTeacherId.trim()
      );
      
      if (existingTeacher) {
        return res.status(400).json({ error: 'Teacher ID already exists in this organization' });
      }
      
      teacher.teacherId = newTeacherId.trim();
    }
    
    if (gender !== undefined) {
      if (gender && gender !== 'male' && gender !== 'female') {
        return res.status(400).json({ error: 'Gender must be male or female' });
      }
      teacher.gender = gender || null;
    }
    
    if (email !== undefined) {
      // Email is optional, no format validation, no uniqueness check
      teacher.email = email ? email.trim().toLowerCase() : null;
      // Also update username if email is provided (for backward compatibility)
      if (email) {
        teacher.username = email.trim().toLowerCase();
      }
    }
    
    if (contactPhone !== undefined) {
      if (contactPhone && contactPhone.length > 20) {
        return res.status(400).json({ error: 'Contact phone must be 20 characters or less' });
      }
      teacher.contactPhone = contactPhone ? contactPhone.trim() : null;
    }
    
    if (remark !== undefined) {
      if (remark && remark.length > 1000) {
        return res.status(400).json({ error: 'Remark must be 1000 characters or less' });
      }
      teacher.remark = remark ? remark.trim() : null;
    }
    
    // Update updatedAt timestamp
    teacher.updatedAt = new Date().toISOString();
    
    users[teacherIndex] = teacher;
    await writeUsers(users);
    
    // Return teacher info (without password)
    const { password: _, ...teacherWithoutPassword } = teacher;
    
    res.json(teacherWithoutPassword);
  } catch (error) {
    console.error('Error updating teacher:', error);
    res.status(500).json({ error: 'Failed to update teacher' });
  }
});

// ==================== Organization Student Assignment API ====================

// Organization assigns students to teachers (many-to-many)
app.post('/api/organizations/assign-students', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { teacherId, studentIds } = req.body;
    
    if (!teacherId || !Array.isArray(studentIds)) {
      return res.status(400).json({ error: 'teacherId and studentIds array are required' });
    }
    
    // Get organization
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    // Verify teacher belongs to organization
    const teacher = users.find(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found or does not belong to your organization' });
    }
    
    // Verify all students belong to the organization
    const data = await readData();
    const validStudents = data.students.filter(s => 
      studentIds.includes(s.id) && s.organizationId === orgUser.organizationId
    );
    
    if (validStudents.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students not found or do not belong to your organization' });
    }
    
    // Update teacher's assigned students
    teacher.assignedStudents = studentIds;
    
    const userIndex = users.findIndex(u => u.id === teacher.id);
    users[userIndex] = teacher;
    await writeUsers(users);
    
    res.json({
      message: 'Students assigned successfully',
      teacherId: teacherId,
      assignedStudentIds: studentIds,
      students: validStudents
    });
  } catch (error) {
    console.error('Error assigning students:', error);
    res.status(500).json({ error: 'Failed to assign students' });
  }
});

// Organization gets students assigned to a teacher
app.get('/api/organizations/teachers/:teacherId/students', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    // Get organization
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    // Verify teacher belongs to organization
    const teacher = users.find(u => u.id === teacherId && u.role === 'teacher' && u.organizationId === orgUser.organizationId);
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // Get all students in organization
    const data = await readData();
    const allStudents = data.students.filter(s => s.organizationId === orgUser.organizationId);
    const assignedStudentIds = teacher.assignedStudents || [];
    const assignedStudents = allStudents.filter(s => assignedStudentIds.includes(s.id));
    
    res.json({
      allStudents: allStudents,
      assignedStudents: assignedStudents,
      assignedStudentIds: assignedStudentIds
    });
  } catch (error) {
    console.error('Error getting assigned students:', error);
    res.status(500).json({ error: 'Failed to get assigned students' });
  }
});

// ==================== Organization Settings API ====================

// Get Class View settings (teacher/organization/admin)
// - Organization admins configure these in Organization Dashboard -> Settings -> Class View Management
// - Teachers (Class View page) read only the relevant subset to decide whether to enable Challenge mode
app.get('/api/class-view/settings', authenticateUser, authorizeRole('organization', 'teacher', 'admin'), requireOrganizationAccess, async (req, res) => {
  try {
    const organizations = await readOrganizations();

    let organizationId = req.organizationFilter;
    // Admin may not have organizationFilter; allow explicit orgId query (optional)
    if (req.user.role === 'admin' && !organizationId) {
      organizationId = req.query.orgId;
    }
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization not specified' });
    }

    const organization = organizations.find(o => o.id === organizationId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const defaultClassViewMode = {
      enabled: true,
      rewardRule: 'fixed',
      hpCalculation: 'byScore',
      hpMultiplier: 1
    };

    const defaultChallengeLevels = {
      levels: [
        { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
        { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
        { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
        { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },
        { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' }
      ]
    };

    const savedSettings = organization.settings || {};
    const classViewMode = { ...defaultClassViewMode, ...(savedSettings.classViewMode || {}) };
    const challengeLevels = savedSettings.challengeLevels || defaultChallengeLevels;

    res.json({
      classViewMode,
      challengeLevels
    });
  } catch (error) {
    console.error('Error getting class view settings:', error);
    res.status(500).json({ error: 'Failed to get class view settings' });
  }
});

// Get organization settings
app.get('/api/organizations/settings', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Return settings or default settings if not set
    const defaultSettings = {
      teacherPermissions: {
        canCreateStudents: true,
        canDeleteStudents: true,
        canModifyScores: true,
        canUseClassView: true,
        canResetScores: true,
        canViewStatistics: true
      },
      studentPermissions: {
        canViewLeaderboard: true,
        canViewOtherScores: true,
        canViewOwnDetails: true
      },
      classViewMode: {
        enabled: true,
        rewardRule: 'fixed',
        hpCalculation: 'byScore',
        hpMultiplier: 1
      },
      studentLevelUp: {
        experiencePerLevel: 100,
        rankSystem: {
          enabled: true,
          baseScore: 50,
          multiplier: 2
        }
      },
      displaySettings: {
        leaderboardCount: 10,
        showScore: true,
        showLevel: true,
        showRank: true,
        themeColor: '#667eea',
        fontSize: 'medium'
      },
      scheduleSettings: {
        classTimes: [],
        autoSaveEnabled: true,
        autoSaveInterval: 30
      },
      scoringRules: {
        correctAnswerPoints: 10,
        incorrectAnswerPoints: 2,
        customRules: []
      },
      challengeLevels: {
        levels: [
          { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
          { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
          { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
          { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },
          { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' },
          { level: 6, name: 'Boss Lv1', maxHP: 650, reward: 60, emoji: '👑' },
          { level: 7, name: 'Boss Lv2', maxHP: 1050, reward: 75, emoji: '👑' },
          { level: 8, name: 'Boss Lv3', maxHP: 1700, reward: 100, emoji: '👑' },
          { level: 9, name: 'Boss Lv4', maxHP: 2750, reward: 125, emoji: '👑' },
          { level: 10, name: 'Final Boss', maxHP: 4450, reward: 150, emoji: '👑' }
        ]
      },
      backupSettings: {
        autoBackupEnabled: true,
        backupFrequency: 'daily',
        backupRetention: 7
      },
      notificationSettings: {
        websocketUpdateFrequency: 1000,
        soundEnabled: false,
        notificationMethod: 'websocket'
      },
      organizationInfo: {
        logo: '',
        primaryColor: '#667eea',
        secondaryColor: '#764ba2'
      },
      securitySettings: {
        passwordMinLength: 6,
        maxLoginAttempts: 5,
        sessionTimeout: 3600000
      }
    };
    
    // Merge default settings with saved settings
    const savedSettings = organization.settings || {};
    const mergedSettings = {
      ...defaultSettings,
      ...savedSettings,
      teacherPermissions: { ...defaultSettings.teacherPermissions, ...(savedSettings.teacherPermissions || {}) },
      studentPermissions: { ...defaultSettings.studentPermissions, ...(savedSettings.studentPermissions || {}) },
      classViewMode: { ...defaultSettings.classViewMode, ...(savedSettings.classViewMode || {}) },
      studentLevelUp: {
        ...defaultSettings.studentLevelUp,
        ...(savedSettings.studentLevelUp || {}),
        rankSystem: { ...defaultSettings.studentLevelUp.rankSystem, ...(savedSettings.studentLevelUp?.rankSystem || {}) }
      },
      displaySettings: { ...defaultSettings.displaySettings, ...(savedSettings.displaySettings || {}) },
      scheduleSettings: { ...defaultSettings.scheduleSettings, ...(savedSettings.scheduleSettings || {}) },
      scoringRules: { ...defaultSettings.scoringRules, ...(savedSettings.scoringRules || {}) },
      challengeLevels: savedSettings.challengeLevels || defaultSettings.challengeLevels,
      backupSettings: { ...defaultSettings.backupSettings, ...(savedSettings.backupSettings || {}) },
      notificationSettings: { ...defaultSettings.notificationSettings, ...(savedSettings.notificationSettings || {}) },
      organizationInfo: { ...defaultSettings.organizationInfo, ...(savedSettings.organizationInfo || {}) },
      securitySettings: { ...defaultSettings.securitySettings, ...(savedSettings.securitySettings || {}) }
    };
    
    res.json(mergedSettings);
  } catch (error) {
    console.error('Error getting organization settings:', error);
    res.status(500).json({ error: 'Failed to get organization settings' });
  }
});

// Update organization settings
app.put('/api/organizations/settings', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const settings = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings data is required' });
    }
    
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Update settings
    organization.settings = settings;
    organization.updatedAt = new Date().toISOString();
    
    const orgIndex = organizations.findIndex(o => o.id === organization.id);
    organizations[orgIndex] = organization;
    await writeOrganizations(organizations);
    
    res.json({
      message: 'Settings saved successfully',
      settings: organization.settings
    });
  } catch (error) {
    console.error('Error updating organization settings:', error);
    res.status(500).json({ error: 'Failed to update organization settings' });
  }
});

// Reset organization settings to default
app.post('/api/organizations/settings/reset', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { category } = req.body; // Optional: reset specific category or all if not provided
    
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    const organizations = await readOrganizations();
    const organization = organizations.find(o => o.id === orgUser.organizationId);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // If category is specified, reset only that category
    if (category && organization.settings) {
      // Reset specific category logic would go here
      // For now, we'll reset all settings
      organization.settings = {};
    } else {
      // Reset all settings
      organization.settings = {};
    }
    
    organization.updatedAt = new Date().toISOString();
    
    const orgIndex = organizations.findIndex(o => o.id === organization.id);
    organizations[orgIndex] = organization;
    await writeOrganizations(organizations);
    
    res.json({
      message: 'Settings reset successfully',
      settings: organization.settings
    });
  } catch (error) {
    console.error('Error resetting organization settings:', error);
    res.status(500).json({ error: 'Failed to reset organization settings' });
  }
});

// ==================== Course Management API ====================

// Get all courses for an organization (organization and admin)
app.get('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const courses = await readCourses();
    
    // Filter by organization
    let filteredCourses = courses;
    if (req.organizationFilter) {
      filteredCourses = courses.filter(c => c.organizationId === req.organizationFilter);
    }
    
    // Sort by createdAt (newest first) by default
    filteredCourses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(filteredCourses);
  } catch (error) {
    console.error('Error getting courses:', error);
    res.status(500).json({ error: 'Failed to get courses' });
  }
});

// Create a new course (organization and admin)
app.post('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { name, price, color } = req.body;
    
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Course name is required' });
    }
    
    if (name.length > 50) {
      return res.status(400).json({ error: 'Course name must be 50 characters or less' });
    }
    
    if (price === undefined || price === null) {
      return res.status(400).json({ error: 'Price is required' });
    }
    
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({ error: 'Price must be a valid number greater than or equal to 0' });
    }
    
    // Validate color format if provided
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'Color must be in #RRGGBB format' });
    }
    
    // Get organization ID
    let organizationId;
    if (req.user.role === 'admin') {
      // Admin can specify organizationId in body, or use organizationFilter if provided
      organizationId = req.body.organizationId || req.organizationFilter;
      if (!organizationId) {
        return res.status(400).json({ error: 'organizationId is required for admin' });
      }
    } else {
      organizationId = req.user.organizationId || req.organizationFilter;
      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }
    }
    
    // Check if course name already exists in this organization
    const courses = await readCourses();
    const existingCourse = courses.find(c => 
      c.organizationId === organizationId && 
      c.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    
    if (existingCourse) {
      return res.status(400).json({ error: 'Course name already exists in this organization' });
    }
    
    // Create new course
    const newCourse = {
      id: `course_${Date.now()}`,
      organizationId: organizationId,
      name: name.trim(),
      price: priceNum,
      color: color || null,
      category: null,
      level: null,
      description: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    courses.push(newCourse);
    await writeCourses(courses);
    
    res.status(201).json(newCourse);
  } catch (error) {
    console.error('Error creating course:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
});

// Update a course (organization and admin)
app.put('/api/organizations/courses/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, color } = req.body;
    
    const courses = await readCourses();
    const courseIndex = courses.findIndex(c => c.id === id);
    
    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = courses[courseIndex];
    
    // Check organization access
    if (req.organizationFilter && course.organizationId !== req.organizationFilter) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validation
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Course name is required' });
      }
      if (name.length > 50) {
        return res.status(400).json({ error: 'Course name must be 50 characters or less' });
      }
      
      // Check if course name already exists in this organization (excluding current course)
      const existingCourse = courses.find(c => 
        c.id !== id &&
        c.organizationId === course.organizationId && 
        c.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      
      if (existingCourse) {
        return res.status(400).json({ error: 'Course name already exists in this organization' });
      }
      
      course.name = name.trim();
    }
    
    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Price must be a valid number greater than or equal to 0' });
      }
      course.price = priceNum;
    }
    
    if (color !== undefined) {
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return res.status(400).json({ error: 'Color must be in #RRGGBB format' });
      }
      course.color = color || null;
    }
    
    course.updatedAt = new Date().toISOString();
    
    courses[courseIndex] = course;
    await writeCourses(courses);
    
    res.json(course);
  } catch (error) {
    console.error('Error updating course:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
});

// Delete a single course (organization and admin)
app.delete('/api/organizations/courses/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const courses = await readCourses();
    const courseIndex = courses.findIndex(c => c.id === id);
    
    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }
    
    const course = courses[courseIndex];
    
    // Check organization access
    if (req.organizationFilter && course.organizationId !== req.organizationFilter) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // TODO: Check if course is in use (when schedule feature is implemented)
    
    // Update packages that contain this course
    await updatePackagesForDeletedCourse(id);
    
    courses.splice(courseIndex, 1);
    await writeCourses(courses);
    
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// Delete multiple courses (organization and admin)
app.delete('/api/organizations/courses', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { courseIds } = req.body;
    
    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ error: 'courseIds array is required' });
    }
    
    const courses = await readCourses();
    let deletedCount = 0;
    
    // Filter courses to delete
    const coursesToDelete = courses.filter(c => {
      // Check organization access
      if (req.organizationFilter && c.organizationId !== req.organizationFilter) {
        return false;
      }
      return courseIds.includes(c.id);
    });
    
    // Remove courses
    const remainingCourses = courses.filter(c => !courseIds.includes(c.id) || 
      (req.organizationFilter && c.organizationId !== req.organizationFilter));
    
    deletedCount = coursesToDelete.length;
    
    await writeCourses(remainingCourses);
    
    res.json({ 
      message: `${deletedCount} course(s) deleted successfully`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error deleting courses:', error);
    res.status(500).json({ error: 'Failed to delete courses' });
  }
});

// ==================== Course Package Management API ====================

// Get all packages for an organization (organization and admin)
app.get('/api/organizations/packages', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    // Check and update expired packages
    let packages = await checkExpiredPackages();
    
    // Filter by organization
    if (req.organizationFilter) {
      packages = packages.filter(p => p.organizationId === req.organizationFilter);
    }
    
    // Sort by createdAt (newest first) by default
    packages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json(packages);
  } catch (error) {
    console.error('Error getting packages:', error);
    res.status(500).json({ error: 'Failed to get packages' });
  }
});

// Create a new package (organization and admin)
app.post('/api/organizations/packages', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { name, courses, priceStrategy, fixedPrice, discountPercentage, customPrice, monthlyLessonPrice, monthlyPeriod, description, startDate, endDate, status } = req.body;
    
    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Package name is required' });
    }
    
    if (name.length > 50) {
      return res.status(400).json({ error: 'Package name must be 50 characters or less' });
    }
    
    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({ error: 'At least one course is required' });
    }
    
    // Validate courses array
    for (const course of courses) {
      if (!course.courseId || !course.quantity) {
        return res.status(400).json({ error: 'Each course must have courseId and quantity' });
      }
      if (typeof course.quantity !== 'number' || course.quantity < 1 || course.quantity > 999 || !Number.isInteger(course.quantity)) {
        return res.status(400).json({ error: 'Quantity must be an integer between 1 and 999' });
      }
    }
    
    // Validate price strategy
    if (!priceStrategy || !['fixed', 'discount', 'custom', 'monthly'].includes(priceStrategy)) {
      return res.status(400).json({ error: 'Price strategy must be fixed, discount, custom, or monthly' });
    }
    
    // Validate price based on strategy
    if (priceStrategy === 'fixed') {
      if (fixedPrice === undefined || fixedPrice === null) {
        return res.status(400).json({ error: 'Fixed price is required for fixed price strategy' });
      }
      const priceNum = parseFloat(fixedPrice);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Fixed price must be a valid number greater than or equal to 0' });
      }
    } else if (priceStrategy === 'discount') {
      if (discountPercentage === undefined || discountPercentage === null) {
        return res.status(400).json({ error: 'Discount percentage is required for discount strategy' });
      }
      const discountNum = parseFloat(discountPercentage);
      if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
        return res.status(400).json({ error: 'Discount percentage must be a number between 0 and 100' });
      }
    } else if (priceStrategy === 'custom') {
      if (customPrice === undefined || customPrice === null) {
        return res.status(400).json({ error: 'Custom price is required for custom price strategy' });
      }
      const priceNum = parseFloat(customPrice);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Custom price must be a valid number greater than or equal to 0' });
      }
    } else if (priceStrategy === 'monthly') {
      if (monthlyLessonPrice === undefined || monthlyLessonPrice === null || monthlyPeriod === undefined || monthlyPeriod === null) {
        return res.status(400).json({ error: 'Monthly price and period are required' });
      }
      const priceNum = parseFloat(monthlyLessonPrice);
      const periodNum = parseInt(monthlyPeriod);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Monthly price must be >= 0' });
      }
      if (isNaN(periodNum) || periodNum < 1) {
        return res.status(400).json({ error: 'Period must be >= 1' });
      }
    }
    
    // Validate dates if provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      if (end <= start) {
        return res.status(400).json({ error: 'End date must be after start date' });
      }
    }
    
    // Validate description length
    if (description && description.length > 500) {
      return res.status(400).json({ error: 'Description must be 500 characters or less' });
    }
    
    // Get organization ID
    let organizationId;
    if (req.user.role === 'admin') {
      organizationId = req.body.organizationId || req.organizationFilter;
      if (!organizationId) {
        return res.status(400).json({ error: 'organizationId is required for admin' });
      }
    } else {
      organizationId = req.user.organizationId || req.organizationFilter;
      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }
    }
    
    // Check if package name already exists in this organization
    const packages = await readPackages();
    const existingPackage = packages.find(p => 
      p.organizationId === organizationId && 
      p.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    
    if (existingPackage) {
      return res.status(400).json({ error: 'Package name already exists in this organization' });
    }
    
    // Verify all courses exist and belong to the organization
    const allCourses = await readCourses();
    for (const courseItem of courses) {
      const course = allCourses.find(c => c.id === courseItem.courseId);
      if (!course) {
        return res.status(400).json({ error: `Course with ID ${courseItem.courseId} not found` });
      }
      if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: `Course ${courseItem.courseId} does not belong to this organization` });
      }
    }
    
    // Create new package
    const newPackage = {
      id: `package_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId: organizationId,
      name: name.trim(),
      courses: courses,
      priceStrategy: priceStrategy,
      fixedPrice: priceStrategy === 'fixed' ? parseFloat(fixedPrice) : null,
      discountPercentage: priceStrategy === 'discount' ? parseFloat(discountPercentage) : null,
      customPrice: priceStrategy === 'custom' ? parseFloat(customPrice) : null,
      monthlyLessonPrice: priceStrategy === 'monthly' ? parseFloat(monthlyLessonPrice) : null,
      monthlyPeriod: priceStrategy === 'monthly' ? parseInt(monthlyPeriod) : null,
      description: description ? description.trim() : null,
      startDate: startDate || null,
      endDate: endDate || null,
      status: status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    packages.push(newPackage);
    await writePackages(packages);
    
    res.status(201).json(newPackage);
  } catch (error) {
    console.error('Error creating package:', error);
    res.status(500).json({ error: 'Failed to create package' });
  }
});

// Update a package (organization and admin)
app.put('/api/organizations/packages/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, courses, priceStrategy, fixedPrice, discountPercentage, customPrice, monthlyLessonPrice, monthlyPeriod, description, startDate, endDate, status } = req.body;
    
    const packages = await readPackages();
    const packageIndex = packages.findIndex(p => p.id === id);
    
    if (packageIndex === -1) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const pkg = packages[packageIndex];
    
    // Check organization access
    if (req.organizationFilter && pkg.organizationId !== req.organizationFilter) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validation
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Package name is required' });
      }
      if (name.length > 50) {
        return res.status(400).json({ error: 'Package name must be 50 characters or less' });
      }
      
      // Check if package name already exists in this organization (excluding current package)
      const existingPackage = packages.find(p => 
        p.id !== id &&
        p.organizationId === pkg.organizationId && 
        p.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      
      if (existingPackage) {
        return res.status(400).json({ error: 'Package name already exists in this organization' });
      }
      
      pkg.name = name.trim();
    }
    
    if (courses !== undefined) {
      if (!Array.isArray(courses) || courses.length === 0) {
        return res.status(400).json({ error: 'At least one course is required' });
      }
      
      // Validate courses array
      for (const course of courses) {
        if (!course.courseId || !course.quantity) {
          return res.status(400).json({ error: 'Each course must have courseId and quantity' });
        }
        if (typeof course.quantity !== 'number' || course.quantity < 1 || course.quantity > 999 || !Number.isInteger(course.quantity)) {
          return res.status(400).json({ error: 'Quantity must be an integer between 1 and 999' });
        }
      }
      
      // Verify all courses exist and belong to the organization
      const allCourses = await readCourses();
      for (const courseItem of courses) {
        const course = allCourses.find(c => c.id === courseItem.courseId);
        if (!course) {
          return res.status(400).json({ error: `Course with ID ${courseItem.courseId} not found` });
        }
        if (course.organizationId !== pkg.organizationId) {
          return res.status(403).json({ error: `Course ${courseItem.courseId} does not belong to this organization` });
        }
      }
      
      pkg.courses = courses;
    }
    
    if (priceStrategy !== undefined) {
      if (!['fixed', 'discount', 'custom', 'monthly'].includes(priceStrategy)) {
        return res.status(400).json({ error: 'Price strategy must be fixed, discount, custom, or monthly' });
      }
      pkg.priceStrategy = priceStrategy;
    }
    
    if (fixedPrice !== undefined) pkg.fixedPrice = fixedPrice;
    if (discountPercentage !== undefined) pkg.discountPercentage = discountPercentage;
    if (customPrice !== undefined) pkg.customPrice = customPrice;
    if (monthlyLessonPrice !== undefined) pkg.monthlyLessonPrice = monthlyLessonPrice;
    if (monthlyPeriod !== undefined) pkg.monthlyPeriod = monthlyPeriod;
    
    if (pkg.priceStrategy === 'fixed') {
        if (pkg.fixedPrice === undefined || pkg.fixedPrice === null) return res.status(400).json({ error: 'Fixed price required' });
        const num = parseFloat(pkg.fixedPrice);
        if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid fixed price' });
        pkg.fixedPrice = num;
        pkg.discountPercentage = null;
        pkg.customPrice = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
    } else if (pkg.priceStrategy === 'discount') {
        if (pkg.discountPercentage === undefined || pkg.discountPercentage === null) return res.status(400).json({ error: 'Discount required' });
        const num = parseFloat(pkg.discountPercentage);
        if (isNaN(num) || num < 0 || num > 100) return res.status(400).json({ error: 'Invalid discount' });
        pkg.discountPercentage = num;
        pkg.fixedPrice = null;
        pkg.customPrice = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
    } else if (pkg.priceStrategy === 'custom') {
        if (pkg.customPrice === undefined || pkg.customPrice === null) return res.status(400).json({ error: 'Custom price required' });
        const num = parseFloat(pkg.customPrice);
        if (isNaN(num) || num < 0) return res.status(400).json({ error: 'Invalid custom price' });
        pkg.customPrice = num;
        pkg.fixedPrice = null;
        pkg.discountPercentage = null;
        pkg.monthlyLessonPrice = null;
        pkg.monthlyPeriod = null;
    } else if (pkg.priceStrategy === 'monthly') {
        if (pkg.monthlyLessonPrice === undefined || pkg.monthlyLessonPrice === null || !pkg.monthlyPeriod) return res.status(400).json({ error: 'Monthly price/period required' });
        const priceNum = parseFloat(pkg.monthlyLessonPrice);
        const periodNum = parseInt(pkg.monthlyPeriod);
        if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Invalid monthly price' });
        if (isNaN(periodNum) || periodNum < 1) return res.status(400).json({ error: 'Invalid period' });
        pkg.monthlyLessonPrice = priceNum;
        pkg.monthlyPeriod = periodNum;
        pkg.fixedPrice = null;
        pkg.discountPercentage = null;
        pkg.customPrice = null;
    }
    
    if (description !== undefined) {
      if (description && description.length > 500) {
        return res.status(400).json({ error: 'Description must be 500 characters or less' });
      }
      pkg.description = description ? description.trim() : null;
    }
    
    if (startDate !== undefined || endDate !== undefined) {
      const start = startDate ? new Date(startDate) : (pkg.startDate ? new Date(pkg.startDate) : null);
      const end = endDate ? new Date(endDate) : (pkg.endDate ? new Date(pkg.endDate) : null);
      
      if (start && end) {
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({ error: 'Invalid date format' });
        }
        if (end <= start) {
          return res.status(400).json({ error: 'End date must be after start date' });
        }
      }
      
      if (startDate !== undefined) {
        pkg.startDate = startDate || null;
      }
      if (endDate !== undefined) {
        pkg.endDate = endDate || null;
      }
    }
    
    if (status !== undefined) {
      if (!['active', 'inactive', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Status must be active, inactive, or archived' });
      }
      pkg.status = status;
    }
    
    pkg.updatedAt = new Date().toISOString();
    
    packages[packageIndex] = pkg;
    await writePackages(packages);
    
    res.json(pkg);
  } catch (error) {
    console.error('Error updating package:', error);
    res.status(500).json({ error: 'Failed to update package' });
  }
});

// Delete a package (organization and admin)
app.delete('/api/organizations/packages/:id', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { id } = req.params;
    
    const packages = await readPackages();
    const packageIndex = packages.findIndex(p => p.id === id);
    
    if (packageIndex === -1) {
      return res.status(404).json({ error: 'Package not found' });
    }
    
    const pkg = packages[packageIndex];
    
    // Check organization access
    if (req.organizationFilter && pkg.organizationId !== req.organizationFilter) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // TODO: Check if package has purchase records (when accounting/sales feature is implemented)
    // For now, we'll mark as archived if it has been used (status check)
    // In the future, we'll check actual purchase records
    
    // For now, we'll allow deletion, but in the future we'll check purchase records
    // and mark as archived instead of deleting
    packages.splice(packageIndex, 1);
    await writePackages(packages);
    
    res.json({ message: 'Package deleted successfully' });
  } catch (error) {
    console.error('Error deleting package:', error);
    res.status(500).json({ error: 'Failed to delete package' });
  }
});

// ==================== Timetable Management API ====================

// Get timetable entries (organization and teacher)
app.get('/api/organizations/timetable', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const timetableData = await readTimetable();
    
    // Filter by organization
    let filteredEntries = timetableData.entries;
    if (req.organizationFilter) {
      filteredEntries = timetableData.entries.filter(e => e.organizationId === req.organizationFilter);
    }
    
    const enrollmentsData = await readEnrollments();
    let filteredEnrollments = enrollmentsData;
    if (req.organizationFilter) {
      filteredEnrollments = enrollmentsData.filter(e => e.organizationId === req.organizationFilter);
    }
    
    res.json({
      entries: filteredEntries,
      metadata: timetableData.metadata,
      enrollments: filteredEnrollments
    });
  } catch (error) {
    console.error('Error getting timetable:', error);
    res.status(500).json({ error: 'Failed to get timetable' });
  }
});

// Get timetable entries for teacher (read-only)
app.get('/api/teachers/timetable', authenticateUser, authorizeRole('teacher'), async (req, res) => {
  try {
    const users = await readUsers();
    const teacher = users.find(u => u.id === req.user.id);
    
    if (!teacher || !teacher.organizationId) {
      return res.status(403).json({ error: 'Teacher organization not found' });
    }
    
    const timetableData = await readTimetable();
    const filteredEntries = timetableData.entries.filter(e => e.organizationId === teacher.organizationId);
    
    const enrollmentsData = await readEnrollments();
    const filteredEnrollments = enrollmentsData.filter(e => e.organizationId === teacher.organizationId);
    
    res.json({
      entries: filteredEntries,
      metadata: timetableData.metadata,
      enrollments: filteredEnrollments
    });
  } catch (error) {
    console.error('Error getting teacher timetable:', error);
    res.status(500).json({ error: 'Failed to get timetable' });
  }
});

// Create timetable entry (organization only)
app.post('/api/organizations/timetable', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { className, startTime, endTime, isRecurring, dayOfWeek, date, startDate, endDate, courseIds, teacherIds, classroom, studentIds, exceptions } = req.body;
    
    // Validation
    if (!className || className.trim().length === 0) {
      return res.status(400).json({ error: 'Class name is required' });
    }
    
    if (className.length > 50) {
      return res.status(400).json({ error: 'Class name must be 50 characters or less' });
    }
    
    if (!startTime || !endTime) {
      return res.status(400).json({ error: 'Start time and end time are required' });
    }
    
    // Validate time format (HH:MM)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
    }
    
    // Validate start time is before end time
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes >= endMinutes) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }
    
    if (isRecurring === undefined) {
      return res.status(400).json({ error: 'isRecurring is required' });
    }
    
    if (isRecurring) {
      if (!dayOfWeek || !Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
        return res.status(400).json({ error: 'dayOfWeek array is required for recurring classes' });
      }
      
      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const invalidDays = dayOfWeek.filter(d => !validDays.includes(d));
      if (invalidDays.length > 0) {
        return res.status(400).json({ error: `Invalid day(s): ${invalidDays.join(', ')}` });
      }

      // Validate startDate and endDate if present
      if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start > end) {
          return res.status(400).json({ error: 'Start date cannot be after end date' });
        }
      }
    } else {
      if (!date) {
        return res.status(400).json({ error: 'date is required for non-recurring classes' });
      }
    }
    
    if (classroom && classroom.length > 50) {
      return res.status(400).json({ error: 'Classroom name must be 50 characters or less' });
    }
    
    // Get organization ID
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }
    
    // Generate unique ID
    const id = `timetable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create new timetable entry
    const newEntry = {
      id,
      organizationId: orgUser.organizationId,
      className: className.trim(),
      startTime,
      endTime,
      isRecurring,
      dayOfWeek: isRecurring ? dayOfWeek : null,
      date: isRecurring ? null : date,
      startDate: isRecurring ? (startDate || null) : null,
      endDate: isRecurring ? (endDate || null) : null,
      courseIds: Array.isArray(courseIds) ? courseIds : [],
      teacherIds: Array.isArray(teacherIds) ? teacherIds : [],
      classroom: classroom ? classroom.trim() : null,
      studentIds: Array.isArray(studentIds) ? studentIds : [],
      exceptions: Array.isArray(exceptions) ? exceptions : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Read timetable data
    const timetableData = await readTimetable();
    
    // Add entry
    timetableData.entries.push(newEntry);
    
    // Update metadata (classNames and classrooms)
    if (!timetableData.metadata.classNames.includes(className.trim())) {
      timetableData.metadata.classNames.push(className.trim());
    }
    if (classroom && classroom.trim() && !timetableData.metadata.classrooms.includes(classroom.trim())) {
      timetableData.metadata.classrooms.push(classroom.trim());
    }
    
    await writeTimetable(timetableData);
    
    res.status(201).json(newEntry);
  } catch (error) {
    console.error('Error creating timetable entry:', error);
    res.status(500).json({ error: 'Failed to create timetable entry' });
  }
});

// Update timetable entry (organization only)
app.put('/api/organizations/timetable/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { id } = req.params;
    const { className, startTime, endTime, isRecurring, dayOfWeek, date, startDate, endDate, courseIds, teacherIds, classroom, studentIds, exceptions } = req.body;
    
    const timetableData = await readTimetable();
    const entryIndex = timetableData.entries.findIndex(e => e.id === id);
    
    if (entryIndex === -1) {
      return res.status(404).json({ error: 'Timetable entry not found' });
    }
    
    const entry = timetableData.entries[entryIndex];
    
    // Verify organization access
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
      return res.status(403).json({ error: 'You don\'t have permission to update this timetable entry' });
    }
    
    // Validation (same as create)
    if (className !== undefined) {
      if (!className || className.trim().length === 0) {
        return res.status(400).json({ error: 'Class name is required' });
      }
      if (className.length > 50) {
        return res.status(400).json({ error: 'Class name must be 50 characters or less' });
      }
    }
    
    if (startTime !== undefined || endTime !== undefined) {
      const finalStartTime = startTime !== undefined ? startTime : entry.startTime;
      const finalEndTime = endTime !== undefined ? endTime : entry.endTime;
      
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(finalStartTime) || !timeRegex.test(finalEndTime)) {
        return res.status(400).json({ error: 'Time must be in HH:MM format (24-hour)' });
      }
      
      const [startHour, startMin] = finalStartTime.split(':').map(Number);
      const [endHour, endMin] = finalEndTime.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      if (startMinutes >= endMinutes) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }
    }
    
    if (isRecurring !== undefined) {
      if (isRecurring) {
        if (!dayOfWeek || !Array.isArray(dayOfWeek) || dayOfWeek.length === 0) {
          return res.status(400).json({ error: 'dayOfWeek array is required for recurring classes' });
        }
        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const invalidDays = dayOfWeek.filter(d => !validDays.includes(d));
        if (invalidDays.length > 0) {
          return res.status(400).json({ error: `Invalid day(s): ${invalidDays.join(', ')}` });
        }

        // Validate startDate and endDate if present
        // Need to check against either the new values or existing ones if not provided, 
        // but since the payload sends what is changing, if user only changes endDate, we should check against new endDate and (new or old) startDate.
        // However, simpler logic: if dates are provided in update, validate them.
        const newStart = startDate !== undefined ? startDate : entry.startDate;
        const newEnd = endDate !== undefined ? endDate : entry.endDate;
        
        if (newStart && newEnd) {
            const s = new Date(newStart);
            const e = new Date(newEnd);
            if (s > e) {
                return res.status(400).json({ error: 'Start date cannot be after end date' });
            }
        }
      } else {
        if (!date) {
          return res.status(400).json({ error: 'date is required for non-recurring classes' });
        }
      }
    }
    
    if (classroom && classroom.length > 50) {
      return res.status(400).json({ error: 'Classroom name must be 50 characters or less' });
    }
    
    // Update entry
    if (className !== undefined) entry.className = className.trim();
    if (startTime !== undefined) entry.startTime = startTime;
    if (endTime !== undefined) entry.endTime = endTime;
    if (isRecurring !== undefined) {
      entry.isRecurring = isRecurring;
      entry.dayOfWeek = isRecurring ? dayOfWeek : null;
      entry.date = isRecurring ? null : date;
      // If switching to recurring, set start/end dates. If staying recurring, update if provided.
      if (isRecurring) {
          if (startDate !== undefined) entry.startDate = startDate || null;
          if (endDate !== undefined) entry.endDate = endDate || null;
      } else {
          entry.startDate = null;
          entry.endDate = null;
      }
    } else if (entry.isRecurring) {
        // If not changing isRecurring status but updating dates for a recurring event
        if (startDate !== undefined) entry.startDate = startDate || null;
        if (endDate !== undefined) entry.endDate = endDate || null;
    }

    if (courseIds !== undefined) entry.courseIds = Array.isArray(courseIds) ? courseIds : [];
    if (teacherIds !== undefined) entry.teacherIds = Array.isArray(teacherIds) ? teacherIds : [];
    if (classroom !== undefined) entry.classroom = classroom ? classroom.trim() : null;
    if (studentIds !== undefined) entry.studentIds = Array.isArray(studentIds) ? studentIds : [];
    if (exceptions !== undefined) entry.exceptions = Array.isArray(exceptions) ? exceptions : [];
    entry.updatedAt = new Date().toISOString();
    
    // Update metadata
    if (className && !timetableData.metadata.classNames.includes(className.trim())) {
      timetableData.metadata.classNames.push(className.trim());
    }
    if (classroom && classroom.trim() && !timetableData.metadata.classrooms.includes(classroom.trim())) {
      timetableData.metadata.classrooms.push(classroom.trim());
    }
    
    timetableData.entries[entryIndex] = entry;
    await writeTimetable(timetableData);
    
    res.json(entry);
  } catch (error) {
    console.error('Error updating timetable entry:', error);
    res.status(500).json({ error: 'Failed to update timetable entry' });
  }
});

// Delete timetable entry (organization only)
app.delete('/api/organizations/timetable/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const timetableData = await readTimetable();
    const entryIndex = timetableData.entries.findIndex(e => e.id === id);
    
    if (entryIndex === -1) {
      return res.status(404).json({ error: 'Timetable entry not found' });
    }
    
    const entry = timetableData.entries[entryIndex];
    
    // Verify organization access
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
      return res.status(403).json({ error: 'You don\'t have permission to delete this timetable entry' });
    }
    
    // Remove entry
    timetableData.entries.splice(entryIndex, 1);
    await writeTimetable(timetableData);
    
    res.json({ message: 'Timetable entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({ error: 'Failed to delete timetable entry' });
  }
});

// Delete specific instance of recurring class
app.post('/api/organizations/timetable/:id/delete-instance', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { id } = req.params;
    const { date, mode } = req.body; // mode: 'single' or 'future'
    
    const timetableData = await readTimetable();
    const entryIndex = timetableData.entries.findIndex(e => e.id === id);
    
    if (entryIndex === -1) return res.status(404).json({ error: 'Entry not found' });
    const entry = timetableData.entries[entryIndex];
    
    // Verify Org
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId || entry.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    if (mode === 'single') {
        if (!entry.exceptions) entry.exceptions = [];
        if (!entry.exceptions.includes(date)) {
            entry.exceptions.push(date);
        }
    } else if (mode === 'future') {
        // Set endDate to the day before
        const targetDate = new Date(date);
        targetDate.setDate(targetDate.getDate() - 1);
        entry.endDate = targetDate.toISOString();
    }
    
    entry.updatedAt = new Date().toISOString();
    timetableData.entries[entryIndex] = entry;
    await writeTimetable(timetableData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting instance:', error);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// Makeup Class - Drop original and enroll to new class
app.post('/api/organizations/timetable/makeup', authenticateUser, authorizeRole('organization'), async (req, res) => {
  const logs = [];
  const log = (msg) => {
    console.log('[MAKEUP]', msg);
    logs.push(String(msg)); // Ensure msg is a string to avoid JSON serialization issues
  };

  try {
    const { studentId, fromEntryId, fromDate, toEntryId, toDate, studentName } = req.body;

    log(`Makeup request: ${studentName} (${studentId}) from ${fromEntryId} on ${fromDate} to ${toEntryId} on ${toDate}`);

    if (!studentId || !fromEntryId || !fromDate || !toEntryId || !toDate) {
      return res.status(400).json({ error: 'Missing required fields', logs });
    }

    // Check user authentication
    if (!req.user || !req.user.organizationId) {
      log('Error: User not authenticated or missing organizationId');
      return res.status(403).json({ error: 'Authentication required', logs });
    }

    const enrollments = await readEnrollments();
    const timetableData = await readTimetable();
    log(`Loaded ${enrollments.length} enrollments`);

    // Debug: Log first few enrollments to understand structure
    if (enrollments.length > 0) {
      log(`Sample enrollment: ${JSON.stringify(enrollments[0])}`);
    }

    // Step 1: Find and drop the original enrollment or student from entry
    log('Step 1: Finding original enrollment/student to drop');
    log(`Looking for studentId: ${studentId}, timetableEntryId: ${fromEntryId}, date: ${fromDate}`);

    // First, check if student is in enrollments
    const studentEnrollments = enrollments.filter(e => String(e.studentId) === String(studentId));
    log(`Student has ${studentEnrollments.length} total enrollments`);

    const originalEnrollmentIndex = enrollments.findIndex(e =>
      String(e.studentId) === String(studentId) &&
      e.timetableEntryId === fromEntryId &&
      e.date === fromDate
    );

    let studentRemoved = false;

    if (originalEnrollmentIndex !== -1) {
      const originalEnrollment = enrollments[originalEnrollmentIndex];
      log(`Found original enrollment: ${originalEnrollment.id}`);

      // Remove the original enrollment
      enrollments.splice(originalEnrollmentIndex, 1);
      log('Original enrollment dropped');
      studentRemoved = true;
    } else {
      // Check if student is directly in timetable entry studentIds
      const fromEntry = timetableData.entries.find(e => e.id === fromEntryId);
      if (fromEntry && fromEntry.studentIds && fromEntry.studentIds.includes(studentId)) {
        const studentIndex = fromEntry.studentIds.indexOf(studentId);
        fromEntry.studentIds.splice(studentIndex, 1);
        log(`Student removed from entry.studentIds at index ${studentIndex}`);
        studentRemoved = true;
      } else {
        log('Warning: Student not found in enrollments or entry.studentIds');
      }
    }

    if (!studentRemoved) {
      log('Warning: Student was not removed from original class, proceeding with new enrollment anyway');
    }

    // Step 2: Create new enrollment for the target class
    log('Step 2: Creating new enrollment for target class');

    // Check if already enrolled in target class (enrollment)
    const existingTargetEnrollment = enrollments.find(e =>
      String(e.studentId) === String(studentId) &&
      e.timetableEntryId === toEntryId &&
      e.date === toDate
    );

    // Check if already in target entry studentIds
    const toEntry = timetableData.entries.find(e => e.id === toEntryId);
    const alreadyInTargetEntry = toEntry && toEntry.studentIds && toEntry.studentIds.includes(studentId);

    if (existingTargetEnrollment || alreadyInTargetEntry) {
      log(`Student already in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
    } else {
      // Create new enrollment
      const newEnrollment = {
        id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: req.user.organizationId,
        studentId,
        timetableEntryId: toEntryId,
        date: toDate,
        type: 'single',
        notes: `Makeup from ${fromDate} (${fromEntryId})`,
        createdAt: new Date().toISOString(),
        makeupFrom: {
          entryId: fromEntryId,
          date: fromDate,
          reason: 'student_makeup'
        }
      };

      enrollments.push(newEnrollment);
      log(`New enrollment created: ${newEnrollment.id}`);
    }

    // Step 3: Save changes
    await writeEnrollments(enrollments);
    log('Enrollments saved successfully');

    // Save timetable data if it was modified (studentIds changed)
    await writeTimetable(timetableData);
    log('Timetable data saved successfully');

    // Note: Frontend will automatically reload data after successful response

    log('Makeup process completed successfully');
    res.json({
      success: true,
      message: 'Student makeup completed',
      logs,
      data: {
        droppedEnrollment: originalEnrollmentIndex !== -1,
        newEnrollmentCreated: !existingTargetEnrollment,
        fromClass: fromEntryId,
        toClass: toEntryId,
        fromDate,
        toDate
      }
    });

  } catch (error) {
    console.error('Error processing makeup:', error);
    log(`Error: ${error.message}`);
    res.status(500).json({ error: 'Failed to process makeup', logs });
  }
});

// Postpone Class - Drop current class and enroll in next week's same class
app.post('/api/organizations/timetable/postpone', authenticateUser, authorizeRole('organization'), async (req, res) => {
  const logs = [];
  const log = (msg) => {
    console.log('[POSTPONE]', msg);
    logs.push(String(msg));
  };

  try {
    const { timetableEntryId, date, studentId } = req.body;

    log(`Postpone request: student ${studentId} from entry ${timetableEntryId} on ${date}`);

    if (!timetableEntryId || !date || !studentId) {
      return res.status(400).json({ error: 'Missing required fields: timetableEntryId, date, studentId', logs });
    }

    // Check user authentication
    if (!req.user || !req.user.organizationId) {
      log('Error: User not authenticated or missing organizationId');
      return res.status(403).json({ error: 'Authentication required', logs });
    }

    const enrollments = await readEnrollments();
    const timetableData = await readTimetable();
    log(`Loaded ${enrollments.length} enrollments, ${timetableData.entries.length} timetable entries`);

    // Find the timetable entry
    const entry = timetableData.entries.find(e => e.id === timetableEntryId);
    if (!entry) {
      return res.status(404).json({ error: 'Timetable entry not found', logs });
    }

    // Verify organization access
    if (entry.organizationId !== req.user.organizationId) {
      return res.status(403).json({ error: 'Access denied to this timetable entry', logs });
    }

    // Step 1: Drop student from current class
    log('Step 1: Dropping student from current class');

    let studentRemoved = false;
    const originalEnrollmentIndex = enrollments.findIndex(e =>
      String(e.studentId) === String(studentId) &&
      e.timetableEntryId === timetableEntryId &&
      e.date === date
    );

    if (originalEnrollmentIndex !== -1) {
      const originalEnrollment = enrollments[originalEnrollmentIndex];
      log(`Found and removing enrollment: ${originalEnrollment.id}`);
      enrollments.splice(originalEnrollmentIndex, 1);
      studentRemoved = true;
    } else {
      // Check if student is in entry.studentIds
      if (entry.studentIds && entry.studentIds.includes(studentId)) {
        const studentIndex = entry.studentIds.indexOf(studentId);
        entry.studentIds.splice(studentIndex, 1);
        log(`Removed student from entry.studentIds at index ${studentIndex}`);
        studentRemoved = true;
      }
    }

    if (!studentRemoved) {
      log('Warning: Student was not found in current class, proceeding with new enrollment');
    }

    // Step 2: Find student's last enrollment (excluding the current one we just dropped)
    log('Step 2: Finding student\'s last enrollment');

    const studentEnrollments = enrollments.filter(e =>
      String(e.studentId) === String(studentId) &&
      e.date !== date // Exclude the one we just dropped
    ).sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date descending

    log(`Student has ${studentEnrollments.length} historical enrollments`);

    let targetEntryId = timetableEntryId; // Default to same class
    let targetDate = null;

    if (studentEnrollments.length > 0) {
      // Use the last enrollment's entry and calculate next week
      const lastEnrollment = studentEnrollments[0];
      targetEntryId = lastEnrollment.timetableEntryId;
      const lastDate = new Date(lastEnrollment.date);
      lastDate.setDate(lastDate.getDate() + 7); // Add one week
      targetDate = lastDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD

      log(`Using last enrollment: ${lastEnrollment.id} from ${lastEnrollment.date}, target date: ${targetDate}`);
    } else {
      // No historical enrollments, just postpone current class by one week
      const currentDate = new Date(date);
      currentDate.setDate(currentDate.getDate() + 7);
      targetDate = currentDate.toISOString().split('T')[0];

      log(`No historical enrollments found, postponing current class to: ${targetDate}`);
    }

    // Step 3: Create new enrollment for next week
    log('Step 3: Creating new enrollment for next week');

    // Check if already enrolled in target class on target date
    const existingTargetEnrollment = enrollments.find(e =>
      String(e.studentId) === String(studentId) &&
      e.timetableEntryId === targetEntryId &&
      e.date === targetDate
    );

    const targetEntry = timetableData.entries.find(e => e.id === targetEntryId);
    const alreadyInTargetEntry = targetEntry && targetEntry.studentIds && targetEntry.studentIds.includes(studentId);

    if (existingTargetEnrollment || alreadyInTargetEntry) {
      log(`Student already enrolled in target class (enrollment: ${!!existingTargetEnrollment}, entry: ${!!alreadyInTargetEntry})`);
    } else {
      // Create new enrollment
      const newEnrollment = {
        id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: req.user.organizationId,
        studentId,
        timetableEntryId: targetEntryId,
        date: targetDate,
        type: 'single',
        notes: `Postponed from ${date} (${timetableEntryId})`,
        createdAt: new Date().toISOString(),
        postponedFrom: {
          entryId: timetableEntryId,
          date: date,
          reason: 'student_postpone'
        }
      };

      enrollments.push(newEnrollment);
      log(`New enrollment created: ${newEnrollment.id} for ${targetDate}`);
    }

    // Step 4: Save changes
    await writeEnrollments(enrollments);
    log('Enrollments saved successfully');

    await writeTimetable(timetableData);
    log('Timetable data saved successfully');

    log('Postpone process completed successfully');
    res.json({
      success: true,
      message: 'Class postponed successfully',
      logs,
      data: {
        droppedFromClass: timetableEntryId,
        droppedFromDate: date,
        enrolledToClass: targetEntryId,
        enrolledToDate: targetDate,
        studentRemoved,
        newEnrollmentCreated: !existingTargetEnrollment && !alreadyInTargetEntry
      }
    });

  } catch (error) {
    console.error('Error processing postpone:', error);
    log(`Error: ${error.message}`);
    res.status(500).json({ error: 'Failed to process postpone', logs });
  }
});

// ==================== Teacher Management API ====================

// Teacher: Chess.com settings (persisted on server, org-scoped)
app.get('/api/teachers/chesscom/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = String(req.user.organizationId || req.organizationFilter || '');
    if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
    const orgs = await readChessComSettings();
    const settings = (orgs && orgs[orgId] && typeof orgs[orgId] === 'object') ? orgs[orgId] : {};
    return res.json({ ok: true, orgId, settings });
  } catch (e) {
    console.error('GET /api/teachers/chesscom/settings error:', e);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.put('/api/teachers/chesscom/settings', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = String(req.user.organizationId || req.organizationFilter || '');
    if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const settings = incoming.settings && typeof incoming.settings === 'object' ? incoming.settings : null;
    if (!settings) return res.status(400).json({ error: 'settings is required' });

    // Validate + normalize
    const clean = {};
    for (const [studentId, entry] of Object.entries(settings)) {
      const sid = String(studentId || '').trim();
      if (!sid) continue;
      const chessId = String(entry?.chessId ?? '').trim();
      if (!chessId) continue;
      clean[sid] = { chessId, updatedAt: new Date().toISOString() };
    }

    const orgs = await readChessComSettings();
    orgs[orgId] = clean;
    const ok = await writeChessComSettings(orgs);
    if (!ok) return res.status(500).json({ error: 'Failed to save settings' });
    return res.json({ ok: true, orgId, count: Object.keys(clean).length });
  } catch (e) {
    console.error('PUT /api/teachers/chesscom/settings error:', e);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Teacher: trigger Blunders sync (today, rapid/blitz, max 10 games per student)
app.post('/api/teachers/blunders/sync-today', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = String(req.user.organizationId || req.organizationFilter || '');
    if (!orgId) return res.status(403).json({ error: 'Teacher not associated with organization' });
    const data = await readData();
    const students = Array.isArray(data?.students) ? data.students.filter(s => String(s.organizationId || '') === orgId) : [];
    // Fire-and-forget per student (throttled inside)
    for (const s of students) {
      syncBlundersForStudent(s).catch(() => {});
    }
    return res.json({ ok: true, message: 'Sync started', students: students.length });
  } catch (e) {
    console.error('POST /api/teachers/blunders/sync-today error:', e);
    return res.status(500).json({ error: 'Failed to start sync' });
  }
});

// Teacher selects students for Class View
app.post('/api/teachers/class-view/students', authenticateUser, authorizeRole('teacher'), async (req, res) => {
  try {
    const { studentIds } = req.body;
    
    if (!Array.isArray(studentIds)) {
      return res.status(400).json({ error: 'studentIds must be an array' });
    }
    
    // Get teacher
    const users = await readUsers();
    const teacher = users.find(u => u.id === req.user.id);
    
    if (!teacher || !teacher.organizationId) {
      return res.status(403).json({ error: 'Teacher not found' });
    }
    
    // Verify all students belong to the same organization
    const data = await readData();
    const students = data.students.filter(s => 
      studentIds.includes(s.id) && s.organizationId === teacher.organizationId
    );
    
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students not found or do not belong to your organization' });
    }
    
    // Update teacher's class view students
    teacher.classViewStudents = studentIds;
    
    const userIndex = users.findIndex(u => u.id === teacher.id);
    users[userIndex] = teacher;
    await writeUsers(users);
    
    res.json({
      message: 'Students added to Class View successfully',
      classViewStudents: studentIds,
      students: students
    });
  } catch (error) {
    console.error('Error updating class view students:', error);
    res.status(500).json({ error: 'Failed to update class view students' });
  }
});

// Teacher gets students for Class View
app.get('/api/teachers/class-view/students', authenticateUser, authorizeRole('teacher'), async (req, res) => {
  try {
    // Get teacher
    const users = await readUsers();
    const teacher = users.find(u => u.id === req.user.id);
    
    if (!teacher || !teacher.organizationId) {
      return res.status(403).json({ error: 'Teacher not found' });
    }
    
    // Get all students in the organization
    const data = await readData();
    const allStudents = data.students.filter(s => s.organizationId === teacher.organizationId);
    
    // Get selected students for Class View
    const selectedStudentIds = teacher.classViewStudents || [];
    const selectedStudents = allStudents.filter(s => selectedStudentIds.includes(s.id));
    
    res.json({
      allStudents: allStudents,
      selectedStudents: selectedStudents,
      selectedStudentIds: selectedStudentIds
    });
  } catch (error) {
    console.error('Error getting class view students:', error);
    res.status(500).json({ error: 'Failed to get class view students' });
  }
});

// ==================== Student API (existing) ====================

// Get all students data (with data isolation)
app.get('/api/students', optionalAuth, async (req, res) => {
  try {
    const data = await readData();
    
    // Filter students by organization if user is authenticated
    let students = data.students;
    if (req.user) {
      // Apply organization filter if user is authenticated
      if (req.user.role === 'admin') {
        // Admin sees all students
      } else if (req.user.role === 'teacher') {
        // Teachers see all students in their organization (for Statistics leaderboard)
        if (req.user.organizationId) {
          students = filterStudentsByOrganization(students, req.user.organizationId);
        } else {
          students = [];
        }
      } else if (req.user.organizationId) {
        // Organization users see all students in their organization
        students = filterStudentsByOrganization(students, req.user.organizationId);
      } else {
        // If user has no organizationId, they see nothing
        students = [];
      }
    }
    
    // Update ranks for all students based on current scores
    students.forEach(student => {
      const rankInfo = getRankInfo(student.score || 0);
      student.rank = rankInfo.rank;
      student.rankIndex = rankInfo.rankIndex;
      student.level = rankInfo.rankIndex + 1;
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read students data' });
  }
});

// Add a new student (deprecated - use /api/organizations/students instead)
// Kept for backward compatibility, but requires organization authentication
app.post('/api/students', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { name, studentId } = req.body;
    if (!name || !studentId) {
      return res.status(400).json({ error: 'Name and Student ID are required' });
    }

    // Get user's organization
    const users = await readUsers();
    const user = users.find(u => u.id === req.user.id);
    let organizationId = null;
    
    if (user) {
      if (user.role === 'organization' && user.organizationId) {
        organizationId = user.organizationId;
      } else if (user.role === 'teacher' && user.organizationId) {
        organizationId = user.organizationId;
      } else if (user.role === 'admin') {
        // Admin can create students but need to specify organizationId
        organizationId = req.body.organizationId;
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required for admin' });
        }
      }
    }
    
    if (!organizationId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Organization authentication required' });
    }

    const data = await readData();
    
    // Check if student already exists in this organization
    const exists = data.students.find(s => 
      s.studentId === studentId && 
      (organizationId ? s.organizationId === organizationId : true)
    );
    if (exists) {
      return res.status(400).json({ error: 'Student ID already exists' });
    }

    const initialRankInfo = getRankInfo(0);
    const newStudent = {
      id: Date.now().toString(),
      name,
      studentId,
      organizationId: organizationId,
      answerCount: 0,
      totalAnswers: 0,
      correctAnswers: 0,
      level: 1,
      rank: 'Wood',
      rankIndex: 0,
      experience: 0,
      score: 0,
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
    
    // Update organization if exists
    if (organizationId) {
      const organizations = await readOrganizations();
      const organization = organizations.find(o => o.id === organizationId);
      if (organization) {
        organization.students.push(newStudent.id);
        await writeOrganizations(organizations);
      }
    }

    broadcast({ type: 'studentAdded', student: newStudent });
    res.json(newStudent);
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// Record an answer - changed to accept points (1-n), points added directly without multiplying
app.post('/api/students/:id/answer', async (req, res) => {
  try {
    const { id } = req.params;
    let { points = 1 } = req.body; // Changed from 'correct' to 'points'
    
    // Ensure points is a number and not multiplied
    points = parseInt(points, 10);
    
    if (!points || points < 1 || isNaN(points)) {
      return res.status(400).json({ error: 'Points must be a positive integer' });
    }
    
    // Debug logging - log what we received
    console.log(`[DEBUG SERVER START] Received request with points: ${points} (type: ${typeof points}), raw body:`, JSON.stringify(req.body));

    const data = await readData();
    const student = data.students.find(s => s.id === id);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Update student data - points added directly (no multiplication)
    // Force conversion to number and ensure no multiplication happens
    const pointsToAdd = Number(points);
    const oldScore = Number(student.score) || 0;
    
    // CRITICAL: Direct addition only - NO multiplication, NO factor of 10
    const newScore = oldScore + pointsToAdd;
    
    student.answerCount = (student.answerCount || 0) + 1;
    student.score = newScore; // Direct addition, NO multiplication
    student.experience = student.score;
    
    // Ensure score is stored as a number (not string)
    student.score = Number(student.score);
    
    // Update statistics
    updateStudentStats(student, pointsToAdd);
    
    // Debug logging - detailed verification
    console.log(`[DEBUG SERVER END] Student: ${student.name}`);
    console.log(`  - Points received from client: ${points}`);
    console.log(`  - Points to add (Number): ${pointsToAdd}`);
    console.log(`  - Old score: ${oldScore}`);
    console.log(`  - Calculation: ${oldScore} + ${pointsToAdd} = ${newScore}`);
    console.log(`  - Final score stored: ${student.score}`);

    // Calculate rank based on score
    const rankInfo = getRankInfo(student.score);
    student.rank = rankInfo.rank;
    student.rankIndex = rankInfo.rankIndex;
    student.level = rankInfo.rankIndex + 1; // Keep level for compatibility

    // Update challenge HP (deduct damage equal to points)
    if (!data.challenge) {
      data.challenge = {
        currentLevel: 1,
        currentHP: LEVELS[0].maxHP,
        completedLevels: [],
        totalDamage: 0,
        selectedStudentIds: [] // Store selected students in Class View
      };
    }
    // Ensure selectedStudentIds exists
    if (!data.challenge.selectedStudentIds) {
      data.challenge.selectedStudentIds = [];
    }
    
    const currentLevelInfo = LEVELS[data.challenge.currentLevel - 1];
    if (currentLevelInfo) {
      // Fix currentHP if it exceeds maxHP (due to config changes)
      if (data.challenge.currentHP > currentLevelInfo.maxHP) {
        data.challenge.currentHP = currentLevelInfo.maxHP;
      }
      
      // Deduct HP equal to points (each point = 1 HP damage)
      const damage = points;
      data.challenge.currentHP = Math.max(0, data.challenge.currentHP - damage);
      data.challenge.totalDamage = (data.challenge.totalDamage || 0) + damage;
      
      // Check if level is completed
      const levelCompleted = data.challenge.currentHP <= 0;
      let levelReward = null;
      
      if (levelCompleted && !data.challenge.completedLevels.includes(data.challenge.currentLevel)) {
        // Level completed! Give reward only to selected students in Class View
        levelReward = currentLevelInfo.reward;
        data.challenge.completedLevels.push(data.challenge.currentLevel);
        
        // Award points only to selected students in Class View
        const selectedIds = data.challenge.selectedStudentIds || [];
        if (selectedIds.length > 0) {
          selectedIds.forEach(studentId => {
            const student = data.students.find(s => s.id === studentId);
            if (student) {
              student.score = (student.score || 0) + levelReward;
              student.experience = student.score;
              const rankInfo = getRankInfo(student.score);
              student.rank = rankInfo.rank;
              student.rankIndex = rankInfo.rankIndex;
              student.level = rankInfo.rankIndex + 1;
            }
        });
        }
        
        // Move to next level
        if (data.challenge.currentLevel < LEVELS.length) {
          data.challenge.currentLevel += 1;
          const nextLevelInfo = LEVELS[data.challenge.currentLevel - 1];
          data.challenge.currentHP = nextLevelInfo.maxHP;
        }
        
        broadcast({ 
          type: 'levelCompleted', 
          level: data.challenge.currentLevel - 1,
          reward: levelReward,
          students: data.students
        });
      } else {
        // Broadcast damage dealt
        broadcast({ 
          type: 'damageDealt', 
          damage: damage,
          currentHP: data.challenge.currentHP,
          maxHP: currentLevelInfo.maxHP,
          level: data.challenge.currentLevel,
          studentName: student.name
        });
      }
    }

    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    broadcast({ type: 'answerRecorded', student, challenge: data.challenge });
    res.json({ student, challenge: data.challenge });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record answer' });
  }
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

// Update student manually (requires organization, teacher, or admin authentication)
app.put('/api/students/:id', authenticateUser, authorizeRole('organization', 'teacher', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const data = await readData();
    const student = data.students.find(s => s.id === id);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Check organization access
    if (req.user.role === 'organization' && student.organizationId !== req.user.organizationId) {
      return res.status(403).json({ error: 'You can only update students from your organization' });
    }

    if (req.user.role === 'teacher') {
      const users = await readUsers();
      const teacher = users.find(u => u.id === req.user.id);
      
      // Teachers can only update students assigned to them AND in their organization
      if (!teacher || teacher.organizationId !== student.organizationId) {
         return res.status(403).json({ error: 'You can only update students in your organization' });
      }

      // Check permissions
      // If updating 'score', check editScore
      if (updates.score !== undefined && (!teacher.teacherPermissions || !teacher.teacherPermissions.editScore)) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to edit scores.' });
      }

      // If updating profile fields (name, studentId, etc.), check editStudentProfile
      // We define "profile fields" as anything NOT score/password for now, or specific list
      const profileFields = ['name', 'studentId', 'gender', 'dateOfBirth', 'contactPhone', 'contactEmail', 'emergencyContactName', 'emergencyContactRelation', 'emergencyContactNumber', 'remark', 'membership', 'membershipStartDate', 'membershipEndDate'];
      const isUpdatingProfile = Object.keys(updates).some(key => profileFields.includes(key));
      
      if (isUpdatingProfile && (!teacher.teacherPermissions || !teacher.teacherPermissions.editStudentProfile)) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to edit student profiles.' });
      }

      // If updating access password, check editSharePwd
      if (updates.accessPassword !== undefined && (!teacher.teacherPermissions || !teacher.teacherPermissions.editSharePwd)) {
          return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to edit share password.' });
      }
    }

    // Validate student name (required)
    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim() === '') {
        return res.status(400).json({ error: 'Student name is required' });
      }
      if (updates.name.length > 100) {
        return res.status(400).json({ error: 'Student name must be 100 characters or less' });
      }
    }

    // Validate student ID uniqueness (if being updated)
    if (updates.studentId !== undefined && updates.studentId !== student.studentId) {
      if (updates.studentId && updates.studentId.trim() !== '') {
        if (updates.studentId.length > 50) {
          return res.status(400).json({ error: 'Student ID must be 50 characters or less' });
        }
        
        const existingStudent = data.students.find(s => 
          s.organizationId === student.organizationId && 
          s.studentId === updates.studentId &&
          s.id !== id
        );
        
        if (existingStudent) {
          return res.status(400).json({ error: 'Student ID already exists in this organization' });
        }
      }
    }

    // Validate date fields
    if (updates.dateOfBirth !== undefined && updates.dateOfBirth !== null && updates.dateOfBirth !== '') {
      if (!isValidDateFormat(updates.dateOfBirth)) {
        return res.status(400).json({ error: 'Date of birth must be in DD/MM/YYYY format' });
      }
      if (!isValidDate(updates.dateOfBirth)) {
        return res.status(400).json({ error: 'Invalid date of birth' });
      }
      if (isFutureDate(updates.dateOfBirth)) {
        return res.status(400).json({ error: 'Date of birth cannot be in the future' });
      }
    }

    if (updates.membershipStartDate !== undefined && updates.membershipStartDate !== null && updates.membershipStartDate !== '') {
      if (!isValidDateFormat(updates.membershipStartDate)) {
        return res.status(400).json({ error: 'Membership start date must be in DD/MM/YYYY format' });
      }
      if (!isValidDate(updates.membershipStartDate)) {
        return res.status(400).json({ error: 'Invalid membership start date' });
      }
    }

    if (updates.membershipEndDate !== undefined && updates.membershipEndDate !== null && updates.membershipEndDate !== '') {
      if (!isValidDateFormat(updates.membershipEndDate)) {
        return res.status(400).json({ error: 'Membership end date must be in DD/MM/YYYY format' });
      }
      if (!isValidDate(updates.membershipEndDate)) {
        return res.status(400).json({ error: 'Invalid membership end date' });
      }
      
      // Validate that end date is after start date
      const startDate = updates.membershipStartDate || student.membershipStartDate;
      if (startDate && startDate.trim() !== '') {
        if (compareDates(updates.membershipEndDate, startDate) < 0) {
          return res.status(400).json({ error: 'Membership end date must be after start date' });
        }
      }
    }

    // Validate field lengths
    const fieldLengths = {
      contactPhone: 20,
      contactEmail: 100,
      emergencyContactName: 100,
      emergencyContactNumber: 20,
      remark: 1000,
      membership: 50
    };

    for (const [field, maxLength] of Object.entries(fieldLengths)) {
      if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') {
        if (updates[field].length > maxLength) {
          return res.status(400).json({ error: `${field} must be ${maxLength} characters or less` });
        }
      }
    }

    // Validate gender
    if (updates.gender !== undefined && updates.gender !== null && updates.gender !== '') {
      if (!['Male', 'Female'].includes(updates.gender)) {
        return res.status(400).json({ error: 'Gender must be Male or Female' });
      }
    }

    // Validate emergency contact relation
    if (updates.emergencyContactRelation !== undefined && updates.emergencyContactRelation !== null && updates.emergencyContactRelation !== '') {
      if (!['Parent', 'Guardian', 'Other'].includes(updates.emergencyContactRelation)) {
        return res.status(400).json({ error: 'Emergency contact relation must be Parent, Guardian, or Other' });
      }
    }

    const studentIndex = data.students.findIndex(s => s.id === id);
    
    // If score is being updated, recalculate rank
    if (updates.score !== undefined) {
      const rankInfo = getRankInfo(updates.score);
      updates.rank = rankInfo.rank;
      updates.rankIndex = rankInfo.rankIndex;
      updates.level = rankInfo.rankIndex + 1;
      updates.experience = updates.score;
    }

    // Merge updates with existing student data
    // Only update fields that are provided (not undefined)
    const allowedFields = [
      'name', 'studentId', 'dateOfBirth', 'gender', 'contactPhone', 'contactEmail',
      'emergencyContactName', 'emergencyContactRelation', 'emergencyContactNumber',
      'remark', 'membership', 'membershipStartDate', 'membershipEndDate', 'score',
      'accessPassword'
    ];
    
    const cleanUpdates = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        cleanUpdates[field] = updates[field] === '' ? null : updates[field];
      }
    });

    data.students[studentIndex] = { ...data.students[studentIndex], ...cleanUpdates };
    data.students[studentIndex].updatedAt = new Date().toISOString();
    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    broadcast({ type: 'studentUpdated', student: data.students[studentIndex] });
    res.json(data.students[studentIndex]);
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Public Student Access (No Auth required, Password protected)
app.get('/api/public/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;
    
    const data = await readData();
    const student = data.students.find(s => s.id === id);
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Check password protection
    if (student.accessPassword) {
        if (!password || password !== student.accessPassword) {
            // Return protected status
            return res.json({ 
                protected: true, 
                id: student.id, 
                name: student.name // Basic info
            });
        }
    }
    
    // Return student data (public view)
    const rankInfo = getRankInfo(student.score || 0);

    // Teacher-specific ranking (first teacher that has this student assigned)
    let rankInTeacher = null;
    let totalStudentsInTeacher = null;
    try {
      const users = await readUsers();
      const teacher = users.find(u =>
        u.role === 'teacher' &&
        Array.isArray(u.assignedStudents) &&
        u.assignedStudents.includes(student.id)
      );
      if (teacher && Array.isArray(teacher.assignedStudents)) {
        const studentsForTeacher = data.students
          .filter(s => teacher.assignedStudents.includes(s.id))
          .sort((a, b) => (b.score || 0) - (a.score || 0));
        const index = studentsForTeacher.findIndex(s => s.id === student.id);
        if (index !== -1) {
          rankInTeacher = index + 1;
          totalStudentsInTeacher = studentsForTeacher.length;
        }
      }
    } catch (err) {
      console.warn('Unable to compute teacher ranking for public student view:', err);
    }

    const publicData = {
        id: student.id,
        name: student.name,
        studentId: student.studentId,
        score: student.score,
        level: rankInfo.rankIndex + 1,
        rank: rankInfo.rank,
        rankIndex: rankInfo.rankIndex,
        nextRank: rankInfo.nextRank,
        progress: rankInfo.progress,
        answerCount: student.answerCount,
        stats: student.stats,
        protected: false,
        rankInTeacher,
        totalStudentsInTeacher
    };
    
    res.json(publicData);
    
  } catch (error) {
    console.error('Error fetching public student:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public Student Access: V.Chess Platform token (No Auth required, Password protected)
// Returns a short-lived JWT with role=student so the student can use WebSocket realtime.
app.get('/api/public/students/:id/vcp-token', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;

    const data = await readData();
    const student = data.students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Check password protection (same rules as public profile)
    if (student.accessPassword) {
      if (!password || password !== student.accessPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    // Mint token with role=student and org context
    const token = generateToken({
      id: String(student.id),
      email: '',
      role: 'student',
      name: String(student.name || 'Student'),
      organizationId: student.organizationId || null
    });

    return res.json({
      ok: true,
      token,
      student: {
        id: String(student.id),
        name: String(student.name || 'Student'),
        studentId: String(student.studentId || '')
      }
    });
  } catch (error) {
    console.error('Error issuing VCP token:', error);
    return res.status(500).json({ error: 'Failed to issue token' });
  }
});

// Public Student Access: Blunders puzzles (No Auth required, Password protected)
app.get('/api/public/students/:id/blunders', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.query;

    const data = await readData();
    const student = data.students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (student.accessPassword) {
      if (!password || password !== student.accessPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    const orgId = String(student.organizationId || '');
    // Best-effort background sync (poll Chess.com) when student opens Blunders
    syncBlundersForStudent(student).catch((e) => console.warn('blunders sync failed:', e));
    const puzzles = await readBlundersPuzzles();
    const mine = puzzles.filter(p => String(p.orgId || '') === orgId && String(p.studentId || '') === String(student.id));
    const pending = mine.filter(p => String(p.status || 'pending') === 'pending');
    const completed = mine.filter(p => String(p.status || '') === 'completed');

    return res.json({
      ok: true,
      student: { id: String(student.id), name: String(student.name || 'Student'), studentId: String(student.studentId || '') },
      pending,
      completed,
      counts: { pending: pending.length, completed: completed.length, total: mine.length }
    });
  } catch (e) {
    console.error('GET /api/public/students/:id/blunders error:', e);
    return res.status(500).json({ error: 'Failed to load blunders puzzles' });
  }
});

// Attempt a blunders puzzle move (engine-checked)
app.post('/api/public/students/:id/blunders/:puzzleId/attempt', async (req, res) => {
  try {
    const { id, puzzleId } = req.params;
    const { password } = req.query;
    const { moveUci, revealBest } = req.body || {};

    const data = await readData();
    const student = data.students.find(s => s.id === id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (student.accessPassword) {
      if (!password || password !== student.accessPassword) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    const orgId = String(student.organizationId || '');
    const puzzles = await readBlundersPuzzles();
    const idx = puzzles.findIndex(p => String(p.id || '') === String(puzzleId) && String(p.orgId || '') === orgId && String(p.studentId || '') === String(student.id));
    if (idx < 0) return res.status(404).json({ error: 'Puzzle not found' });

    const puzzle = puzzles[idx];
    // Reveal-only: allow client to fetch best move without attempting any move.
    if (revealBest && !moveUci) {
      const startFen = String(puzzle.startFEN || '');
      if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });
      // Use cached value if present; otherwise compute and persist.
      let bestMove = String(puzzle.bestMoveUci || '');
      if (!bestMove) {
        const best = await sfEvalFen(startFen, 16);
        bestMove = String(best.bestMove || '');
        puzzle.bestMoveUci = bestMove;
        puzzle.bestCp = scoreToCp(best.score);
        puzzles[idx] = puzzle;
        await writeBlundersPuzzles(puzzles);
      }
      return res.json({ ok: true, bestMove: bestMove || undefined });
    }
    if (String(puzzle.status || 'pending') === 'completed') {
      return res.json({
        ok: true,
        alreadyCompleted: true,
        bestMove: revealBest ? (String(puzzle.bestMoveUci || '') || undefined) : undefined
      });
    }

    const parsed = parseUciMove(moveUci);
    if (!parsed) return res.status(400).json({ error: 'Invalid moveUci (use UCI like e2e4 or e7e8q)' });

    const startFen = String(puzzle.startFEN || '');
    const studentColor = String(puzzle.studentColor || '');
    if (!startFen) return res.status(400).json({ error: 'Puzzle missing startFEN' });

    let chess = null;
    try { chess = new Chess(startFen); } catch { chess = null; }
    if (!chess) return res.status(400).json({ error: 'Invalid startFEN' });

    const turn = chess.turn(); // 'w' | 'b'
    if (studentColor && turn !== studentColor) {
      // Still allow but warn; puzzle generator should ensure this is student's turn.
    }

    const mv = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion });
    if (!mv) return res.status(400).json({ error: 'Illegal move' });

    const afterFen = chess.fen();

    // Evaluate best move at start (student to move)
    const best = await sfEvalFen(startFen, 16);
    const bestMove = String(best.bestMove || '');
    const bestCp = scoreToCp(best.score);

    // Evaluate student's move result at after position (opponent to move), invert to student's POV
    const after = await sfEvalFen(afterFen, 16);
    const afterCpOppPov = scoreToCp(after.score);
    const userCp = -afterCpOppPov;

    const dropCp = bestCp - userCp; // positive means worse than best for student
    const dropPoints = dropCp / 100;

    const isBest = bestMove && parsed.uci === bestMove;
    const thresholdPoints = 1.0;
    const okNoDrop = dropPoints <= 0;
    const isBlunder = dropPoints > thresholdPoints;

    let verdict = 'retry';
    let ok = false;
    if (isBest) {
      verdict = 'best';
      ok = true;
    } else if (!isBlunder) {
      verdict = okNoDrop ? 'good' : 'good';
      ok = true;
    } else {
      verdict = 'blunder';
      ok = false;
    }

    // Persist attempts + completion
    const attempts = Array.isArray(puzzle.attempts) ? puzzle.attempts : [];
    attempts.push({
      at: new Date().toISOString(),
      moveUci: parsed.uci,
      san: String(mv.san || ''),
      bestMove,
      bestCp,
      userCp,
      dropCp
    });
    puzzle.attempts = attempts;

    if (ok) {
      puzzle.status = 'completed';
      puzzle.completedAt = new Date().toISOString();
    }
    // Keep best fields updated (useful for later UI)
    puzzle.bestMoveUci = bestMove;
    puzzle.bestCp = bestCp;
    puzzle.lastUserMoveUci = parsed.uci;
    puzzle.lastUserCp = userCp;
    puzzle.lastDropCp = dropCp;

    puzzles[idx] = puzzle;
    await writeBlundersPuzzles(puzzles);

    return res.json({
      ok,
      verdict, // 'best' | 'good' | 'blunder'
      dropPoints,
      bestMove: (ok && (verdict === 'best' || revealBest)) ? bestMove : undefined
    });
  } catch (e) {
    console.error('POST /api/public/students/:id/blunders/:puzzleId/attempt error:', e);
    return res.status(500).json({ error: 'Failed to evaluate move' });
  }
});

// Delete student
app.delete('/api/students/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    if (req.user.role === 'teacher') {
      const users = await readUsers();
      const currentUser = users.find(u => u.id === req.user.id);
      
      if (!currentUser || !currentUser.organizationId) {
        return res.status(403).json({ error: 'Teacher not associated with organization' });
      }

      // Check "Delete Student" permission
      if (!currentUser.teacherPermissions || !currentUser.teacherPermissions.deleteStudent) {
        return res.status(403).json({ error: 'Insufficient permissions: You are not allowed to delete students.' });
      }

      // Ensure the student belongs to the teacher's organization
      const data = await readData();
      const student = data.students.find(s => s.id === id);
      
      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      if (student.organizationId !== currentUser.organizationId) {
        return res.status(403).json({ error: 'You can only delete students in your organization' });
      }
    } else if (req.user.role !== 'admin' && req.user.role !== 'organization') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const data = await readData();
    const studentIndex = data.students.findIndex(s => s.id === id);

    if (studentIndex === -1) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Organization permission check (double check if role is organization)
    if (req.user.role === 'organization') {
        const users = await readUsers();
        const orgUser = users.find(u => u.id === req.user.id);
        if (data.students[studentIndex].organizationId !== orgUser.organizationId) {
            return res.status(403).json({ error: 'You can only delete students in your organization' });
        }
    }

    data.students.splice(studentIndex, 1);
    data.lastUpdate = new Date().toISOString();
    await writeData(data);

    // Also remove from organization's student list
    const organizations = await readOrganizations();
    for (const org of organizations) {
        if (org.students && org.students.includes(id)) {
            org.students = org.students.filter(sid => sid !== id);
            await writeOrganizations(organizations);
            break; 
        }
    }

    broadcast({ type: 'studentDeleted', studentId: id });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

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

// ==================== Monster Fight Game APIs ====================

// Helper function to calculate revive probability
function calculateReviveProbability(puzzlePoints, baseRate, decay, maxRate, accumulatedRate = 0) {
  // Formula: baseRate + baseRate*decay + baseRate*decay^2 + ... + baseRate*decay^(n-1)
  // Simplified: baseRate * (1 - decay^n) / (1 - decay)
  // With accumulated rate from previous failed attempts
  let totalRate = accumulatedRate;
  if (puzzlePoints > 0) {
    const geometricSum = baseRate * (1 - Math.pow(decay, puzzlePoints)) / (1 - decay);
    totalRate += geometricSum;
  }
  return Math.min(totalRate, maxRate);
}

// Helper function to calculate damage
function calculateDamage(attack, puzzlePoints, multiplier, isCrit = false, critDamage = 2.0) {
  let baseDamage = attack * puzzlePoints * multiplier;
  // Add randomness ±10%
  const randomFactor = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
  baseDamage *= randomFactor;
  
  if (isCrit) {
    baseDamage *= critDamage;
  }
  
  return Math.max(1, Math.round(baseDamage));
}

function pickRandomMultiplierFromRanges(ranges, defaultValue = 1) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return defaultValue;
  }

  let r = Math.random();
  let selectedRange = null;

  for (const range of ranges) {
    const chance = typeof range.chance === 'number' ? range.chance : 0;
    if (chance > 0) {
      if (r <= chance) {
        selectedRange = range;
        break;
      }
      r -= chance;
    }
  }

  if (!selectedRange) {
    selectedRange = ranges[ranges.length - 1];
  }

  const min = typeof selectedRange.min === 'number' ? selectedRange.min : defaultValue;
  const max = typeof selectedRange.max === 'number' ? selectedRange.max : min;
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function getPassiveDamageInfo(player) {
  const result = {
    multiplier: 1,
    sources: []
  };

  if (!player || !Array.isArray(player.skills)) {
    return result;
  }

  const passiveSkill = player.skills.find(skill => skill.type === 'passive');
  if (!passiveSkill || !passiveSkill.effect) {
    return result;
  }

  const effect = passiveSkill.effect;

  if (effect.damageMultiplier && typeof effect.damageMultiplier === 'object') {
    const min = typeof effect.damageMultiplier.min === 'number' ? effect.damageMultiplier.min : 1;
    const max = typeof effect.damageMultiplier.max === 'number' ? effect.damageMultiplier.max : min;
    if (max > 0) {
      const value = max > min ? min + Math.random() * (max - min) : max;
      result.multiplier *= value;
      result.sources.push({ type: 'precision_boost', value: Number(value.toFixed(2)) });
    }
  }

  if (effect.randomMultiplier && Array.isArray(effect.randomMultiplier.ranges)) {
    const value = pickRandomMultiplierFromRanges(effect.randomMultiplier.ranges, 1);
    result.multiplier *= value;
    result.sources.push({ type: 'arcane_surge', value: Number(value.toFixed(2)) });
  }

  return result;
}

function ensurePlayerStats(player) {
  if (!player.stats) {
    player.stats = { totalDamage: 0, kills: 0, healing: 0 };
  }
  if (typeof player.stats.totalDamage !== 'number') player.stats.totalDamage = 0;
  if (typeof player.stats.kills !== 'number') player.stats.kills = 0;
  if (typeof player.stats.healing !== 'number') player.stats.healing = 0;
  return player.stats;
}

function getDamageReduction(player) {
  if (!player || !Array.isArray(player.skills)) {
    return 0;
  }
  const passiveSkill = player.skills.find(skill => skill.type === 'passive');
  const reduction = passiveSkill?.effect?.damageReduction;
  if (typeof reduction === 'number' && reduction > 0) {
    return Math.min(0.9, Math.max(0, reduction));
  }
  return 0;
}

function applyPriestPassiveHealing(gameState) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const alivePlayers = gameState.players.filter(p => p.isAlive);
  if (alivePlayers.length === 0) {
    return [];
  }
  const healEvents = [];
  gameState.players.forEach(player => {
    if (!player.isAlive || player.characterClass !== 'priest') {
      return;
    }
    const healBase = Number(player.puzzlePoints) || 0;
    if (healBase <= 0) {
      return;
    }
    const healPerPlayer = Math.floor(healBase / alivePlayers.length);
    if (healPerPlayer <= 0) {
      return;
    }
    const healedTargets = [];
    alivePlayers.forEach(target => {
      if (!target.maxHP || target.currentHP >= target.maxHP) {
        return;
      }
      const before = target.currentHP;
      target.currentHP = Math.min(target.maxHP, target.currentHP + healPerPlayer);
      const healed = target.currentHP - before;
      if (healed > 0) {
        ensurePlayerStats(player).healing += healed;
        healedTargets.push({ name: target.studentName, amount: healed, before, after: target.currentHP });
      }
    });
    if (healedTargets.length > 0) {
      healEvents.push({ priestName: player.studentName, healAmount: healPerPlayer, targets: healedTargets });
    }
  });
  return healEvents;
}

function getMonsterPassiveEffect(monster) {
  if (!monster || !Array.isArray(monster.skills)) {
    return null;
  }
  const passiveSkill = monster.skills.find(skill => skill.type === 'passive');
  return passiveSkill?.effect || null;
}

function getMonsterDamageReduction(monster) {
  const effect = getMonsterPassiveEffect(monster);
  const reduction = effect?.damageReduction;
  if (typeof reduction === 'number' && reduction > 0) {
    return Math.min(0.9, Math.max(0, reduction));
  }
  return 0;
}

function getAvailableMonsterTypes(data) {
  return (data?.gameSettings?.monsterTypes && data.gameSettings.monsterTypes.length > 0)
    ? data.gameSettings.monsterTypes
    : MONSTER_TYPES;
}

function getMonsterTypeById(typeId, data) {
  if (!typeId) return null;
  const types = getAvailableMonsterTypes(data);
  return types.find(t => t.id === typeId) || MONSTER_TYPES.find(t => t.id === typeId) || null;
}

function maybeApplyShamanCriticalHeal(monster, baseAmount) {
  const effect = getMonsterPassiveEffect(monster);
  if (!effect) {
    return { amount: baseAmount, isCritical: false };
  }
  const chance = effect.critHealChance;
  const multiplier = effect.critHealMultiplier;
  if (typeof chance === 'number' && chance > 0 && typeof multiplier === 'number' && multiplier > 1) {
    if (Math.random() < chance) {
      const boosted = Math.max(1, Math.round(baseAmount * multiplier));
      return { amount: boosted, isCritical: true };
    }
  }
  return { amount: baseAmount, isCritical: false };
}

function applyShamanPassiveHealing(gameState, data) {
  if (!gameState || !Array.isArray(gameState.monsters)) {
    return [];
  }
  const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
  if (aliveMonsters.length === 0) {
    return [];
  }
  const healLogs = [];
  aliveMonsters.forEach(monster => {
    const effect = getMonsterPassiveEffect(monster);
    if (!effect?.healLowestAllyFraction) {
      return;
    }
    const target = aliveMonsters.reduce((lowest, ally) => 
      ally.currentHP < lowest.currentHP ? ally : lowest
    , aliveMonsters[0]);
    if (!target || target.currentHP >= target.maxHP) {
      return;
    }
    const baseHealAmount = Math.max(1, Math.floor(target.maxHP * effect.healLowestAllyFraction));
    const { amount: healAmount, isCritical } = maybeApplyShamanCriticalHeal(monster, baseHealAmount);
    const before = target.currentHP;
    target.currentHP = Math.min(target.maxHP, target.currentHP + healAmount);
    const actualHeal = target.currentHP - before;
    if (actualHeal > 0) {
      const critNote = isCritical ? ' (Critical Heal!)' : '';
      healLogs.push(`${monster.name} heals ${target.name} for ${actualHeal} HP${critNote} (HP ${before} -> ${target.currentHP}).`);
    }
  });
  return healLogs;
}

function applyFirestormAuraBeforePlayerAction(player, gameState) {
  if (!player || !player.isAlive) {
    return null;
  }
  if (!gameState || !Array.isArray(gameState.monsters)) {
    return null;
  }
  const auraMonsters = gameState.monsters.filter(monster => {
    if (!monster || !monster.isAlive) {
      return false;
    }
    const effect = getMonsterPassiveEffect(monster);
    return !!(effect && effect.firestormAura);
  });
  if (auraMonsters.length === 0) {
    return null;
  }

  const result = {
    triggered: false,
    totalDamage: 0,
    defeated: false,
    messages: []
  };

  auraMonsters.forEach(monster => {
    const effect = getMonsterPassiveEffect(monster);
    const aura = effect?.firestormAura;
    if (!aura) {
      return;
    }
    const maxHP = monster.maxHP || 0;
    if (maxHP <= 0) {
      return;
    }
    const threshold = typeof aura.threshold === 'number' ? aura.threshold : 0.5;
    const enraged = (monster.currentHP / maxHP) <= threshold;
    const fraction = enraged
      ? (typeof aura.enragedFraction === 'number' ? aura.enragedFraction : aura.baseFraction)
      : aura.baseFraction;
    if (typeof fraction !== 'number' || fraction <= 0) {
      return;
    }
    const beforeHP = player.currentHP;
    const damage = Math.max(1, Math.floor(maxHP * fraction));
    player.currentHP = Math.max(0, player.currentHP - damage);
    result.triggered = true;
    result.totalDamage += damage;
    const afterHP = player.currentHP;
    const note = enraged ? ' (enraged aura)' : '';
    result.messages.push(`${monster.name}'s Firestorm Aura scorches ${player.studentName} for ${damage} damage${note}. (HP ${beforeHP} -> ${afterHP})`);
  });

  if (!result.triggered) {
    return null;
  }

  if (player.currentHP <= 0) {
    player.currentHP = 0;
    player.isAlive = false;
    result.defeated = true;
  }

  return result;
}

function addBleedStatusToPlayer(player, effect, monsterName) {
  if (!player || !effect) {
    return;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  player.statuses.push({
    type: 'bleed',
    remainingTurns: effect.turns || 3,
    damageFraction: effect.damageFraction || 0.01,
    source: monsterName,
    appliedThisTurn: true
  });
}

function addBleedingClawStatusToPlayer(player, monster, effect) {
  if (!player || !monster || !effect) {
    return null;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  const baseAttack = typeof monster.attack === 'number' ? monster.attack : (monster.baseAttack || 0);
  const damagePerTurn = Math.max(1, Math.round(baseAttack * (effect.damageFraction || 0.2)));
  const remainingTurns = Math.max(1, effect.turns || 2);
  player.statuses.push({
    type: 'bleeding_claw',
    remainingTurns,
    damagePerTurn,
    source: monster.name,
    appliedThisTurn: true
  });
  return `${monster.name}'s Bleeding Claw wounds ${player.studentName}, dealing ${damagePerTurn} damage per turn for ${remainingTurns} turns.`;
}

function addSilenceStatusToPlayer(player, duration, source) {
  if (!player || duration <= 0) {
    return;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  player.statuses.push({
    type: 'silence',
    remainingTurns: duration,
    source: source || null,
    appliedThisTurn: true
  });
}

function isPlayerSilenced(player) {
  if (!player || !Array.isArray(player.statuses)) {
    return false;
  }
  return player.statuses.some(status => status.type === 'silence');
}

function getLastAttackDamage(player, gameState) {
  if (player && typeof player.lastAttackDamage === 'number' && player.lastAttackDamage > 0) {
    return player.lastAttackDamage;
  }
  const baseMultiplier = gameState?.gameConfig?.damageMultiplier || 0.2;
  return Math.max(1, Math.round((player?.attack || 1) * baseMultiplier));
}

function forcePlayerToAttackAlly(player, monster, gameState) {
  const aliveAllies = gameState.players.filter(p => p.isAlive && p.studentId !== player.studentId);
  if (aliveAllies.length === 0) {
    return {
      used: false,
      log: `${monster.name} tries to compel ${player.studentName}, but there are no other allies to strike.`
    };
  }
  const victim = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
  const baseDamage = getLastAttackDamage(player, gameState);
  const beforeHP = victim.currentHP;
  const newHP = Math.max(1, victim.currentHP - baseDamage);
  const actualDamage = beforeHP - newHP;
  victim.currentHP = newHP;
  const stats = ensurePlayerStats(player);
  stats.totalDamage += actualDamage;
  const log = `${monster.name}'s dark magic forces ${player.studentName} to strike ${victim.studentName} for ${actualDamage} damage! (HP ${beforeHP} -> ${victim.currentHP})`;
  player.lastAttackDamage = actualDamage > 0 ? actualDamage : baseDamage;
  if (victim.currentHP <= 0) {
    victim.isAlive = false;
  }
  return { used: true, log };
}

function selectPlayerTargetForMonster(alivePlayers, options = {}) {
  if (!alivePlayers || alivePlayers.length === 0) {
    return null;
  }
  const shield = alivePlayers.find(p => p.characterClass === 'shield_warrior');
  const ignoreTaunt = !!options.ignoreTaunt;
  const preferNonShield = !!options.preferNonShield;

  let candidates = alivePlayers;
  if (preferNonShield) {
    const nonShield = alivePlayers.filter(p => p.characterClass !== 'shield_warrior');
    if (nonShield.length > 0) {
      candidates = nonShield;
    }
  }

  if (!ignoreTaunt && shield && (!preferNonShield || candidates.includes(shield))) {
    return shield;
  }

  return candidates.reduce((lowest, player) => (
    player.currentHP < lowest.currentHP ? player : lowest
  ), candidates[0]);
}

function executeMonsterActiveSkill(monster, skill, gameState) {
  const effect = skill.effect || {};
  const skillName = skill.name || 'Skill';
  const alivePlayers = gameState.players.filter(p => p.isAlive);

  if (effect.areaHeal) {
    const healFraction = Math.max(0, effect.missingHpFraction || 0);
    const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
    if (aliveMonsters.length === 0) {
      return { used: false };
    }
    const summaryDetails = [];
    aliveMonsters.forEach(target => {
      const missing = Math.max(0, (target.maxHP || 0) - (target.currentHP || 0));
      if (missing <= 0) {
        return;
      }
      const healAmount = Math.max(1, Math.floor(missing * healFraction));
      const before = target.currentHP;
      target.currentHP = Math.min(target.maxHP, target.currentHP + healAmount);
      const actualHeal = target.currentHP - before;
      if (actualHeal > 0) {
        summaryDetails.push(`${target.name}: +${actualHeal} HP (HP ${before} -> ${target.currentHP})`);
      }
    });
    if (summaryDetails.length === 0) {
      return { used: false };
    }
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} casts ${skillName}, bathing allies in restorative energy.`,
      summaryDetails
    });
    return { used: true };
  }

  if (effect.areaDamage) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const damageMultiplier = gameState.gameConfig.damageMultiplier * (effect.damageMultiplier || 1);
    const baseDamage = calculateDamage(
      monster.attack,
      1,
      damageMultiplier,
      false,
      gameState.gameConfig.critDamage
    );
    const summaryDetails = [];
    alivePlayers.forEach(player => {
      const damageReduction = getDamageReduction(player);
      const finalDamage = damageReduction > 0
        ? Math.max(1, Math.round(baseDamage * (1 - damageReduction)))
        : baseDamage;
      const beforeHP = player.currentHP;
      player.currentHP = Math.max(0, player.currentHP - finalDamage);
      if (player.currentHP <= 0) {
        player.isAlive = false;
      }
      summaryDetails.push(`${player.studentName}: -${finalDamage} HP (HP ${beforeHP} -> ${player.currentHP}${damageReduction > 0 ? ', reduced' : ''})`);
    });
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} engulfs the party with ${skillName}!`,
      summaryDetails
    });
    return { used: true };
  }

  if (effect.forcePlayerAttack) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, { ignoreTaunt: effect.ignoreTaunt });
    if (!target) {
      return { used: false };
    }
    const result = forcePlayerToAttackAlly(target, monster, gameState);
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: result.log
    });
    return { used: result.used };
  }

  if (effect.reduceRemainingHpFraction) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, { ignoreTaunt: effect.ignoreTaunt });
    if (!target) {
      return { used: false };
    }
    const fraction = Math.min(0.99, Math.max(0, effect.reduceRemainingHpFraction));
    const before = target.currentHP;
    const remainingFraction = 1 - fraction;
    const newHP = Math.max(1, Math.ceil(before * remainingFraction));
    const damage = before - newHP;
    target.currentHP = newHP;
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name}'s ${skillName} rends ${target.studentName}, ripping away ${damage} HP! (HP ${before} -> ${target.currentHP})`
    });
    return { used: true };
  }

  if (effect.damageMultiplier) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, {
      ignoreTaunt: effect.ignoreTaunt,
      preferNonShield: effect.preferNonShield
    });
    if (!target) {
      return { used: false };
    }
    const damageMultiplier = gameState.gameConfig.damageMultiplier * (effect.damageMultiplier || 1);
    const damageReduction = getDamageReduction(target);
    const baseDamage = calculateDamage(
      monster.attack,
      1,
      damageMultiplier,
      false,
      gameState.gameConfig.critDamage
    );
    const finalDamage = damageReduction > 0
      ? Math.max(1, Math.round(baseDamage * (1 - damageReduction)))
      : baseDamage;
    const beforeHP = target.currentHP;
    target.currentHP = Math.max(0, target.currentHP - finalDamage);
    if (target.currentHP <= 0) {
      target.isAlive = false;
    }
    let message = `${monster.name} uses ${skillName} on ${target.studentName} for ${finalDamage} damage${damageReduction > 0 ? ' (reduced)' : ''}! (HP ${beforeHP} -> ${target.currentHP})`;

    if (effect.silenceChance && Math.random() < effect.silenceChance && target.isAlive) {
      addSilenceStatusToPlayer(target, effect.silenceDuration || 1, monster.name);
      message += ` ${target.studentName} is silenced!`;
    }

    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message
    });
    return { used: true };
  }

  return { used: false };
}

function attemptMonsterActiveSkill(monster, gameState) {
  if (!monster || !monster.isAlive || !Array.isArray(monster.skills)) {
    return { used: false };
  }
  const activeSkills = monster.skills.filter(skill => skill.type === 'active');
  if (activeSkills.length === 0) {
    return { used: false };
  }

  monster.skillCooldowns = monster.skillCooldowns || {};

  for (const skill of activeSkills) {
    const cooldown = monster.skillCooldowns[skill.id] || 0;
    if (cooldown <= 0) {
      const result = executeMonsterActiveSkill(monster, skill, gameState);
      if (result.used) {
        monster.skillCooldowns[skill.id] = skill.cooldown || 0;
        return { used: true };
      }
    }
  }

  return { used: false };
}

function applyPlayerStatusEffects(gameState) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const logs = [];
  gameState.players.forEach(player => {
    if (!player.isAlive || !Array.isArray(player.statuses) || player.statuses.length === 0) {
      return;
    }
    const remainingStatuses = [];
    player.statuses.forEach(status => {
      if (status.appliedThisTurn) {
        status.appliedThisTurn = false;
        remainingStatuses.push(status);
        return;
      }
      if (status.type === 'bleed') {
        const damage = Math.max(1, Math.round((player.maxHP || 0) * (status.damageFraction || 0.01)));
        const before = player.currentHP;
        player.currentHP = Math.max(0, player.currentHP - damage);
        logs.push(`${player.studentName} suffers ${damage} bleed damage${status.source ? ` from ${status.source}` : ''}. (HP ${before} -> ${player.currentHP})`);
        if (player.currentHP <= 0) {
          player.isAlive = false;
        }
      } else if (status.type === 'bleeding_claw') {
        const damage = Math.max(1, Math.round(status.damagePerTurn || 0));
        if (damage > 0) {
          const before = player.currentHP;
          player.currentHP = Math.max(0, player.currentHP - damage);
          logs.push(`${player.studentName} suffers ${damage} Bleeding Claw damage${status.source ? ` from ${status.source}` : ''}. (HP ${before} -> ${player.currentHP})`);
          if (player.currentHP <= 0) {
            player.isAlive = false;
          }
        }
      } else if (status.type === 'silence') {
        logs.push(`${player.studentName} is silenced${status.source ? ` by ${status.source}` : ''} and cannot use skills.`);
      }
      status.remainingTurns = (status.remainingTurns || 1) - 1;
      if (player.isAlive && status.remainingTurns > 0) {
        remainingStatuses.push(status);
      }
    });
    player.statuses = remainingStatuses;
  });
  return logs;
}

function ensureMonsterStatuses(monster) {
  if (!monster) {
    return [];
  }
  if (!Array.isArray(monster.statuses)) {
    monster.statuses = [];
  }
  return monster.statuses;
}

function addStatusToMonster(monster, status) {
  if (!monster || !status) {
    return;
  }
  const statuses = ensureMonsterStatuses(monster);
  const normalized = {
    type: status.type,
    remainingTurns: typeof status.remainingTurns === 'number' ? status.remainingTurns : 1,
    skipActionsRemaining: typeof status.skipActionsRemaining === 'number' ? status.skipActionsRemaining : 1,
    source: status.source || null,
    note: status.note || null
  };
  statuses.push(normalized);
}

function processMonsterControlStatuses(monster) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return { skipTurn: false, logs: [] };
  }
  let skipTurn = false;
  const logs = [];
  monster.statuses.forEach(status => {
    if ((status.type === 'stun' || status.type === 'freeze') && !skipTurn) {
      const remainingSkips = typeof status.skipActionsRemaining === 'number' ? status.skipActionsRemaining : 1;
      if (remainingSkips > 0) {
        skipTurn = true;
        status.skipActionsRemaining = Math.max(0, remainingSkips - 1);
        if (status.type === 'stun') {
          logs.push(`${monster.name} is stunned and cannot act this turn!`);
        } else if (status.type === 'freeze') {
          logs.push(`${monster.name} is frozen solid and skips this turn!`);
        } else {
          logs.push(`${monster.name} is incapacitated and cannot act this turn!`);
        }
      }
    }
  });
  return { skipTurn, logs };
}

function advanceMonsterStatuses(monster) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return;
  }
  monster.statuses = monster.statuses.filter(status => {
    if (typeof status.remainingTurns === 'number') {
      status.remainingTurns -= 1;
      return status.remainingTurns > 0;
    }
    return false;
  });
}

function applyMonsterStatusDamage(monster, gameState, data) {
  const result = { logs: [], deathLogs: [] };
  if (!monster || !monster.isAlive || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return result;
  }

  let monsterKilled = false;
  monster.statuses.forEach(status => {
    if (!monster.isAlive) {
      return;
    }
    if (status.type === 'poison' && (status.remainingTurns === undefined || status.remainingTurns > 0)) {
      const damage = Math.max(1, status.damagePerTurn || 0);
      if (damage <= 0) {
        return;
      }
      const beforeHP = monster.currentHP;
      monster.currentHP = Math.max(0, monster.currentHP - damage);
      result.logs.push(`${monster.name} suffers ${damage} poison damage${status.source ? ` from ${status.source}` : ''}. (HP ${beforeHP} -> ${monster.currentHP})`);
      if (monster.currentHP <= 0 && monster.isAlive) {
        monster.isAlive = false;
        monsterKilled = true;
      }
    }
  });

  if (monsterKilled) {
    const deathLogs = handleMonsterDeath(monster, gameState, data);
    result.deathLogs.push(...deathLogs);
  }

  return result;
}

function ensureMonsterSequence(gameState) {
  if (typeof gameState.monsterSequence !== 'number') {
    gameState.monsterSequence = 0;
  }
}

function createMonsterInstanceFromType(monsterType, gameState, overrides = {}) {
  ensureMonsterSequence(gameState);
  gameState.monsterSequence += 1;
  return {
    id: `monster_${gameState.currentLevel}_${gameState.monsterSequence}`,
    type: monsterType.id,
    name: overrides.name || `${monsterType.name} ${gameState.monsterSequence}`,
    emoji: monsterType.emoji,
    baseAttack: overrides.attack ?? monsterType.baseAttack,
    attack: overrides.attack ?? monsterType.baseAttack,
    maxHP: overrides.maxHP ?? monsterType.baseHP,
    currentHP: overrides.currentHP ?? monsterType.baseHP,
    isAlive: true,
    skills: (monsterType.skills || []).map(skill => ({ ...skill })),
    skillCooldowns: {}
  };
}

function handleMonsterDeath(monster, gameState, data) {
  const logs = [];
  const effect = getMonsterPassiveEffect(monster);
  if (effect?.splitOnDeath && !monster.splitPerformed) {
    monster.splitPerformed = true;
    const splitMin = effect.splitMin || 2;
    const splitMax = effect.splitMax || splitMin;
    const splitCount = splitMin === splitMax
      ? splitMin
      : splitMin + Math.floor(Math.random() * (splitMax - splitMin + 1));
    const miniType = getMonsterTypeById('mini_slime', data);
    if (miniType) {
      for (let i = 0; i < splitCount; i++) {
        const mini = createMonsterInstanceFromType(miniType, gameState, {
          attack: monster.attack,
          maxHP: Math.max(1, Math.floor((monster.maxHP || miniType.baseHP) / 3)),
          currentHP: Math.max(1, Math.floor((monster.maxHP || miniType.baseHP) / 3))
        });
        mini.parentId = monster.id;
        mini.originalType = miniType.id;
        mini.spawnTurn = gameState.currentTurn;
        gameState.monsters.push(mini);
      }
      logs.push(`${monster.name} splits into ${splitCount} Mini Slimes!`);
    }
  }
  return logs;
}

// Get game configuration
app.get('/api/game/config', (req, res) => {
  res.json({
    config: GAME_CONFIG,
    playerClasses: PLAYER_CLASSES,
    monsterTypes: MONSTER_TYPES
  });
});

// Initialize game state
app.post('/api/game/init', async (req, res) => {
  try {
    const { studentIds, levelConfig } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs are required' });
    }
    
    // Get student data
    const data = await readData();
    const students = data.students.filter(s => studentIds.includes(s.id));
    
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students not found' });
    }
    
    // Get settings from data file
    const settingsConfig = data.gameSettings?.config || GAME_CONFIG;
    
    // Initialize game state
    const gameState = {
      currentLevel: 1,
      currentTurn: 1,
      phase: 'character_selection', // character_selection, puzzle_input, player_turn, monster_turn, game_over
      players: students.map((student, index) => ({
        studentId: student.id,
        studentName: student.name,
        characterClass: null,
        currentHP: 0,
        maxHP: 0,
        attack: 0,
        puzzlePoints: 0,
        isAlive: true,
        skills: [],
        skillCooldowns: {},
        accumulatedReviveRate: 0,
        stats: {
          totalDamage: 0,
          kills: 0,
          healing: 0
        },
        statuses: []
      })),
      monsters: [],
      actionLog: [],
      levelConfig: levelConfig || [],
      gameConfig: { ...settingsConfig },
      monsterSequence: 0
    };
    
    // Store game state in data
    if (!data.gameState) {
      data.gameState = {};
    }
    data.gameState.current = gameState;
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState });
    res.json(gameState);
  } catch (error) {
    console.error('Error initializing game:', error);
    res.status(500).json({ error: 'Failed to initialize game' });
  }
});

// Get current game state
app.get('/api/game/state', async (req, res) => {
  try {
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    res.json(data.gameState.current);
  } catch (error) {
    console.error('Error getting game state:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Update player character selection
app.post('/api/game/select-character', async (req, res) => {
  try {
    const { studentId, characterClassId } = req.body;
    
    if (!studentId || !characterClassId) {
      return res.status(400).json({ error: 'Student ID and character class ID are required' });
    }
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    const player = gameState.players.find(p => p.studentId === studentId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    // Get player classes from settings or defaults
    const availablePlayerClasses = data.gameSettings?.playerClasses || PLAYER_CLASSES;
    
    const characterClass = availablePlayerClasses.find(c => c.id === characterClassId);
    if (!characterClass) {
      return res.status(404).json({ error: 'Character class not found' });
    }
    
    // Set character
    player.characterClass = characterClassId;
    player.attack = characterClass.baseAttack;
    player.maxHP = characterClass.baseHP;
    player.currentHP = characterClass.baseHP;
    player.skills = characterClass.skills.map(skill => ({ ...skill }));
    player.skillCooldowns = {};
    ensurePlayerStats(player);
    
    // Keep phase as 'character_selection' until user clicks "Start Battle"
    // The battle will be initialized when user clicks the button
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState });
    res.json(gameState);
  } catch (error) {
    console.error('Error selecting character:', error);
    res.status(500).json({ error: 'Failed to select character' });
  }
});

// Input puzzle points for players
app.post('/api/game/input-puzzle-points', async (req, res) => {
  try {
    const { puzzlePoints } = req.body; // { studentId: points }
    
    if (!puzzlePoints || typeof puzzlePoints !== 'object') {
      return res.status(400).json({ error: 'Puzzle points object is required' });
    }
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    
    // Update puzzle points for each player
    Object.keys(puzzlePoints).forEach(studentId => {
      const player = gameState.players.find(p => p.studentId === studentId);
      if (player) {
        player.puzzlePoints = Math.max(0, parseInt(puzzlePoints[studentId]) || 0);
      }
    });
    
    // Check if we need to initialize monsters
    // Initialize ONLY if: monsters don't exist, OR if we're explicitly transitioning from level_complete phase (new level)
    // DO NOT reinitialize if monsters are dead during battle - that's normal gameplay
    const monstersExisted = gameState.monsters && gameState.monsters.length > 0;
    const isLevelTransition = gameState.phase === 'level_complete';
    
    // Only initialize monsters if they don't exist, or if we're explicitly transitioning levels
    if (!monstersExisted || isLevelTransition) {
      // Clear existing monsters if transitioning to new level
      if (isLevelTransition && monstersExisted) {
        gameState.monsters = [];
      }
      // First time: initialize monsters
      const levelInfo = gameState.levelConfig[gameState.currentLevel - 1];
      if (levelInfo) {
        gameState.monsters = [];
        
        // Get monster types from settings or defaults
        const availableMonsterTypes = data.gameSettings?.monsterTypes || MONSTER_TYPES;
        
        let monsterIndex = 1; // Global index for unique naming
        levelInfo.monsters.forEach(monsterConfig => {
          const monsterType = availableMonsterTypes.find(m => m.id === monsterConfig.type);
          if (monsterType) {
            const config = gameState.gameConfig || GAME_CONFIG;
            const strengthMultiplier = config.difficultyCurve?.[gameState.currentLevel]?.strengthMultiplier || 
                                       GAME_CONFIG.difficultyCurve[gameState.currentLevel]?.strengthMultiplier || 1.0;
            for (let i = 0; i < monsterConfig.count; i++) {
              const monsterInstance = createMonsterInstanceFromType(monsterType, gameState, {
                name: `${monsterType.name} ${monsterIndex}`,
                attack: Math.round(monsterType.baseAttack * strengthMultiplier),
                maxHP: Math.round(monsterType.baseHP * strengthMultiplier),
                currentHP: Math.round(monsterType.baseHP * strengthMultiplier)
              });
              monsterInstance.originalType = monsterConfig.type;
              monsterInstance.spawnTurn = gameState.currentTurn;
              gameState.monsters.push(monsterInstance);
              monsterIndex++; // Increment global index
            }
          }
        });
      }
      
      // Set phase to player_turn and add action log
      if (!gameState.phase || gameState.phase === 'character_selection' || gameState.phase === 'puzzle_input' || gameState.phase === 'level_complete') {
        gameState.phase = 'player_turn';

        // When starting a new level, reset player action flags and increment turn
        if (isLevelTransition) {
          gameState.currentTurn += 1;
          gameState.players.forEach(player => {
            player.hasActed = false;
          });
        }
        if (isLevelTransition) {
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'level_start',
            message: `Level ${gameState.currentLevel} started!`
          });
        } else {
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'puzzle_input',
            message: 'Puzzle points input completed. Battle begins!'
          });
        }
      }
    } else {
      // If monsters already exist and we're not transitioning levels, we only update puzzle points
    }
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState });
    res.json(gameState);
  } catch (error) {
    console.error('Error inputting puzzle points:', error);
    res.status(500).json({ error: 'Failed to input puzzle points' });
  }
});

// Player action (attack, skill, heal)
app.post('/api/game/player-action', async (req, res) => {
  try {
    const { studentId, action, targetId, skillId, puzzlePoints } = req.body;
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    if (gameState.phase !== 'player_turn') {
      return res.status(400).json({ error: 'Not player turn' });
    }
    
    const player = gameState.players.find(p => p.studentId === studentId);
    if (!player || !player.isAlive) {
      return res.status(400).json({ error: 'Player not found or not alive' });
    }
    
    // Use Puzzle Points from request if provided (most up-to-date), otherwise use gameState
    const effectivePuzzlePoints = (puzzlePoints !== undefined && puzzlePoints !== null) 
      ? Math.max(0, parseInt(puzzlePoints) || 0)
      : player.puzzlePoints;
    
    // Update player's puzzle points in gameState to keep it in sync
    if (puzzlePoints !== undefined && puzzlePoints !== null) {
      player.puzzlePoints = effectivePuzzlePoints;
    }
    
    let actionResult = null;

    const auraResult = applyFirestormAuraBeforePlayerAction(player, gameState);
    if (auraResult && auraResult.triggered) {
      auraResult.messages.forEach(message => {
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message,
          summaryDetails: [message]
        });
      });
      if (auraResult.defeated) {
        player.hasActed = true;
        const firestormResult = {
          type: 'status',
          message: `${player.studentName} is overwhelmed by the Firestorm Aura and cannot act this turn.`
        };
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        broadcast({ type: 'gameStateUpdated', gameState, actionResult: firestormResult });
        return res.json({ gameState, actionResult: firestormResult });
      }
    }
    
    if (action === 'skill' && isPlayerSilenced(player)) {
      return res.status(400).json({ error: `${player.studentName} is silenced and cannot use skills this turn.` });
    }
    
    if (action === 'attack') {
      let monster = gameState.monsters.find(m => m.id === targetId && m.isAlive);
      const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
      let redirected = false;
      if (tauntingMonster && (!monster || monster.id !== tauntingMonster.id)) {
        monster = tauntingMonster;
        redirected = true;
      }
      if (!monster) {
        return res.status(400).json({ error: 'Target not found' });
      }
      
      const monsterPassive = getMonsterPassiveEffect(monster);
      if (monsterPassive?.dodgeChance && Math.random() < monsterPassive.dodgeChance) {
        actionResult = {
          type: 'attack',
          playerName: player.studentName,
          targetName: monster.name,
          dodged: true,
          redirected
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${monster.name} dodges ${player.studentName}'s attack!`
        });
      } else {
        // Check for crit
        const critRate = gameState.gameConfig.critRate + (player.skills.find(s => s.effect?.critRateBonus)?.effect?.critRateBonus || 0);
        const isCrit = Math.random() < critRate;
        
        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalDamageMultiplier = gameState.gameConfig.damageMultiplier * passiveDamageInfo.multiplier;
        
        console.log(`[Server] Player ${player.studentName} attack: ATK=${player.attack}, PuzzlePoints=${effectivePuzzlePoints}, BaseMultiplier=${gameState.gameConfig.damageMultiplier}, PassiveMultiplier=${passiveDamageInfo.multiplier.toFixed(3)}, Crit=${isCrit}`);
        if (passiveDamageInfo.sources.length > 0) {
          console.log('  Passive sources:', passiveDamageInfo.sources);
        }
        
        let damage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalDamageMultiplier,
          isCrit,
          gameState.gameConfig.critDamage
        );
        
        const monsterDamageReduction = getMonsterDamageReduction(monster);
        if (monsterDamageReduction > 0) {
          damage = Math.max(1, Math.round(damage * (1 - monsterDamageReduction)));
        }
        
        console.log(`[Server] Calculated damage: ${damage} (Monster HP: ${monster.currentHP} -> ${monster.currentHP - damage})`);
        
        monster.currentHP = Math.max(0, monster.currentHP - damage);
        if (monster.currentHP <= 0) {
          monster.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        
        ensurePlayerStats(player).totalDamage += damage;
        player.lastAttackDamage = damage;
        
        actionResult = {
          type: 'attack',
          playerName: player.studentName,
          targetName: monster.name,
          damage,
          isCrit,
          monsterKilled: !monster.isAlive,
          passiveEffects: passiveDamageInfo.sources,
          redirected
        };
        
        const tauntText = redirected ? ' (taunted)' : '';
        const reductionText = monsterDamageReduction > 0 ? ' (reduced by monster armor)' : '';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} attacks ${monster.name} for ${damage} damage${isCrit ? ' (CRITICAL!)' : ''}${reductionText}${tauntText}${!monster.isAlive ? ' - KILLED!' : ''}`
        });
        
        const deathLogs = handleMonsterDeath(monster, gameState, data);
        deathLogs.forEach(message => {
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'player_turn',
            message
          });
        });
      }
    } else if (action === 'skill' && skillId) {
      const skill = player.skills.find(s => s.id === skillId);
      if (!skill || skill.type !== 'active') {
        return res.status(400).json({ error: 'Invalid skill' });
      }

      player.turnSkillsUsed = player.turnSkillsUsed || {};
      const skillsThisTurn = player.turnSkillsUsed[gameState.currentTurn] || new Set();

      if (player.characterClass === 'priest' && skillsThisTurn.size > 0 && !skillsThisTurn.has(skillId)) {
        return res.status(400).json({ error: 'Priest can only use one skill per turn' });
      }

      if (player.skillCooldowns[skillId] && player.skillCooldowns[skillId] > 0) {
        return res.status(400).json({ error: 'Skill on cooldown' });
      }

      player.turnSkillsUsed[gameState.currentTurn] = skillsThisTurn;

      const applyCooldown = () => {
        player.skillCooldowns[skillId] = skill.cooldown || 0;
        skillsThisTurn.add(skillId);
      };

      if (skillId === 'active_1' && player.characterClass === 'warrior') {
        const target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }
        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * 1.5 * passiveDamageInfo.multiplier;
        const damage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        target.currentHP = Math.max(0, target.currentHP - damage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += damage;
        player.lastAttackDamage = damage;
        player.skillCooldowns[skillId] = 3;
        skillsThisTurn.add(skillId);
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} uses ${skill.name} on ${target.name} for ${damage} damage!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} uses ${skill.name} on ${target.name} for ${damage} damage!`
        });
      } else if (skillId === 'active_1' && player.characterClass === 'archer') {
        const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
        if (aliveMonsters.length === 0) {
          return res.status(400).json({ error: 'No monsters available' });
        }

        const targetCount = Math.max(1, skill.effect?.targetCount || 2);
        const selectedTargets = [];
        if (targetId) {
          const primary = aliveMonsters.find(m => m.id === targetId);
          if (primary) {
            selectedTargets.push(primary);
          }
        }
        aliveMonsters.forEach(monster => {
          if (selectedTargets.length < targetCount && !selectedTargets.includes(monster)) {
            selectedTargets.push(monster);
          }
        });

        if (selectedTargets.length === 0) {
          return res.status(400).json({ error: 'No targets found for Multi Shot' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * passiveDamageInfo.multiplier;
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        const actionDetails = [];
        const defeatedMonsters = new Set();

        selectedTargets.forEach(originalTarget => {
          if (!originalTarget.isAlive) {
            return;
          }

          let target = originalTarget;
          if (tauntingMonster && tauntingMonster.id !== originalTarget.id) {
            target = tauntingMonster;
          }

          const monsterPassive = getMonsterPassiveEffect(target) || {};
          if (monsterPassive.dodgeChance && Math.random() < monsterPassive.dodgeChance) {
            actionDetails.push(`${target.name}: dodged the arrow`);
            return;
          }

          const damage = calculateDamage(
            player.attack,
            effectivePuzzlePoints,
            totalMultiplier,
            false,
            gameState.gameConfig.critDamage
          );
          const reduction = getMonsterDamageReduction(target);
          const finalDamage = reduction > 0
            ? Math.max(1, Math.round(damage * (1 - reduction)))
            : damage;
          const beforeHP = target.currentHP;
          target.currentHP = Math.max(0, target.currentHP - finalDamage);
          if (target.currentHP <= 0) {
            target.isAlive = false;
            defeatedMonsters.add(target);
            ensurePlayerStats(player).kills += 1;
          }
          ensurePlayerStats(player).totalDamage += finalDamage;
          player.lastAttackDamage = finalDamage;
          actionDetails.push(`${target.name}: -${finalDamage} HP (HP ${beforeHP} -> ${target.currentHP}${reduction > 0 ? ', reduced' : ''}${target !== originalTarget ? ' | redirected by taunt' : ''})`);
        });

        player.skillCooldowns[skillId] = skill.cooldown || 4;
        skillsThisTurn.add(skillId);

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} fires ${skill.name}, striking ${selectedTargets.length} target(s)!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} unleashes ${skill.name}, arrows hitting multiple enemies!`,
          summaryDetails: actionDetails
        });

        defeatedMonsters.forEach(monster => {
          const deathLogs = handleMonsterDeath(monster, gameState, data);
          deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'player_turn',
              message
            });
          });
        });
      } else if (skillId === 'active_2' && player.characterClass === 'archer') {
        const target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }
        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * passiveDamageInfo.multiplier;
        const baseDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const critDamageMultiplier = gameState.gameConfig.critDamage || 2.0;
        const finalDamage = Math.max(1, Math.round(baseDamage * critDamageMultiplier));
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = 4;
        skillsThisTurn.add(skillId);
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName}'s ${skill.name} deals a critical hit to ${target.name} for ${finalDamage} damage!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName}'s ${skill.name} deals a critical hit to ${target.name} for ${finalDamage} damage!`
        });
      } else if (skillId === 'active_2' && player.characterClass === 'warrior') {
        let target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        let redirected = false;
        if (tauntingMonster && (!target || target.id !== tauntingMonster.id)) {
          target = tauntingMonster;
          redirected = true;
        }
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const skillMultiplier = skill.effect?.damageMultiplier || 1.5;
        const totalMultiplier = gameState.gameConfig.damageMultiplier * skillMultiplier * passiveDamageInfo.multiplier;
        const rawDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const monsterDamageReduction = getMonsterDamageReduction(target);
        const finalDamage = monsterDamageReduction > 0
          ? Math.max(1, Math.round(rawDamage * (1 - monsterDamageReduction)))
          : rawDamage;
        const beforeHP = target.currentHP;
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = skill.cooldown || 3;
        skillsThisTurn.add(skillId);

        addStatusToMonster(target, {
          type: 'stun',
          remainingTurns: skill.effect?.stunTurns || 2,
          skipActionsRemaining: 1,
          source: player.studentName
        });

        const statusMessage = `${target.name} is stunned for ${skill.effect?.stunTurns || 2} turns!`;
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} charges ${target.name} for ${finalDamage} damage${redirected ? ' (taunted)' : ''} and stuns it!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} charges ${target.name} for ${finalDamage} damage (HP ${beforeHP} -> ${target.currentHP})${monsterDamageReduction > 0 ? ' (reduced)' : ''}${redirected ? ' (taunted)' : ''}. ${statusMessage}`
        });

        if (!target.isAlive) {
          const deathLogs = handleMonsterDeath(target, gameState, data);
          deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'player_turn',
              message
            });
          });
        }
      } else if (skillId === 'active_2' && player.characterClass === 'wizard') {
        let target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        const ignoreTaunt = !!skill.effect?.ignoreTaunt;
        let redirected = false;
        if (!ignoreTaunt && tauntingMonster && (!target || tauntingMonster.id !== target.id)) {
          target = tauntingMonster;
          redirected = true;
        }
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const skillMultiplier = skill.effect?.damageMultiplier || 1.2;
        const totalMultiplier = gameState.gameConfig.damageMultiplier * skillMultiplier * passiveDamageInfo.multiplier;
        const rawDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const monsterDamageReduction = getMonsterDamageReduction(target);
        const finalDamage = monsterDamageReduction > 0
          ? Math.max(1, Math.round(rawDamage * (1 - monsterDamageReduction)))
          : rawDamage;
        const beforeHP = target.currentHP;
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = skill.cooldown || 4;
        skillsThisTurn.add(skillId);

        const freezeChance = skill.effect?.freezeChance ?? 0.4;
        const freezeDuration = skill.effect?.freezeDuration ?? 1;
        const frozeTarget = Math.random() < freezeChance && target.isAlive;
        if (frozeTarget) {
          addStatusToMonster(target, {
            type: 'freeze',
            remainingTurns: freezeDuration,
            skipActionsRemaining: 1,
            source: player.studentName
          });
        }

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} unleashes ${skill.name} on ${target.name} for ${finalDamage} damage${frozeTarget ? ' and freezes it!' : ''}${redirected ? ' (taunted)' : ''}.`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} strikes ${target.name} with ${skill.name} for ${finalDamage} damage (HP ${beforeHP} -> ${target.currentHP})${monsterDamageReduction > 0 ? ' (reduced)' : ''}${redirected ? ' (taunted)' : ''}${frozeTarget ? ` and freezes it for ${freezeDuration} turn${freezeDuration > 1 ? 's' : ''}!` : ''}`
        });

        if (!target.isAlive) {
          const deathLogs = handleMonsterDeath(target, gameState, data);
          deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'player_turn',
              message
            });
          });
        }
      } else if (skillId === 'active_1' && player.characterClass === 'assassin') {
        const target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }
        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * passiveDamageInfo.multiplier;
        const baseDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const critDamageMultiplier = (gameState.gameConfig.critDamage || 2.0) * 1.3;
        const finalDamage = Math.max(1, Math.round(baseDamage * critDamageMultiplier));
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = 4;
        skillsThisTurn.add(skillId);
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName}'s ${skill.name} deals a devastating critical for ${finalDamage} damage!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName}'s ${skill.name} deals a devastating critical for ${finalDamage} damage!`
        });
      } else if (skillId === 'active_2' && player.characterClass === 'assassin') {
        const target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * passiveDamageInfo.multiplier;
        const damage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const reduction = getMonsterDamageReduction(target);
        const finalDamage = reduction > 0
          ? Math.max(1, Math.round(damage * (1 - reduction)))
          : damage;
        const beforeHP = target.currentHP;
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = skill.cooldown || 4;
        skillsThisTurn.add(skillId);

        const dotTurns = Math.max(1, skill.effect?.dotTurns || 3);
        const dotDamage = Math.max(1, Math.round(damage * (skill.effect?.dotMultiplier || 0.2)));
        addStatusToMonster(target, {
          type: 'poison',
          remainingTurns: dotTurns,
          damagePerTurn: dotDamage,
          source: player.studentName
        });

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} poisons ${target.name}, dealing ${finalDamage} damage and applying poison!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} slashes ${target.name} for ${finalDamage} damage (HP ${beforeHP} -> ${target.currentHP}) and applies poison for ${dotTurns} turns.${reduction > 0 ? ' (reduced)' : ''}`,
          summaryDetails: [`Poison will deal ${dotDamage} damage per turn.`]
        });

        if (!target.isAlive) {
          const deathLogs = handleMonsterDeath(target, gameState, data);
          deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'player_turn',
              message
            });
          });
        }
      } else if (skillId === 'active_1' && player.characterClass === 'wizard') {
        const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
        if (aliveMonsters.length === 0) {
          return res.status(400).json({ error: 'No monsters available' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * (skill.effect?.damageMultiplier || 1) * passiveDamageInfo.multiplier;
        const baseDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const damageSummary = [];
        let totalDamageDealt = 0;
        const defeatedMonsters = [];

        aliveMonsters.forEach(monster => {
          const monsterReduction = getMonsterDamageReduction(monster);
          const finalDamage = monsterReduction > 0
            ? Math.max(1, Math.round(baseDamage * (1 - monsterReduction)))
            : baseDamage;
          const beforeHP = monster.currentHP;
          monster.currentHP = Math.max(0, monster.currentHP - finalDamage);
          totalDamageDealt += finalDamage;
          if (monster.currentHP <= 0) {
            monster.isAlive = false;
            defeatedMonsters.push(monster);
            ensurePlayerStats(player).kills += 1;
          }
          ensurePlayerStats(player).totalDamage += finalDamage;
          player.lastAttackDamage = finalDamage;
          damageSummary.push(`${monster.name}: -${finalDamage} HP (HP ${beforeHP} -> ${monster.currentHP}${monsterReduction > 0 ? ', reduced' : ''})`);
        });

        player.skillCooldowns[skillId] = skill.cooldown || 3;
        skillsThisTurn.add(skillId);

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} casts ${skill.name}, dealing ${baseDamage} base damage to all enemies!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} engulfs all enemies in ${skill.name}, dealing ${baseDamage} base damage each.`,
          summaryDetails: damageSummary
        });

        defeatedMonsters.forEach(monster => {
          const deathLogs = handleMonsterDeath(monster, gameState, data);
          deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'player_turn',
              message
            });
          });
        });
      } else if (skillId === 'active_1' && player.characterClass === 'priest') {
        const targetPlayer = gameState.players.find(p => p.studentId === targetId);
        if (!targetPlayer || !targetPlayer.isAlive) {
          return res.status(400).json({ error: 'Target player not found or not alive' });
        }
        const priestMaxHP = player.maxHP || 1;
        const selfCost = Math.max(1, Math.floor(priestMaxHP * 0.03));
        player.currentHP = Math.max(1, player.currentHP - selfCost);
    const healAmount = Math.max(1, Math.round(player.attack * ((targetPlayer.puzzlePoints || 0) + (player.puzzlePoints || 0)) * 0.1));
        const before = targetPlayer.currentHP;
        targetPlayer.currentHP = Math.min(targetPlayer.maxHP, targetPlayer.currentHP + healAmount);
        const actualHeal = targetPlayer.currentHP - before;
        if (actualHeal > 0) {
          ensurePlayerStats(player).healing += actualHeal;
        }
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} sacrifices ${selfCost} HP to heal ${targetPlayer.studentName} for ${actualHeal} HP.`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} sacrifices ${selfCost} HP to heal ${targetPlayer.studentName} for ${actualHeal} HP.`
        });
      } else if (skillId === 'active_2' && player.characterClass === 'priest') {
        const targetPlayer = gameState.players.find(p => p.studentId === targetId);
        if (!targetPlayer) {
          return res.status(400).json({ error: 'Target player not found' });
        }
        if (targetPlayer.isAlive) {
          return res.status(400).json({ error: 'Target player is already alive' });
        }
        targetPlayer.isAlive = true;
        targetPlayer.currentHP = Math.max(1, Math.floor(targetPlayer.maxHP * 0.5));
        targetPlayer.statuses = [];
        targetPlayer.accumulatedReviveRate = 0;
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} revives ${targetPlayer.studentName} with ${targetPlayer.currentHP} HP!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} revives ${targetPlayer.studentName} with ${targetPlayer.currentHP} HP!`
        });
      } else if (skillId === 'active_1' && player.characterClass === 'shield_warrior') {
        const target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }
        const damage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          gameState.gameConfig.damageMultiplier * (skill.effect?.damageMultiplier || 1),
          false,
          gameState.gameConfig.critDamage
        );
        target.currentHP = Math.max(0, target.currentHP - damage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += damage;
        player.lastAttackDamage = damage;
        target.attack = Math.max(1, Math.floor(target.attack * 0.8));
        target.debuffs = target.debuffs || {};
        target.debuffs.attackReducedUntilTurn = gameState.currentTurn + 1;
        player.skillCooldowns[skillId] = 3;
        skillsThisTurn.add(skillId);
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} strikes ${target.name} for ${damage} damage and weakens its attack!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} strikes ${target.name} for ${damage} damage and weakens its attack!`
        });
      } else if (skillId === 'active_2' && player.characterClass === 'shield_warrior') {
        let target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        let redirected = false;
        if (tauntingMonster && (!target || tauntingMonster.id !== target.id)) {
          target = tauntingMonster;
          redirected = true;
        }
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }

        const damage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          gameState.gameConfig.damageMultiplier * (skill.effect?.damageMultiplier || 1.2),
          false,
          gameState.gameConfig.critDamage
        );
        const reduction = getMonsterDamageReduction(target);
        const finalDamage = reduction > 0
          ? Math.max(1, Math.round(damage * (1 - reduction)))
          : damage;
        const beforeHP = target.currentHP;
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = skill.cooldown || 4;
        skillsThisTurn.add(skillId);

        let stunApplied = false;
        if (target.isAlive && Math.random() < (skill.effect?.stunChance || 0.3)) {
          addStatusToMonster(target, {
            type: 'stun',
            remainingTurns: skill.effect?.stunTurns || 1,
            skipActionsRemaining: 1,
            source: player.studentName
          });
          stunApplied = true;
        }

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} smashes ${target.name} for ${finalDamage} damage${stunApplied ? ' and stuns it!' : ''}${redirected ? ' (taunted)' : ''}`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} smashes ${target.name} for ${finalDamage} damage (HP ${beforeHP} -> ${target.currentHP})${reduction > 0 ? ' (reduced)' : ''}${redirected ? ' (taunted)' : ''}${stunApplied ? ' and stuns it!' : ''}`
        });

        if (!target.isAlive) {
          const deathLogs = handleMonsterDeath(target, gameState, data);
          deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'player_turn',
              message
            });
          });
        }
      }
    }
    
    // Check if all monsters are dead
    const allMonstersDead = gameState.monsters.every(m => !m.isAlive);
    if (allMonstersDead) {
      // Level complete
      gameState.currentLevel++;
      if (gameState.currentLevel > gameState.levelConfig.length) {
        // Game complete
        gameState.phase = 'game_over';

        if (!gameState.rewardsDistributed) {
          const baseReward = 20;
          const mvpBonus = 0;
          const participants = Array.isArray(gameState.players) ? gameState.players : [];

          // Prepare reward map
          const rewards = {};
          participants.forEach(player => {
            rewards[player.studentId] = baseReward;
            player.rewardPoints = baseReward;
            player.isMVP = false;
          });

          // Calculate MVP based on defined scoring formula
          let mvp = null;
          let maxScore = -1;
          participants.forEach(player => {
            const stats = player.stats || {};
            const score = (stats.totalDamage || 0) * 0.5 + (stats.kills || 0) * 20 + (stats.healing || 0) * 0.3;
            if (score > maxScore) {
              maxScore = score;
              mvp = player;
            }
          });

          if (mvp && rewards[mvp.studentId] !== undefined) {
            rewards[mvp.studentId] += mvpBonus;
            mvp.rewardPoints = rewards[mvp.studentId];
            mvp.isMVP = true;
          }

          // Update player stats for UI
          participants.forEach(player => {
            if (!player.stats) {
              player.stats = { totalDamage: 0, kills: 0, healing: 0, totalPoints: 0 };
            }
            player.stats.totalPoints = rewards[player.studentId] || baseReward;
          });

          // Apply rewards to students data
          participants.forEach(player => {
            const reward = rewards[player.studentId] || 0;
            const student = data.students.find(s => s.id === player.studentId);
            if (!student || reward <= 0) {
              return;
            }

            student.score = (student.score || 0) + reward;
            student.experience = student.score;

            const rankInfo = getRankInfo(student.score);
            student.rank = rankInfo.rank;
            student.rankIndex = rankInfo.rankIndex;
            student.level = rankInfo.rankIndex + 1;

            addRewardPointsToStats(student, reward);
          });

          gameState.rewardsDistributed = true;
          gameState.rewardsSummary = {
            baseReward,
            mvpBonus,
            rewards: participants.map(player => ({
              studentId: player.studentId,
              name: player.studentName,
              reward: rewards[player.studentId] || baseReward,
              isMVP: !!player.isMVP
            })),
            mvp: mvp ? {
              studentId: mvp.studentId,
              name: mvp.studentName,
              reward: rewards[mvp.studentId] || (baseReward + mvpBonus)
            } : null
          };

          const rewardMessage = mvp
            ? `Game Complete! Each player receives ${baseReward} points. MVP ${mvp.studentName} gains an extra ${mvpBonus} points!`
            : `Game Complete! Each player receives ${baseReward} points.`;

          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'game_over',
            message: rewardMessage
          });
        }
      } else {
        // Next level - set phase to level_complete so user can click button to proceed
        gameState.phase = 'level_complete';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'level_complete',
          message: `Level ${gameState.currentLevel - 1} complete! Ready to start level ${gameState.currentLevel}...`
        });
      }
    } else {
      // Mark player as acted, but don't auto-switch to monster turn
      // Let the user click "Process Monster Turn" button manually
      player.hasActed = true;
    }
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState, actionResult });
    res.json({ gameState, actionResult });
  } catch (error) {
    console.error('Error processing player action:', error);
    res.status(500).json({ error: 'Failed to process player action' });
  }
});

// Monster turn (AI)
app.post('/api/game/monster-turn', async (req, res) => {
  try {
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    
    // Check if all players have acted (if in player_turn phase)
    if (gameState.phase === 'player_turn') {
      const allPlayersActed = gameState.players.every(p => !p.isAlive || p.hasActed);
      if (!allPlayersActed) {
        return res.status(400).json({ error: 'Not all players have acted yet' });
      }
      // Switch to monster turn
      gameState.phase = 'monster_turn';
      // Reset player action flags for next turn
      gameState.players.forEach(p => p.hasActed = false);
    } else if (gameState.phase !== 'monster_turn') {
      return res.status(400).json({ error: 'Not monster turn' });
    }
    
    // Simple AI: Attack player with lowest HP
    let alivePlayers = gameState.players.filter(p => p.isAlive);
    if (alivePlayers.length === 0) {
      // Game over
      gameState.phase = 'game_over';
      gameState.actionLog.push({
        turn: gameState.currentTurn,
        phase: 'game_over',
        message: 'All players defeated! Game Over.'
      });
    } else {
      const statusLogs = applyPlayerStatusEffects(gameState);
      statusLogs.forEach(message => {
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'monster_turn',
          message
        });
      });

      alivePlayers = gameState.players.filter(p => p.isAlive);
      if (alivePlayers.length === 0) {
        gameState.phase = 'game_over';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'game_over',
          message: 'All players defeated! Game Over.'
        });
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        broadcast({ type: 'gameStateUpdated', gameState });
        return res.json(gameState);
      }

      const shamanLogs = applyShamanPassiveHealing(gameState, data);
      shamanLogs.forEach(message => {
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'monster_turn',
          message,
          summaryDetails: [message]
        });
      });

      const priestHeals = applyPriestPassiveHealing(gameState);
      if (priestHeals.length > 0) {
        priestHeals.forEach(event => {
          const targetSummary = event.targets
            ? event.targets.map(t => `${t.name} (+${t.amount})`).join(', ')
            : 'all allies';
          const summaryDetails = event.targets
            ? event.targets.map(t => `${t.name}: ${t.before} → ${t.after} (+${t.amount})`)
            : [];
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message: `${event.priestName}'s blessing heals ${targetSummary} for ${event.healAmount} HP each.`,
            summaryDetails
          });
        });
      }

      alivePlayers = gameState.players.filter(p => p.isAlive);
      if (alivePlayers.length === 0) {
        gameState.phase = 'game_over';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'game_over',
          message: 'All players defeated! Game Over.'
        });
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        broadcast({ type: 'gameStateUpdated', gameState });
        return res.json(gameState);
      }

      let shieldWarriorTaunt = alivePlayers.find(p => p.characterClass === 'shield_warrior');
      gameState.monsters.filter(m => m.isAlive).forEach(monster => {
        const statusDamage = applyMonsterStatusDamage(monster, gameState, data);
        statusDamage.logs.forEach(message => {
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message,
            summaryDetails: [message]
          });
        });
        if (statusDamage.deathLogs && statusDamage.deathLogs.length > 0) {
          statusDamage.deathLogs.forEach(message => {
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'monster_turn',
              message
            });
          });
          advanceMonsterStatuses(monster);
          return;
        }

        const controlStatus = processMonsterControlStatuses(monster);
        controlStatus.logs.forEach(message => {
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message,
            summaryDetails: [message]
          });
        });
        if (controlStatus.skipTurn) {
          advanceMonsterStatuses(monster);
          return;
        }

        const skillAttempt = attemptMonsterActiveSkill(monster, gameState);
        if (skillAttempt.used) {
          advanceMonsterStatuses(monster);
          return;
        }

        const passive = getMonsterPassiveEffect(monster) || {};
        const attackCount = passive.attackCount || 1;
        for (let attackIndex = 0; attackIndex < attackCount; attackIndex++) {
          alivePlayers = gameState.players.filter(p => p.isAlive);
          if (alivePlayers.length === 0) {
            break;
          }
          shieldWarriorTaunt = alivePlayers.find(p => p.characterClass === 'shield_warrior');
          let target = shieldWarriorTaunt || alivePlayers.reduce((lowest, p) =>
            p.currentHP < lowest.currentHP ? p : lowest
          );
          if (!target || !target.isAlive) {
            continue;
          }

          let attackMultiplier = passive.attackMultiplier || 1;
          if (passive.lowHPBonus) {
            if (typeof passive.lowHPBonus === 'object') {
              const threshold = passive.lowHPBonus.threshold ?? 0.5;
              const bonusMultiplier = passive.lowHPBonus.multiplier ?? 1.5;
              if ((monster.currentHP / monster.maxHP) <= threshold) {
                attackMultiplier *= bonusMultiplier;
              }
            } else if ((monster.currentHP / monster.maxHP) <= 0.5) {
              attackMultiplier *= 1.5;
            }
          }

          const critRate = passive.critRateBonus || 0;
          const isCrit = Math.random() < critRate;
          const critMultiplier = isCrit ? (gameState.gameConfig.critDamage || 2.0) : 1;

          const damageBeforeReduction = calculateDamage(
            monster.attack,
            1,
            gameState.gameConfig.damageMultiplier * attackMultiplier * critMultiplier,
            false,
            gameState.gameConfig.critDamage
          );

          const damageReduction = getDamageReduction(target);
          const damage = damageReduction > 0
            ? Math.max(1, Math.round(damageBeforeReduction * (1 - damageReduction)))
            : damageBeforeReduction;

          target.currentHP = Math.max(0, target.currentHP - damage);
          if (target.currentHP <= 0) {
            target.isAlive = false;
          }

          const critNote = isCrit ? ' (CRITICAL!)' : '';
          const reductionNote = damageReduction > 0 ? ' (reduced by shield)' : '';
          gameState.actionLog.push({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message: `${monster.name} attacks ${target.studentName} for ${damage} damage${critNote}${reductionNote}${!target.isAlive ? ' - DEFEATED!' : ''}`
          });

          if (passive.applyBleed) {
            addBleedStatusToPlayer(target, passive.applyBleed, monster.name);
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'monster_turn',
              message: `${monster.name} inflicts bleeding on ${target.studentName}!`
            });
          }

          if (passive.attackIncreaseOnHit && damage > 0) {
            const increase = passive.attackIncreaseOnHit;
            monster.attack = Math.max(1, (monster.attack || 0) + increase);
            if (typeof monster.attackGrowth !== 'number') {
              monster.attackGrowth = 0;
            }
            monster.attackGrowth += increase;
            gameState.actionLog.push({
              turn: gameState.currentTurn,
              phase: 'monster_turn',
              message: `${monster.name}'s attack rises to ${monster.attack} through Cunning Momentum!`
            });
          }

          if (passive.bleedingClaw && target.isAlive && damage > 0) {
            const bleedMessage = addBleedingClawStatusToPlayer(target, monster, passive.bleedingClaw);
            if (bleedMessage) {
              gameState.actionLog.push({
                turn: gameState.currentTurn,
                phase: 'monster_turn',
                message: bleedMessage
              });
            }
          }

          alivePlayers = gameState.players.filter(p => p.isAlive);
          if (alivePlayers.length === 0) {
            break;
          }
        }

        advanceMonsterStatuses(monster);
      });

      if (gameState.players.every(p => !p.isAlive)) {
        gameState.phase = 'game_over';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'game_over',
          message: 'All players defeated! Game Over.'
        });
      } else {
        gameState.currentTurn++;
        gameState.phase = 'player_turn';
      }
    }
    
    const completedTurnIndexRaw = (gameState.phase === 'player_turn' && typeof gameState.currentTurn === 'number')
      ? gameState.currentTurn - 1
      : gameState.currentTurn;
    const normalizedTurnIndex = typeof completedTurnIndexRaw === 'number'
      ? Math.max(0, completedTurnIndexRaw)
      : null;

    gameState.players.forEach(player => {
      if (player && player.skillCooldowns) {
        Object.keys(player.skillCooldowns).forEach(skillId => {
          const currentValue = player.skillCooldowns[skillId];
          if (typeof currentValue === 'number' && currentValue > 0) {
            player.skillCooldowns[skillId] = Math.max(0, currentValue - 1);
          }
        });
      }

      if (player && player.turnSkillsUsed && normalizedTurnIndex !== null) {
        if (player.turnSkillsUsed[normalizedTurnIndex] !== undefined) {
          delete player.turnSkillsUsed[normalizedTurnIndex];
        }
        if (Object.keys(player.turnSkillsUsed).length === 0) {
          delete player.turnSkillsUsed;
        }
      }
    });

    gameState.monsters.forEach(monster => {
      if (monster && monster.skillCooldowns) {
        Object.keys(monster.skillCooldowns).forEach(skillId => {
          const currentValue = monster.skillCooldowns[skillId];
          if (typeof currentValue === 'number' && currentValue > 0) {
            monster.skillCooldowns[skillId] = Math.max(0, currentValue - 1);
          }
        });
      }
    });
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState });
    res.json(gameState);
  } catch (error) {
    console.error('Error processing monster turn:', error);
    res.status(500).json({ error: 'Failed to process monster turn' });
  }
});

// Revive attempt
app.post('/api/game/revive', async (req, res) => {
  try {
    const { studentId, puzzlePoints } = req.body;
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    const player = gameState.players.find(p => p.studentId === studentId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    if (player.isAlive) {
      return res.status(400).json({ error: 'Player is already alive' });
    }
    
    // Calculate revive probability
    const reviveRate = calculateReviveProbability(
      puzzlePoints,
      gameState.gameConfig.baseReviveRate,
      gameState.gameConfig.reviveRateDecay,
      gameState.gameConfig.maxReviveRate,
      player.accumulatedReviveRate
    );
    
    const success = Math.random() < reviveRate;
    
    if (success) {
      player.isAlive = true;
      player.currentHP = Math.floor(player.maxHP * 0.5); // Revive with 50% HP
      player.accumulatedReviveRate = 0;
      player.puzzlePoints -= puzzlePoints;
      player.statuses = [];
      
      gameState.actionLog.push({
        turn: gameState.currentTurn,
        phase: 'revive',
        message: `${player.studentName} successfully revived with ${puzzlePoints} puzzle points!`
      });
    } else {
      player.accumulatedReviveRate = reviveRate; // Accumulate for next attempt
      player.puzzlePoints -= puzzlePoints;
      
      gameState.actionLog.push({
        turn: gameState.currentTurn,
        phase: 'revive',
        message: `${player.studentName} failed to revive (${(reviveRate * 100).toFixed(1)}% chance). Probability accumulated.`
      });
    }
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState, reviveResult: { success, reviveRate } });
    res.json({ success, reviveRate, gameState });
  } catch (error) {
    console.error('Error attempting revive:', error);
    res.status(500).json({ error: 'Failed to attempt revive' });
  }
});

app.get('/api/running-queen/leaderboard', async (req, res) => {
  try {
    const entries = await readRunningQueenLeaderboard();
    res.json({ entries });
  } catch (error) {
    console.error('Error fetching Running Queen leaderboard:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.post('/api/running-queen/leaderboard', async (req, res) => {
  try {
    const { players, score, duration, status, mode, queenCount, timerDurationMs, timerDuration } = req.body || {};
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'Players list is required' });
    }
    const normalizedPlayers = players.map(player => ({
      name: player.name || 'Unknown',
      studentId: player.studentId || '',
      id: player.id || null
    }));
    const entries = await addRunningQueenLeaderboardEntry({
      players: normalizedPlayers,
      score,
      duration,
      status,
      mode,
      queenCount,
      timerDurationMs: timerDurationMs || timerDuration
    });
    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error updating Running Queen leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

app.get('/api/royal-exchange/leaderboard', async (req, res) => {
  try {
    const entries = await readRoyalExchangeLeaderboard();
    // Only show successful completions. Keep legacy entries (without success field) visible.
    const filtered = Array.isArray(entries)
      ? entries.filter(entry => entry && (entry.success === true || typeof entry.success === 'undefined'))
      : [];
    // Show only each person's/team's best result per difficulty.
    const deduped = dedupeRoyalExchangeLeaderboardEntries(filtered);
    deduped.sort((a, b) => {
      if ((a.difficulty || 'normal') !== (b.difficulty || 'normal')) {
        return String(a.difficulty || 'normal').localeCompare(String(b.difficulty || 'normal'));
      }
      if (Number(a.steps) !== Number(b.steps)) return Number(a.steps) - Number(b.steps);
      if (Number(a.duration) !== Number(b.duration)) return Number(a.duration) - Number(b.duration);
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    res.json({ entries: deduped });
  } catch (error) {
    console.error('Error fetching Royal Exchange leaderboard:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.post('/api/royal-exchange/leaderboard', async (req, res) => {
  try {
    const { success, players, steps, duration, difficulty, createdAt } = req.body || {};
    if (success !== true) {
      return res.status(400).json({ error: 'Only successful completions can be recorded' });
    }
    if (!Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'Players list is required' });
    }
    const normalizedPlayers = players.map(player => ({
      name: player.name || 'Unknown',
      studentId: player.studentId || '',
      id: player.id || null
    }));
    const entries = await addRoyalExchangeLeaderboardEntry({
      success: true,
      players: normalizedPlayers,
      steps,
      duration,
      difficulty,
      createdAt
    });
    res.json({ success: true, entries });
  } catch (error) {
    console.error('Error updating Royal Exchange leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// Hope Mate leaderboard (teacher scoped)
app.get('/api/hope-mate/leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    const teacherId = String(req.user?.id || '');
    const all = await readHopeMateLeaderboard();
    const filtered = (Array.isArray(all) ? all : [])
      .map(e => normalizeHopeMateEntry(e))
      .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId);
    filtered.sort((a, b) => {
      if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    });
    res.json({ entries: filtered });
  } catch (error) {
    console.error('Error fetching Hope Mate leaderboard:', error);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.post('/api/hope-mate/leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    const teacherId = String(req.user?.id || '');
    const studentInternalId = String(req.body?.studentId || '');
    const totalScore = Number(req.body?.totalScore);
    if (!studentInternalId) return res.status(400).json({ error: 'studentId is required' });
    if (!Number.isFinite(totalScore) || totalScore < 0) return res.status(400).json({ error: 'totalScore must be a non-negative number' });

    // Validate student exists within this teacher's organization
    const data = await readData();
    let students = Array.isArray(data?.students) ? data.students : [];
    if (orgId) {
      students = filterStudentsByOrganization(students, orgId);
    }
    const student = students.find(s => String(s?.id) === studentInternalId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const updated = await upsertHopeMateLeaderboardEntry({
      orgId: String(orgId || ''),
      teacherId,
      student: {
        id: String(student.id),
        name: String(student.name || 'Unknown'),
        studentId: String(student.studentId || '')
      },
      totalScore
    });

    const scoped = updated
      .map(e => normalizeHopeMateEntry(e))
      .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId);
    scoped.sort((a, b) => {
      if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    });

    res.json({ ok: true, entries: scoped });
  } catch (error) {
    if (error && error.code === 'SCORE_JUMP') {
      return res.status(400).json({ error: 'Invalid score update' });
    }
    console.error('Error updating Hope Mate leaderboard:', error);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// Hope Mate Challenge leaderboard (teacher scoped, per durationSec)
app.get('/api/hope-mate/challenge-leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    const teacherId = String(req.user?.id || '');
    const durationSec = Number(req.query?.durationSec);
    if (!HOPE_MATE_CHALLENGE_DURATIONS.has(durationSec)) {
      return res.status(400).json({ error: 'durationSec must be one of 60, 120, 180' });
    }
    const all = await readHopeMateChallengeLeaderboard();
    const scoped = (Array.isArray(all) ? all : [])
      .map(e => normalizeHopeMateChallengeEntry(e))
      .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId && Number(e.durationSec) === durationSec);
    scoped.sort((a, b) => {
      if ((b.totalSolved || 0) !== (a.totalSolved || 0)) return (b.totalSolved || 0) - (a.totalSolved || 0);
      if ((b.bestLevel || 0) !== (a.bestLevel || 0)) return (b.bestLevel || 0) - (a.bestLevel || 0);
      if ((b.bestTimeLeftSec || 0) !== (a.bestTimeLeftSec || 0)) return (b.bestTimeLeftSec || 0) - (a.bestTimeLeftSec || 0);
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    });
    return res.json({ entries: scoped });
  } catch (error) {
    console.error('Error fetching Hope Mate Challenge leaderboard:', error);
    return res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

app.post('/api/hope-mate/challenge-leaderboard', authenticateUser, authorizeRole('teacher'), requireOrganizationAccess, async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    const teacherId = String(req.user?.id || '');
    const studentInternalId = String(req.body?.studentId || '');
    const durationSec = Number(req.body?.durationSec);
    const totalSolved = Number(req.body?.totalSolved);
    const bestLevel = Number(req.body?.bestLevel);
    const bestTimeLeftSec = Number(req.body?.bestTimeLeftSec);

    if (!studentInternalId) return res.status(400).json({ error: 'studentId is required' });
    if (!HOPE_MATE_CHALLENGE_DURATIONS.has(durationSec)) return res.status(400).json({ error: 'durationSec must be one of 60, 120, 180' });
    if (!Number.isFinite(totalSolved) || totalSolved < 0) return res.status(400).json({ error: 'totalSolved must be a non-negative number' });
    if (!Number.isFinite(bestLevel) || bestLevel < 1 || bestLevel > 10) return res.status(400).json({ error: 'bestLevel must be between 1 and 10' });
    if (!Number.isFinite(bestTimeLeftSec) || bestTimeLeftSec < 0 || bestTimeLeftSec > durationSec) return res.status(400).json({ error: 'bestTimeLeftSec must be between 0 and durationSec' });

    const data = await readData();
    let students = Array.isArray(data?.students) ? data.students : [];
    if (orgId) students = filterStudentsByOrganization(students, orgId);
    const student = students.find(s => String(s?.id) === studentInternalId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const updated = await upsertHopeMateChallengeEntry({
      orgId: String(orgId || ''),
      teacherId,
      durationSec,
      student: {
        id: String(student.id),
        name: String(student.name || 'Unknown'),
        studentId: String(student.studentId || '')
      },
      totalSolved,
      bestLevel,
      bestTimeLeftSec
    });

    const scoped = (Array.isArray(updated) ? updated : [])
      .map(e => normalizeHopeMateChallengeEntry(e))
      .filter(e => String(e.orgId) === String(orgId) && String(e.teacherId) === teacherId && Number(e.durationSec) === durationSec);
    scoped.sort((a, b) => {
      if ((b.totalSolved || 0) !== (a.totalSolved || 0)) return (b.totalSolved || 0) - (a.totalSolved || 0);
      if ((b.bestLevel || 0) !== (a.bestLevel || 0)) return (b.bestLevel || 0) - (a.bestLevel || 0);
      if ((b.bestTimeLeftSec || 0) !== (a.bestTimeLeftSec || 0)) return (b.bestTimeLeftSec || 0) - (a.bestTimeLeftSec || 0);
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    });
    return res.json({ ok: true, entries: scoped });
  } catch (error) {
    console.error('Error updating Hope Mate Challenge leaderboard:', error);
    return res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// ============================
// Billing (PayPal subscriptions)
// ============================

// Admin: sync active+live prices to PayPal (auto-create Product/Plans, store paypalPlanId back into price records)
app.post('/api/admin/billing/paypal/sync-prices', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const prices = await readSubscriptionPrices();
    const activeLive = prices.filter(p => String(p.status) === 'active' && String(p.publishState) === 'live');
    const updates = [];
    for (const price of activeLive) {
      const { paypalProductId, paypalPlanId, reused } = await ensurePayPalPlanForPrice(price);
      updates.push({ id: price.id, code: price.code, paypalPlanId, reused });
      price.paypalProductId = paypalProductId;
      price.paypalPlanId = paypalPlanId;
    }
    await writeSubscriptionPrices(prices);
    res.json({ ok: true, updated: updates.length, updates });
  } catch (error) {
    console.error('PayPal sync-prices error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync prices' });
  }
});

// =========================
// Admin - Hope Mate Stage Puzzles (manual FEN library)
// =========================
const HOPE_MATE_STAGE_KEYS = new Set([
  'rook',
  'queen',
  'minor',
  'pawns',
  'twoRooks',
  'rookKnight',
  'queenBishop',
  'queenKnight',
  'queenRook',
  'threePieces'
]);

app.get('/api/admin/games/hope-mate/stage-puzzles', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const stageKey = String(req.query.stageKey || '').trim();
    const data = await readHopeMateStagePuzzlesFile();
    let puzzles = data.puzzles || [];
    if (stageKey) puzzles = puzzles.filter((p) => p.stageKey === stageKey);
    return res.json({ puzzles });
  } catch (e) {
    console.error('Admin get Hope Mate stage puzzles failed:', e);
    return res.status(500).json({ error: 'Failed to load puzzles' });
  }
});

app.post('/api/admin/games/hope-mate/stage-puzzles', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const stageKey = String(req.body?.stageKey || '').trim();
    const fen = String(req.body?.fen || '').trim();
    if (!HOPE_MATE_STAGE_KEYS.has(stageKey)) {
      return res.status(400).json({ error: 'Invalid stageKey' });
    }
    const v = validateFen8x8(fen);
    if (!v.ok) return res.status(400).json({ error: v.reason || 'Invalid FEN' });

    const data = await readHopeMateStagePuzzlesFile();
    const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];

    const id = `hm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const entry = { id, stageKey, fen: v.fen, createdAt: new Date().toISOString() };
    puzzles.unshift(entry);

    const ok = await writeHopeMateStagePuzzlesFile({ puzzles });
    if (!ok) return res.status(500).json({ error: 'Failed to save puzzle' });
    return res.json({ ok: true, puzzle: entry });
  } catch (e) {
    console.error('Admin add Hope Mate stage puzzle failed:', e);
    return res.status(500).json({ error: 'Failed to save puzzle' });
  }
});

app.delete('/api/admin/games/hope-mate/stage-puzzles/:id', authenticateUser, authorizeRole('admin'), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const data = await readHopeMateStagePuzzlesFile();
    const puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
    const next = puzzles.filter((p) => p.id !== id);
    if (next.length === puzzles.length) return res.status(404).json({ error: 'Not found' });

    const ok = await writeHopeMateStagePuzzlesFile({ puzzles: next });
    if (!ok) return res.status(500).json({ error: 'Failed to delete puzzle' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('Admin delete Hope Mate stage puzzle failed:', e);
    return res.status(500).json({ error: 'Failed to delete puzzle' });
  }
});

// Organization: create PayPal subscription for a selected priceId (active+live only)
app.post('/api/organizations/billing/subscriptions', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

    const priceId = String(req.body?.priceId || '');
    if (!priceId) return res.status(400).json({ error: 'priceId is required' });

    const prices = await readSubscriptionPrices();
    const price = prices.find(p => String(p.id) === priceId);
    if (!price) return res.status(404).json({ error: 'Price not found' });
    if (!(String(price.status) === 'active' && String(price.publishState) === 'live')) {
      return res.status(400).json({ error: 'Price is not Active + Live' });
    }

    if (!price.paypalPlanId) {
      const ensured = await ensurePayPalPlanForPrice(price);
      price.paypalProductId = ensured.paypalProductId;
      price.paypalPlanId = ensured.paypalPlanId;
      await writeSubscriptionPrices(prices);
    }

    const { id, status, approvalUrl } = await paypal.createSubscription({
      planId: price.paypalPlanId,
      orgId,
      returnPath: '/organization.html',
      cancelPath: '/organization.html'
    });

    await upsertBillingSubscriptionFromPayPal({
      orgId,
      priceId: price.id,
      paypalSubscriptionId: id,
      paypalPlanId: price.paypalPlanId,
      status,
      billingType: price.billingType,
      currency: price.currency,
      currentPeriodEnd: null
    });

    res.json({ ok: true, subscriptionId: id, approvalUrl });
  } catch (error) {
    console.error('Create org subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
});

// Organization: after PayPal approve redirect, force-refresh subscription state from PayPal (fallback when webhook is delayed)
app.post('/api/organizations/billing/subscriptions/refresh', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

    const subscriptionId = String(req.body?.subscriptionId || '');
    if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId is required' });

    const refreshed = await refreshSubscriptionAndEntitlement(subscriptionId);

    // Security: ensure the subscription belongs to this org
    if (refreshed.orgId && String(refreshed.orgId) !== String(orgId)) {
      return res.status(403).json({ error: 'Subscription does not belong to this organization' });
    }

    res.json({ ok: true, refreshed });
  } catch (error) {
    console.error('Refresh subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh subscription' });
  }
});

// Organization: cancel PayPal subscription (stop auto-renew; PayPal decides whether it remains active until period end)
app.post('/api/organizations/billing/subscriptions/cancel', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

    let subscriptionId = String(req.body?.subscriptionId || '');
    if (!subscriptionId) {
      const latest = await billingDb.query(
        'SELECT paypal_subscription_id FROM billing_subscriptions WHERE org_id=$1 ORDER BY updated_at DESC NULLS LAST LIMIT 1',
        [orgId]
      );
      subscriptionId = String(latest.rows[0]?.paypal_subscription_id || '');
    }
    if (!subscriptionId) return res.status(404).json({ error: 'No subscription found for this organization' });

    // Security: verify subscription belongs to this org (via PayPal custom_id when available)
    const pre = await paypal.getSubscription(subscriptionId);
    const customOrg = String(pre?.custom_id || '');
    if (customOrg && customOrg !== String(orgId)) {
      return res.status(403).json({ error: 'Subscription does not belong to this organization' });
    }

    const reason = String(req.body?.reason || 'Customer requested cancellation');
    await paypal.cancelSubscription({ subscriptionId, reason });

    // Mark local intent (useful for UI even if PayPal keeps it active until period end)
    await billingDb.query(
      'UPDATE billing_subscriptions SET cancel_at_period_end=TRUE, updated_at=NOW() WHERE paypal_subscription_id=$1',
      [subscriptionId]
    );

    const refreshed = await refreshSubscriptionAndEntitlement(subscriptionId);

    // Security: ensure the subscription belongs to this org
    if (refreshed.orgId && String(refreshed.orgId) !== String(orgId)) {
      return res.status(403).json({ error: 'Subscription does not belong to this organization' });
    }

    res.json({ ok: true, refreshed });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

// Organization: read current entitlement status (computed)
app.get('/api/organizations/billing/status', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const orgId = resolveOrgIdFromUser(req.user);
    if (!orgId) return res.status(400).json({ error: 'Missing organization id' });

    const ent = await billingDb.query('SELECT * FROM billing_entitlements WHERE org_id=$1', [orgId]);
    const sub = await billingDb.query(
      'SELECT * FROM billing_subscriptions WHERE org_id=$1 ORDER BY updated_at DESC NULLS LAST LIMIT 1',
      [orgId]
    );
    const trial = await billingDb.query('SELECT * FROM billing_trials WHERE org_id=$1', [orgId]);

    const entitlement = ent.rows[0] || null;
    const subscription = sub.rows[0] || null;
    const trialRow = trial.rows[0] || null;

    const now = new Date();
    const computedStatus = entitlement
      ? computeEntitlementStatus(now, entitlement.current_period_end, entitlement.grace_until)
      : 'inactive';

    let graceDaysLeft = null;
    if (entitlement?.grace_until) {
      const ms = new Date(entitlement.grace_until).getTime() - now.getTime();
      graceDaysLeft = Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
    }

    let trialActive = false;
    let trialDaysLeft = null;
    if (trialRow?.trial_end) {
      const ms = new Date(trialRow.trial_end).getTime() - now.getTime();
      trialDaysLeft = Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)));
      trialActive = ms >= 0;
    }

    res.json({
      orgId,
      status: computedStatus,
      graceDaysLeft,
      trial: trialRow
        ? {
            trialStart: trialRow.trial_start || null,
            trialEnd: trialRow.trial_end || null,
            active: trialActive,
            daysLeft: trialDaysLeft
          }
        : null,
      entitlement,
      subscription
    });
  } catch (error) {
    console.error('Get billing status error:', error);
    res.status(500).json({ error: error.message || 'Failed to load billing status' });
  }
});

// Organization: list available subscription plans (Active + Live prices only)
app.get('/api/organizations/billing/plans', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const prices = await readSubscriptionPrices();
    const activeLive = prices
      .filter(p => String(p.status) === 'active' && String(p.publishState) === 'live')
      .map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        amount: Number(p.amount || 0),
        currency: String(p.currency || 'HKD').toUpperCase(),
        billingType: String(p.billingType || 'monthly'),
        limits: p.limits || {},
        features: p.features || {}
      }));

    const monthlyEquivalent = (p) => {
      const n = Number(p.amount || 0);
      return p.billingType === 'yearly' ? n / 12 : n;
    };

    activeLive.sort((a, b) => {
      const va = monthlyEquivalent(a);
      const vb = monthlyEquivalent(b);
      if (va !== vb) return va - vb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    res.json({ plans: activeLive });
  } catch (error) {
    console.error('Get org billing plans error:', error);
    res.status(500).json({ error: error.message || 'Failed to load plans' });
  }
});

// PayPal webhook (Sandbox/Live) - signature verification + store event + refresh subscription + update entitlement
app.post('/api/webhooks/paypal', async (req, res) => {
  try {
    const eventBody = req.body;
    const verify = await paypal.verifyWebhookSignature({ req, eventBody });
    if (!verify.ok) {
      console.warn('PayPal webhook signature failed:', verify.reason);
      return res.status(400).json({ ok: false });
    }

    const eventId = String(eventBody?.id || '');
    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'Missing event id' });
    }

    // Idempotency: ignore duplicates
    await billingDb.query(
      `
      INSERT INTO billing_webhook_events(paypal_event_id, event_type, resource_type, resource_id, raw)
      VALUES ($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT (paypal_event_id) DO NOTHING
    `,
      [
        eventId,
        eventBody?.event_type || null,
        eventBody?.resource_type || null,
        eventBody?.resource?.id || null,
        JSON.stringify(eventBody)
      ]
    );

    // Try to refresh subscription state when we can extract subscription id
    const type = String(eventBody?.event_type || '');
    let subscriptionId = null;
    if (type.startsWith('BILLING.SUBSCRIPTION.')) {
      subscriptionId = eventBody?.resource?.id || null;
    } else if (eventBody?.resource?.billing_agreement_id) {
      subscriptionId = eventBody.resource.billing_agreement_id;
    }

    if (subscriptionId) {
      await refreshSubscriptionAndEntitlement(String(subscriptionId));
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('PayPal webhook error:', error);
    res.status(500).json({ ok: false });
  }
});

// Save game state
app.post('/api/game/save', async (req, res) => {
  try {
    const { day, time } = req.body;
    
    if (!day || !time) {
      return res.status(400).json({ error: 'Day and time are required' });
    }
    
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({ error: 'Invalid day' });
    }
    
    const timeMatch = time.match(/^(\d{2}):?(\d{2})$/);
    if (!timeMatch) {
      return res.status(400).json({ error: 'Invalid time format' });
    }
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game to save' });
    }
    
    const filename = `game_${day}_${time.replace(':', '')}.txt`;
    const filepath = path.join(GAME_SAVES_DIR, filename);
    
    const saveData = {
      day,
      time,
      savedAt: new Date().toISOString(),
      gameState: data.gameState.current
    };
    
    await fs.writeFile(filepath, JSON.stringify(saveData, null, 2), 'utf8');
    
    res.json({ success: true, filename, savedAt: saveData.savedAt });
  } catch (error) {
    console.error('Error saving game:', error);
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// Get game saves list
app.get('/api/game/saves', async (req, res) => {
  try {
    const files = await fs.readdir(GAME_SAVES_DIR);
    const saves = [];
    
    for (const file of files) {
      if (file.endsWith('.txt')) {
        try {
          const filepath = path.join(GAME_SAVES_DIR, file);
          const content = await fs.readFile(filepath, 'utf8');
          const saveData = JSON.parse(content);
          saves.push({
            filename: file,
            day: saveData.day,
            time: saveData.time,
            savedAt: saveData.savedAt
          });
        } catch (err) {
          console.error(`Error reading save file ${file}:`, err);
        }
      }
    }
    
    saves.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    res.json(saves);
  } catch (error) {
    console.error('Error getting game saves:', error);
    res.status(500).json({ error: 'Failed to get game saves' });
  }
});

// Load game state
app.post('/api/game/load', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    
    const filepath = path.join(GAME_SAVES_DIR, filename);
    const content = await fs.readFile(filepath, 'utf8');
    const saveData = JSON.parse(content);
    
    const data = await readData();
    if (!data.gameState) {
      data.gameState = {};
    }
    data.gameState.current = saveData.gameState;
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState: saveData.gameState });
    res.json(saveData.gameState);
  } catch (error) {
    console.error('Error loading game:', error);
    res.status(500).json({ error: 'Failed to load game' });
  }
});

// Delete game save
app.delete('/api/game/saves/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(GAME_SAVES_DIR, filename);
    await fs.unlink(filepath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting game save:', error);
    res.status(500).json({ error: 'Failed to delete game save' });
  }
});

// Get game settings (for editing)
app.get('/api/game/settings', async (req, res) => {
  try {
    const data = await readData();
    
    // Get current game settings or defaults
    const settings = {
      config: data.gameState?.current?.gameConfig || { ...GAME_CONFIG },
      playerClasses: data.gameSettings?.playerClasses || PLAYER_CLASSES,
      monsterTypes: data.gameSettings?.monsterTypes || MONSTER_TYPES,
      levelConfig: data.gameState?.current?.levelConfig || []
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error getting game settings:', error);
    res.status(500).json({ error: 'Failed to get game settings' });
  }
});

// Update game config (teacher settings)
app.post('/api/game/config', async (req, res) => {
  try {
    const { config, playerClasses, monsterTypes, levelConfig } = req.body;
    
    const data = await readData();
    
    // Store settings in data file for persistence
    if (!data.gameSettings) {
      data.gameSettings = {};
    }
    
    // Update global settings
    if (config) {
      if (!data.gameSettings.config) {
        data.gameSettings.config = { ...GAME_CONFIG };
      }
      Object.assign(data.gameSettings.config, config);
    }
    
    // Update player classes
    if (playerClasses) {
      data.gameSettings.playerClasses = playerClasses;
    }
    
    // Update monster types
    if (monsterTypes) {
      data.gameSettings.monsterTypes = monsterTypes;
    }
    
    // Update level config
    if (levelConfig) {
      if (!data.gameState) {
        data.gameState = {};
      }
      if (!data.gameState.current) {
        data.gameState.current = {};
      }
      data.gameState.current.levelConfig = levelConfig;
    }
    
    // Also update current game's config if game is active
    if (data.gameState && data.gameState.current) {
      if (config) {
        Object.assign(data.gameState.current.gameConfig, config);
      }
      if (levelConfig) {
        data.gameState.current.levelConfig = levelConfig;
      }
    }
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameConfigUpdated', config: config || data.gameSettings.config });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating game config:', error);
    res.status(500).json({ error: 'Failed to update game config' });
  }
});

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

// Get attendance records
app.get('/api/attendance', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { timetableEntryId, date, studentId } = req.query;
    let records = await readAttendance();
    
    // Filter
    if (req.organizationFilter) {
        records = records.filter(r => r.organizationId === req.organizationFilter);
    }
    
    if (timetableEntryId) {
        records = records.filter(r => r.timetableEntryId === timetableEntryId);
    }
    if (date) {
        records = records.filter(r => r.date === date);
    }
    if (studentId) {
        records = records.filter(r => r.studentId === studentId);
    }
    
    res.json(records);
  } catch (error) {
    console.error('Error getting attendance:', error);
    res.status(500).json({ error: 'Failed to get attendance' });
  }
});

// Save attendance records
app.post('/api/attendance', authenticateUser, requireOrganizationAccess, async (req, res) => {
  try {
    const { timetableEntryId, date, records } = req.body;
    
    if (!timetableEntryId || !date || !Array.isArray(records)) {
        return res.status(400).json({ error: 'Invalid data' });
    }
    
    let allRecords = await readAttendance();
    let organizationId;
    
    if (req.user.role === 'admin') {
        const timetableData = await readTimetable();
        const entry = timetableData.entries.find(e => e.id === timetableEntryId);
        if (!entry) return res.status(404).json({ error: 'Entry not found' });
        organizationId = entry.organizationId;
    } else {
        organizationId = req.user.organizationId;
    }
    
    records.forEach(rec => {
        const existingIndex = allRecords.findIndex(r => 
            r.timetableEntryId === timetableEntryId && 
            r.date === date && 
            r.studentId === rec.studentId
        );
        
        const newRecord = {
            id: existingIndex !== -1 ? allRecords[existingIndex].id : `att_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            organizationId,
            timetableEntryId,
            date,
            studentId: rec.studentId,
            status: rec.status,
            updatedAt: new Date().toISOString(),
            updatedBy: req.user.id
        };
        
        if (existingIndex !== -1) {
            allRecords[existingIndex] = newRecord;
        } else {
            allRecords.push(newRecord);
        }
    });
    
    await writeAttendance(allRecords);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: 'Failed to save attendance' });
  }
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

// Adjust Student Balance
app.post('/api/organizations/students/:id/balance', authenticateUser, authorizeRole('organization', 'teacher'), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, note } = req.body;
    
    if (!amount || !type || !['credit', 'debit'].includes(type)) {
        return res.status(400).json({ error: 'Invalid data' });
    }
    
    const data = await readData();
    const studentIndex = data.students.findIndex(s => s.id === id);
    if (studentIndex === -1) return res.status(404).json({ error: 'Student not found' });
    
    const student = data.students[studentIndex];
    const orgId = req.user.organizationId;
    
    if (student.organizationId !== orgId) return res.status(403).json({ error: 'Access denied' });
    
    const value = parseFloat(amount);
    if (isNaN(value)) return res.status(400).json({ error: 'Invalid amount' });
    
    const oldBalance = student.balance || 0;
    if (type === 'credit') {
        student.balance = oldBalance + value;
    } else {
        student.balance = oldBalance - value;
    }
    
    const transactions = await readTransactions();
    const transaction = {
        id: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: orgId,
        studentId: id,
        type,
        amount: value,
        balanceBefore: oldBalance,
        balanceAfter: student.balance,
        note: note || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
    };
    transactions.push(transaction);
    
    await writeData(data);
    await writeTransactions(transactions);
    
    res.json({ success: true, balance: student.balance, transaction });
    
  } catch (error) {
    console.error('Error adjusting balance:', error);
    res.status(500).json({ error: 'Failed to adjust balance' });
  }
});

// Get Transactions
app.get('/api/organizations/transactions', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { studentId } = req.query;
    const transactions = await readTransactions();
    const orgId = req.user.organizationId;
    
    let filtered = transactions.filter(t => t.organizationId === orgId);
    if (studentId) {
        filtered = filtered.filter(t => t.studentId === studentId);
    }
    
    res.json(filtered);
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Get Organization Orders
app.get('/api/organizations/orders', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) return res.status(403).json({ error: 'Org not found' });
    
    const orders = await readOrders();
    const orgOrders = orders.filter(o => o.organizationId === orgUser.organizationId);
    
    res.json(orgOrders);
  } catch (error) {
    console.error('Error getting orders:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Update Order Status
app.patch('/api/organizations/orders/:id/status', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentDetails } = req.body;
    
    if (!['paid', 'unpaid', 'cancelled', 'refunded'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    
    const orders = await readOrders();
    const orderIndex = orders.findIndex(o => o.id === id);
    
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
    
    const order = orders[orderIndex];
    if (order.organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    order.status = status;
    if (paymentDetails) {
        order.paymentDetails = paymentDetails;
    }
    order.updatedAt = new Date().toISOString();
    order.updatedBy = req.user.id;
    
    await writeOrders(orders);
    
    res.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// Delete Order
app.delete('/api/organizations/orders/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { id } = req.params;
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    
    const orders = await readOrders();
    const orderIndex = orders.findIndex(o => o.id === id);
    
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });
    
    if (orders[orderIndex].organizationId !== orgUser.organizationId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    orders.splice(orderIndex, 1);
    await writeOrders(orders);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

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

// Get Expenses
app.get('/api/organizations/expenses', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const expenses = await readExpenses();
    const orgExpenses = expenses.filter(e => e.organizationId === req.user.organizationId);
    res.json(orgExpenses);
  } catch (error) {
    console.error('Error getting expenses:', error);
    res.status(500).json({ error: 'Failed to get expenses' });
  }
});

// Add Expense
app.post('/api/organizations/expenses', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { item, amount, date, category, note } = req.body;
    
    if (!item || !amount || !date || !category) {
        return res.status(400).json({ error: 'Required fields missing' });
    }
    
    const expenses = await readExpenses();
    const newExpense = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        organizationId: req.user.organizationId,
        item,
        amount: parseFloat(amount),
        date,
        category,
        note: note || '',
        createdAt: new Date().toISOString(),
        createdBy: req.user.id
    };
    
    expenses.push(newExpense);
    await writeExpenses(expenses);
    
    res.json(newExpense);
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// Delete Expense
app.delete('/api/organizations/expenses/:id', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { id } = req.params;
    const expenses = await readExpenses();
    const index = expenses.findIndex(e => e.id === id);
    
    if (index === -1) return res.status(404).json({ error: 'Expense not found' });
    if (expenses[index].organizationId !== req.user.organizationId) return res.status(403).json({ error: 'Access denied' });
    
    expenses.splice(index, 1);
    await writeExpenses(expenses);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Create Sales Order
app.post('/api/organizations/orders', authenticateUser, authorizeRole('organization'), async (req, res) => {
  console.log('[DEBUG] POST /orders called');
  try {
    const { studentId, items, paymentStatus, paymentDetails } = req.body;
    console.log('[DEBUG] Order Payload:', { studentId, itemCount: items?.length, paymentStatus });

    if (!studentId || !items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid order data' });
    }
    
    // Check organization access
    const users = await readUsers();
    const orgUser = users.find(u => u.id === req.user.id);
    if (!orgUser || !orgUser.organizationId) {
      return res.status(403).json({ error: 'Organization not found' });
    }

    // 1. Save Order
    const orders = await readOrders();
    const newOrder = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organizationId: orgUser.organizationId,
      studentId,
      date: new Date().toISOString(),
      status: paymentStatus || 'unpaid', // unpaid, paid
      paymentDetails: paymentDetails || null,
      items: items, // Store full structure
      totalAmount: items.reduce((sum, item) => sum + (item.price || 0), 0),
      createdBy: req.user.id
    };
    
    orders.push(newOrder);
    await writeOrders(orders);
    
    // 2. Process Enrollments
    const enrollments = await readEnrollments();
    const timetableData = await readTimetable();
    let timetableModified = false;
    
    for (const item of items) {
      if (item.enrolledClasses && Array.isArray(item.enrolledClasses)) {
        for (const cls of item.enrolledClasses) {
          let entryId = cls.id;
          
          // Try to find exact match first (for Single classes or raw IDs)
          let entry = timetableData.entries.find(e => e.id === entryId);
          
          // If not found, check if it's a recurring instance (ID_Timestamp)
          if (!entry && cls.id.includes('_')) {
             // Try removing the last segment (timestamp)
             const lastUnderscoreIndex = cls.id.lastIndexOf('_');
             if (lastUnderscoreIndex > -1) {
                 const potentialId = cls.id.substring(0, lastUnderscoreIndex);
                 const potentialEntry = timetableData.entries.find(e => e.id === potentialId);
                 if (potentialEntry) {
                     entry = potentialEntry;
                     entryId = potentialId;
                 }
             }
          }
          
          console.log(`[DEBUG] Processing Item Class ID: ${cls.id}, Resolved EntryID: ${entryId}, Entry Found: ${!!entry}`);

          if (entry) {
             console.log(`[DEBUG] Entry Found: ${entry.className}, isRecurring: ${entry.isRecurring}`);
             
             // Unified Logic: Always add to enrollments (single instance record)
             // Use dateString from frontend if available (safe local date), otherwise fallback
             let dateStr;
             if (cls.dateString) {
                 dateStr = cls.dateString;
             } else {
                 dateStr = new Date(cls.date).toISOString().split('T')[0];
             }
             
             console.log(`[DEBUG] Processing enrollment for date ${dateStr}`);
             
             // Check duplicates
             const exists = enrollments.find(e => 
               e.studentId === studentId && 
               e.timetableEntryId === entry.id && 
               e.date === dateStr
             );
             
             if (!exists) {
               console.log(`[DEBUG] Adding new enrollment for entry ${entry.id} on ${dateStr}`);
               enrollments.push({
                 id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                 organizationId: orgUser.organizationId,
                 studentId,
                 timetableEntryId: entry.id,
                 date: dateStr,
                 type: 'single', 
                 orderId: newOrder.id
               });
             } else {
               console.log(`[DEBUG] Enrollment already exists for entry ${entry.id} on ${dateStr}`);
             }
          } else {
             console.log(`[DEBUG] Timetable Entry NOT FOUND for ID: ${entryId} (Original: ${cls.id})`);
          }
        }
      }
    }
    
    await writeEnrollments(enrollments);
    if (timetableModified) {
      console.log('[DEBUG] Writing updated timetable data');
      await writeTimetable(timetableData);
    } else {
      console.log('[DEBUG] No changes to timetable entries');
    }
    
    res.status(201).json(newOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Drop Enrollment / Refund
app.post('/api/organizations/enrollments/drop', authenticateUser, authorizeRole('organization'), async (req, res) => {
  try {
    const { studentId, mode, enrollmentId, timetableEntryId, date, courseId } = req.body;
    
    console.log(`[DEBUG] Drop Request: studentId=${studentId}, mode=${mode}`);

    if (!studentId || !mode) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Read Students from DATA_FILE (students.txt) via readData()
    const data = await readData();
    const students = data.students || [];
    const studentIndex = students.findIndex(s => s.id === studentId);
    
    if (studentIndex === -1) {
      console.log(`[DEBUG] Student NOT FOUND in students.txt. ID: ${studentId}`);
      return res.status(404).json({ error: 'Student not found' });
    }

    let enrollments = await readEnrollments();
    const orders = await readOrders();
    const timetableData = await readTimetable();
    
    let refundAmount = 0;
    let droppedCount = 0;
    
    // Helper to calculate refund value for a single enrollment
    const getRefundValue = (enrollment) => {
       if (!enrollment.orderId) return 0;
       const order = orders.find(o => o.id === enrollment.orderId);
       
       // Only refund if Paid
       if (!order || order.status !== 'paid') return 0;

       // Find the item in the order
       for (const item of order.items) {
          if (item.enrolledClasses && Array.isArray(item.enrolledClasses)) {
             // Check if this enrollment corresponds to one of these classes
             // We match by Date and Entry ID (fuzzy match for Entry ID due to recurrence suffix)
             const match = item.enrolledClasses.some(cls => {
                 let clsDate;
                 if (cls.dateString) {
                     clsDate = cls.dateString;
                 } else {
                     clsDate = new Date(cls.date).toISOString().split('T')[0];
                 }
                 
                 if (clsDate !== enrollment.date) return false;
                 
                 // Check ID
                 if (cls.id === enrollment.timetableEntryId) return true;
                 if (cls.id.startsWith(enrollment.timetableEntryId + '_')) return true;
                 if (enrollment.timetableEntryId.startsWith(cls.id + '_')) return true; // Unlikely
                 
                 // Also try robust ID resolution logic from POST /orders if needed
                 // But generally, enrollment.timetableEntryId is the Resolved ID.
                 // And cls.id is likely the Resolved ID or Recurring ID.
                 return cls.id.includes(enrollment.timetableEntryId);
             });
             
             if (match) {
                 const count = item.enrolledClasses.length || 1;
                 return (item.price || 0) / count;
             }
          }
       }
       return 0;
    };

    if (mode === 'single') {
        let targetIndex = -1;
        if (enrollmentId) {
            targetIndex = enrollments.findIndex(e => e.id === enrollmentId);
        } else if (timetableEntryId && date) {
            targetIndex = enrollments.findIndex(e => e.studentId === studentId && e.timetableEntryId === timetableEntryId && e.date === date);
        }
        
        if (targetIndex !== -1) {
            const enrollment = enrollments[targetIndex];
            refundAmount += getRefundValue(enrollment);
            enrollments.splice(targetIndex, 1);
            droppedCount++;
        }
    } else if (mode === 'all') {
        if (!timetableEntryId) return res.status(400).json({ error: 'Timetable Entry ID required for Drop All' });
        
        const today = new Date().toISOString().split('T')[0];
        const newEnrollments = [];
        
        for (const e of enrollments) {
            let shouldDrop = false;
            if (e.studentId === studentId && e.date >= today) {
                // Check if enrollment belongs to the specific Timetable Entry (Series)
                // This ensures we only drop "Elite Class (Mon)" and not "Regular Class (Wed)"
                if (e.timetableEntryId === timetableEntryId) {
                    shouldDrop = true;
                }
            }
            
            if (shouldDrop) {
                refundAmount += getRefundValue(e);
                droppedCount++;
            } else {
                newEnrollments.push(e);
            }
        }
        enrollments = newEnrollments;
    }

    // Update Student Balance if refund applicable
    if (refundAmount > 0) {
        students[studentIndex].balance = (students[studentIndex].balance || 0) + refundAmount;
        await writeData(data);
    }
    
    await writeEnrollments(enrollments);
    
    res.json({ 
        success: true, 
        droppedCount, 
        refundAmount, 
        newBalance: students[studentIndex].balance || 0 
    });

  } catch (error) {
    console.error('Error dropping enrollment:', error);
    res.status(500).json({ error: 'Failed to drop enrollment' });
  }
});

// Get Game Config
app.get('/api/organizations/game-config', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
  try {
    let orgId = req.user.organizationId;
    
    const organizations = await readOrganizations();
    const org = organizations.find(o => o.id === orgId);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    
    // Default Levels
    const defaultLevels = [
        { level: 1, name: 'Slime', maxHP: 200, reward: 10, image: '🟢' },
        { level: 2, name: 'Goblin', maxHP: 400, reward: 20, image: '👺' },
        { level: 3, name: 'Orc', maxHP: 600, reward: 30, image: '👹' },
        { level: 4, name: 'Dragon', maxHP: 800, reward: 40, image: '🐉' },
        { level: 5, name: 'Demon', maxHP: 1000, reward: 50, image: '😈' },
        { level: 6, name: 'Boss Lv1', maxHP: 1200, reward: 60, image: '👑' },
        { level: 7, name: 'Boss Lv2', maxHP: 1500, reward: 75, image: '👑' },
        { level: 8, name: 'Boss Lv3', maxHP: 2000, reward: 100, image: '👑' },
        { level: 9, name: 'Boss Lv4', maxHP: 2500, reward: 125, image: '👑' },
        { level: 10, name: 'Final Boss', maxHP: 3000, reward: 150, image: '👑' }
    ];

    const config = org.gameConfig || {};
    if (!config.classicLevels || config.classicLevels.length === 0) {
        config.classicLevels = defaultLevels;
    }
    config.mode = config.mode || 'classic';
    
    res.json(config);
  } catch (error) {
    console.error('Error getting game config:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// Update Game Config
app.put('/api/organizations/game-config', authenticateUser, authorizeRole('organization', 'admin'), async (req, res) => {
  try {
    const { mode, classicLevels } = req.body;
    let orgId = req.user.organizationId;
    
    const organizations = await readOrganizations();
    const orgIndex = organizations.findIndex(o => o.id === orgId);
    if (orgIndex === -1) return res.status(404).json({ error: 'Organization not found' });
    
    organizations[orgIndex].gameConfig = {
        mode: mode || 'classic',
        classicLevels: classicLevels || []
    };
    
    await writeOrganizations(organizations);
    
    broadcast({ type: 'gameConfigUpdated', config: organizations[orgIndex].gameConfig });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving game config:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// Initialize server
async function startServer() {
  await ensureDataDir();
  await initializeDataFile();
  await loadVcpChessGameHistoryIndex();
  await billingDb.ensureBillingSchema();
  
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

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

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Data file: ${DATA_FILE}`);
  });

  // Make wss available globally for broadcast
  global.wss = wss;
}

startServer();
