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


function registerMonsterFightSetupRoutes(app: any, deps: any): void {
  const d = bindMonsterFightDeps(deps);
  const {
    fs, path, authenticateUser, authorizeRole, requireOrganizationAccess,
    readData, writeData, broadcast, filterStudentsByOrganization, resolveOrgIdFromUser,
    getRankInfo, addRewardPointsToStats, GAME_SAVES_DIR,
    RUNNING_QUEEN_LEADERBOARD_FILE, ROYAL_EXCHANGE_LEADERBOARD_FILE,
    HOPE_MATE_LEADERBOARD_FILE, HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, HOPE_MATE_STAGE_PUZZLES_FILE
  } = d;

// Running Queen / Royal Exchange / Hope Mate routes were extracted into:
// - server/routes/games/runningQueenRoutes.js
// - server/routes/games/royalExchangeRoutes.js
// - server/routes/games/hopeMateRoutes.js
// - server/routes/games/hopeMateAdminRoutes.js
//
// Keep Monster Fight routes below.
// ==================== Monster Fight Game APIs ====================

// Get game configuration
app.get('/api/game/config', (req: Request, res: Response) => {
  res.json({
    config: GAME_CONFIG,
    playerClasses: PLAYER_CLASSES,
    monsterTypes: MONSTER_TYPES
  });
});

// Initialize game state
app.post('/api/game/init', async (req: Request, res: Response) => {
  try {
    const { studentIds, levelConfig } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs are required' });
    }
    
    const data = await readData();
    const students = data.students.filter(s => studentIds.includes(s.id));
    
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students not found' });
    }
    
    const settingsConfig = data.gameSettings?.config || GAME_CONFIG;
    
    const resolvedLevelConfig = (Array.isArray(levelConfig) && levelConfig.length)
      ? levelConfig
      : DEFAULT_LEVEL_CONFIG_EASY;

    const gameState = {
      currentLevel: 1,
      currentTurn: 1,
      phase: 'character_selection',
      players: students.map((student, index) => ({
        studentId: student.id,
        studentName: student.name,
        characterClass: null,
        currentHP: 0,
        maxHP: 0,
        attack: 0,
        puzzlePoints: 0,
        isAlive: true,
        skills: [] as any[],
        skillCooldowns: {} as Record<string, number>,
        accumulatedReviveRate: 0,
        stats: {
          totalDamage: 0,
          kills: 0,
          healing: 0
        },
        statuses: [] as any[]
      })),
      monsters: [] as any[],
      actionLog: [] as any[],
      levelConfig: resolvedLevelConfig,
      gameConfig: { ...settingsConfig },
      monsterSequence: 0
    };
    
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
app.get('/api/game/state', async (req: Request, res: Response) => {
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
app.post('/api/game/select-character', async (req: Request, res: Response) => {
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
    
    const availablePlayerClasses = data.gameSettings?.playerClasses || PLAYER_CLASSES;
    
    const characterClass = availablePlayerClasses.find(c => c.id === characterClassId);
    if (!characterClass) {
      return res.status(404).json({ error: 'Character class not found' });
    }
    
    player.characterClass = characterClassId;
    player.attack = characterClass.baseAttack;
    player.maxHP = characterClass.baseHP;
    player.currentHP = characterClass.baseHP;
    player.skills = characterClass.skills.map(skill => ({ ...skill }));
    player.skillCooldowns = {};
    ensurePlayerStats(player);
    
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
app.post('/api/game/input-puzzle-points', async (req: Request, res: Response) => {
  try {
    const { puzzlePoints } = req.body;
    
    if (!puzzlePoints || typeof puzzlePoints !== 'object') {
      return res.status(400).json({ error: 'Puzzle points object is required' });
    }
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    
    Object.keys(puzzlePoints).forEach(studentId => {
      const player = gameState.players.find(p => p.studentId === studentId);
      if (player) {
        player.puzzlePoints = Math.max(0, parseInt(puzzlePoints[studentId]) || 0);
      }
    });
    
    const monstersExisted = gameState.monsters && gameState.monsters.length > 0;
    const isLevelTransition = gameState.phase === 'level_complete';
    
    if (!monstersExisted || isLevelTransition) {
      if (isLevelTransition && monstersExisted) {
        gameState.monsters = [];
      }
      const levelInfo = gameState.levelConfig[gameState.currentLevel - 1];
      if (levelInfo) {
        gameState.monsters = [];
        
        const availableMonsterTypes = data.gameSettings?.monsterTypes || MONSTER_TYPES;
        
        let monsterIndex = 1;
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
              monsterIndex++;
            }
          }
        });
      }
      
      if (!gameState.phase || gameState.phase === 'character_selection' || gameState.phase === 'puzzle_input' || gameState.phase === 'level_complete') {
        gameState.phase = 'player_turn';

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
}

module.exports = { registerMonsterFightSetupRoutes };
export {};
