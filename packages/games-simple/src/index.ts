// @student-scoring/games-simple barrel exports
const runningQueenRoutes = require('./routes/runningQueenRoutes');
const royalExchangeRoutes = require('./routes/royalExchangeRoutes');
const hopeMateRoutes = require('./routes/hopeMateRoutes');
const hopeMateAdminRoutes = require('./routes/hopeMateAdminRoutes');

export const registerRunningQueenRoutes = runningQueenRoutes.registerRunningQueenRoutes;
export const registerRoyalExchangeRoutes = royalExchangeRoutes.registerRoyalExchangeRoutes;
export const registerHopeMateRoutes = hopeMateRoutes.registerHopeMateRoutes;
export const registerHopeMateAdminRoutes = hopeMateAdminRoutes.registerHopeMateAdminRoutes;
