// @student-scoring/games-blunders barrel exports
const blundersTeacherRoutes = require('./routes/blundersTeacherRoutes');
const blundersPublicRoutes = require('./routes/blundersPublicRoutes');
const storage = require('./blunders/storage');
const evalModule = require('./blunders/eval');
const puzzles = require('./blunders/puzzles');
const stats = require('./blunders/stats');
const chesscom = require('./blunders/chesscom');
const stockfish = require('./blunders/stockfish');
const sync = require('./blunders/sync');
const jobs = require('./blunders/jobs');
const ai = require('./blunders/ai');
const tagger = require('./blunders/tagger');
const db = require('./blunders/db');
const dbRetry = require('./blunders/dbRetry');
const settingsDb = require('./chesscom/settingsDb');

// Route registrations
export const registerBlundersTeacherRoutes = blundersTeacherRoutes.registerBlundersTeacherRoutes;
export const registerBlundersPublicRoutes = blundersPublicRoutes.registerBlundersPublicRoutes;

// Blunders modules (factory functions used by server.ts initialization)
export const createBlundersStorage = storage.createBlundersStorage;
export const createBlundersEval = evalModule.createBlundersEval;
export const createBlundersPuzzles = puzzles.createBlundersPuzzles;
export const createBlundersStats = stats.createBlundersStats;
export const createBlundersChessCom = chesscom.createBlundersChessCom;
export const createStockfishRunner = stockfish.createStockfishRunner;
export const createBlundersSync = sync.createBlundersSync;
export const createBlundersTeacherJobs = jobs.createBlundersTeacherJobs;
export const createBlundersAi = ai.createBlundersAi;
export const createBlundersTagger = tagger.createBlundersTagger;
export const createBlundersDb = db.createBlundersDb;
export const createBlundersDbRetry = dbRetry.createBlundersDbRetry;

// Chess.com settings DB
export const createChessComSettingsDb = settingsDb.createChessComSettingsDb;
