// Monster database for Chess Pal (data only)
// Loaded before `pages.js`
(() => {
  const g = (typeof window !== 'undefined') ? window : globalThis;
  g.CP_DATA = g.CP_DATA || {};

  g.CP_DATA.MONSTER_DB = [
    {
      id: '001',
      name: 'Grimjaw',
      element: 'dark',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 420,
      atk: 120,
      rcv: 0,
      passiveSkill: { name: 'Predator Instinct', text: 'ATK +10% when HP below 50% (placeholder).', params: { lowHpAtkBonus: 0.10 } },
      activeSkill: { name: 'Night Rend', cd: 6, text: 'Deal dark damage (placeholder).', params: { dmg: 120 } },
      img: 'images/Monsters/M001-Grimjaw/M001-Grimjaw.png',
      mini: 'images/Monsters/M001-Grimjaw/M001-Grimjaw-mini.png'
    },
    {
      id: '002',
      name: 'Cinder Brute',
      element: 'fire',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 480,
      atk: 135,
      rcv: 0,
      passiveSkill: { name: 'Heat Armor', text: 'Take -10% damage (placeholder).', params: { damageReduction: 0.10 } },
      activeSkill: { name: 'Ash Slam', cd: 7, text: 'Convert 2 tiles to Fire (placeholder).', params: { convert: { count: 2, to: 'fire' } } },
      img: 'images/Monsters/M002-Cinder_Brute/M002-Cinder_Brute.png',
      mini: 'images/Monsters/M002-Cinder_Brute/M002-Cinder_Brute-mini.png'
    },
    {
      id: '003',
      name: 'Tide Wraith',
      element: 'water',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 400,
      atk: 128,
      rcv: 0,
      passiveSkill: { name: 'Cold Mist', text: '10% chance to slow enemies (placeholder).', params: { slowChance: 0.10 } },
      activeSkill: { name: 'Undertow', cd: 6, text: 'Convert 1 tile to Water (placeholder).', params: { convert: { count: 1, to: 'water' } } },
      img: 'images/Monsters/M003-Tide_Wraith/M003-Tide_Wraith.png',
      mini: 'images/Monsters/M003-Tide_Wraith/M003-Tide_Wraith-mini.png'
    },
    {
      id: '004',
      name: 'Verdant Maw',
      element: 'wood',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 520,
      atk: 110,
      rcv: 0,
      passiveSkill: { name: 'Regrowth', text: 'Heal +2% max HP each turn (placeholder).', params: { healMaxHpPctPerTurn: 0.02 } },
      activeSkill: { name: 'Root Bind', cd: 8, text: 'Convert 1 tile to Wood + 1 to Heart (placeholder).', params: { convert: [{ count: 1, to: 'wood' }, { count: 1, to: 'heart' }] } },
      img: 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw.png',
      mini: 'images/Monsters/M004-Verdant_Maw/M004-Verdant_Maw-mini.png'
    },
    {
      id: '005',
      name: 'Solar Idol',
      element: 'light',
      rarity: 5,
      level: 1,
      maxLevel: 99,
      hp: 390,
      atk: 140,
      rcv: 0,
      passiveSkill: { name: 'Blinding Aura', text: 'Enemies miss +5% (placeholder).', params: { enemyMissChance: 0.05 } },
      activeSkill: { name: 'Radiant Pulse', cd: 7, text: 'Convert 2 tiles to Light (placeholder).', params: { convert: { count: 2, to: 'light' } } },
      img: 'images/Monsters/M005-Solar_Idol/M005-Solar_Idol.png',
      mini: 'images/Monsters/M005-Solar_Idol/M005-Solar_Idol-mini.png'
    },

    // Boss series (006-010)
    {
      id: '006',
      name: 'Abyss Monarch',
      element: 'dark',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 880,
      atk: 210,
      rcv: 0,
      passiveSkill: { name: 'Abyssal Dominion', text: 'Start each battle with +1 cascade chain (placeholder).', params: { startCascadeBonus: 1 } },
      activeSkill: { name: 'Void Eclipse', cd: 9, text: 'Convert 3 tiles to Dark; deal heavy dark damage (placeholder).', params: { convert: { count: 3, to: 'dark' }, dmg: 360 } },
      img: 'images/Monsters/M006-Abyss_Monarch/M006-Abyss_Monarch.png',
      mini: 'images/Monsters/M006-Abyss_Monarch/M006-Abyss_Monarch-mini.png'
    },
    {
      id: '007',
      name: 'Crimson Warlord',
      element: 'fire',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 920,
      atk: 225,
      rcv: 0,
      passiveSkill: { name: 'War Drums', text: 'Fire damage +15% (placeholder).', params: { fireDmgBonus: 0.15 } },
      activeSkill: { name: 'Blood Furnace', cd: 9, text: 'Convert 4 tiles to Fire (placeholder).', params: { convert: { count: 4, to: 'fire' } } },
      img: 'images/Monsters/M007-Crimson_Warlord/M007-Crimson_Warlord.png',
      mini: 'images/Monsters/M007-Crimson_Warlord/M007-Crimson_Warlord-mini.png'
    },
    {
      id: '008',
      name: 'Leviathan Prime',
      element: 'water',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 860,
      atk: 220,
      rcv: 0,
      passiveSkill: { name: 'Deep Pressure', text: 'Enemies take +10% damage after cascades (placeholder).', params: { postCascadeVulnerability: 0.10 } },
      activeSkill: { name: 'Tsunami Break', cd: 10, text: 'Convert 3 tiles to Water; +1s time this turn (placeholder).', params: { convert: { count: 3, to: 'water' }, extraTimeSec: 1 } },
      img: 'images/Monsters/M008-Leviathan_Prime/M008-Leviathan_Prime.png',
      mini: 'images/Monsters/M008-Leviathan_Prime/M008-Leviathan_Prime-mini.png'
    },
    {
      id: '009',
      name: 'Worldroot Colossus',
      element: 'wood',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 980,
      atk: 200,
      rcv: 0,
      passiveSkill: { name: 'Ancient Bark', text: 'Take -15% damage (placeholder).', params: { damageReduction: 0.15 } },
      activeSkill: { name: 'Thorn Cathedral', cd: 10, text: 'Convert 2 tiles to Wood + 2 to Heart (placeholder).', params: { convert: [{ count: 2, to: 'wood' }, { count: 2, to: 'heart' }] } },
      img: 'images/Monsters/M009-Worldroot_Colossus/M009-Worldroot_Colossus.png',
      mini: 'images/Monsters/M009-Worldroot_Colossus/M009-Worldroot_Colossus-mini.png'
    },
    {
      id: '010',
      name: 'Dawn Seraph',
      element: 'light',
      rarity: 6,
      level: 1,
      maxLevel: 99,
      hp: 840,
      atk: 235,
      rcv: 0,
      passiveSkill: { name: 'Radiant Shield', text: 'Heal +2% max HP each turn (placeholder).', params: { healMaxHpPctPerTurn: 0.02 } },
      activeSkill: { name: 'Solar Judgement', cd: 10, text: 'Convert 4 tiles to Light; deal light damage (placeholder).', params: { convert: { count: 4, to: 'light' }, dmg: 340 } },
      img: 'images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph.png',
      mini: 'images/Monsters/M010-Dawn_Seraph/M010-Dawn_Seraph-mini.png'
    }
  ];
})();

