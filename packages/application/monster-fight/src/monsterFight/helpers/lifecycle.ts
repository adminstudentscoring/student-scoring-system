// Monster Fight lifecycle helpers (spawn, death).
"use strict";

import { getMonsterPassiveEffect, getMonsterTypeById } from './passives';

export function ensureMonsterSequence(gameState: any) {
  if (typeof gameState.monsterSequence !== 'number') {
    gameState.monsterSequence = 0;
  }
}

export function createMonsterInstanceFromType(monsterType: any, gameState: any, overrides: any = {}) {
  ensureMonsterSequence(gameState);
  gameState.monsterSequence += 1;
  const inst: any = {
    id: `monster_${gameState.currentLevel}_${gameState.monsterSequence}`,
    type: monsterType.id,
    name: overrides.name || `${monsterType.name} ${gameState.monsterSequence}`,
    emoji: monsterType.emoji,
    baseAttack: overrides.attack ?? monsterType.baseAttack,
    attack: overrides.attack ?? monsterType.baseAttack,
    maxHP: overrides.maxHP ?? monsterType.baseHP,
    currentHP: overrides.currentHP ?? monsterType.baseHP,
    isAlive: true,
    skills: (monsterType.skills || []).map((skill: any) => ({ ...skill })),
    skillCooldowns: {}
  };
  return inst;
}

export function handleMonsterDeath(monster: any, gameState: any, data: any) {
  const logs: string[] = [];
  const effect = getMonsterPassiveEffect(monster);
  if (effect?.splitOnDeath && !monster.splitPerformed) {
    monster.splitPerformed = true;
    const splitMin = effect.splitMin || 2;
    const splitMax = effect.splitMax || splitMin;
    const splitCount = splitMin === splitMax
      ? splitMin
      : splitMin + Math.floor(Math.random() * (splitMax - splitMin + 1));
    const miniType = getMonsterTypeById('mini_slime', data);
    if (miniType) {
      for (let i = 0; i < splitCount; i++) {
        const mini = createMonsterInstanceFromType(miniType, gameState, {
          attack: monster.attack,
          maxHP: Math.max(1, Math.floor((monster.maxHP || miniType.baseHP) / 3)),
          currentHP: Math.max(1, Math.floor((monster.maxHP || miniType.baseHP) / 3))
        });
        mini.parentId = monster.id;
        mini.originalType = miniType.id;
        mini.spawnTurn = gameState.currentTurn;
        gameState.monsters.push(mini);
      }
      logs.push(`${monster.name} splits into ${splitCount} Mini Slimes!`);
    }
  }
  return logs;
}
