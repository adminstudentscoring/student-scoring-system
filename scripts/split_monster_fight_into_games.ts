// Splits server/routes/monsterFightGameRoutes.js into:
// - server/routes/games/monsterFightRoutes.js (Monster Fight only)
// - server/routes/monsterFightGameRoutes.js (games entry / aggregator)
//
// Usage: node scripts/split_monster_fight_into_games.js
"use strict";

const fs = require("fs");
const path = require("path");

function mustFind(haystack: string, needle: string, label?: string): number {
  const idx = haystack.indexOf(needle);
  if (idx === -1) throw new Error(`Could not find ${label || "needle"}: ${needle}`);
  return idx;
}

function main(): void {
  const repoRoot = process.cwd();
  const srcPath = path.join(repoRoot, "server", "routes", "monsterFightGameRoutes.js");
  const outMonsterFightPath = path.join(repoRoot, "server", "routes", "games", "monsterFightRoutes.js");

  const src: string = fs.readFileSync(srcPath, "utf8");

  let monsterFight = src;

  monsterFight = monsterFight.replace(
    "function registerMonsterFightGameRoutes(app, deps) {",
    "function registerMonsterFightRoutes(app, deps) {"
  );

  const aggStart = mustFind(
    monsterFight,
    "// Register non-MonsterFight game routes that were extracted from this file.",
    "aggregator start marker"
  );
  const cfgStart = mustFind(
    monsterFight,
    "// Monster Fight Game Configuration",
    "monster fight config marker"
  );
  monsterFight = monsterFight.slice(0, aggStart) + monsterFight.slice(cfgStart);

  monsterFight = monsterFight.replace(
    "module.exports = { registerMonsterFightGameRoutes };",
    "module.exports = { registerMonsterFightRoutes };"
  );

  fs.mkdirSync(path.dirname(outMonsterFightPath), { recursive: true });
  fs.writeFileSync(outMonsterFightPath, monsterFight, "utf8");

  const aggregator = `// Games routes entry (aggregator)\\n"use strict";\\n\\nfunction registerMonsterFightGameRoutes(app, deps) {\\n  if (!app) throw new Error("registerMonsterFightGameRoutes: missing app");\\n  const fs = deps && deps.fs;\\n  const path = deps && deps.path;\\n  const authenticateUser = deps && deps.authenticateUser;\\n  const authorizeRole = deps && deps.authorizeRole;\\n  const requireOrganizationAccess = deps && deps.requireOrganizationAccess;\\n  const readData = deps && deps.readData;\\n  const writeData = deps && deps.writeData;\\n  const broadcast = deps && deps.broadcast;\\n  const filterStudentsByOrganization = deps && deps.filterStudentsByOrganization;\\n  const resolveOrgIdFromUser = deps && deps.resolveOrgIdFromUser;\\n  const getRankInfo = deps && deps.getRankInfo;\\n  const addRewardPointsToStats = deps && deps.addRewardPointsToStats;\\n  const GAME_SAVES_DIR = deps && deps.GAME_SAVES_DIR;\\n  const RUNNING_QUEEN_LEADERBOARD_FILE = deps && deps.RUNNING_QUEEN_LEADERBOARD_FILE;\\n  const ROYAL_EXCHANGE_LEADERBOARD_FILE = deps && deps.ROYAL_EXCHANGE_LEADERBOARD_FILE;\\n  const HOPE_MATE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_LEADERBOARD_FILE;\\n  const HOPE_MATE_CHALLENGE_LEADERBOARD_FILE = deps && deps.HOPE_MATE_CHALLENGE_LEADERBOARD_FILE;\\n  const HOPE_MATE_STAGE_PUZZLES_FILE = deps && deps.HOPE_MATE_STAGE_PUZZLES_FILE;\\n\\n  // Register Monster Fight (all /api/game/* endpoints)\\n  const { registerMonsterFightRoutes } = require("./games/monsterFightRoutes");\\n  registerMonsterFightRoutes(app, {\\n    fs,\\n    path,\\n    readData,\\n    writeData,\\n    broadcast,\\n    getRankInfo,\\n    addRewardPointsToStats,\\n    GAME_SAVES_DIR\\n  });\\n\\n  // Register other games\\n  const { registerRunningQueenRoutes } = require("./games/runningQueenRoutes");\\n  const { registerRoyalExchangeRoutes } = require("./games/royalExchangeRoutes");\\n  const { registerHopeMateRoutes } = require("./games/hopeMateRoutes");\\n  const { registerHopeMateAdminRoutes } = require("./games/hopeMateAdminRoutes");\\n\\n  registerRunningQueenRoutes(app, { fs, RUNNING_QUEEN_LEADERBOARD_FILE });\\n  registerRoyalExchangeRoutes(app, { fs, ROYAL_EXCHANGE_LEADERBOARD_FILE });\\n  registerHopeMateRoutes(app, {\\n    fs,\\n    authenticateUser,\\n    authorizeRole,\\n    requireOrganizationAccess,\\n    readData,\\n    filterStudentsByOrganization,\\n    resolveOrgIdFromUser,\\n    HOPE_MATE_LEADERBOARD_FILE,\\n    HOPE_MATE_CHALLENGE_LEADERBOARD_FILE\\n  });\\n  registerHopeMateAdminRoutes(app, {\\n    fs,\\n    authenticateUser,\\n    authorizeRole,\\n    HOPE_MATE_STAGE_PUZZLES_FILE\\n  });\\n}\\n\\nmodule.exports = { registerMonsterFightGameRoutes };\\n`;

  fs.writeFileSync(srcPath, aggregator, "utf8");

  console.log("OK: wrote", outMonsterFightPath);
  console.log("OK: rewrote", srcPath, "as games entry");
}

if (require.main === module) {
  main();
}

