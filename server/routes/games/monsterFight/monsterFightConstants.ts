// Monster Fight Game Constants
// Extracted from monsterFightCore.ts — contains game config, level definitions,
// player classes, monster types, and related static data.
"use strict";

// Monster Fight Game Configuration
export const GAME_CONFIG = {
  damageMultiplier: 0.2,
  critRate: 0.10,
  critDamage: 2.0,
  baseReviveRate: 0.01,
  reviveRateDecay: 0.95,
  maxReviveRate: 0.66,
  backgroundTheme: 'image',
  battleMap: 'Battle/Map.jpg',
  difficultyCurve: {
    1: { monstersPerStudent: 1, strengthMultiplier: 1.0 },
    2: { monstersPerStudent: 1.5, strengthMultiplier: 1.2 },
    3: { monstersPerStudent: 2.0, strengthMultiplier: 1.5 }
  } as Record<number, { monstersPerStudent: number; strengthMultiplier: number }>
};

export const DEFAULT_LEVEL_CONFIG_EASY = [
  { level: 1, monsters: [
    { type: 'slime', count: 1 },
    { type: 'goblin', count: 1 },
    { type: 'brute', count: 1 },
    { type: 'shaman', count: 1 }
  ]},
  { level: 2, monsters: [
    { type: 'goblin', count: 2 },
    { type: 'dark_mage', count: 1 },
    { type: 'brute', count: 2 },
    { type: 'shaman', count: 2 }
  ]},
  { level: 3, monsters: [
    { type: 'goblin', count: 4 },
    { type: 'dark_mage', count: 2 },
    { type: 'brute', count: 2 },
    { type: 'shaman', count: 2 },
    { type: 'tiger', count: 1 }
  ]}
];

export const PLAYER_CLASSES = [
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
      { id: 'passive_1', name: 'Shield Block', type: 'passive', description: 'Reduce damage by 30% and taunt monsters (redirect attacks to you)', effect: { damageReduction: 0.3, tauntMonsters: true } },
      { id: 'active_1', name: 'Shield Bash', type: 'active', cooldown: 3, description: 'Attack and reduce enemy attack', emoji: '🔰', effect: { debuff: 'attack', damageMultiplier: 1.1 } },
      { id: 'active_2', name: 'Shield Smash', type: 'active', cooldown: 4, description: 'Attack with 30% chance to stun', emoji: '🥊', effect: { damageMultiplier: 1.2, stunChance: 0.3, stunTurns: 1 } }
    ]
  }
];

export const MONSTER_TYPES = [
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
        description: 'Ignore taunt and rip away 80% of the target\'s remaining HP',
        effect: { reduceRemainingHpFraction: 0.8, ignoreTaunt: true }
      }
    ]
  }
];

export const HOPE_MATE_STAGE_KEYS = new Set([
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
