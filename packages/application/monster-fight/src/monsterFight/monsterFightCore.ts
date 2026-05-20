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
} from './monsterFightConstants';

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
} from './monsterFightHelpers';

const { registerMonsterFightSetupRoutes } = require('./core/monsterFightSetupRoutes');
const { registerMonsterFightPlayerActionRoutes } = require('./core/monsterFightPlayerActionRoutes');
const { registerMonsterFightMonsterTurnRoutes } = require('./core/monsterFightMonsterTurnRoutes');
const { registerMonsterFightReviveRoutes } = require('./core/monsterFightReviveRoutes');

function registerMonsterFightCoreRoutes(app: any, deps: any): void {
  if (!app) throw new Error("registerMonsterFightGameRoutes: missing app");
  registerMonsterFightSetupRoutes(app, deps);
  registerMonsterFightPlayerActionRoutes(app, deps);
  registerMonsterFightMonsterTurnRoutes(app, deps);
  registerMonsterFightReviveRoutes(app, deps);
}

module.exports = { registerMonsterFightCoreRoutes };
export {};
