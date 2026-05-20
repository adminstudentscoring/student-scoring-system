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


export function runPlayerSkillEarly(ctx: PlayerSkillContext): any {
  const { res, player, gameState, data, skillId, targetId, effectivePuzzlePoints, skill, applyCooldown, skillsThisTurn } = ctx;
  let actionResult: any = null;
      if (skillId === 'active_1' && player.characterClass === 'warrior') {
        const target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }
        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * 1.5 * passiveDamageInfo.multiplier;
        const damage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
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
        player.skillCooldowns[skillId] = 3;
        skillsThisTurn.add(skillId);
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} uses ${skill.name} on ${target.name} for ${damage} damage!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} uses ${skill.name} on ${target.name} for ${damage} damage!`
        });
      } else if (skillId === 'active_1' && player.characterClass === 'archer') {
        const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
        if (aliveMonsters.length === 0) {
          return res.status(400).json({ error: 'No monsters available' });
        }

        const targetCount = Math.max(1, skill.effect?.targetCount || 2);
        const selectedTargets: any[] = [];
        if (targetId) {
          const primary = aliveMonsters.find(m => m.id === targetId);
          if (primary) {
            selectedTargets.push(primary);
          }
        }
        aliveMonsters.forEach(monster => {
          if (selectedTargets.length < targetCount && !selectedTargets.includes(monster)) {
            selectedTargets.push(monster);
          }
        });

        if (selectedTargets.length === 0) {
          return res.status(400).json({ error: 'No targets found for Multi Shot' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const totalMultiplier = gameState.gameConfig.damageMultiplier * passiveDamageInfo.multiplier;
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        const actionDetails: string[] = [];
        const defeatedMonsters = new Set();

        selectedTargets.forEach(originalTarget => {
          if (!originalTarget.isAlive) {
            return;
          }

          let target = originalTarget;
          if (tauntingMonster && tauntingMonster.id !== originalTarget.id) {
            target = tauntingMonster;
          }

          const monsterPassive = getMonsterPassiveEffect(target) || {};
          if (monsterPassive.dodgeChance && Math.random() < monsterPassive.dodgeChance) {
            actionDetails.push(`${target.name}: dodged the arrow`);
            return;
          }

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
            defeatedMonsters.add(target);
            ensurePlayerStats(player).kills += 1;
          }
          ensurePlayerStats(player).totalDamage += finalDamage;
          player.lastAttackDamage = finalDamage;
          actionDetails.push(`${target.name}: -${finalDamage} HP (HP ${beforeHP} -> ${target.currentHP}${reduction > 0 ? ', reduced' : ''}${target !== originalTarget ? ' | redirected by taunt' : ''})`);
        });

        player.skillCooldowns[skillId] = Math.max(0, Number(skill.cooldown) || 4);
        skillsThisTurn.add(skillId);

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} fires ${skill.name}, striking ${selectedTargets.length} target(s)!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} unleashes ${skill.name}, arrows hitting multiple enemies!`,
          summaryDetails: actionDetails
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
      } else if (skillId === 'active_2' && player.characterClass === 'archer') {
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
        const critDamageMultiplier = gameState.gameConfig.critDamage || 2.0;
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
          message: `${player.studentName}'s ${skill.name} deals a critical hit to ${target.name} for ${finalDamage} damage!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName}'s ${skill.name} deals a critical hit to ${target.name} for ${finalDamage} damage!`
        });
      } else if (skillId === 'active_2' && player.characterClass === 'warrior') {
        let target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        let redirected = false;
        if (tauntingMonster && (!target || target.id !== tauntingMonster.id)) {
          target = tauntingMonster;
          redirected = true;
        }
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const skillMultiplier = skill.effect?.damageMultiplier || 1.5;
        const totalMultiplier = gameState.gameConfig.damageMultiplier * skillMultiplier * passiveDamageInfo.multiplier;
        const rawDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const monsterDamageReduction = getMonsterDamageReduction(target);
        const finalDamage = monsterDamageReduction > 0
          ? Math.max(1, Math.round(rawDamage * (1 - monsterDamageReduction)))
          : rawDamage;
        const beforeHP = target.currentHP;
        target.currentHP = Math.max(0, target.currentHP - finalDamage);
        if (target.currentHP <= 0) {
          target.isAlive = false;
          ensurePlayerStats(player).kills += 1;
        }
        ensurePlayerStats(player).totalDamage += finalDamage;
        player.lastAttackDamage = finalDamage;
        player.skillCooldowns[skillId] = Math.max(0, Number(skill.cooldown) || 3);
        skillsThisTurn.add(skillId);

        addStatusToMonster(target, {
          type: 'stun',
          remainingTurns: skill.effect?.stunTurns || 2,
          skipActionsRemaining: 1,
          source: player.studentName
        });

        const statusMessage = `${target.name} is stunned for ${skill.effect?.stunTurns || 2} turns!`;
        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} charges ${target.name} for ${finalDamage} damage${redirected ? ' (taunted)' : ''} and stuns it!`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} charges ${target.name} for ${finalDamage} damage (HP ${beforeHP} -> ${target.currentHP})${monsterDamageReduction > 0 ? ' (reduced)' : ''}${redirected ? ' (taunted)' : ''}. ${statusMessage}`
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
      } else if (skillId === 'active_2' && player.characterClass === 'wizard') {
        let target = gameState.monsters.find(m => m.id === targetId && m.isAlive);
        const tauntingMonster = gameState.monsters.find(m => m.isAlive && getMonsterPassiveEffect(m)?.tauntPlayers);
        const ignoreTaunt = !!skill.effect?.ignoreTaunt;
        let redirected = false;
        if (!ignoreTaunt && tauntingMonster && (!target || tauntingMonster.id !== target.id)) {
          target = tauntingMonster;
          redirected = true;
        }
        if (!target) {
          return res.status(400).json({ error: 'Target not found' });
        }

        const passiveDamageInfo = getPassiveDamageInfo(player);
        const skillMultiplier = skill.effect?.damageMultiplier || 1.2;
        const totalMultiplier = gameState.gameConfig.damageMultiplier * skillMultiplier * passiveDamageInfo.multiplier;
        const rawDamage = calculateDamage(
          player.attack,
          effectivePuzzlePoints,
          totalMultiplier,
          false,
          gameState.gameConfig.critDamage
        );
        const monsterDamageReduction = getMonsterDamageReduction(target);
        const finalDamage = monsterDamageReduction > 0
          ? Math.max(1, Math.round(rawDamage * (1 - monsterDamageReduction)))
          : rawDamage;
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

        const freezeChance = skill.effect?.freezeChance ?? 0.4;
        const freezeDuration = skill.effect?.freezeDuration ?? 1;
        const frozeTarget = Math.random() < freezeChance && target.isAlive;
        if (frozeTarget) {
          addStatusToMonster(target, {
            type: 'freeze',
            remainingTurns: freezeDuration,
            skipActionsRemaining: 1,
            source: player.studentName
          });
        }

        actionResult = {
          type: 'skill',
          playerName: player.studentName,
          skillName: skill.name,
          message: `${player.studentName} unleashes ${skill.name} on ${target.name} for ${finalDamage} damage${frozeTarget ? ' and freezes it!' : ''}${redirected ? ' (taunted)' : ''}.`
        };
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'player_turn',
          message: `${player.studentName} strikes ${target.name} with ${skill.name} for ${finalDamage} damage (HP ${beforeHP} -> ${target.currentHP})${monsterDamageReduction > 0 ? ' (reduced)' : ''}${redirected ? ' (taunted)' : ''}${frozeTarget ? ` and freezes it for ${freezeDuration} turn${freezeDuration > 1 ? 's' : ''}!` : ''}`
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
