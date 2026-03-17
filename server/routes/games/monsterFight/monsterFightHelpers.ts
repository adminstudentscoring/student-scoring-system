// Monster Fight Game Helper Functions
// Extracted from monsterFightCore.ts — damage calculation, status effects,
// passive abilities, monster AI, and other utility functions.
"use strict";

import { MONSTER_TYPES } from './monsterFightConstants';

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

export function addBleedStatusToPlayer(player: any, effect: any, monsterName: any) {
  if (!player || !effect) {
    return;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  player.statuses.push({
    type: 'bleed',
    remainingTurns: effect.turns || 3,
    damageFraction: effect.damageFraction || 0.01,
    source: monsterName,
    appliedThisTurn: true
  });
}

export function addBleedingClawStatusToPlayer(player: any, monster: any, effect: any) {
  if (!player || !monster || !effect) {
    return null;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  const baseAttack = typeof monster.attack === 'number' ? monster.attack : (monster.baseAttack || 0);
  const damagePerTurn = Math.max(1, Math.round(baseAttack * (effect.damageFraction || 0.2)));
  const remainingTurns = Math.max(1, effect.turns || 2);
  player.statuses.push({
    type: 'bleeding_claw',
    remainingTurns,
    damagePerTurn,
    source: monster.name,
    appliedThisTurn: true
  });
  return `${monster.name}'s Bleeding Claw wounds ${player.studentName}, dealing ${damagePerTurn} damage per turn for ${remainingTurns} turns.`;
}

export function addSilenceStatusToPlayer(player: any, duration: any, source: any) {
  if (!player || duration <= 0) {
    return;
  }
  if (!Array.isArray(player.statuses)) {
    player.statuses = [];
  }
  player.statuses.push({
    type: 'silence',
    remainingTurns: duration,
    source: source || null,
    appliedThisTurn: true
  });
}

export function isPlayerSilenced(player: any) {
  if (!player || !Array.isArray(player.statuses)) {
    return false;
  }
  return player.statuses.some((status: any) => status.type === 'silence');
}

export function getLastAttackDamage(player: any, gameState: any) {
  if (player && typeof player.lastAttackDamage === 'number' && player.lastAttackDamage > 0) {
    return player.lastAttackDamage;
  }
  const baseMultiplier = gameState?.gameConfig?.damageMultiplier || 0.2;
  return Math.max(1, Math.round((player?.attack || 1) * baseMultiplier));
}

export function forcePlayerToAttackAlly(player: any, monster: any, gameState: any) {
  const aliveAllies = gameState.players.filter((p: any) => p.isAlive && p.studentId !== player.studentId);
  if (aliveAllies.length === 0) {
    return {
      used: false,
      log: `${monster.name} tries to compel ${player.studentName}, but there are no other allies to strike.`
    };
  }
  const victim = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
  const baseDamage = getLastAttackDamage(player, gameState);
  const beforeHP = victim.currentHP;
  const newHP = Math.max(1, victim.currentHP - baseDamage);
  const actualDamage = beforeHP - newHP;
  victim.currentHP = newHP;
  const stats = ensurePlayerStats(player);
  stats.totalDamage += actualDamage;
  const log = `${monster.name}'s dark magic forces ${player.studentName} to strike ${victim.studentName} for ${actualDamage} damage! (HP ${beforeHP} -> ${victim.currentHP})`;
  player.lastAttackDamage = actualDamage > 0 ? actualDamage : baseDamage;
  if (victim.currentHP <= 0) {
    victim.isAlive = false;
  }
  return { used: true, log };
}

export function selectPlayerTargetForMonster(alivePlayers: any, options: any = {}) {
  if (!alivePlayers || alivePlayers.length === 0) {
    return null;
  }
  const ignoreTaunt = !!options.ignoreTaunt;
  const preferNonShield = !!options.preferNonShield;

  if (!ignoreTaunt) {
    const taunter = alivePlayers.find((p: any) => p.isAlive && getPlayerPassiveEffect(p)?.tauntMonsters);
    if (taunter) return taunter;
  }

  let candidates = alivePlayers;
  if (preferNonShield) {
    const nonShield = alivePlayers.filter((p: any) => p.characterClass !== 'shield_warrior');
    if (nonShield.length > 0) {
      candidates = nonShield;
    }
  }

  return candidates.reduce((lowest: any, player: any) => (
    player.currentHP < lowest.currentHP ? player : lowest
  ), candidates[0]);
}

export function executeMonsterActiveSkill(monster: any, skill: any, gameState: any) {
  const effect = skill.effect || {};
  const skillName = skill.name || 'Skill';
  const alivePlayers = gameState.players.filter((p: any) => p.isAlive);

  if (effect.areaHeal) {
    const healFraction = Math.max(0, effect.missingHpFraction || 0);
    const aliveMonsters = gameState.monsters.filter((m: any) => m.isAlive);
    if (aliveMonsters.length === 0) {
      return { used: false };
    }
    const summaryDetails: string[] = [];
    aliveMonsters.forEach((target: any) => {
      const missing = Math.max(0, (target.maxHP || 0) - (target.currentHP || 0));
      if (missing <= 0) {
        return;
      }
      const healAmount = Math.max(1, Math.floor(missing * healFraction));
      const before = target.currentHP;
      target.currentHP = Math.min(target.maxHP, target.currentHP + healAmount);
      const actualHeal = target.currentHP - before;
      if (actualHeal > 0) {
        summaryDetails.push(`${target.name}: +${actualHeal} HP (HP ${before} -> ${target.currentHP})`);
      }
    });
    if (summaryDetails.length === 0) {
      return { used: false };
    }
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} casts ${skillName}, bathing allies in restorative energy.`,
      summaryDetails
    };
    return { used: true, entry };
  }

  if (effect.areaDamage) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const damageMultiplier = gameState.gameConfig.damageMultiplier * (effect.damageMultiplier || 1);
    const baseDamage = calculateDamage(
      monster.attack,
      1,
      damageMultiplier,
      false,
      gameState.gameConfig.critDamage
    );
    const summaryDetails: string[] = [];
    alivePlayers.forEach((player: any) => {
      const damageReduction = getDamageReduction(player);
      const finalDamage = damageReduction > 0
        ? Math.max(1, Math.round(baseDamage * (1 - damageReduction)))
        : baseDamage;
      const beforeHP = player.currentHP;
      player.currentHP = Math.max(0, player.currentHP - finalDamage);
      if (player.currentHP <= 0) {
        player.isAlive = false;
      }
      summaryDetails.push(`${player.studentName}: -${finalDamage} HP (HP ${beforeHP} -> ${player.currentHP}${damageReduction > 0 ? ', reduced' : ''})`);
    });
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} engulfs the party with ${skillName}!`,
      summaryDetails
    };
    return { used: true, entry };
  }

  if (effect.forcePlayerAttack) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, { ignoreTaunt: effect.ignoreTaunt });
    if (!target) {
      return { used: false };
    }
    const result = forcePlayerToAttackAlly(target, monster, gameState);
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: result.log
    };
    return { used: result.used, entry: result.used ? entry : null };
  }

  if (effect.reduceRemainingHpFraction) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, { ignoreTaunt: effect.ignoreTaunt });
    if (!target) {
      return { used: false };
    }
    const fraction = Math.min(0.99, Math.max(0, effect.reduceRemainingHpFraction));
    const before = target.currentHP;
    const remainingFraction = 1 - fraction;
    const newHP = Math.max(1, Math.ceil(before * remainingFraction));
    const damage = before - newHP;
    target.currentHP = newHP;
    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name}'s ${skillName} rends ${target.studentName}, ripping away ${damage} HP! (HP ${before} -> ${target.currentHP})`
    };
    return { used: true, entry };
  }

  if (effect.damageMultiplier) {
    if (alivePlayers.length === 0) {
      return { used: false };
    }
    const target = selectPlayerTargetForMonster(alivePlayers, {
      ignoreTaunt: effect.ignoreTaunt,
      preferNonShield: effect.preferNonShield
    });
    if (!target) {
      return { used: false };
    }
    const damageMultiplier = gameState.gameConfig.damageMultiplier * (effect.damageMultiplier || 1);
    const damageReduction = getDamageReduction(target);
    const baseDamage = calculateDamage(
      monster.attack,
      1,
      damageMultiplier,
      false,
      gameState.gameConfig.critDamage
    );
    const finalDamage = damageReduction > 0
      ? Math.max(1, Math.round(baseDamage * (1 - damageReduction)))
      : baseDamage;
    const beforeHP = target.currentHP;
    target.currentHP = Math.max(0, target.currentHP - finalDamage);
    if (target.currentHP <= 0) {
      target.isAlive = false;
    }
    let message = `${monster.name} uses ${skillName} on ${target.studentName} for ${finalDamage} damage${damageReduction > 0 ? ' (reduced)' : ''}! (HP ${beforeHP} -> ${target.currentHP})`;

    if (effect.silenceChance && Math.random() < effect.silenceChance && target.isAlive) {
      addSilenceStatusToPlayer(target, effect.silenceDuration || 1, monster.name);
      message += ` ${target.studentName} is silenced!`;
    }

    const entry = {
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message
    };
    return { used: true, entry };
  }

  return { used: false };
}

