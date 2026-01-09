// Backward-compatibility shim:
// This file used to be the games routes entry. It now forwards to `server/routes/gameRoutes.js`.
"use strict";

const { registerMonsterFightGameRoutes } = require("./gameRoutes");

module.exports = { registerMonsterFightGameRoutes };