// Monster Fight helpers — see monsterFightHelpers.ts barrel.
"use strict";

import { MONSTER_TYPES } from '../monsterFightConstants';
import { pickRandomMultiplierFromRanges, ensurePlayerStats } from './combat';

export function getPassiveDamageInfo(player: any) {
  const result: any = {
    multiplier: 1,
    sources: [] as any[]
  };

  if (!player || !Array.isArray(player.skills)) {
    return result;
  }

  const passiveSkill = player.skills.find((skill: any) => skill.type === 'passive');
  if (!passiveSkill || !passiveSkill.effect) {
    return result;
  }

  const effect = passiveSkill.effect;

  if (effect.damageMultiplier && typeof effect.damageMultiplier === 'object') {
    const min = typeof effect.damageMultiplier.min === 'number' ? effect.damageMultiplier.min : 1;
    const max = typeof effect.damageMultiplier.max === 'number' ? effect.damageMultiplier.max : min;
    if (max > 0) {
      const value = max > min ? min + Math.random() * (max - min) : max;
      result.multiplier *= value;
      result.sources.push({ type: 'precision_boost', value: Number(value.toFixed(2)) });
    }
  }

  if (effect.randomMultiplier && Array.isArray(effect.randomMultiplier.ranges)) {
    const value = pickRandomMultiplierFromRanges(effect.randomMultiplier.ranges, 1);
    result.multiplier *= value;
    result.sources.push({ type: 'arcane_surge', value: Number(value.toFixed(2)) });
  }

  return result;
}

export function applyPriestPassiveHealing(gameState: any) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const alivePlayers = gameState.players.filter((p: any) => p.isAlive);
  if (alivePlayers.length === 0) {
    return [];
  }
  const healEvents: any[] = [];
  gameState.players.forEach((player: any) => {
    if (!player.isAlive || player.characterClass !== 'priest') {
      return;
    }
    const healBase = Number(player.puzzlePoints) || 0;
    if (healBase <= 0) {
      return;
    }
    const healPerPlayer = Math.floor(healBase / alivePlayers.length);
    if (healPerPlayer <= 0) {
      return;
    }
    const healedTargets: any[] = [];
    alivePlayers.forEach((target: any) => {
      if (!target.maxHP || target.currentHP >= target.maxHP) {
        return;
      }
      const before = target.currentHP;
      target.currentHP = Math.min(target.maxHP, target.currentHP + healPerPlayer);
      const healed = target.currentHP - before;
      if (healed > 0) {
        ensurePlayerStats(player).healing += healed;
        healedTargets.push({ name: target.studentName, amount: healed, before, after: target.currentHP });
      }
    });
    if (healedTargets.length > 0) {
      healEvents.push({ priestName: player.studentName, healAmount: healPerPlayer, targets: healedTargets });
    }
  });
  return healEvents;
}

export function getMonsterPassiveEffect(monster: any) {
  if (!monster || !Array.isArray(monster.skills)) {
    return null;
  }
  const passiveSkill = monster.skills.find((skill: any) => skill.type === 'passive');
  return passiveSkill?.effect || null;
}

export function getPlayerPassiveEffect(player: any) {
  if (!player || !Array.isArray(player.skills)) {
    return null;
  }
  const passiveSkill = player.skills.find((skill: any) => skill.type === 'passive');
  return passiveSkill?.effect || null;
}

export function getMonsterDamageReduction(monster: any) {
  const effect = getMonsterPassiveEffect(monster);
  const reduction = effect?.damageReduction;
  if (typeof reduction === 'number' && reduction > 0) {
    return Math.min(0.9, Math.max(0, reduction));
  }
  return 0;
}

export function getAvailableMonsterTypes(data: any) {
  return (data?.gameSettings?.monsterTypes && data.gameSettings.monsterTypes.length > 0)
    ? data.gameSettings.monsterTypes
    : MONSTER_TYPES;
}

export function getMonsterTypeById(typeId: any, data: any) {
  if (!typeId) return null;
  const types = getAvailableMonsterTypes(data);
  return types.find((t: any) => t.id === typeId) || MONSTER_TYPES.find((t: any) => t.id === typeId) || null;
}

