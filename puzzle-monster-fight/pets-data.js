// Pet Data Generator
// This script generates 275 pets data

const elements = ['fire', 'water', 'light', 'dark', 'wind'];
const races = [
  'Vexling', 'Zephyrian', 'Crystalkin', 'Shadowspawn', 'Flameborn',
  'Aquarite', 'Luminite', 'Umbrath', 'Aeroth', 'Pyroclast'
];

const emojis = [
  '🔥', '💧', '✨', '🌑', '💨', '🐉', '🦅', '🐺', '🦁', '🐸',
  '🦄', '🐍', '🦋', '🐙', '🦑', '🦀', '🐢', '🦎', '🐊', '🦈',
  '🐋', '🐬', '🐟', '🐠', '🐡', '🦐', '🦞', '🦟', '🦗', '🕷️',
  '🦂', '🐛', '🐜', '🐝', '🐞', '🦇', '🐻', '🐨', '🐼', '🦘',
  '🦡', '🐾', '🦓', '🦒', '🦌', '🐃', '🐂', '🐄', '🐎', '🐖',
  '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🐈', '🐓', '🦃',
  '🦅', '🦆', '🦢', '🦉', '🦚', '🦜', '🐦', '🐤', '🐣', '🐥',
  '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞',
  '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕',
  '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
  '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛',
  '🦏', '🐪', '🐫', '🦒', '🦘', '🦙', '🐃', '🐂', '🐄', '🐎',
  '🐖', '🐏', '🐑', '🦌', '🐐', '🐕', '🐩', '🐈', '🐓', '🦃',
  '🦅', '🦆', '🦢', '🦉', '🦚', '🦜', '🐦', '🐤', '🐣', '🐥',
  '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞',
  '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕',
  '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
  '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛',
  '🦏', '🐪', '🐫', '🦒', '🦘', '🦙', '🐃', '🐂', '🐄', '🐎',
  '🐖', '🐏', '🐑', '🦌', '🐐', '🐕', '🐩', '🐈', '🐓', '🦃',
  '🦅', '🦆', '🦢', '🦉', '🦚', '🦜', '🐦', '🐤', '🐣', '🐥',
  '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞',
  '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕',
  '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
  '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛',
  '🦏', '🐪', '🐫', '🦒', '🦘', '🦙', '🐃', '🐂', '🐄', '🐎',
  '🐖', '🐏', '🐑', '🦌', '🐐', '🐕', '🐩', '🐈', '🐓', '🦃',
  '🦅', '🦆', '🦢', '🦉', '🦚', '🦜', '🐦', '🐤', '🐣', '🐥',
  '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞'
];

function generatePetName(tier, raceIndex, petIndex) {
  const prefixes = ['Zyl', 'Kry', 'Vex', 'Nyx', 'Pyx', 'Lux', 'Rex', 'Zeph', 'Aer', 'Aqu'];
  const suffixes = ['ion', 'ith', 'ath', 'eth', 'oth', 'yth', 'ath', 'eth', 'oth', 'yth'];
  const midfixes = ['ra', 'la', 'ma', 'na', 'ta', 'sa', 'ka', 'ga', 'pa', 'ba'];
  
  const prefix = prefixes[petIndex % prefixes.length];
  const midfix = midfixes[raceIndex % midfixes.length];
  const suffix = suffixes[(petIndex + raceIndex) % suffixes.length];
  
  return prefix + midfix + suffix;
}

