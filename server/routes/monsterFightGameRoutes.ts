// Backward-compatibility shim:
// This file used to be the games routes entry. It now forwards to `server/routes/gameRoutes.js`.
"use strict";
import type { Request, Response } from 'express';

const { registerMonsterFightGameRoutes } = require("./gameRoutes");

module.exports = { registerMonsterFightGameRoutes };