// Chess Works routes — thin wrapper for teacher + public submodules
"use strict";

const { createChessWorksShared } = require('./chessWorksShared');
const { registerChessWorksTeacherRoutes } = require('./chessWorksTeacherRoutes');
const { registerChessWorksPublicRoutes } = require('./chessWorksPublicRoutes');

function registerChessWorksRoutes(app: any, deps: any): void {
  if (!app) throw new Error("registerChessWorksRoutes: missing app");
  const shared = createChessWorksShared(deps);
  registerChessWorksTeacherRoutes(app, shared);
  registerChessWorksPublicRoutes(app, shared);
}

module.exports = { registerChessWorksRoutes };
export {};
