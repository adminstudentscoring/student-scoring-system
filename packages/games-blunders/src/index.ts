// @student-scoring/games-blunders barrel exports

// Route registrations
export { registerBlundersTeacherRoutes } from './routes/blundersTeacherRoutes';
export { registerBlundersPublicRoutes } from './routes/blundersPublicRoutes';

// Blunders modules (factory functions used by server.ts initialization)
export { createBlundersStorage } from './blunders/storage';
export { createBlundersEval } from './blunders/eval';
export { createBlundersPuzzles } from './blunders/puzzles';
export { createBlundersStats } from './blunders/stats';
export { createBlundersChessCom } from './blunders/chesscom';
export { createStockfishRunner } from './blunders/stockfish';
export { createBlundersSync } from './blunders/sync';
export { createBlundersTeacherJobs } from './blunders/jobs';
export { createBlundersAi } from './blunders/ai';
export { createBlundersTagger } from './blunders/tagger';
export { createBlundersDb } from './blunders/db';
export { createBlundersDbRetry } from './blunders/dbRetry';

// Chess.com settings DB
export { createChessComSettingsDb } from './chesscom/settingsDb';
