// Tactics Fighter builder routes — thin wrapper
"use strict";

const { registerTacticsFighterPuzzlesBuilderTreeRoutes } = require('./tacticsFighterPuzzlesBuilderTreeRoutes');
const { registerTacticsFighterPuzzlesBuilderCategoriesRoutes } = require('./tacticsFighterPuzzlesBuilderCategoriesRoutes');
const { registerTacticsFighterPuzzlesBuilderTopicsRoutes } = require('./tacticsFighterPuzzlesBuilderTopicsRoutes');
const { registerTacticsFighterPuzzlesBuilderSubtopicsRoutes } = require('./tacticsFighterPuzzlesBuilderSubtopicsRoutes');
const { registerTacticsFighterPuzzlesBuilderPuzzleCrudRoutes } = require('./tacticsFighterPuzzlesBuilderPuzzleCrudRoutes');

function registerTacticsFighterPuzzlesBuilderRoutes(app: any, deps: any, shared: any): void {
  registerTacticsFighterPuzzlesBuilderTreeRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesBuilderCategoriesRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesBuilderTopicsRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesBuilderSubtopicsRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesBuilderPuzzleCrudRoutes(app, deps, shared);
}

module.exports = { registerTacticsFighterPuzzlesBuilderRoutes };
export {};