export function attemptMonsterActiveSkill(monster: any, gameState: any) {
  if (!monster || !monster.isAlive || !Array.isArray(monster.skills)) {
    return { used: false };
  }
  const activeSkills = monster.skills.filter((skill: any) => skill.type === 'active');
  if (activeSkills.length === 0) {
    return { used: false };
  }

  monster.skillCooldowns = monster.skillCooldowns || {};

  for (const skill of activeSkills) {
    const cooldown = monster.skillCooldowns[skill.id] || 0;
    if (cooldown <= 0) {
      const result = executeMonsterActiveSkill(monster, skill, gameState);
      if (result.used) {
        monster.skillCooldowns[skill.id] = skill.cooldown || 0;
        return { used: true, entry: (result as any).entry || null };
      }
    }
  }

  return { used: false };
}

export function applyPlayerStatusEffects(gameState: any) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const logs: string[] = [];
  gameState.players.forEach((player: any) => {
    if (!player.isAlive || !Array.isArray(player.statuses) || player.statuses.length === 0) {
      return;
    }
    const remainingStatuses: any[] = [];
    player.statuses.forEach((status: any) => {
      if (status.appliedThisTurn) {
        status.appliedThisTurn = false;
        remainingStatuses.push(status);
        return;
      }
      if (status.type === 'bleed') {
        const damage = Math.max(1, Math.round((player.maxHP || 0) * (status.damageFraction || 0.01)));
        const before = player.currentHP;
        player.currentHP = Math.max(0, player.currentHP - damage);
        logs.push(`${player.studentName} suffers ${damage} bleed damage${status.source ? ` from ${status.source}` : ''}. (HP ${before} -> ${player.currentHP})`);
        if (player.currentHP <= 0) {
          player.isAlive = false;
        }
      } else if (status.type === 'bleeding_claw') {
        const damage = Math.max(1, Math.round(status.damagePerTurn || 0));
        if (damage > 0) {
          const before = player.currentHP;
          player.currentHP = Math.max(0, player.currentHP - damage);
          logs.push(`${player.studentName} suffers ${damage} Bleeding Claw damage${status.source ? ` from ${status.source}` : ''}. (HP ${before} -> ${player.currentHP})`);
          if (player.currentHP <= 0) {
            player.isAlive = false;
          }
        }
      } else if (status.type === 'silence') {
        logs.push(`${player.studentName} is silenced${status.source ? ` by ${status.source}` : ''} and cannot use skills.`);
      }
      status.remainingTurns = (status.remainingTurns || 1) - 1;
      if (player.isAlive && status.remainingTurns > 0) {
        remainingStatuses.push(status);
      }
    });
    player.statuses = remainingStatuses;
  });
  return logs;
}

