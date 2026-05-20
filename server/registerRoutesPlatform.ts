import type { Express } from 'express';

const bootstrap = require('./bootstrap');
const stores = require('./stores');
const blunders = require('./blundersInit');
const core = require('@student-scoring/core');
const { broadcast } = require('./ws');
const billingAccess = require('@student-scoring/billing/src/access');

const {
  hashPassword, comparePassword, generateToken, authenticateUser, authorizeRole, optionalAuth,
  filterStudentsByOrganization, LEVELS, getRankInfo, getDateKey, getWeekKey, getMonthKey,
  updateStudentStats, addRewardPointsToStats
} = core;

const ctx = { ...stores, ...blunders, broadcast, billingAccess };

function registerPlatformRoutes(app: Express): void {
  const readUsers = ctx.readUsers;
  const writeUsers = ctx.writeUsers;
  const readOrganizations = ctx.readOrganizations;
  const writeOrganizations = ctx.writeOrganizations;
  const readData = ctx.readData;
  const writeData = ctx.writeData;
  const readSubscriptionPrices = ctx.readSubscriptionPrices;
  const writeSubscriptionPrices = ctx.writeSubscriptionPrices;
  const readSubscriptionPackages = ctx.readSubscriptionPackages;
  const writeSubscriptionPackages = ctx.writeSubscriptionPackages;
  const appendSubscriptionAudit = ctx.appendSubscriptionAudit;
  const normalizeSubscriptionStatus = ctx.normalizeSubscriptionStatus;
  const normalizePublishState = ctx.normalizePublishState;
  const normalizeCurrency = ctx.normalizeCurrency;
  const dateOnlyTodayString = ctx.dateOnlyTodayString;
  const fs = ctx.fs;
  const SUBSCRIPTION_AUDIT_FILE = ctx.SUBSCRIPTION_AUDIT_FILE;
  const requireOrganizationAccess = ctx.requireOrganizationAccess;
  const readChessComSettings = ctx.readChessComSettings;
  const writeChessComSettings = ctx.writeChessComSettings;
  const getOrgChessComSettings = ctx.getOrgChessComSettings;
  const upsertOrgChessComSettings = ctx.upsertOrgChessComSettings;
  const readBlundersPuzzles = ctx.readBlundersPuzzles;
  const writeBlundersPuzzles = ctx.writeBlundersPuzzles;
  const readBlundersStats = ctx.readBlundersStats;
  const readBlundersSettings = ctx.readBlundersSettings;
  const writeBlundersSettings = ctx.writeBlundersSettings;
  const readBlundersTeacherJobs = ctx.readBlundersTeacherJobs;
  const writeBlundersTeacherJobs = ctx.writeBlundersTeacherJobs;
  const getOrgBlundersSettings = ctx.getOrgBlundersSettings;
  const getMasterBlundersConfig = ctx.getMasterBlundersConfig;
  const sanitizeMasterEntry = ctx.sanitizeMasterEntry;
  const defaultMastersPreset = ctx.defaultMastersPreset;
  const formatHkTime = ctx.formatHkTime;
  const computeNextRatingsRunIso = ctx.computeNextRatingsRunIso;
  const computeNextBlundersDailyRunIso = ctx.computeNextBlundersDailyRunIso;
  const CHESSCOM_RATINGS_REFRESH_HK_HOUR = ctx.CHESSCOM_RATINGS_REFRESH_HK_HOUR;
  const CHESSCOM_RATINGS_REFRESH_HK_MIN = ctx.CHESSCOM_RATINGS_REFRESH_HK_MIN;
  const BLUNDERS_DAILY_SYNC_HK_HOUR = ctx.BLUNDERS_DAILY_SYNC_HK_HOUR;
  const BLUNDERS_DAILY_SYNC_HK_MIN = ctx.BLUNDERS_DAILY_SYNC_HK_MIN;
  const blundersDailySyncMeta = ctx.blundersDailySyncMeta;
  const BLUNDERS_DEFAULTS = ctx.BLUNDERS_DEFAULTS;
  const nowIso = ctx.nowIso;
  const puzzleSortKeyMs = ctx.puzzleSortKeyMs;
  const isInvalidSameBestMovePuzzle = ctx.isInvalidSameBestMovePuzzle;
  const normalizeHkDayKey = ctx.normalizeHkDayKey;
  const todayHkKey = ctx.todayHkKey;
  const syncBlundersForStudent = ctx.syncBlundersForStudent;
  const syncBlundersForMaster = ctx.syncBlundersForMaster;
  const blundersTeacherJobQueue = ctx.blundersTeacherJobQueue;
  const blundersTeacherRunNextJob = ctx.blundersTeacherRunNextJob;
  const blundersTeacherJobCancel = ctx.blundersTeacherJobCancel;
  const BLUNDERS_TAGGER_VERSION = ctx.BLUNDERS_TAGGER_VERSION;
  const BLUNDERS_PUZZLES_FILE = bootstrap.BLUNDERS_PUZZLES_FILE;
  const BLUNDERS_STATS_FILE = bootstrap.BLUNDERS_STATS_FILE;
  const BLUNDERS_SETTINGS_FILE = bootstrap.BLUNDERS_SETTINGS_FILE;
  const BLUNDERS_TEACHER_JOBS_FILE = bootstrap.BLUNDERS_TEACHER_JOBS_FILE;
  const appDb = ctx.appDb;
  const readChessComRatings = ctx.readChessComRatings;
  const readCourses = ctx.readCourses;
  const writeCourses = ctx.writeCourses;
  const readPackages = ctx.readPackages;
  const writePackages = ctx.writePackages;
  const checkExpiredPackages = ctx.checkExpiredPackages;
  const updatePackagesForDeletedCourse = ctx.updatePackagesForDeletedCourse;
  const readTimetable = ctx.readTimetable;
  const writeTimetable = ctx.writeTimetable;
  const readEnrollments = ctx.readEnrollments;
  const writeEnrollments = ctx.writeEnrollments;
  const readOrders = ctx.readOrders;
  const writeOrders = ctx.writeOrders;
  const readTransactions = ctx.readTransactions;
  const writeTransactions = ctx.writeTransactions;
  const readAttendance = ctx.readAttendance;
  const writeAttendance = ctx.writeAttendance;
  const getStudentChessComCredentials = ctx.getStudentChessComCredentials;
  const SAVES_DIR = ctx.SAVES_DIR;
  const path = ctx.path;
  const pruneStudentBlundersInPlace = ctx.pruneStudentBlundersInPlace;
  const BLUNDERS_MAX_PUZZLES_PER_STUDENT = ctx.BLUNDERS_MAX_PUZZLES_PER_STUDENT;
  const computeRolling3mStats = ctx.computeRolling3mStats;
  const blundersSyncState = ctx.blundersSyncState;
  const blundersLastStudentSync = ctx.blundersLastStudentSync;
  const getChessComUsernameForStudent = ctx.getChessComUsernameForStudent;
  const chessComGetGamesForHkDay = ctx.chessComGetGamesForHkDay;
  const chessComGetRecentGames = ctx.chessComGetRecentGames;
  const getStudentBlundersConfig = ctx.getStudentBlundersConfig;
  const readBlundersMasterProgress = ctx.readBlundersMasterProgress;
  const writeBlundersMasterProgress = ctx.writeBlundersMasterProgress;
  const blundersBucketKeyOfPuzzle = ctx.blundersBucketKeyOfPuzzle;
  const readBlundersChallengeSessions = ctx.readBlundersChallengeSessions;
  const writeBlundersChallengeSessions = ctx.writeBlundersChallengeSessions;
  const readBlundersChallengeLeaderboard = ctx.readBlundersChallengeLeaderboard;
  const writeBlundersChallengeLeaderboard = ctx.writeBlundersChallengeLeaderboard;
  const blundersChallengeDifficultyConfig = ctx.blundersChallengeDifficultyConfig;
  const pickStudentRatingFromCache = ctx.pickStudentRatingFromCache;
  const blundersRatingBucket = ctx.blundersRatingBucket;
  const pickChallengePuzzlesFromAllBlunders = ctx.pickChallengePuzzlesFromAllBlunders;
  const sfEvalFen = ctx.sfEvalFen;
  const scoreToCp = ctx.scoreToCp;
  const parseUciMove = ctx.parseUciMove;
  const uciToSanAtFen = ctx.uciToSanAtFen;
  const blundersVerdictFromScores = ctx.blundersVerdictFromScores;
  const openAiEnabled = ctx.openAiEnabled;
  const openAiJson = ctx.openAiJson;
  const aiCommentCacheKey = ctx.aiCommentCacheKey;
  const aiCommentIsFresh = ctx.aiCommentIsFresh;
  const readBlundersAiComments = ctx.readBlundersAiComments;
  const generateStudentAiCommentMonth = ctx.generateStudentAiCommentMonth;
  const readBlundersDbRetry = ctx.readBlundersDbRetry;
  const Chess = ctx.Chess;

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
    readOrders,
    writeOrders,
    readTransactions,
    writeTransactions,
    readAttendance,
    writeAttendance,
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
}

export {};

module.exports = { registerPlatformRoutes };