export function maybeApplyShamanCriticalHeal(monster: any, baseAmount: any) {
  const effect = getMonsterPassiveEffect(monster);
  if (!effect) {
    return { amount: baseAmount, isCritical: false };
  }
  const chance = effect.critHealChance;
  const multiplier = effect.critHealMultiplier;
  if (typeof chance === 'number' && chance > 0 && typeof multiplier === 'number' && multiplier > 1) {
    if (Math.random() < chance) {
      const boosted = Math.max(1, Math.round(baseAmount * multiplier));
      return { amount: boosted, isCritical: true };
    }
  }
  return { amount: baseAmount, isCritical: false };
}

export function applyShamanPassiveHealing(gameState: any, data: any) {
  if (!gameState || !Array.isArray(gameState.monsters)) {
    return [];
  }
  const aliveMonsters = gameState.monsters.filter((m: any) => m.isAlive);
  if (aliveMonsters.length === 0) {
    return [];
  }
  const healLogs: string[] = [];
  aliveMonsters.forEach((monster: any) => {
    const effect = getMonsterPassiveEffect(monster);
    if (!effect?.healLowestAllyFraction) {
      return;
    }
    const target = aliveMonsters.reduce((lowest: any, ally: any) => 
      ally.currentHP < lowest.currentHP ? ally : lowest
    , aliveMonsters[0]);
    if (!target || target.currentHP >= target.maxHP) {
      return;
    }
    const baseHealAmount = Math.max(1, Math.floor(target.maxHP * effect.healLowestAllyFraction));
    const { amount: healAmount, isCritical } = maybeApplyShamanCriticalHeal(monster, baseHealAmount);
    const before = target.currentHP;
    target.currentHP = Math.min(target.maxHP, target.currentHP + healAmount);
    const actualHeal = target.currentHP - before;
    if (actualHeal > 0) {
      const critNote = isCritical ? ' (Critical Heal!)' : '';
      healLogs.push(`${monster.name} heals ${target.name} for ${actualHeal} HP${critNote} (HP ${before} -> ${target.currentHP}).`);
    }
  });
  return healLogs;
}

export function applyFirestormAuraBeforePlayerAction(player: any, gameState: any) {
  if (!player || !player.isAlive) {
    return null;
  }
  if (!gameState || !Array.isArray(gameState.monsters)) {
    return null;
  }
  const auraMonsters = gameState.monsters.filter((monster: any) => {
    if (!monster || !monster.isAlive) {
      return false;
    }
    const effect = getMonsterPassiveEffect(monster);
    return !!(effect && effect.firestormAura);
  });
  if (auraMonsters.length === 0) {
    return null;
  }

  const result: any = {
    triggered: false,
    totalDamage: 0,
    defeated: false,
    messages: [] as string[]
  };

  auraMonsters.forEach((monster: any) => {
    const effect = getMonsterPassiveEffect(monster);
    const aura = effect?.firestormAura;
    if (!aura) {
      return;
    }
    const maxHP = monster.maxHP || 0;
    if (maxHP <= 0) {
      return;
    }
    const threshold = typeof aura.threshold === 'number' ? aura.threshold : 0.5;
    const enraged = (monster.currentHP / maxHP) <= threshold;
    const fraction = enraged
      ? (typeof aura.enragedFraction === 'number' ? aura.enragedFraction : aura.baseFraction)
      : aura.baseFraction;
    if (typeof fraction !== 'number' || fraction <= 0) {
      return;
    }
    const beforeHP = player.currentHP;
    const damage = Math.max(1, Math.floor(maxHP * fraction));
    player.currentHP = Math.max(0, player.currentHP - damage);
    result.triggered = true;
    result.totalDamage += damage;
    const afterHP = player.currentHP;
    const note = enraged ? ' (enraged aura)' : '';
    result.messages.push(`${monster.name}'s Firestorm Aura scorches ${player.studentName} for ${damage} damage${note}. (HP ${beforeHP} -> ${afterHP})`);
  });

  if (!result.triggered) {
    return null;
  }

  if (player.currentHP <= 0) {
    player.currentHP = 0;
    player.isAlive = false;
    result.defeated = true;
  }

  return result;
}
