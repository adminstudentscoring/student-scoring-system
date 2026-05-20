// Core game logic routes extracted from monsterFightRoutes.js
// Handles: game init, state, character selection, puzzle input, player actions,
// monster turns, revive.
// Constants and helpers have been split into monsterFightConstants.ts and monsterFightHelpers.ts.
"use strict";
import type { Request, Response } from 'express';

import {
  GAME_CONFIG,
  DEFAULT_LEVEL_CONFIG_EASY,
  PLAYER_CLASSES,
  MONSTER_TYPES,
  HOPE_MATE_STAGE_KEYS
} from '../monsterFightConstants';

import {
  calculateReviveProbability,
  calculateDamage,
  getPassiveDamageInfo,
  ensurePlayerStats,
  getDamageReduction,
  applyPriestPassiveHealing,
  getMonsterPassiveEffect,
  getPlayerPassiveEffect,
  getMonsterDamageReduction,
  isPlayerSilenced,
  applyFirestormAuraBeforePlayerAction,
  addBleedStatusToPlayer,
  addBleedingClawStatusToPlayer,
  addSilenceStatusToPlayer,
  selectPlayerTargetForMonster,
  attemptMonsterActiveSkill,
  applyPlayerStatusEffects,
  addStatusToMonster,
  processMonsterControlStatuses,
  advanceMonsterStatuses,
  applyMonsterStatusDamage,
  createMonsterInstanceFromType,
  handleMonsterDeath,
  applyShamanPassiveHealing
} from '../monsterFightHelpers';

function bindMonsterFightDeps(deps: any) {
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

  if (!fs) throw new Error("registerMonsterFightGameRoutes: missing deps.fs");
  if (!path) throw new Error("registerMonsterFightGameRoutes: missing deps.path");
  if (typeof readData !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.readData");
  if (typeof writeData !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.writeData");
  if (typeof broadcast !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.broadcast");
  if (typeof getRankInfo !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.getRankInfo");
  if (typeof addRewardPointsToStats !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.addRewardPointsToStats");
  if (!GAME_SAVES_DIR) throw new Error("registerMonsterFightGameRoutes: missing deps.GAME_SAVES_DIR");

  return {
    fs, path, authenticateUser, authorizeRole, requireOrganizationAccess,
    readData, writeData, broadcast, filterStudentsByOrganization, resolveOrgIdFromUser,
    getRankInfo, addRewardPointsToStats, GAME_SAVES_DIR,
    RUNNING_QUEEN_LEADERBOARD_FILE, ROYAL_EXCHANGE_LEADERBOARD_FILE,
    HOPE_MATE_LEADERBOARD_FILE, HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, HOPE_MATE_STAGE_PUZZLES_FILE
  };
}


function registerMonsterFightReviveRoutes(app: any, deps: any): void {
  const d = bindMonsterFightDeps(deps);
  const {
    fs, path, authenticateUser, authorizeRole, requireOrganizationAccess,
    readData, writeData, broadcast, filterStudentsByOrganization, resolveOrgIdFromUser,
    getRankInfo, addRewardPointsToStats, GAME_SAVES_DIR,
    RUNNING_QUEEN_LEADERBOARD_FILE, ROYAL_EXCHANGE_LEADERBOARD_FILE,
    HOPE_MATE_LEADERBOARD_FILE, HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, HOPE_MATE_STAGE_PUZZLES_FILE
  } = d;

app.post('/api/game/revive', async (req: Request, res: Response) => {
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
      player.currentHP = Math.floor(player.maxHP * 0.5);
      player.accumulatedReviveRate = 0;
      player.puzzlePoints -= puzzlePoints;
      player.statuses = [];
      
      gameState.actionLog.push({
        turn: gameState.currentTurn,
        phase: 'revive',
        message: `${player.studentName} successfully revived with ${puzzlePoints} puzzle points!`
      });
    } else {
      player.accumulatedReviveRate = reviveRate;
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

}

module.exports = { registerMonsterFightReviveRoutes };
export {};