function generateSkill(tier, element, petIndex) {
  const skillTypes = ['Attack', 'Heal', 'Buff', 'Debuff', 'Convert'];
  const skillType = skillTypes[petIndex % skillTypes.length];
  
  const elementNames = {
    fire: 'Fire',
    water: 'Water',
    light: 'Light',
    dark: 'Dark',
    wind: 'Wind'
  };
  
  const elementName = elementNames[element];
  const effectValue = 1.5 + (petIndex % 10) * 0.1; // 1.5 to 2.4
  const cooldown = 3 + (petIndex % 8); // 3 to 10
  
  let skillName, description;
  
  switch(skillType) {
    case 'Attack':
      skillName = `${elementName} Blast`;
      description = `Deal ${effectValue.toFixed(1)}x ${elementName.toLowerCase()} damage to all enemies`;
      break;
    case 'Heal':
      skillName = `${elementName} Restoration`;
      description = `Restore HP by ${effectValue.toFixed(1)}x recovery`;
      break;
    case 'Buff':
      skillName = `${elementName} Empowerment`;
      description = `Increase attack by ${effectValue.toFixed(1)}x for 3 turns`;
      break;
    case 'Debuff':
      skillName = `${elementName} Weakening`;
      description = `Reduce enemy attack by ${(effectValue * 10).toFixed(0)}% for 3 turns`;
      break;
    case 'Convert':
      const convertCount = tier === 'C' ? 3 + (petIndex % 3) : tier === 'B' ? 5 + (petIndex % 4) : 8;
      skillName = `${elementName} Conversion`;
      description = `Convert ${convertCount} random jewels to ${elementName.toLowerCase()}`;
      break;
  }
  
  return {
    name: skillName,
    description: description,
    cooldown: cooldown,
    effectValue: effectValue
  };
}

function generateLeaderSkill(tier, element, race, petIndex, hasLeaderSkill) {
  if (!hasLeaderSkill) return null;
  
  const elementNames = {
    fire: 'Fire',
    water: 'Water',
    light: 'Light',
    dark: 'Dark',
    wind: 'Wind'
  };
  
  const elementName = elementNames[element];
  const multiplier = tier === 'C' ? 1.5 + (petIndex % 5) * 0.2 : tier === 'B' ? 1.8 + (petIndex % 4) * 0.2 : 2.0 + (petIndex % 3) * 0.25;
  
  const skillTypes = ['Element', 'Damage', 'Recovery', 'Race', 'Composite'];
  const skillType = skillTypes[petIndex % skillTypes.length];
  
  let name, description;
  
  switch(skillType) {
    case 'Element':
      name = `${elementName} Mastery`;
      description = `${elementName} attribute attack ${multiplier.toFixed(1)}x`;
      break;
    case 'Damage':
      name = `${elementName} Fury`;
      description = `All damage ${multiplier.toFixed(1)}x`;
      break;
    case 'Recovery':
      name = `${elementName} Vitality`;
      description = `Recovery ${multiplier.toFixed(1)}x`;
      break;
    case 'Race':
      name = `${race} Bond`;
      description = `${race} race attack ${multiplier.toFixed(1)}x`;
      break;
    case 'Composite':
      name = `${elementName} ${race} Lord`;
      description = `${elementName} attribute attack ${multiplier.toFixed(1)}x, Recovery ${(multiplier * 0.8).toFixed(1)}x`;
      break;
  }
  
  return {
    name: name,
    description: description
  };
}

function generateDescription(tier, element, race, petIndex) {
  const descriptions = [
    `A ${element} ${race.toLowerCase()} creature born from the elemental plane.`,
    `This ${race.toLowerCase()} harnesses the power of ${element} to protect its territory.`,
    `Ancient ${race.toLowerCase()} that has mastered ${element} magic over centuries.`,
    `A wild ${race.toLowerCase()} that channels ${element} energy naturally.`,
    `Legendary ${race.toLowerCase()} known for its ${element} abilities.`
  ];
  
  return descriptions[petIndex % descriptions.length];
}

