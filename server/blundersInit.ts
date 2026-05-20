const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const { openAiEnabled, openAiJson } = require('@student-scoring/platform');
const bootstrap = require('./bootstrap');
const stores = require('./stores');

const {
  ROOT_DIR,
  BLUNDERS_AI_COMMENTS_FILE,
  BLUNDERS_DB_RETRY_FILE,
  BLUNDERS_PUZZLES_FILE,
  BLUNDERS_STATS_FILE,
  BLUNDERS_SETTINGS_FILE,
  BLUNDERS_MASTER_PROGRESS_FILE,
  BLUNDERS_CHALLENGE_SESSIONS_FILE,
  BLUNDERS_CHALLENGE_LEADERBOARD_FILE,
  BLUNDERS_TEACHER_JOBS_FILE,
  CHESSCOM_RATINGS_FILE
} = bootstrap;

const {
  readData,
  readChessComSettings,
  appDb,
  readOrganizations,
  readOrders,
  writeOrders,
  readEnrollments,
  writeEnrollments,
  readTimetable,
  readPackages,
  readCourses
} = stores;

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
const { sfEvalFen, sfAnalyzeFen } = createStockfishRunner({ fs, path, spawn, processExecPath: process.execPath, baseDir: ROOT_DIR });

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


const { createAutoRenew } = require('@student-scoring/platform');
const AUTO_RENEW_LEAD_DAYS = Number(process.env.AUTO_RENEW_LEAD_DAYS || 30);
let autoRenewMeta = { lastRunAt: null, lastRunHkDay: null, lastRunOk: 0, lastRunErr: 0 };
let maybeRunAutoRenewAllOrgs = async () => ({ ok: true, skipped: true });

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

export {};

module.exports = {
  readBlundersAiComments,
  writeBlundersAiComments,
  aiCommentCacheKey,
  aiCommentIsFresh,
  generateStudentAiCommentMonth,
  readBlundersDbRetry,
  writeBlundersDbRetry,
  enqueueBlundersDbRetry,
  blundersDbRetryTick,
  dbRetryBackoffMs,
  BLUNDERS_DEFAULTS,
  normalizeHkDayKey,
  defaultMastersPreset,
  sanitizeMasterEntry,
  getOrgBlundersSettings,
  getStudentBlundersConfig,
  getMasterBlundersConfig,
  readBlundersPuzzles,
  writeBlundersPuzzles,
  readBlundersStats,
  writeBlundersStats,
  blundersMarkGamesAnalyzed,
  readBlundersSettings,
  writeBlundersSettings,
  readBlundersMasterProgress,
  writeBlundersMasterProgress,
  readBlundersChallengeSessions,
  writeBlundersChallengeSessions,
  readBlundersChallengeLeaderboard,
  writeBlundersChallengeLeaderboard,
  readBlundersTeacherJobs,
  writeBlundersTeacherJobs,
  blundersTeacherJobQueue,
  blundersTeacherJobCancel,
  blundersTeacherRunNextJob,
  nowIso,
  blundersChallengeDifficultyConfig,
  puzzleSortKeyMs,
  threeMonthsAgoMs,
  puzzleDropPoints,
  isMissMatePuzzle,
  isInvalidSameBestMovePuzzle,
  blundersBucketKeyOfPuzzle,
  blundersRatingBucket,
  pickStudentRatingFromCache,
  pickChallengePuzzlesFromAllBlunders,
  computeRolling3mStats,
  computeRollingWindowStats,
  computeStudentMonthStats,
  HK_OFFSET_SEC,
  hkDayKeyFromEpochSec,
  todayHkKey,
  hkNow,
  formatHkTime,
  fetchJsonWithTimeout,
  CHESSCOM_RATINGS_REFRESH_HK_HOUR,
  CHESSCOM_RATINGS_REFRESH_HK_MIN,
  readChessComRatings,
  writeChessComRatings,
  pickChessComRating,
  fetchChessComStats,
  getCachedChessComRating,
  refreshChessComRatingsForOrg,
  computeNextRatingsRunIso,
  maybeRunChessComRatingsRefreshAllOrgs,
  BLUNDERS_DAILY_SYNC_HK_HOUR,
  BLUNDERS_DAILY_SYNC_HK_MIN,
  blundersDailySyncMeta,
  computeNextBlundersDailyRunIso,
  maybeRunBlundersDailySyncAllStudents,
  autoRenewMeta,
  maybeRunAutoRenewAllOrgs,
  chessComGetGamesForHkDay,
  chessComGetTodayGames,
  chessComGetRecentGames,
  getChessComUsernameForStudent,
  hkTodayDateStr,
  scoreToCp,
  blundersVerdictFromScores,
  uciToSanAtFen,
  BLUNDERS_BEST_TOL_RATIO,
  BLUNDERS_BEST_TOL_MIN_CP,
  BLUNDERS_MATE_OR_HUGE_CP,
  BLUNDERS_GOOD_IF_STILL_AHEAD_CP,
  BLUNDERS_TAGGER_VERSION,
  BLUNDERS_TAGS,
  tagBlunderPuzzle,
  dbUpsertPuzzleTags,
  dbUpsertPuzzlesFromObjects,
  sfEvalFen,
  sfAnalyzeFen,
  syncBlundersForStudent,
  syncBlundersForMaster,
  pruneStudentBlundersInPlace,
  appendBlundersPuzzlesPreserveProgress,
  blundersSyncState,
  blundersLastStudentSync,
  BLUNDERS_MAX_PUZZLES_PER_STUDENT,
  openAiEnabled,
  openAiJson,
  Chess,
  parseUciMove: require('@student-scoring/core').parseUciMove
};
