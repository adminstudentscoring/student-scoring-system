// Extracted from server.js to reduce file size and isolate game APIs.
"use strict";

function registerMonsterFightRoutes(app, deps) {
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

  if (!app) throw new Error("registerMonsterFightGameRoutes: missing app");
  if (!fs) throw new Error("registerMonsterFightGameRoutes: missing deps.fs");
  if (!path) throw new Error("registerMonsterFightGameRoutes: missing deps.path");
  if (typeof readData !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.readData");
  if (typeof writeData !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.writeData");
  if (typeof broadcast !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.broadcast");
  if (typeof getRankInfo !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.getRankInfo");
  if (typeof addRewardPointsToStats !== "function") throw new Error("registerMonsterFightGameRoutes: missing deps.addRewardPointsToStats");
  if (!GAME_SAVES_DIR) throw new Error("registerMonsterFightGameRoutes: missing deps.GAME_SAVES_DIR");

  // Monster Fight Game Configuration
const GAME_CONFIG = {
  // Default damage multiplier
  damageMultiplier: 0.2,
  
  // Default crit settings
  critRate: 0.10, // 10%
  critDamage: 2.0, // 2x damage
  
  // Default revive settings
  baseReviveRate: 0.01, // 1%
  reviveRateDecay: 0.95, // 0.95 multiplier per point
  maxReviveRate: 0.66, // 66% max
  
  // Difficulty curve
  difficultyCurve: {
    1: { monstersPerStudent: 1, strengthMultiplier: 1.0 },
    2: { monstersPerStudent: 1.5, strengthMultiplier: 1.2 },
    3: { monstersPerStudent: 2.0, strengthMultiplier: 1.5 }
  }
};

// Player Character Classes
const PLAYER_CLASSES = [
  {
    id: 'archer',
    name: 'Archer',
    emoji: '🏹',
    baseAttack: 10,
    baseHP: 80,
    skills: [
      { id: 'passive_1', name: 'Precision Shot', type: 'passive', description: 'Damage increased by 1.2-1.5x', effect: { damageMultiplier: { min: 1.2, max: 1.5 } } },
      { id: 'active_1', name: 'Multi Shot', type: 'active', cooldown: 4, description: 'Attack multiple enemies', emoji: '🎯', effect: { targetCount: 3 } },
      { id: 'active_2', name: 'Critical Strike', type: 'active', cooldown: 4, description: 'Guaranteed critical hit', emoji: '💢', effect: { guaranteedCrit: true } }
    ]
  },
  {
    id: 'warrior',
    name: 'Warrior',
    emoji: '⚔️',
    baseAttack: 12,
    baseHP: 100,
    skills: [
      { id: 'passive_1', name: 'Berserker', type: 'passive', description: 'Attack increases when HP is low', effect: { lowHPBonus: true } },
      { id: 'active_1', name: 'Power Strike', type: 'active', cooldown: 2, description: 'Deal 1.5x damage', emoji: '⚡', effect: { damageMultiplier: 1.5 } },
      { id: 'active_2', name: 'Charge', type: 'active', cooldown: 3, description: 'Attack and stun enemy for 2 turns', emoji: '🐎', effect: { stunTurns: 2, damageMultiplier: 1.5 } }
    ]
  },
  {
    id: 'wizard',
    name: 'Wizard',
    emoji: '🔮',
    baseAttack: 15,
    baseHP: 60,
    skills: [
      {
        id: 'passive_1',
        name: 'Arcane Surge',
        type: 'passive',
        description: 'Attacks deal 1.0-3.0x damage (higher multipliers are rarer; 3.0x ≈1%)',
        effect: {
          randomMultiplier: {
            ranges: [
              { chance: 0.01, min: 3.0, max: 3.0 },
              { chance: 0.04, min: 2.5, max: 2.99 },
              { chance: 0.10, min: 2.0, max: 2.49 },
              { chance: 0.25, min: 1.5, max: 1.99 },
              { chance: 0.60, min: 1.0, max: 1.49 }
            ]
          }
        }
      },
      { id: 'active_1', name: 'Fireball', type: 'active', cooldown: 3, description: 'Area damage to all enemies (ignores taunt)', emoji: '🔥', effect: { areaDamage: true, ignoreTaunt: true, damageMultiplier: 0.35 } },
      { id: 'active_2', name: 'Freeze', type: 'active', cooldown: 4, description: 'Single-target damage with 40% chance to freeze for 1 turn (ignores taunt)', emoji: '❄️', effect: { freezeChance: 0.4, freezeDuration: 1, damageMultiplier: 1.2, ignoreTaunt: true } }
    ]
  },
  {
    id: 'priest',
    name: 'Priest',
    emoji: '✨',
    baseAttack: 8,
    baseHP: 90,
    skills: [
      { id: 'passive_1', name: 'Divine Blessing', type: 'passive', description: 'Regenerate HP each turn', effect: { regenPerTurn: 5 } },
      { id: 'active_1', name: 'Heal', type: 'active', cooldown: 2, description: 'Restore HP to ally', effect: { heal: 30 } },
      { id: 'active_2', name: 'Revive', type: 'active', cooldown: 5, description: 'Revive fallen ally', effect: { revive: true } }
    ]
  },
  {
    id: 'assassin',
    name: 'Assassin',
    emoji: '🗡️',
    baseAttack: 14,
    baseHP: 70,
    skills: [
      { id: 'passive_1', name: 'Shadow Step', type: 'passive', description: 'Critical rate increased by 30%', effect: { critRateBonus: 0.30 } },
      { id: 'active_1', name: 'Backstab', type: 'active', cooldown: 3, description: 'High damage from behind', emoji: '🗡️', effect: { damageMultiplier: 2.0 } },
      { id: 'active_2', name: 'Poison', type: 'active', cooldown: 4, description: 'Apply poison damage over time', emoji: '☠️', effect: { dotMultiplier: 0.2, dotTurns: 3 } }
    ]
  },
  {
    id: 'shield_warrior',
    name: 'Shield Warrior',
    emoji: '🛡️',
    baseAttack: 9,
    baseHP: 120,
    skills: [
      { id: 'passive_1', name: 'Shield Block', type: 'passive', description: 'Reduce damage by 30% and taunt monsters', effect: { damageReduction: 0.3, tauntMonsters: true } },
      { id: 'active_1', name: 'Shield Bash', type: 'active', cooldown: 3, description: 'Attack and reduce enemy attack', emoji: '🔰', effect: { debuff: 'attack', damageMultiplier: 1.1 } },
      { id: 'active_2', name: 'Shield Smash', type: 'active', cooldown: 4, description: 'Attack with 30% chance to stun', emoji: '🥊', effect: { damageMultiplier: 1.2, stunChance: 0.3, stunTurns: 1 } }
    ]
  }
];

// Monster Types
const MONSTER_TYPES = [
  {
    id: 'shaman',
    name: 'Shaman',
    emoji: '🧙',
    baseAttack: 12,
    baseHP: 80,
    skills: [
      {
        id: 'passive_1',
        name: 'Vital Infusion',
        type: 'passive',
        description: 'Each turn heal the lowest HP ally (including self) for 10% max HP with a chance to critically amplify heals',
        effect: { healLowestAllyFraction: 0.1, critHealChance: 0.4, critHealMultiplier: 2.5 }
      },
      {
        id: 'active_1',
        name: 'Vital Storm',
        type: 'active',
        cooldown: 3,
        description: 'Heal all allies for 40% of their missing HP',
        effect: { areaHeal: true, missingHpFraction: 0.4 }
      }
    ]
  },
  {
    id: 'slime',
    name: 'Slime',
    emoji: '🟢',
    baseAttack: 8,
    baseHP: 60,
    skills: [
      { id: 'passive_1', name: 'Split', type: 'passive', description: 'On first death split into mini slimes', effect: { splitOnDeath: true, splitMin: 2, splitMax: 4 } },
      { id: 'active_1', name: 'Acid Spit', type: 'active', cooldown: 2, description: 'Deal damage over time', effect: { dot: true } }
    ]
  },
  {
    id: 'mini_slime',
    name: 'Mini Slime',
    emoji: '🟢',
    baseAttack: 8,
    baseHP: 20,
    skills: []
  },
  {
    id: 'goblin',
    name: 'Goblin',
    emoji: '👺',
    baseAttack: 10,
    baseHP: 70,
    skills: [
      {
        id: 'passive_1',
        name: 'Cunning Momentum',
        type: 'passive',
        description: 'Gains +1 attack permanently each time it lands a successful strike',
        effect: { attackIncreaseOnHit: 1 }
      },
      {
        id: 'active_1',
        name: 'Shadow Stab',
        type: 'active',
        cooldown: 2,
        description: 'Strike a non-shield foe, ignoring taunt',
        effect: { damageMultiplier: 1, ignoreTaunt: true, preferNonShield: true }
      }
    ]
  },
  {
    id: 'brute',
    name: 'Brute',
    emoji: '👹',
    baseAttack: 15,
    baseHP: 120,
    skills: [
      { id: 'passive_1', name: 'Tough', type: 'passive', description: 'Reduce damage by 20% and taunt player attacks', effect: { damageReduction: 0.2, tauntPlayers: true } },
      {
        id: 'active_1',
        name: 'Bone Slam',
        type: 'active',
        cooldown: 2,
        description: 'Devastating 2.5× single-target smash (taunt applies)',
        effect: { damageMultiplier: 2.5 }
      }
    ]
  },
  {
    id: 'dark_mage',
    name: 'Dark Mage',
    emoji: '🧛',
    baseAttack: 18,
    baseHP: 90,
    skills: [
      { id: 'passive_1', name: 'Dark Aura', type: 'passive', description: 'Inflict 3-turn bleed on attack', effect: { applyBleed: { turns: 3, damageFraction: 0.01 } } },
      {
        id: 'active_1',
        name: 'Dark Bolt',
        type: 'active',
        cooldown: 3,
        description: 'Force a player to strike an ally with their last attack power',
        effect: { forcePlayerAttack: true }
      }
    ]
  },
  {
    id: 'tiger',
    name: 'Evil Tiger',
    emoji: '🐅',
    baseAttack: 14,
    baseHP: 100,
    skills: [
      {
        id: 'passive_1',
        name: 'Bleeding Claw',
        type: 'passive',
        description: 'Attack ×1.5 when HP ≤ 50% and normal attacks inflict a stacking bleed over time',
        effect: {
          lowHPBonus: { threshold: 0.5, multiplier: 1.5 },
          bleedingClaw: { damageFraction: 0.2, turns: 2 }
        }
      },
      {
        id: 'active_1',
        name: 'Savage Roar',
        type: 'active',
        cooldown: 3,
        description: 'Deal 2× damage and silence the target for 1 turn (40% chance)',
        effect: { damageMultiplier: 2, silenceChance: 0.4, silenceDuration: 1 }
      }
    ]
  },
  {
    id: 'dragon',
    name: 'Evil Dragon',
    emoji: '🐉',
    isBoss: true,
    baseAttack: 25,
    baseHP: 300,
    skills: [
      {
        id: 'passive_1',
        name: 'Firestorm Aura',
        type: 'passive',
        description: '20% chance to dodge normal attacks and scorch foes before they act',
        effect: {
          dodgeChance: 0.2,
          firestormAura: { baseFraction: 0.02, enragedFraction: 0.05, threshold: 0.5 }
        }
      },
      {
        id: 'active_1',
        name: 'Fire Breath',
        type: 'active',
        cooldown: 2,
        description: 'Unleash 2× attack damage to all players, ignoring taunt',
        effect: { areaDamage: true, damageMultiplier: 2, ignoreTaunt: true }
      }
    ]
  },
  {
    id: 'three_headed_wolf',
    name: 'Three-Headed Wolf',
    emoji: '🐺',
    isBoss: true,
    baseAttack: 22,
    baseHP: 250,
    skills: [
      { id: 'passive_1', name: 'Triple Attack', type: 'passive', description: 'Attack 3 times per turn (0.8x damage)', effect: { attackCount: 3, attackMultiplier: 0.8 } },
      {
        id: 'active_1',
        name: 'Fatal Bite',
        type: 'active',
        cooldown: 2,
        description: 'Ignore taunt and rip away 80% of the target’s remaining HP',
        effect: { reduceRemainingHpFraction: 0.8, ignoreTaunt: true }
      }
    ]
  }
];

// Running Queen / Royal Exchange / Hope Mate routes were extracted into:
// - server/routes/games/runningQueenRoutes.js
// - server/routes/games/royalExchangeRoutes.js
// - server/routes/games/hopeMateRoutes.js
// - server/routes/games/hopeMateAdminRoutes.js
//
// Keep Monster Fight routes below.
// ==================== Monster Fight Game APIs ====================

// Helper function to calculate revive probability
function calculateReviveProbability(puzzlePoints, baseRate, decay, maxRate, accumulatedRate = 0) {
  // Formula: baseRate + baseRate*decay + baseRate*decay^2 + ... + baseRate*decay^(n-1)
  // Simplified: baseRate * (1 - decay^n) / (1 - decay)
  // With accumulated rate from previous failed attempts
  let totalRate = accumulatedRate;
  if (puzzlePoints > 0) {
    const geometricSum = baseRate * (1 - Math.pow(decay, puzzlePoints)) / (1 - decay);
    totalRate += geometricSum;
  }
  return Math.min(totalRate, maxRate);
}

// Helper function to calculate damage
function calculateDamage(attack, puzzlePoints, multiplier, isCrit = false, critDamage = 2.0) {
  let baseDamage = attack * puzzlePoints * multiplier;
  // Add randomness ±10%
  const randomFactor = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
  baseDamage *= randomFactor;
  
  if (isCrit) {
    baseDamage *= critDamage;
  }
  
  return Math.max(1, Math.round(baseDamage));
}

function pickRandomMultiplierFromRanges(ranges, defaultValue = 1) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    return defaultValue;
  }

  let r = Math.random();
  let selectedRange = null;

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

function getPassiveDamageInfo(player) {
  const result = {
    multiplier: 1,
    sources: []
  };

  if (!player || !Array.isArray(player.skills)) {
    return result;
  }

  const passiveSkill = player.skills.find(skill => skill.type === 'passive');
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

function ensurePlayerStats(player) {
  if (!player.stats) {
    player.stats = { totalDamage: 0, kills: 0, healing: 0 };
  }
  if (typeof player.stats.totalDamage !== 'number') player.stats.totalDamage = 0;
  if (typeof player.stats.kills !== 'number') player.stats.kills = 0;
  if (typeof player.stats.healing !== 'number') player.stats.healing = 0;
  return player.stats;
}

function getDamageReduction(player) {
  if (!player || !Array.isArray(player.skills)) {
    return 0;
  }
  const passiveSkill = player.skills.find(skill => skill.type === 'passive');
  const reduction = passiveSkill?.effect?.damageReduction;
  if (typeof reduction === 'number' && reduction > 0) {
    return Math.min(0.9, Math.max(0, reduction));
  }
  return 0;
}

function applyPriestPassiveHealing(gameState) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const alivePlayers = gameState.players.filter(p => p.isAlive);
  if (alivePlayers.length === 0) {
    return [];
  }
  const healEvents = [];
  gameState.players.forEach(player => {
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
    const healedTargets = [];
    alivePlayers.forEach(target => {
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

function getMonsterPassiveEffect(monster) {
  if (!monster || !Array.isArray(monster.skills)) {
    return null;
  }
  const passiveSkill = monster.skills.find(skill => skill.type === 'passive');
  return passiveSkill?.effect || null;
}

function getPlayerPassiveEffect(player) {
  if (!player || !Array.isArray(player.skills)) {
    return null;
  }
  const passiveSkill = player.skills.find(skill => skill.type === 'passive');
  return passiveSkill?.effect || null;
}

function getMonsterDamageReduction(monster) {
  const effect = getMonsterPassiveEffect(monster);
  const reduction = effect?.damageReduction;
  if (typeof reduction === 'number' && reduction > 0) {
    return Math.min(0.9, Math.max(0, reduction));
  }
  return 0;
}

function getAvailableMonsterTypes(data) {
  return (data?.gameSettings?.monsterTypes && data.gameSettings.monsterTypes.length > 0)
    ? data.gameSettings.monsterTypes
    : MONSTER_TYPES;
}

function getMonsterTypeById(typeId, data) {
  if (!typeId) return null;
  const types = getAvailableMonsterTypes(data);
  return types.find(t => t.id === typeId) || MONSTER_TYPES.find(t => t.id === typeId) || null;
}

function maybeApplyShamanCriticalHeal(monster, baseAmount) {
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

function applyShamanPassiveHealing(gameState, data) {
  if (!gameState || !Array.isArray(gameState.monsters)) {
    return [];
  }
  const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
  if (aliveMonsters.length === 0) {
    return [];
  }
  const healLogs = [];
  aliveMonsters.forEach(monster => {
    const effect = getMonsterPassiveEffect(monster);
    if (!effect?.healLowestAllyFraction) {
      return;
    }
    const target = aliveMonsters.reduce((lowest, ally) => 
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

function applyFirestormAuraBeforePlayerAction(player, gameState) {
  if (!player || !player.isAlive) {
    return null;
  }
  if (!gameState || !Array.isArray(gameState.monsters)) {
    return null;
  }
  const auraMonsters = gameState.monsters.filter(monster => {
    if (!monster || !monster.isAlive) {
      return false;
    }
    const effect = getMonsterPassiveEffect(monster);
    return !!(effect && effect.firestormAura);
  });
  if (auraMonsters.length === 0) {
    return null;
  }

  const result = {
    triggered: false,
    totalDamage: 0,
    defeated: false,
    messages: []
  };

  auraMonsters.forEach(monster => {
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

function addBleedStatusToPlayer(player, effect, monsterName) {
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

function addBleedingClawStatusToPlayer(player, monster, effect) {
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

function addSilenceStatusToPlayer(player, duration, source) {
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

function isPlayerSilenced(player) {
  if (!player || !Array.isArray(player.statuses)) {
    return false;
  }
  return player.statuses.some(status => status.type === 'silence');
}

function getLastAttackDamage(player, gameState) {
  if (player && typeof player.lastAttackDamage === 'number' && player.lastAttackDamage > 0) {
    return player.lastAttackDamage;
  }
  const baseMultiplier = gameState?.gameConfig?.damageMultiplier || 0.2;
  return Math.max(1, Math.round((player?.attack || 1) * baseMultiplier));
}

function forcePlayerToAttackAlly(player, monster, gameState) {
  const aliveAllies = gameState.players.filter(p => p.isAlive && p.studentId !== player.studentId);
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

function selectPlayerTargetForMonster(alivePlayers, options = {}) {
  if (!alivePlayers || alivePlayers.length === 0) {
    return null;
  }
  const ignoreTaunt = !!options.ignoreTaunt;
  const preferNonShield = !!options.preferNonShield;

  let candidates = alivePlayers;
  if (preferNonShield) {
    const nonShield = alivePlayers.filter(p => p.characterClass !== 'shield_warrior');
    if (nonShield.length > 0) {
      candidates = nonShield;
    }
  }

  if (!ignoreTaunt) {
    const taunter = candidates.find(p => p.isAlive && getPlayerPassiveEffect(p)?.tauntMonsters);
    if (taunter) return taunter;
  }

  return candidates.reduce((lowest, player) => (
    player.currentHP < lowest.currentHP ? player : lowest
  ), candidates[0]);
}

function executeMonsterActiveSkill(monster, skill, gameState) {
  const effect = skill.effect || {};
  const skillName = skill.name || 'Skill';
  const alivePlayers = gameState.players.filter(p => p.isAlive);

  if (effect.areaHeal) {
    const healFraction = Math.max(0, effect.missingHpFraction || 0);
    const aliveMonsters = gameState.monsters.filter(m => m.isAlive);
    if (aliveMonsters.length === 0) {
      return { used: false };
    }
    const summaryDetails = [];
    aliveMonsters.forEach(target => {
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
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} casts ${skillName}, bathing allies in restorative energy.`,
      summaryDetails
    });
    return { used: true };
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
    const summaryDetails = [];
    alivePlayers.forEach(player => {
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
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name} engulfs the party with ${skillName}!`,
      summaryDetails
    });
    return { used: true };
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
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: result.log
    });
    return { used: result.used };
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
    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message: `${monster.name}'s ${skillName} rends ${target.studentName}, ripping away ${damage} HP! (HP ${before} -> ${target.currentHP})`
    });
    return { used: true };
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

    gameState.actionLog.push({
      turn: gameState.currentTurn,
      phase: 'monster_turn',
      message
    });
    return { used: true };
  }

  return { used: false };
}

function attemptMonsterActiveSkill(monster, gameState) {
  if (!monster || !monster.isAlive || !Array.isArray(monster.skills)) {
    return { used: false };
  }
  const activeSkills = monster.skills.filter(skill => skill.type === 'active');
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
        return { used: true };
      }
    }
  }

  return { used: false };
}

function applyPlayerStatusEffects(gameState) {
  if (!gameState || !Array.isArray(gameState.players)) {
    return [];
  }
  const logs = [];
  gameState.players.forEach(player => {
    if (!player.isAlive || !Array.isArray(player.statuses) || player.statuses.length === 0) {
      return;
    }
    const remainingStatuses = [];
    player.statuses.forEach(status => {
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

function ensureMonsterStatuses(monster) {
  if (!monster) {
    return [];
  }
  if (!Array.isArray(monster.statuses)) {
    monster.statuses = [];
  }
  return monster.statuses;
}

function addStatusToMonster(monster, status) {
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

function processMonsterControlStatuses(monster) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return { skipTurn: false, logs: [] };
  }
  let skipTurn = false;
  const logs = [];
  monster.statuses.forEach(status => {
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

function advanceMonsterStatuses(monster) {
  if (!monster || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return;
  }
  monster.statuses = monster.statuses.filter(status => {
    if (typeof status.remainingTurns === 'number') {
      status.remainingTurns -= 1;
      return status.remainingTurns > 0;
    }
    return false;
  });
}

function applyMonsterStatusDamage(monster, gameState, data) {
  const result = { logs: [], deathLogs: [] };
  if (!monster || !monster.isAlive || !Array.isArray(monster.statuses) || monster.statuses.length === 0) {
    return result;
  }

  let monsterKilled = false;
  monster.statuses.forEach(status => {
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

function ensureMonsterSequence(gameState) {
  if (typeof gameState.monsterSequence !== 'number') {
    gameState.monsterSequence = 0;
  }
}

function createMonsterInstanceFromType(monsterType, gameState, overrides = {}) {
  ensureMonsterSequence(gameState);
  gameState.monsterSequence += 1;
  return {
    id: `monster_${gameState.currentLevel}_${gameState.monsterSequence}`,
    type: monsterType.id,
    name: overrides.name || `${monsterType.name} ${gameState.monsterSequence}`,
    emoji: monsterType.emoji,
    baseAttack: overrides.attack ?? monsterType.baseAttack,
    attack: overrides.attack ?? monsterType.baseAttack,
    maxHP: overrides.maxHP ?? monsterType.baseHP,
    currentHP: overrides.currentHP ?? monsterType.baseHP,
    isAlive: true,
    skills: (monsterType.skills || []).map(skill => ({ ...skill })),
    skillCooldowns: {}
  };
}

function handleMonsterDeath(monster, gameState, data) {
  const logs = [];
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

// Get game configuration
app.get('/api/game/config', (req, res) => {
  res.json({
    config: GAME_CONFIG,
    playerClasses: PLAYER_CLASSES,
    monsterTypes: MONSTER_TYPES
  });
});

// Initialize game state
app.post('/api/game/init', async (req, res) => {
  try {
    const { studentIds, levelConfig } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Student IDs are required' });
    }
    
    // Get student data
    const data = await readData();
    const students = data.students.filter(s => studentIds.includes(s.id));
    
    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Some students not found' });
    }
    
    // Get settings from data file
    const settingsConfig = data.gameSettings?.config || GAME_CONFIG;
    
    // Initialize game state
    const gameState = {
      currentLevel: 1,
      currentTurn: 1,
      phase: 'character_selection', // character_selection, puzzle_input, player_turn, monster_turn, game_over
      players: students.map((student, index) => ({
        studentId: student.id,
        studentName: student.name,
        characterClass: null,
        currentHP: 0,
        maxHP: 0,
        attack: 0,
        puzzlePoints: 0,
        isAlive: true,
        skills: [],
        skillCooldowns: {},
        accumulatedReviveRate: 0,
        stats: {
          totalDamage: 0,
          kills: 0,
          healing: 0
        },
        statuses: []
      })),
      monsters: [],
      actionLog: [],
      levelConfig: levelConfig || [],
      gameConfig: { ...settingsConfig },
      monsterSequence: 0
    };
    
    // Store game state in data
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
app.get('/api/game/state', async (req, res) => {
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
app.post('/api/game/select-character', async (req, res) => {
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
    
    // Get player classes from settings or defaults
    const availablePlayerClasses = data.gameSettings?.playerClasses || PLAYER_CLASSES;
    
    const characterClass = availablePlayerClasses.find(c => c.id === characterClassId);
    if (!characterClass) {
      return res.status(404).json({ error: 'Character class not found' });
    }
    
    // Set character
    player.characterClass = characterClassId;
    player.attack = characterClass.baseAttack;
    player.maxHP = characterClass.baseHP;
    player.currentHP = characterClass.baseHP;
    player.skills = characterClass.skills.map(skill => ({ ...skill }));
    player.skillCooldowns = {};
    ensurePlayerStats(player);
    
    // Keep phase as 'character_selection' until user clicks "Start Battle"
    // The battle will be initialized when user clicks the button
    
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
app.post('/api/game/input-puzzle-points', async (req, res) => {
  try {
    const { puzzlePoints } = req.body; // { studentId: points }
    
    if (!puzzlePoints || typeof puzzlePoints !== 'object') {
      return res.status(400).json({ error: 'Puzzle points object is required' });
    }
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    
    // Update puzzle points for each player
    Object.keys(puzzlePoints).forEach(studentId => {
      const player = gameState.players.find(p => p.studentId === studentId);
      if (player) {
        player.puzzlePoints = Math.max(0, parseInt(puzzlePoints[studentId]) || 0);
      }
    });
    
    // Check if we need to initialize monsters
    // Initialize ONLY if: monsters don't exist, OR if we're explicitly transitioning from level_complete phase (new level)
    // DO NOT reinitialize if monsters are dead during battle - that's normal gameplay
    const monstersExisted = gameState.monsters && gameState.monsters.length > 0;
    const isLevelTransition = gameState.phase === 'level_complete';
    
    // Only initialize monsters if they don't exist, or if we're explicitly transitioning levels
    if (!monstersExisted || isLevelTransition) {
      // Clear existing monsters if transitioning to new level
      if (isLevelTransition && monstersExisted) {
        gameState.monsters = [];
      }
      // First time: initialize monsters
      const levelInfo = gameState.levelConfig[gameState.currentLevel - 1];
      if (levelInfo) {
        gameState.monsters = [];
        
        // Get monster types from settings or defaults
        const availableMonsterTypes = data.gameSettings?.monsterTypes || MONSTER_TYPES;
        
        let monsterIndex = 1; // Global index for unique naming
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
              monsterIndex++; // Increment global index
            }
          }
        });
      }
      
      // Set phase to player_turn and add action log
      if (!gameState.phase || gameState.phase === 'character_selection' || gameState.phase === 'puzzle_input' || gameState.phase === 'level_complete') {
        gameState.phase = 'player_turn';

        // When starting a new level, reset player action flags and increment turn
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

// Player action (attack, skill, heal)
app.post('/api/game/player-action', async (req, res) => {
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
    
    // Use Puzzle Points from request if provided (most up-to-date), otherwise use gameState
    const effectivePuzzlePoints = (puzzlePoints !== undefined && puzzlePoints !== null) 
      ? Math.max(0, parseInt(puzzlePoints) || 0)
      : player.puzzlePoints;
    
    // Update player's puzzle points in gameState to keep it in sync
    if (puzzlePoints !== undefined && puzzlePoints !== null) {
      player.puzzlePoints = effectivePuzzlePoints;
    }
    
    let actionResult = null;

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
        // Check for crit
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
        player.skillCooldowns[skillId] = skill.cooldown || 0;
        skillsThisTurn.add(skillId);
      };

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
        const selectedTargets = [];
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
        const actionDetails = [];
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

        player.skillCooldowns[skillId] = skill.cooldown || 4;
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
        player.skillCooldowns[skillId] = skill.cooldown || 3;
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
        player.skillCooldowns[skillId] = skill.cooldown || 4;
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
      } else if (skillId === 'active_1' && player.characterClass === 'assassin') {
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
        player.skillCooldowns[skillId] = skill.cooldown || 4;
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
        const damageSummary = [];
        let totalDamageDealt = 0;
        const defeatedMonsters = [];

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

        player.skillCooldowns[skillId] = skill.cooldown || 3;
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
        player.skillCooldowns[skillId] = skill.cooldown || 4;
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
    }
    
    // Check if all monsters are dead
    const allMonstersDead = gameState.monsters.every(m => !m.isAlive);
    if (allMonstersDead) {
      // Level complete
      gameState.currentLevel++;
      if (gameState.currentLevel > gameState.levelConfig.length) {
        // Game complete
        gameState.phase = 'game_over';

        if (!gameState.rewardsDistributed) {
          const baseReward = 20;
          const mvpBonus = 0;
          const participants = Array.isArray(gameState.players) ? gameState.players : [];

          // Prepare reward map
          const rewards = {};
          participants.forEach(player => {
            rewards[player.studentId] = baseReward;
            player.rewardPoints = baseReward;
            player.isMVP = false;
          });

          // Calculate MVP based on defined scoring formula
          let mvp = null;
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

          // Update player stats for UI
          participants.forEach(player => {
            if (!player.stats) {
              player.stats = { totalDamage: 0, kills: 0, healing: 0, totalPoints: 0 };
            }
            player.stats.totalPoints = rewards[player.studentId] || baseReward;
          });

          // Apply rewards to students data
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
        // Next level - set phase to level_complete so user can click button to proceed
        gameState.phase = 'level_complete';
        gameState.actionLog.push({
          turn: gameState.currentTurn,
          phase: 'level_complete',
          message: `Level ${gameState.currentLevel - 1} complete! Ready to start level ${gameState.currentLevel}...`
        });
      }
    } else {
      // Mark player as acted, but don't auto-switch to monster turn
      // Let the user click "Process Monster Turn" button manually
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

// Monster turn (AI)
app.post('/api/game/monster-turn', async (req, res) => {
  try {
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    const turnEvents = [];
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
    
    // Check if all players have acted (if in player_turn phase)
    if (gameState.phase === 'player_turn') {
      const allPlayersActed = gameState.players.every(p => !p.isAlive || p.hasActed);
      if (!allPlayersActed) {
        return res.status(400).json({ error: 'Not all players have acted yet' });
      }
      // Switch to monster turn
      gameState.phase = 'monster_turn';
      // Reset player action flags for next turn
      gameState.players.forEach(p => p.hasActed = false);
    } else if (gameState.phase !== 'monster_turn') {
      return res.status(400).json({ error: 'Not monster turn' });
    }
    
    // Simple AI: Attack player with lowest HP
    let alivePlayers = gameState.players.filter(p => p.isAlive);
    if (alivePlayers.length === 0) {
      // Game over
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
          advanceMonsterStatuses(monster);
          return;
        }

        const passive = getMonsterPassiveEffect(monster) || {};
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

          target.currentHP = Math.max(0, target.currentHP - damage);
          if (target.currentHP <= 0) {
            target.isAlive = false;
          }

          const critNote = isCrit ? ' (CRITICAL!)' : '';
          const reductionNote = damageReduction > 0 ? ' (reduced by shield)' : '';
          pushLog({
            turn: gameState.currentTurn,
            phase: 'monster_turn',
            message: `${monster.name} attacks ${target.studentName} for ${damage} damage${critNote}${reductionNote}${!target.isAlive ? ' - DEFEATED!' : ''}`
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
      if (player && player.skillCooldowns) {
        Object.keys(player.skillCooldowns).forEach(skillId => {
          const currentValue = player.skillCooldowns[skillId];
          if (typeof currentValue === 'number' && currentValue > 0) {
            player.skillCooldowns[skillId] = Math.max(0, currentValue - 1);
          }
        });
      }

      if (player && player.turnSkillsUsed && normalizedTurnIndex !== null) {
        if (player.turnSkillsUsed[normalizedTurnIndex] !== undefined) {
          delete player.turnSkillsUsed[normalizedTurnIndex];
        }
        if (Object.keys(player.turnSkillsUsed).length === 0) {
          delete player.turnSkillsUsed;
        }
      }
    });

    gameState.monsters.forEach(monster => {
      if (monster && monster.skillCooldowns) {
        Object.keys(monster.skillCooldowns).forEach(skillId => {
          const currentValue = monster.skillCooldowns[skillId];
          if (typeof currentValue === 'number' && currentValue > 0) {
            monster.skillCooldowns[skillId] = Math.max(0, currentValue - 1);
          }
        });
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
app.post('/api/game/revive', async (req, res) => {
  try {
    const { studentId, puzzlePoints } = req.body;
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game' });
    }
    
    const gameState = data.gameState.current;
    const player = gameState.players.find(p => p.studentId === studentId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    if (player.isAlive) {
      return res.status(400).json({ error: 'Player is already alive' });
    }
    
    // Calculate revive probability
    const reviveRate = calculateReviveProbability(
      puzzlePoints,
      gameState.gameConfig.baseReviveRate,
      gameState.gameConfig.reviveRateDecay,
      gameState.gameConfig.maxReviveRate,
      player.accumulatedReviveRate
    );
    
    const success = Math.random() < reviveRate;
    
    if (success) {
      player.isAlive = true;
      player.currentHP = Math.floor(player.maxHP * 0.5); // Revive with 50% HP
      player.accumulatedReviveRate = 0;
      player.puzzlePoints -= puzzlePoints;
      player.statuses = [];
      
      gameState.actionLog.push({
        turn: gameState.currentTurn,
        phase: 'revive',
        message: `${player.studentName} successfully revived with ${puzzlePoints} puzzle points!`
      });
    } else {
      player.accumulatedReviveRate = reviveRate; // Accumulate for next attempt
      player.puzzlePoints -= puzzlePoints;
      
      gameState.actionLog.push({
        turn: gameState.currentTurn,
        phase: 'revive',
        message: `${player.studentName} failed to revive (${(reviveRate * 100).toFixed(1)}% chance). Probability accumulated.`
      });
    }
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState, reviveResult: { success, reviveRate } });
    res.json({ success, reviveRate, gameState });
  } catch (error) {
    console.error('Error attempting revive:', error);
    res.status(500).json({ error: 'Failed to attempt revive' });
  }
});

// Running Queen routes extracted.

// Royal Exchange routes extracted.

// Hope Mate leaderboard (teacher scoped)
// Hope Mate teacher routes extracted.

// Hope Mate Challenge leaderboard (teacher scoped, per durationSec)
// Hope Mate challenge routes extracted.

// =========================
// Admin - Hope Mate Stage Puzzles (manual FEN library)
// =========================
const HOPE_MATE_STAGE_KEYS = new Set([
  'rook',
  'queen',
  'minor',
  'pawns',
  'twoRooks',
  'rookKnight',
  'queenBishop',
  'queenKnight',
  'queenRook',
  'threePieces'
]);

// Hope Mate admin stage puzzles extracted.

// Save game state
app.post('/api/game/save', async (req, res) => {
  try {
    const { day, time } = req.body;
    
    if (!day || !time) {
      return res.status(400).json({ error: 'Day and time are required' });
    }
    
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    if (!validDays.includes(day)) {
      return res.status(400).json({ error: 'Invalid day' });
    }
    
    const timeMatch = time.match(/^(\d{2}):?(\d{2})$/);
    if (!timeMatch) {
      return res.status(400).json({ error: 'Invalid time format' });
    }
    
    const data = await readData();
    if (!data.gameState || !data.gameState.current) {
      return res.status(404).json({ error: 'No active game to save' });
    }
    
    const filename = `game_${day}_${time.replace(':', '')}.txt`;
    const filepath = path.join(GAME_SAVES_DIR, filename);
    
    const saveData = {
      day,
      time,
      savedAt: new Date().toISOString(),
      gameState: data.gameState.current
    };
    
    await fs.writeFile(filepath, JSON.stringify(saveData, null, 2), 'utf8');
    
    res.json({ success: true, filename, savedAt: saveData.savedAt });
  } catch (error) {
    console.error('Error saving game:', error);
    res.status(500).json({ error: 'Failed to save game' });
  }
});

// Get game saves list
app.get('/api/game/saves', async (req, res) => {
  try {
    const files = await fs.readdir(GAME_SAVES_DIR);
    const saves = [];
    
    for (const file of files) {
      if (file.endsWith('.txt')) {
        try {
          const filepath = path.join(GAME_SAVES_DIR, file);
          const content = await fs.readFile(filepath, 'utf8');
          const saveData = JSON.parse(content);
          saves.push({
            filename: file,
            day: saveData.day,
            time: saveData.time,
            savedAt: saveData.savedAt
          });
        } catch (err) {
          console.error(`Error reading save file ${file}:`, err);
        }
      }
    }
    
    saves.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    res.json(saves);
  } catch (error) {
    console.error('Error getting game saves:', error);
    res.status(500).json({ error: 'Failed to get game saves' });
  }
});

// Load game state
app.post('/api/game/load', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    
    const filepath = path.join(GAME_SAVES_DIR, filename);
    const content = await fs.readFile(filepath, 'utf8');
    const saveData = JSON.parse(content);
    
    const data = await readData();
    if (!data.gameState) {
      data.gameState = {};
    }
    data.gameState.current = saveData.gameState;
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameStateUpdated', gameState: saveData.gameState });
    res.json(saveData.gameState);
  } catch (error) {
    console.error('Error loading game:', error);
    res.status(500).json({ error: 'Failed to load game' });
  }
});

// Delete game save
app.delete('/api/game/saves/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(GAME_SAVES_DIR, filename);
    await fs.unlink(filepath);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting game save:', error);
    res.status(500).json({ error: 'Failed to delete game save' });
  }
});

// Get game settings (for editing)
app.get('/api/game/settings', async (req, res) => {
  try {
    const data = await readData();
    
    // Get current game settings or defaults
    const settings = {
      config: data.gameState?.current?.gameConfig || { ...GAME_CONFIG },
      playerClasses: data.gameSettings?.playerClasses || PLAYER_CLASSES,
      monsterTypes: data.gameSettings?.monsterTypes || MONSTER_TYPES,
      levelConfig: data.gameState?.current?.levelConfig || []
    };
    
    res.json(settings);
  } catch (error) {
    console.error('Error getting game settings:', error);
    res.status(500).json({ error: 'Failed to get game settings' });
  }
});

// Update game config (teacher settings)
app.post('/api/game/config', async (req, res) => {
  try {
    const { config, playerClasses, monsterTypes, levelConfig } = req.body;
    
    const data = await readData();
    
    // Store settings in data file for persistence
    if (!data.gameSettings) {
      data.gameSettings = {};
    }
    
    // Update global settings
    if (config) {
      if (!data.gameSettings.config) {
        data.gameSettings.config = { ...GAME_CONFIG };
      }
      Object.assign(data.gameSettings.config, config);
    }
    
    // Update player classes
    if (playerClasses) {
      data.gameSettings.playerClasses = playerClasses;
    }
    
    // Update monster types
    if (monsterTypes) {
      data.gameSettings.monsterTypes = monsterTypes;
    }
    
    // Update level config
    if (levelConfig) {
      if (!data.gameState) {
        data.gameState = {};
      }
      if (!data.gameState.current) {
        data.gameState.current = {};
      }
      data.gameState.current.levelConfig = levelConfig;
    }
    
    // Also update current game's config if game is active
    if (data.gameState && data.gameState.current) {
      if (config) {
        Object.assign(data.gameState.current.gameConfig, config);
      }
      if (levelConfig) {
        data.gameState.current.levelConfig = levelConfig;
      }
    }
    
    data.lastUpdate = new Date().toISOString();
    await writeData(data);
    
    broadcast({ type: 'gameConfigUpdated', config: config || data.gameSettings.config });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating game config:', error);
    res.status(500).json({ error: 'Failed to update game config' });
  }
});

}

module.exports = { registerMonsterFightRoutes };
