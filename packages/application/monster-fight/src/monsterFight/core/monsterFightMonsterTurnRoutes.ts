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


function registerMonsterFightMonsterTurnRoutes(app: any, deps: any): void {
  const d = bindMonsterFightDeps(deps);
  const {
    fs, path, authenticateUser, authorizeRole, requireOrganizationAccess,
    readData, writeData, broadcast, filterStudentsByOrganization, resolveOrgIdFromUser,
    getRankInfo, addRewardPointsToStats, GAME_SAVES_DIR,
    RUNNING_QUEEN_LEADERBOARD_FILE, ROYAL_EXCHANGE_LEADERBOARD_FILE,
    HOPE_MATE_LEADERBOARD_FILE, HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, HOPE_MATE_STAGE_PUZZLES_FILE
  } = d;

app.post('/api/game/monster-turn', async (req: Request, res: Response) => {
  try {
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    const turnEvents: any[] = [];
    const snapshotState = () => {
      try {
        return JSON.parse(JSON.stringify({
          phase: gameState.phase,
          currentTurn: gameState.currentTurn,
          players: gameState.players,
          monsters: gameState.monsters,
          actionLog: gameState.actionLog
        }));
      } catch {
        return {
          phase: gameState.phase,
          currentTurn: gameState.currentTurn,
          players: gameState.players,
          monsters: gameState.monsters,
          actionLog: gameState.actionLog
        };
      }
    };
    const pushLog = (entry) => {
      gameState.actionLog.push(entry);
      turnEvents.push({ log: entry, snapshot: snapshotState() });
    };
    
    if (gameState.phase === 'player_turn') {
      const allPlayersActed = gameState.players.every(p => !p.isAlive || p.hasActed);
      if (!allPlayersActed) {
        return res.status(400).json({ error: 'Not all players have acted yet' });
      }

      gameState.players.forEach(player => {
        if (player && player.skillCooldowns) {
          Object.keys(player.skillCooldowns).forEach(skillId => {
            const currentValue = Number(player.skillCooldowns[skillId]) || 0;
            if (currentValue > 0) {
              player.skillCooldowns[skillId] = Math.max(0, currentValue - 1);
            }
          });
        }
      });
      gameState.monsters.forEach(monster => {
        if (monster && monster.skillCooldowns) {
          Object.keys(monster.skillCooldowns).forEach(skillId => {
            const currentValue = Number(monster.skillCooldowns[skillId]) || 0;
            if (currentValue > 0) {
              monster.skillCooldowns[skillId] = Math.max(0, currentValue - 1);
            }
          });
        }
      });

      gameState.phase = 'monster_turn';
      gameState.players.forEach(p => p.hasActed = false);
    } else if (gameState.phase !== 'monster_turn') {
      return res.status(400).json({ error: 'Not monster turn' });
    }
    
    let alivePlayers = gameState.players.filter(p => p.isAlive);
    if (alivePlayers.length === 0) {
      gameState.phase = 'game_over';
      pushLog({
        turn: gameState.currentTurn,
        phase: 'game_over',
        message: 'All players defeated! Game Over.'
      });
    } else {
      const statusLogs = applyPlayerStatusEffects(gameState);
      statusLogs.forEach(message => {
        pushLog({
          turn: gameState.currentTurn,
          phase: 'monster_turn',
          message
        });
      });

      alivePlayers = gameState.players.filter(p => p.isAlive);
      if (alivePlayers.length === 0) {
        gameState.phase = 'game_over';
        pushLog({
          turn: gameState.currentTurn,
          phase: 'game_over',
          message: 'All players defeated! Game Over.'
        });
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        broadcast({ type: 'gameStateUpdated', gameState });
        return res.json({ gameState, turnEvents });
      }

      const shamanLogs = applyShamanPassiveHealing(gameState, data);
      shamanLogs.forEach(message => {
        pushLog({
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
          pushLog({
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
        pushLog({
          turn: gameState.currentTurn,
          phase: 'game_over',
          message: 'All players defeated! Game Over.'
        });
        data.lastUpdate = new Date().toISOString();
        await writeData(data);
        broadcast({ type: 'gameStateUpdated', gameState });
        return res.json({ gameState, turnEvents });
      }

      gameState.monsters.filter(m => m.isAlive).forEach(monster => {
        const statusDamage = applyMonsterStatusDamage(monster, gameState, data);
        statusDamage.logs.forEach(message => {
          pushLog({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message,
            summaryDetails: [message]
          });
        });
        if (statusDamage.deathLogs && statusDamage.deathLogs.length > 0) {
          statusDamage.deathLogs.forEach(message => {
            pushLog({
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
          pushLog({
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
          if (skillAttempt.entry) {
            pushLog(skillAttempt.entry);
          }
          advanceMonsterStatuses(monster);
          return;
        }

        const passive = getMonsterPassiveEffect(monster) || {} as any;
        const attackCount = passive.attackCount || 1;
        for (let attackIndex = 0; attackIndex < attackCount; attackIndex++) {
          alivePlayers = gameState.players.filter(p => p.isAlive);
          if (alivePlayers.length === 0) {
            break;
          }
          const target = selectPlayerTargetForMonster(alivePlayers, {});
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

          const tauntTriggered = !!(
            target.characterClass === 'shield_warrior' &&
            getPlayerPassiveEffect(target)?.tauntMonsters &&
            alivePlayers.some(p => p && p.isAlive && p.studentId !== target.studentId)
          );

          target.currentHP = Math.max(0, target.currentHP - damage);
          if (target.currentHP <= 0) {
            target.isAlive = false;
          }

          const critNote = isCrit ? ' (CRITICAL!)' : '';
          const reductionNote = damageReduction > 0 ? ' (reduced by shield)' : '';
          const tauntNote = tauntTriggered ? ' (TAUNT)' : '';
          pushLog({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message: `${monster.name} attacks ${target.studentName} for ${damage} damage${critNote}${reductionNote}${tauntNote}${!target.isAlive ? ' - DEFEATED!' : ''}`
          });

          if (passive.applyBleed) {
            addBleedStatusToPlayer(target, passive.applyBleed, monster.name);
            pushLog({
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
            pushLog({
              turn: gameState.currentTurn,
              phase: 'monster_turn',
              message: `${monster.name}'s attack rises to ${monster.attack} through Cunning Momentum!`
            });
          }

          if (passive.bleedingClaw && target.isAlive && damage > 0) {
            const bleedMessage = addBleedingClawStatusToPlayer(target, monster, passive.bleedingClaw);
            if (bleedMessage) {
              pushLog({
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
        pushLog({
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
      if (player && player.turnSkillsUsed && normalizedTurnIndex !== null) {
        if (player.turnSkillsUsed[normalizedTurnIndex] !== undefined) {
          delete player.turnSkillsUsed[normalizedTurnIndex];
        }
        if (Object.keys(player.turnSkillsUsed).length === 0) {
          delete player.turnSkillsUsed;
        }
      }
    });
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState });
    res.json({ gameState, turnEvents });
  } catch (error) {
    console.error('Error processing monster turn:', error);
    res.status(500).json({ error: 'Failed to process monster turn' });
  }
});

// Revive attempt
}

module.exports = { registerMonsterFightMonsterTurnRoutes };
export {};
