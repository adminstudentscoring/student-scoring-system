// Challenge Level System Configuration
// HP calculation: Level 1=50, Level 2=100, Level 3=150, then each level = previous + previous-1
const LEVELS = [
  { level: 1, name: 'Slime', maxHP: 50, reward: 10, emoji: '🟢' },
  { level: 2, name: 'Goblin', maxHP: 100, reward: 20, emoji: '👺' },
  { level: 3, name: 'Orc', maxHP: 150, reward: 30, emoji: '👹' },
  { level: 4, name: 'Dragon', maxHP: 250, reward: 40, emoji: '🐉' },        // 150 + 100
  { level: 5, name: 'Demon', maxHP: 400, reward: 50, emoji: '😈' },         // 250 + 150
  { level: 6, name: 'Boss Lv1', maxHP: 650, reward: 60, emoji: '👑' },      // 400 + 250
  { level: 7, name: 'Boss Lv2', maxHP: 1050, reward: 75, emoji: '👑' },     // 650 + 400
  { level: 8, name: 'Boss Lv3', maxHP: 1700, reward: 100, emoji: '👑' },    // 1050 + 650
  { level: 9, name: 'Boss Lv4', maxHP: 2750, reward: 125, emoji: '👑' },    // 1700 + 1050
  { level: 10, name: 'Final Boss', maxHP: 4450, reward: 150, emoji: '👑' }  // 2750 + 1700
];

// Rank system configuration
// Wood starts at 50, then each rank multiplies by 2 times the previous rank's max score
const RANKS = [
  { name: 'Wood', maxScore: 50 },                                    // 0-50
  { name: 'Bronze', maxScore: 50 * 2 },                              // 50-100
  { name: 'Silver', maxScore: 50 * Math.pow(2, 2) },                // 100-200
  { name: 'Gold', maxScore: 50 * Math.pow(2, 3) },                  // 200-400
  { name: 'Platinum', maxScore: 50 * Math.pow(2, 4) },              // 400-800
  { name: 'Diamond', maxScore: 50 * Math.pow(2, 5) },               // 800-1600
  { name: 'Candidate Master', maxScore: 50 * Math.pow(2, 6) },      // 1600-3200
  { name: 'Master', maxScore: 50 * Math.pow(2, 7) },                // 3200-6400
  { name: 'International Master', maxScore: 50 * Math.pow(2, 8) },  // 6400-12800
  { name: 'Grand Master', maxScore: Infinity }                       // 12800+
];

module.exports = { LEVELS, RANKS };
