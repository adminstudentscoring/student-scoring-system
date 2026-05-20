// Monster Fight helpers — see monsterFightHelpers.ts barrel.
"use strict";

export function calculateReviveProbability(puzzlePoints: any, baseRate: any, decay: any, maxRate: any, accumulatedRate = 0) {
  let totalRate = accumulatedRate;
  if (puzzlePoints > 0) {
    const geometricSum = baseRate * (1 - Math.pow(decay, puzzlePoints)) / (1 - decay);
    totalRate += geometricSum;
  }
  return Math.min(totalRate, maxRate);
}

export function calculateDamage(attack: any, puzzlePoints: any, multiplier: any, isCrit = false, critDamage = 2.0) {
  let baseDamage = attack * puzzlePoints * multiplier;
  const randomFactor = 0.9 + Math.random() * 0.2;
  baseDamage *= randomFactor;
  
  if (isCrit) {
    baseDamage *= critDamage;
  }
  
  return Math.max(1, Math.round(baseDamage));
}

export function pickRandomMultiplierFromRanges(ranges: any, defaultValue = 1) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return defaultValue;
  }

  let r = Math.random();
  let selectedRange: any = null;

  for (const range of ranges) {
    const chance = typeof range.chance === 'number' ? range.chance : 0;
    if (chance > 0) {
      if (r <= chance) {
        selectedRange = range;
        break;
      }
      r -= chance;
    }
  }

  if (!selectedRange) {
    selectedRange = ranges[ranges.length - 1];
  }

  const min = typeof selectedRange.min === 'number' ? selectedRange.min : defaultValue;
  const max = typeof selectedRange.max === 'number' ? selectedRange.max : min;
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

export function ensurePlayerStats(player: any) {
  if (!player.stats) {
    player.stats = { totalDamage: 0, kills: 0, healing: 0 };
  }
  if (typeof player.stats.totalDamage !== 'number') player.stats.totalDamage = 0;
  if (typeof player.stats.kills !== 'number') player.stats.kills = 0;
  if (typeof player.stats.healing !== 'number') player.stats.healing = 0;
  return player.stats;
}

export function getDamageReduction(player: any) {
  if (!player || !Array.isArray(player.skills)) {
    return 0;
  }
  const passiveSkill = player.skills.find((skill: any) => skill.type === 'passive');
  const reduction = passiveSkill?.effect?.damageReduction;
  if (typeof reduction === 'number' && reduction > 0) {
    return Math.min(0.9, Math.max(0, reduction));
  }
  return 0;
}

export function getLastAttackDamage(player: any, gameState: any) {
  if (player && typeof player.lastAttackDamage === 'number' && player.lastAttackDamage > 0) {
    return player.lastAttackDamage;
  }
  const baseMultiplier = gameState?.gameConfig?.damageMultiplier || 0.2;
  return Math.max(1, Math.round((player?.attack || 1) * baseMultiplier));
}
