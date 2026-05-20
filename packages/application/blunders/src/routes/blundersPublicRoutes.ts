// Extracted from server.js to keep the main entry file smaller.
// NOTE: This module intentionally uses `with (deps)` in submodules.

const { registerBlundersPublicListRoutes } = require('./public/blundersPublicListRoutes');
const { registerBlundersPublicTeacherRoutes } = require('./public/blundersPublicTeacherRoutes');
const { registerBlundersPublicChallengeRoutes } = require('./public/blundersPublicChallengeRoutes');
const { registerBlundersPublicMasterRoutes } = require('./public/blundersPublicMasterRoutes');
const { registerBlundersPublicAttemptRoutes } = require('./public/blundersPublicAttemptRoutes');

function registerBlundersPublicRoutes(app: any, deps: any): void {
  registerBlundersPublicListRoutes(app, deps);
  registerBlundersPublicTeacherRoutes(app, deps);
  registerBlundersPublicChallengeRoutes(app, deps);
  registerBlundersPublicMasterRoutes(app, deps);
  registerBlundersPublicAttemptRoutes(app, deps);
}

module.exports = { registerBlundersPublicRoutes };
export {};
