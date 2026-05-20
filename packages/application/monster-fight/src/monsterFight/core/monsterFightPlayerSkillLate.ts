// @ts-nocheck
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

export type PlayerSkillContext = {
  res: Response;
  player: any;
  gameState: any;
  data: any;
  skillId: string;
  targetId: string;
  effectivePuzzlePoints: number;
  skill: any;
  applyCooldown: () => void;
  skillsThisTurn: Set<string>;
};

export type PlayerSkillRunResult = { handled: true; actionResult?: any } | { handled: false };


export function runPlayerSkillLate(ctx: PlayerSkillContext): any {
  const { res, player, gameState, data, skillId, targetId, effectivePuzzlePoints, skill, applyCooldown, skillsThisTurn } = ctx;
  let actionResult: any = null;
      if (skillId === 'active_1' && player.characterClass === 'assassin') {
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
        player.skillCooldowns[skillId] = Math.max(0, Number(skill.cooldown) || 4);
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
        const damageSummary: string[] = [];
        let totalDamageDealt = 0;
        const defeatedMonsters: any[] = [];

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

        player.skillCooldowns[skillId] = Math.max(0, Number(skill.cooldown) || 3);
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
        applyCooldown();
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
        applyCooldown();
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
        player.skillCooldowns[skillId] = Math.max(0, Number(skill.cooldown) || 4);
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
  if (actionResult !== null) return { handled: true, actionResult };
  return { handled: false };
}
export {};