function generatePets() {
  const pets = [];
  let emojiIndex = 0;
  
  // Generate C tier pets (100 pets: 20 types × 5 elements)
  for (let typeIndex = 0; typeIndex < 20; typeIndex++) {
    const raceIndex = Math.floor(typeIndex / 2); // 2 pets per race
    const race = races[raceIndex];
    const baseHP = 500 + (typeIndex * 35); // 500-1165
    const baseAttack = 50 + (typeIndex * 3.5); // 50-116.5
    const baseRecovery = 20 + (typeIndex * 2); // 20-58
    const hasLeaderSkill = typeIndex < 5; // First 5 have leader skills
    
    for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
      const element = elements[elementIndex];
      const petIndex = typeIndex * 5 + elementIndex;
      const petName = generatePetName('C', raceIndex, typeIndex);
      
      pets.push({
        id: `pet_C${String(typeIndex + 1).padStart(3, '0')}_${element}`,
        name: petName,
        element: element,
        race: race,
        tier: 'C',
        emoji: emojis[emojiIndex % emojis.length],
        baseHP: Math.round(baseHP),
        baseAttack: Math.round(baseAttack),
        baseRecovery: Math.round(baseRecovery),
        growthRate: 1.025,
        skill: generateSkill('C', element, petIndex),
        leaderSkill: generateLeaderSkill('C', element, race, petIndex, hasLeaderSkill),
        description: generateDescription('C', element, race, petIndex)
      });
      
      emojiIndex++;
    }
  }
  
  // Generate B tier pets (100 pets: 20 types × 5 elements)
  for (let typeIndex = 0; typeIndex < 20; typeIndex++) {
    const raceIndex = Math.floor(typeIndex / 2);
    const race = races[raceIndex];
    const cBaseHP = 500 + (typeIndex * 35);
    const cBaseAttack = 50 + (typeIndex * 3.5);
    const cBaseRecovery = 20 + (typeIndex * 2);
    const baseHP = Math.round(cBaseHP * 1.05);
    const baseAttack = Math.round(cBaseAttack * 1.05);
    const baseRecovery = Math.round(cBaseRecovery * 1.05);
    
    for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
      const element = elements[elementIndex];
      const petIndex = 100 + typeIndex * 5 + elementIndex;
      const petName = generatePetName('B', raceIndex, typeIndex);
      
      pets.push({
        id: `pet_B${String(typeIndex + 1).padStart(3, '0')}_${element}`,
        name: petName,
        element: element,
        race: race,
        tier: 'B',
        emoji: emojis[emojiIndex % emojis.length],
        baseHP: baseHP,
        baseAttack: baseAttack,
        baseRecovery: baseRecovery,
        growthRate: 1.03,
        skill: generateSkill('B', element, petIndex),
        leaderSkill: generateLeaderSkill('B', element, race, petIndex, true),
        description: generateDescription('B', element, race, petIndex)
      });
      
      emojiIndex++;
    }
  }
  
  // Generate A tier pets (75 pets: 15 types × 5 elements)
  for (let typeIndex = 0; typeIndex < 15; typeIndex++) {
    const raceIndex = Math.floor(typeIndex / 2);
    const race = races[raceIndex];
    const cBaseHP = 500 + (typeIndex * 35);
    const cBaseAttack = 50 + (typeIndex * 3.5);
    const cBaseRecovery = 20 + (typeIndex * 2);
    const bBaseHP = cBaseHP * 1.05;
    const bBaseAttack = cBaseAttack * 1.05;
    const bBaseRecovery = cBaseRecovery * 1.05;
    const baseHP = Math.round(bBaseHP * 1.05);
    const baseAttack = Math.round(bBaseAttack * 1.05);
    const baseRecovery = Math.round(bBaseRecovery * 1.05);
    
    for (let elementIndex = 0; elementIndex < 5; elementIndex++) {
      const element = elements[elementIndex];
      const petIndex = 200 + typeIndex * 5 + elementIndex;
      const petName = generatePetName('A', raceIndex, typeIndex);
      
      pets.push({
        id: `pet_A${String(typeIndex + 1).padStart(3, '0')}_${element}`,
        name: petName,
        element: element,
        race: race,
        tier: 'A',
        emoji: emojis[emojiIndex % emojis.length],
        baseHP: baseHP,
        baseAttack: baseAttack,
        baseRecovery: baseRecovery,
        growthRate: 1.035,
        skill: generateSkill('A', element, petIndex),
        leaderSkill: generateLeaderSkill('A', element, race, petIndex, true),
        description: generateDescription('A', element, race, petIndex)
      });
      
      emojiIndex++;
    }
  }
  
  return pets;
}

// Generate pets data
const PetsData = generatePets();

// Export for browser
if (typeof window !== 'undefined') {
  window.PetsData = PetsData;
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PetsData;
}
