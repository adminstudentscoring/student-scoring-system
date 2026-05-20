// Puzzle CRUD, generation, and fetching routes — thin wrapper
"use strict";

const { registerTacticsFighterPuzzlesPublicRoutes } = require('./puzzles/tacticsFighterPuzzlesPublicRoutes');
const { registerTacticsFighterPuzzlesBuilderRoutes } = require('./puzzles/tacticsFighterPuzzlesBuilderRoutes');
const { registerTacticsFighterPuzzlesStudentRoutes } = require('./puzzles/tacticsFighterPuzzlesStudentRoutes');
const { registerTacticsFighterPuzzlesChallengeRoutes } = require('./puzzles/tacticsFighterPuzzlesChallengeRoutes');

function registerTacticsFighterPuzzlesRoutes(app: any, deps: any, shared: any): void {
  registerTacticsFighterPuzzlesPublicRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesBuilderRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesStudentRoutes(app, deps, shared);
  registerTacticsFighterPuzzlesChallengeRoutes(app, deps, shared);
}

module.exports = { registerTacticsFighterPuzzlesRoutes };
export {};
