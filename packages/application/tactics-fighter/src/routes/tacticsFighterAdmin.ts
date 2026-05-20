// Admin/builder routes — thin wrapper
"use strict";

const { registerTacticsFighterAdminSettingsRoutes } = require('./admin/tacticsFighterAdminSettingsRoutes');
const { registerTacticsFighterAdminEngineRoutes } = require('./admin/tacticsFighterAdminEngineRoutes');
const { registerTacticsFighterAdminApplyMoveRoutes } = require('./admin/tacticsFighterAdminApplyMoveRoutes');
const { registerTacticsFighterAdminPhotoRoutes } = require('./admin/tacticsFighterAdminPhotoRoutes');

function registerTacticsFighterAdminRoutes(app: any, deps: any, shared: any): void {
  registerTacticsFighterAdminSettingsRoutes(app, deps, shared);
  registerTacticsFighterAdminEngineRoutes(app, deps, shared);
  registerTacticsFighterAdminApplyMoveRoutes(app, deps, shared);
  registerTacticsFighterAdminPhotoRoutes(app, deps, shared);
}

module.exports = { registerTacticsFighterAdminRoutes };
export {};
