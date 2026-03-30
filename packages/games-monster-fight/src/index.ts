// @student-scoring/games-monster-fight barrel exports
const monsterFightRoutes = require('./monsterFightRoutes');
const gameRoutes = require('./gameRoutes');

export const registerMonsterFightRoutes = monsterFightRoutes.registerMonsterFightRoutes;
export const registerGameRoutes = gameRoutes.registerGameRoutes;
export const registerMonsterFightGameRoutes = gameRoutes.registerMonsterFightGameRoutes;
