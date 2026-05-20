const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { Chess } = require('chess.js');
const { openAiEnabled, openAiJson } = require('@student-scoring/platform');
const bootstrap = require('../bootstrap');
const stores = require('../stores');
const { nowIso, blundersChallengeDifficultyConfig, createBlundersRuntimeState } = require('./sharedState');

const {
  ROOT_DIR,
  BLUNDERS_AI_COMMENTS_FILE,
  BLUNDERS_DB_RETRY_FILE,
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

const { parseUciMove, dateStrFromYmd } = require('@student-scoring/core');

function wireBlundersModules(storage: any) {
  const runtime = createBlundersRuntimeState();
  const out: Record<string, any> = { ...storage, ...runtime, nowIso, blundersChallengeDifficultyConfig, Chess, openAiEnabled, openAiJson };

  let puzzleSortKeyMs: any = () => 0;
  let puzzleDropPoints: any = () => 0;
  let isMissMatePuzzle: any = () => false;
  let syncBlundersForStudent: any;
  let enqueueBlundersDbRetry: any;

  function hkTodayDateStr(): string {
    const t = out.hkNow();
    return dateStrFromYmd(t.y, t.m, t.d);
  }
  out.hkTodayDateStr = hkTodayDateStr;

  // Eval
  {
    const { createBlundersEval } = require('@student-scoring/application-blunders');
    const ev = createBlundersEval({ Chess, parseUciMove });
    Object.assign(out, {
      scoreToCp: ev.scoreToCp,
      blundersVerdictFromScores: ev.blundersVerdictFromScores,
      uciToSanAtFen: ev.uciToSanAtFen,
      BLUNDERS_BEST_TOL_RATIO: ev.BLUNDERS_BEST_TOL_RATIO,
      BLUNDERS_BEST_TOL_MIN_CP: ev.BLUNDERS_BEST_TOL_MIN_CP,
      BLUNDERS_MATE_OR_HUGE_CP: ev.BLUNDERS_MATE_OR_HUGE_CP,
      BLUNDERS_GOOD_IF_STILL_AHEAD_CP: ev.BLUNDERS_GOOD_IF_STILL_AHEAD_CP
    });
  }

  // Chess.com (sync getter is lazy)
  {
    const { createBlundersChessCom } = require('@student-scoring/application-blunders');
    const cc = createBlundersChessCom({
      fs,
      CHESSCOM_RATINGS_FILE,
      readData,
      readChessComSettings,
      getOrgBlundersSettings: storage.getOrgBlundersSettings,
      normalizeHkDayKey: storage.normalizeHkDayKey,
      BLUNDERS_ALLOWED_TIME_CLASSES: runtime.BLUNDERS_ALLOWED_TIME_CLASSES,
      BLUNDERS_MAX_GAMES_PER_DAY: runtime.BLUNDERS_MAX_GAMES_PER_DAY,
      blundersSyncState: runtime.blundersSyncState,
      nowIso,
      getSyncBlundersForStudent: () => syncBlundersForStudent
    });
    Object.assign(out, {
      HK_OFFSET_SEC: cc.HK_OFFSET_SEC,
      hkDayKeyFromEpochSec: cc.hkDayKeyFromEpochSec,
      todayHkKey: cc.todayHkKey,
      hkNow: cc.hkNow,
      formatHkTime: cc.formatHkTime,
      fetchJsonWithTimeout: cc.fetchJsonWithTimeout,
      CHESSCOM_RATINGS_REFRESH_HK_HOUR: cc.CHESSCOM_RATINGS_REFRESH_HK_HOUR,
      CHESSCOM_RATINGS_REFRESH_HK_MIN: cc.CHESSCOM_RATINGS_REFRESH_HK_MIN,
      readChessComRatings: cc.readChessComRatings,
      writeChessComRatings: cc.writeChessComRatings,
      pickChessComRating: cc.pickChessComRating,
      fetchChessComStats: cc.fetchChessComStats,
      getCachedChessComRating: cc.getCachedChessComRating,
      refreshChessComRatingsForOrg: cc.refreshChessComRatingsForOrg,
      computeNextRatingsRunIso: cc.computeNextRatingsRunIso,
      maybeRunChessComRatingsRefreshAllOrgs: cc.maybeRunChessComRatingsRefreshAllOrgs,
      BLUNDERS_DAILY_SYNC_HK_HOUR: cc.BLUNDERS_DAILY_SYNC_HK_HOUR,
      BLUNDERS_DAILY_SYNC_HK_MIN: cc.BLUNDERS_DAILY_SYNC_HK_MIN,
      blundersDailySyncMeta: cc.blundersDailySyncMeta,
      computeNextBlundersDailyRunIso: cc.computeNextBlundersDailyRunIso,
      maybeRunBlundersDailySyncAllStudents: cc.maybeRunBlundersDailySyncAllStudents,
      chessComGetGamesForHkDay: cc.chessComGetGamesForHkDay,
      chessComGetTodayGames: cc.chessComGetTodayGames,
      chessComGetRecentGames: cc.chessComGetRecentGames,
      getChessComUsernameForStudent: cc.getChessComUsernameForStudent
    });
  }

  // Tagger (uses puzzle stubs until puzzles init runs)
  {
    const { createBlundersTagger } = require('@student-scoring/application-blunders');
    const t = createBlundersTagger({ Chess, parseUciMove, puzzleDropPoints, isMissMatePuzzle });
    out.BLUNDERS_TAGGER_VERSION = t.BLUNDERS_TAGGER_VERSION;
    out.BLUNDERS_TAGS = t.BLUNDERS_TAGS;
    out.tagBlunderPuzzle = t.tagBlunderPuzzle;
  }

  // DB + retry
  {
    const { createBlundersDb } = require('@student-scoring/application-blunders');
    const db = createBlundersDb({
      nowIso,
      enqueueBlundersDbRetry: (...args: any[]) => enqueueBlundersDbRetry(...args),
      puzzleSortKeyMs,
      BLUNDERS_TAGGER_VERSION: out.BLUNDERS_TAGGER_VERSION
    });
    out.dbUpsertPuzzleTags = db.dbUpsertPuzzleTags;
    out.dbUpsertPuzzlesFromObjects = db.dbUpsertPuzzlesFromObjects;
  }
  {
    const { createBlundersDbRetry } = require('@student-scoring/application-blunders');
    const r = createBlundersDbRetry({
      fs,
      appDb,
      nowIso,
      BLUNDERS_DB_RETRY_FILE,
      dbUpsertPuzzleTags: out.dbUpsertPuzzleTags,
      dbUpsertPuzzlesFromObjects: out.dbUpsertPuzzlesFromObjects
    });
    Object.assign(out, {
      readBlundersDbRetry: r.readBlundersDbRetry,
      writeBlundersDbRetry: r.writeBlundersDbRetry,
      enqueueBlundersDbRetry: r.enqueueBlundersDbRetry,
      blundersDbRetryTick: r.blundersDbRetryTick,
      dbRetryBackoffMs: r.dbRetryBackoffMs
    });
    enqueueBlundersDbRetry = r.enqueueBlundersDbRetry;
  }

  // Puzzles + stats
  {
    const { createBlundersPuzzles } = require('@student-scoring/application-blunders');
    const pz = createBlundersPuzzles({
      readBlundersPuzzles: storage.readBlundersPuzzles,
      writeBlundersPuzzles: storage.writeBlundersPuzzles,
      appDb,
      BLUNDERS_MAX_PUZZLES_PER_STUDENT: runtime.BLUNDERS_MAX_PUZZLES_PER_STUDENT,
      enqueueBlundersDbRetry: out.enqueueBlundersDbRetry
    });
    puzzleSortKeyMs = pz.puzzleSortKeyMs;
    puzzleDropPoints = pz.puzzleDropPoints;
    isMissMatePuzzle = pz.isMissMatePuzzle;
    Object.assign(out, {
      puzzleSortKeyMs: pz.puzzleSortKeyMs,
      threeMonthsAgoMs: pz.threeMonthsAgoMs,
      puzzleDropPoints: pz.puzzleDropPoints,
      isMissMatePuzzle: pz.isMissMatePuzzle,
      isInvalidSameBestMovePuzzle: pz.isInvalidSameBestMovePuzzle,
      blundersBucketKeyOfPuzzle: pz.blundersBucketKeyOfPuzzle,
      blundersRatingBucket: pz.blundersRatingBucket,
      pickStudentRatingFromCache: pz.pickStudentRatingFromCache,
      pickChallengePuzzlesFromAllBlunders: pz.pickChallengePuzzlesFromAllBlunders,
      pruneStudentBlundersInPlace: pz.pruneStudentBlundersInPlace,
      appendBlundersPuzzlesPreserveProgress: pz.appendBlundersPuzzlesPreserveProgress
    });

    const { createBlundersStats } = require('@student-scoring/application-blunders');
    const st = createBlundersStats({
      threeMonthsAgoMs: pz.threeMonthsAgoMs,
      puzzleSortKeyMs: pz.puzzleSortKeyMs,
      puzzleDropPoints: pz.puzzleDropPoints,
      isMissMatePuzzle: pz.isMissMatePuzzle,
      blundersBucketKeyOfPuzzle: pz.blundersBucketKeyOfPuzzle
    });
    Object.assign(out, {
      computeRolling3mStats: st.computeRolling3mStats,
      computeRollingWindowStats: st.computeRollingWindowStats,
      computeStudentMonthStats: st.computeStudentMonthStats
    });
  }

  // AI
  {
    const { createBlundersAi } = require('@student-scoring/application-blunders');
    const ai = createBlundersAi({
      fs,
      BLUNDERS_AI_COMMENTS_FILE,
      nowIso,
      openAiEnabled,
      openAiJson,
      readBlundersPuzzles: storage.readBlundersPuzzles,
      readBlundersStats: storage.readBlundersStats,
      computeStudentMonthStats: out.computeStudentMonthStats
    });
    Object.assign(out, {
      readBlundersAiComments: ai.readBlundersAiComments,
      writeBlundersAiComments: ai.writeBlundersAiComments,
      aiCommentCacheKey: ai.aiCommentCacheKey,
      aiCommentIsFresh: ai.aiCommentIsFresh,
      generateStudentAiCommentMonth: ai.generateStudentAiCommentMonth
    });
  }

  // Stockfish
  {
    const { createStockfishRunner } = require('@student-scoring/application-blunders');
    const sf = createStockfishRunner({ fs, path, spawn, processExecPath: process.execPath, baseDir: ROOT_DIR });
    out.sfEvalFen = sf.sfEvalFen;
    out.sfAnalyzeFen = sf.sfAnalyzeFen;
  }

  // Sync
  {
    const { createBlundersSync } = require('@student-scoring/application-blunders');
    const sync = createBlundersSync({
      Chess,
      normalizeHkDayKey: storage.normalizeHkDayKey,
      todayHkKey: out.todayHkKey,
      blundersSyncState: runtime.blundersSyncState,
      blundersStudentLocks: runtime.blundersStudentLocks,
      blundersLastStudentSync: runtime.blundersLastStudentSync,
      blundersLastStudentHistoryScan: runtime.blundersLastStudentHistoryScan,
      getChessComUsernameForStudent: out.getChessComUsernameForStudent,
      getStudentBlundersConfig: storage.getStudentBlundersConfig,
      getMasterBlundersConfig: storage.getMasterBlundersConfig,
      chessComGetRecentGames: out.chessComGetRecentGames,
      chessComGetGamesForHkDay: out.chessComGetGamesForHkDay,
      fetchChessComStats: out.fetchChessComStats,
      pickChessComRating: out.pickChessComRating,
      readBlundersPuzzles: storage.readBlundersPuzzles,
      writeBlundersPuzzles: storage.writeBlundersPuzzles,
      readBlundersStats: storage.readBlundersStats,
      writeBlundersStats: storage.writeBlundersStats,
      appendBlundersPuzzlesPreserveProgress: out.appendBlundersPuzzlesPreserveProgress,
      sfEvalFen: out.sfEvalFen,
      scoreToCp: out.scoreToCp,
      blundersVerdictFromScores: out.blundersVerdictFromScores
    });
    syncBlundersForStudent = sync.syncBlundersForStudent;
    out.syncBlundersForStudent = sync.syncBlundersForStudent;
    out.syncBlundersForMaster = sync.syncBlundersForMaster;
  }

  // Teacher jobs
  {
    const { createBlundersTeacherJobs } = require('@student-scoring/application-blunders');
    const jobs = createBlundersTeacherJobs({
      readBlundersTeacherJobs: storage.readBlundersTeacherJobs,
      writeBlundersTeacherJobs: storage.writeBlundersTeacherJobs,
      readData,
      syncBlundersForStudent: out.syncBlundersForStudent,
      syncBlundersForMaster: out.syncBlundersForMaster,
      getOrgBlundersSettings: storage.getOrgBlundersSettings,
      readBlundersPuzzles: storage.readBlundersPuzzles,
      writeBlundersPuzzles: storage.writeBlundersPuzzles,
      appDb,
      dbUpsertPuzzleTags: out.dbUpsertPuzzleTags,
      BLUNDERS_TAGGER_VERSION: out.BLUNDERS_TAGGER_VERSION,
      tagBlunderPuzzle: out.tagBlunderPuzzle,
      nowIso
    });
    Object.assign(out, {
      blundersTeacherJobQueue: jobs.blundersTeacherJobQueue,
      blundersTeacherJobCancel: jobs.blundersTeacherJobCancel,
      blundersTeacherRunNextJob: jobs.blundersTeacherRunNextJob
    });
  }

  // Auto-renew
  {
    const { createAutoRenew } = require('@student-scoring/platform');
    const AUTO_RENEW_LEAD_DAYS = Number(process.env.AUTO_RENEW_LEAD_DAYS || 30);
    const ar = createAutoRenew({
      todayHkKey: () => out.todayHkKey(),
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
    out.autoRenewMeta = ar.autoRenewMeta;
    out.maybeRunAutoRenewAllOrgs = ar.maybeRunAutoRenewAllOrgs;
  }

  out.parseUciMove = require('@student-scoring/core').parseUciMove;
  return out;
}

module.exports = { wireBlundersModules };

export {};
