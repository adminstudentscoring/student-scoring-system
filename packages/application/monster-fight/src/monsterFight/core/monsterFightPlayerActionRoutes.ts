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

const { runPlayerSkillEarly } = require('./monsterFightPlayerSkillEarly');
const { runPlayerSkillLate } = require('./monsterFightPlayerSkillLate');

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


function registerMonsterFightPlayerActionRoutes(app: any, deps: any): void {
  const d = bindMonsterFightDeps(deps);
  const {
    fs, path, authenticateUser, authorizeRole, requireOrganizationAccess,
    readData, writeData, broadcast, filterStudentsByOrganization, resolveOrgIdFromUser,
    getRankInfo, addRewardPointsToStats, GAME_SAVES_DIR,
    RUNNING_QUEEN_LEADERBOARD_FILE, ROYAL_EXCHANGE_LEADERBOARD_FILE,
    HOPE_MATE_LEADERBOARD_FILE, HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, HOPE_MATE_STAGE_PUZZLES_FILE
  } = d;

// Player action (attack, skill, heal)

app.post('/api/game/player-action', async (req: Request, res: Response) => {
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
    
    const effectivePuzzlePoints = (puzzlePoints !== undefined && puzzlePoints !== null) 
      ? Math.max(0, parseInt(puzzlePoints) || 0)
      : player.puzzlePoints;
    
    if (puzzlePoints !== undefined && puzzlePoints !== null) {
      player.puzzlePoints = effectivePuzzlePoints;
    }
    
    let actionResult: any = null;

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
        const base = Math.max(0, Number(skill.cooldown) || 0);
        player.skillCooldowns[skillId] = base;
        skillsThisTurn.add(skillId);
      };

      const { runPlayerSkillEarly } = require('./monsterFightPlayerSkillEarly');
      const { runPlayerSkillLate } = require('./monsterFightPlayerSkillLate');
      const skillCtx = {
        res, player, gameState, data, skillId, targetId, effectivePuzzlePoints, skill, applyCooldown, skillsThisTurn
      };
      const early = runPlayerSkillEarly(skillCtx);
      if (early.handled) {
        actionResult = early.actionResult ?? actionResult;
      } else {
        const late = runPlayerSkillLate(skillCtx);
        if (late.handled) actionResult = late.actionResult ?? actionResult;
      }

    }
    
    const allMonstersDead = gameState.monsters.every(m => !m.isAlive);
    if (allMonstersDead) {
      gameState.currentLevel++;
      if (gameState.currentLevel > gameState.levelConfig.length) {
        gameState.phase = 'game_over';

        if (!gameState.rewardsDistributed) {
          const baseReward = 20;
          const mvpBonus = 0;
          const participants = Array.isArray(gameState.players) ? gameState.players : [];

          const rewards: Record<string, number> = {};
          participants.forEach(player => {
            rewards[player.studentId] = baseReward;
            player.rewardPoints = baseReward;
            player.isMVP = false;
          });

          let mvp: any = null;
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

          participants.forEach(player => {
            if (!player.stats) {
              player.stats = { totalDamage: 0, kills: 0, healing: 0, totalPoints: 0 };
            }
            player.stats.totalPoints = rewards[player.studentId] || baseReward;
          });

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
        gameState.phase = 'level_complete';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'level_complete',
          message: `Level ${gameState.currentLevel - 1} complete! Ready to start level ${gameState.currentLevel}...`
        });
      }
    } else {
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

}

module.exports = { registerMonsterFightPlayerActionRoutes };
export {};

