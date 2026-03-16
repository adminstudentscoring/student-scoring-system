// Organization-related routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.
// This file is now a thin wrapper that delegates to focused sub-modules.

const { registerOrgCrudRoutes } = require('./orgCrudRoutes');
const { registerOrgTeachersRoutes } = require('./orgTeachersRoutes');
const { registerOrgStudentsRoutes } = require('./orgStudentsRoutes');
const { registerOrgSettingsRoutes } = require('./orgSettingsRoutes');

function registerOrganizationsRoutes(app, deps) {
  registerOrgCrudRoutes(app, deps);
  registerOrgTeachersRoutes(app, deps);
  registerOrgStudentsRoutes(app, deps);
  registerOrgSettingsRoutes(app, deps);
}

module.exports = { registerOrganizationsRoutes };