export function ensureMonsterStatuses(monster: any) {
  if (!monster) {
    return [];
  }
  if (!Array.isArray(monster.statuses)) {
    monster.statuses = [];
  }
  return monster.statuses;
}

export function addStatusToMonster(monster: any, status: any) {
  if (!monster || !status) {
    return;
  }
  const statuses = ensureMonsterStatuses(monster);
  const normalized = {
    type: status.type,
    remainingTurns: typeof status.remainingTurns === 'number' ? status.remainingTurns : 1,
    skipActionsRemaining: typeof status.skipActionsRemaining === 'number' ? status.skipActionsRemaining : 1,
    source: status.source || null,
    note: status.note || null
  };
  statuses.push(normalized);
}

export function processMonsterControlStatuses(monster: any) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return { skipTurn: false, logs: [] as string[] };
  }
  let skipTurn = false;
  const logs: string[] = [];
  monster.statuses.forEach((status: any) => {
    if ((status.type === 'stun' || status.type === 'freeze') && !skipTurn) {
      const remainingSkips = typeof status.skipActionsRemaining === 'number' ? status.skipActionsRemaining : 1;
      if (remainingSkips > 0) {
        skipTurn = true;
        status.skipActionsRemaining = Math.max(0, remainingSkips - 1);
        if (status.type === 'stun') {
          logs.push(`${monster.name} is stunned and cannot act this turn!`);
        } else if (status.type === 'freeze') {
          logs.push(`${monster.name} is frozen solid and skips this turn!`);
        } else {
          logs.push(`${monster.name} is incapacitated and cannot act this turn!`);
        }
      }
    }
  });
  return { skipTurn, logs };
}

export function advanceMonsterStatuses(monster: any) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return;
  }
  monster.statuses = monster.statuses.filter((status: any) => {
    if (typeof status.remainingTurns === 'number') {
      status.remainingTurns -= 1;
      return status.remainingTurns > 0;
    }
    return false;
  });
}

export function applyMonsterStatusDamage(monster: any, gameState: any, data: any) {
  const result: any = { logs: [] as string[], deathLogs: [] as string[] };
  if (!monster || !monster.isAlive || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return result;
  }

  let monsterKilled = false;
  monster.statuses.forEach((status: any) => {
    if (!monster.isAlive) {
      return;
    }
    if (status.type === 'poison' && (status.remainingTurns === undefined || status.remainingTurns > 0)) {
      const damage = Math.max(1, status.damagePerTurn || 0);
      if (damage <= 0) {
        return;
      }
      const beforeHP = monster.currentHP;
      monster.currentHP = Math.max(0, monster.currentHP - damage);
      result.logs.push(`${monster.name} suffers ${damage} poison damage${status.source ? ` from ${status.source}` : ''}. (HP ${beforeHP} -> ${monster.currentHP})`);
      if (monster.currentHP <= 0 && monster.isAlive) {
        monster.isAlive = false;
        monsterKilled = true;
      }
    }
  });

  if (monsterKilled) {
    const deathLogs = handleMonsterDeath(monster, gameState, data);
    result.deathLogs.push(...deathLogs);
  }

  return result;
}

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
