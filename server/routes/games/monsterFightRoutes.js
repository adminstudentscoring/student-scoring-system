// Extracted from server.js to reduce file size and isolate game APIs.
// This file is now a thin wrapper that delegates to focused sub-modules.
"use strict";

const { registerMonsterFightCoreRoutes } = require('./monsterFight/monsterFightCore');
const { registerMonsterFightAdminRoutes } = require('./monsterFight/monsterFightAdmin');
const { registerMonsterFightLeaderboardRoutes } = require('./monsterFight/monsterFightLeaderboard');

function registerMonsterFightRoutes(app, deps) {
  registerMonsterFightCoreRoutes(app, deps);
  registerMonsterFightAdminRoutes(app, deps);
  registerMonsterFightLeaderboardRoutes(app, deps);
}

module.exports = { registerMonsterFightRoutes };
