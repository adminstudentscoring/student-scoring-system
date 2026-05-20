// Organization settings routes extracted from organizationsRoutes.js
// All route behavior should remain identical.


const { registerOrgSettingsCoreRoutes } = require('./settings/orgSettingsCoreRoutes');
const { registerOrgSettingsPurgeRoutes } = require('./settings/orgSettingsPurgeRoutes');

function registerOrgSettingsRoutes(app: any, deps: any): void {
  registerOrgSettingsCoreRoutes(app, deps);
  registerOrgSettingsPurgeRoutes(app, deps);
}

module.exports = { registerOrgSettingsRoutes };
export {};
