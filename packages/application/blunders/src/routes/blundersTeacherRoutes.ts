// Extracted from server.js — thin wrapper for teacher blunders routes.

const { registerBlundersTeacherSyncRoutes } = require('./teacher/blundersTeacherSyncRoutes');
const { registerBlundersTeacherSettingsRoutes } = require('./teacher/blundersTeacherSettingsRoutes');
const { registerBlundersTeacherAllBlundersRoutes } = require('./teacher/blundersTeacherAllBlundersRoutes');
const { registerBlundersTeacherStorageRoutes } = require('./teacher/blundersTeacherStorageRoutes');
const { registerBlundersTeacherJobRoutes } = require('./teacher/blundersTeacherJobRoutes');
const { registerBlundersTeacherSummaryRoutes } = require('./teacher/blundersTeacherSummaryRoutes');

function registerBlundersTeacherRoutes(app: any, deps: any): void {
  registerBlundersTeacherSyncRoutes(app, deps);
  registerBlundersTeacherSettingsRoutes(app, deps);
  registerBlundersTeacherAllBlundersRoutes(app, deps);
  registerBlundersTeacherStorageRoutes(app, deps);
  registerBlundersTeacherJobRoutes(app, deps);
  registerBlundersTeacherSummaryRoutes(app, deps);
}

module.exports = { registerBlundersTeacherRoutes };
export {};
