// Games routes entry (aggregator)
"use strict";
import type { Request, Response } from 'express';

function registerGameRoutes(app: any, deps: any): void {
  if (!app) throw new Error("registerGameRoutes: missing app");

  const fs = deps && deps.fs;
  const path = deps && deps.path;
  const authenticateUser = deps && deps.authenticateUser;
  const authorizeRole = deps && deps.authorizeRole;
  const requireOrganizationAccess = deps && deps.requireOrganizationAccess;
  const readData = deps && deps.readData;
  const writeData = deps && deps.writeData;
  const broadcast = deps && deps.broadcast;
  const filterStudentsByOrganization = deps && deps.filterStudentsByOrganization;
  const resolveOrgIdFromUser = deps && deps.resolveOrgIdFromUser;
  const getRankInfo = deps && deps.getRankInfo;
  const addRewardPointsToStats = deps && deps.addRewardPointsToStats;
  const GAME_SAVES_DIR = deps && deps.GAME_SAVES_DIR;
  const RUNNING_QUEEN_LEADERBOARD_FILE = deps && deps.RUNNING_QUEEN_LEADERBOARD_FILE;
  const ROYAL_EXCHANGE_LEADERBOARD_FILE = deps && deps.ROYAL_EXCHANGE_LEADERBOARD_FILE;
  const HOPE_MATE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_LEADERBOARD_FILE;
  const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE;
  const HOPE_MATE_STAGE_PUZZLES_FILE = deps && deps.HOPE_MATE_STAGE_PUZZLES_FILE;

  // Register Monster Fight (all /api/game/* endpoints)
  const { registerMonsterFightRoutes } = require("./games/monsterFightRoutes");
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

  // Register other games
  const { registerRunningQueenRoutes } = require("./games/runningQueenRoutes");
  const { registerRoyalExchangeRoutes } = require("./games/royalExchangeRoutes");
  const { registerHopeMateRoutes } = require("./games/hopeMateRoutes");
  const { registerHopeMateAdminRoutes } = require("./games/hopeMateAdminRoutes");

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
}

// Backward-compatible alias (so older code can keep calling the old name)
function registerMonsterFightGameRoutes(app: any, deps: any): void {
  return registerGameRoutes(app, deps);
}

module.exports = { registerGameRoutes, registerMonsterFightGameRoutes };


