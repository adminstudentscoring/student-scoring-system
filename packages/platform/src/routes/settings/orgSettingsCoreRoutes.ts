// Organization settings routes — thin wrapper over read/write modules.
"use strict";

const { createOrgSettingsTimetableHelpers } = require('./orgSettingsTimetableHelpers');
const { registerOrgSettingsCoreReadRoutes } = require('./orgSettingsCoreReadRoutes');
const { registerOrgSettingsCoreWriteRoutes } = require('./orgSettingsCoreWriteRoutes');

function registerOrgSettingsCoreRoutes(app: any, deps: any): void {
  const timetableHelpers = createOrgSettingsTimetableHelpers();
  registerOrgSettingsCoreReadRoutes(app, deps, timetableHelpers);
  registerOrgSettingsCoreWriteRoutes(app, deps, timetableHelpers);
}

module.exports = { registerOrgSettingsCoreRoutes };
export {};
