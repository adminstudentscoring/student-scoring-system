import type { Express } from 'express';

const stores = require('./stores');
const blunders = require('./blundersInit');
const core = require('@student-scoring/core');
const { Chess } = require('chess.js');

function registerAppRoutes(app: Express): void {
  const d = Object.assign({}, stores, blunders, core, require('./ws'), { Chess, parseUciMove: core.parseUciMove });
  const fs = d.fs;
  const path = d.path;
  const authenticateUser = d.authenticateUser;
  const authorizeRole = d.authorizeRole;
  const requireOrganizationAccess = d.requireOrganizationAccess;
  const readData = d.readData;
  const writeData = d.writeData;
  const readUsers = d.readUsers;
  const readOrganizations = d.readOrganizations;
  const writeOrganizations = d.writeOrganizations;
  const readSubscriptionPrices = d.readSubscriptionPrices;
  const writeSubscriptionPrices = d.writeSubscriptionPrices;
  const resolveOrgIdFromUser = d.resolveOrgIdFromUser;
  const filterStudentsByOrganization = d.filterStudentsByOrganization;
  const getRankInfo = d.getRankInfo;
  const addRewardPointsToStats = d.addRewardPointsToStats;
  const GAME_SAVES_DIR = d.GAME_SAVES_DIR;
  const RUNNING_QUEEN_LEADERBOARD_FILE = d.RUNNING_QUEEN_LEADERBOARD_FILE;
  const ROYAL_EXCHANGE_LEADERBOARD_FILE = d.ROYAL_EXCHANGE_LEADERBOARD_FILE;
  const HOPE_MATE_LEADERBOARD_FILE = d.HOPE_MATE_LEADERBOARD_FILE;
  const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = d.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE;
  const HOPE_MATE_STAGE_PUZZLES_FILE = d.HOPE_MATE_STAGE_PUZZLES_FILE;
  const TACTICS_FIGHTER_ATTEMPTS_FILE = d.TACTICS_FIGHTER_ATTEMPTS_FILE;
  const appDb = d.appDb;
  const sfAnalyzeFen = d.sfAnalyzeFen;
  const readEnrollments = d.readEnrollments;
  const writeEnrollments = d.writeEnrollments;
  const readOrders = d.readOrders;
  const writeOrders = d.writeOrders;
  const readExpenses = d.readExpenses;
  const writeExpenses = d.writeExpenses;
  const readTransactions = d.readTransactions;
  const writeTransactions = d.writeTransactions;
  const readTimetable = d.readTimetable;
  const writeTimetable = d.writeTimetable;
  const readAttendance = d.readAttendance;
  const writeAttendance = d.writeAttendance;
  const readVchessInvoiceImports = d.readVchessInvoiceImports;
  const writeVchessInvoiceImports = d.writeVchessInvoiceImports;
  const paypalBilling = d.paypalBilling;
  const billingDb = d.billingDb;
  const paypal = d.paypal;
  const checkExpiredPackages = d.checkExpiredPackages;
  const updatePackagesForDeletedCourse = d.updatePackagesForDeletedCourse;
  const LEVELS = d.LEVELS;
  const getDateKey = d.getDateKey;
  const getWeekKey = d.getWeekKey;
  const getMonthKey = d.getMonthKey;
  const SAVES_DIR = d.SAVES_DIR;
  const broadcast = d.broadcast;
  const parseUciMove = d.parseUciMove;

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
  
  // ===== Attendance routes (moved to server/routes/attendanceRoutes.js) =====
  const { registerAttendanceRoutes } = require('@student-scoring/platform');
  registerAttendanceRoutes(app, {
    authenticateUser,
    requireOrganizationAccess,
    readTimetable,
    readAttendance,
    writeAttendance
  });

  // ===== Organizations billing + finance routes (moved to server/routes/organizationsBillingRoutes.js) =====
  const {
    registerOrganizationsBillingRoutes,
    registerVchessInvoiceImportRoutes
  } = require('@student-scoring/billing');
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
  
  registerVchessInvoiceImportRoutes(app, {
    authenticateUser,
    authorizeRole,
    readUsers,
    readVchessInvoiceImports,
    writeVchessInvoiceImports,
    readOrganizations,
    writeOrganizations,
    readData,
    writeData,
    readTimetable,
    writeTimetable,
    readEnrollments,
    writeEnrollments,
    broadcast
  });
  
  const { registerVchessInvoiceLlmRoutes } = require('@student-scoring/platform');
  registerVchessInvoiceLlmRoutes(app);
  
  // ===== My Own App routes (Admin utilities) =====
  const { registerMyOwnAppRoutes } = require('@student-scoring/platform');
  registerMyOwnAppRoutes(app, {
    appDb,
    authenticateUser,
    authorizeRole
  });
}

export {};

module.exports = { registerAppRoutes };
