// Games routes entry — now delegates only to Monster Fight.
// Running Queen, Royal Exchange, and Hope Mate live in @student-scoring/application-running-queen, application-royal-exchange, and application-hope-mate.
"use strict";
import type { Request, Response } from 'express';

const { registerMonsterFightRoutes } = require("./monsterFightRoutes");

function registerGameRoutes(app: any, deps: any): void {
  if (!app) throw new Error("registerGameRoutes: missing app");
  registerMonsterFightRoutes(app, deps);
}

function registerMonsterFightGameRoutes(app: any, deps: any): void {
  return registerGameRoutes(app, deps);
}

module.exports = { registerGameRoutes, registerMonsterFightGameRoutes };


