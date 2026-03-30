// @student-scoring/games-chess barrel exports
const chessLightRoutes = require('./routes/chessLightRoutes');
const chessSolitaireRoutes = require('./routes/chessSolitaireRoutes');
const chessWorksRoutes = require('./routes/chessWorksRoutes');
const mazeRunnerRoutes = require('./routes/mazeRunnerRoutes');

export const registerChessLightRoutes = chessLightRoutes.registerChessLightRoutes;
export const registerChessSolitaireRoutes = chessSolitaireRoutes.registerChessSolitaireRoutes;
export const registerChessWorksRoutes = chessWorksRoutes.registerChessWorksRoutes;
export const registerMazeRunnerRoutes = mazeRunnerRoutes.registerMazeRunnerRoutes;
