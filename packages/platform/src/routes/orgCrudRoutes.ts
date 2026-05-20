// Course, Package, and Timetable management routes extracted from organizationsRoutes.js
// All route behavior should remain identical.
// Thin wrapper delegating to focused sub-modules under routes/org/.

const { registerOrgCoursesRoutes } = require('./org/orgCoursesRoutes');
const { registerOrgPackagesRoutes } = require('./org/orgPackagesRoutes');
const { registerOrgTimetableCrudRoutes } = require('./org/orgTimetableCrudRoutes');
const { registerOrgTimetableAdjustRoutes } = require('./org/orgTimetableAdjustRoutes');

function registerOrgCrudRoutes(app: any, deps: any): void {
  registerOrgCoursesRoutes(app, deps);
  registerOrgPackagesRoutes(app, deps);
  registerOrgTimetableCrudRoutes(app, deps);
  registerOrgTimetableAdjustRoutes(app, deps);
}

module.exports = { registerOrgCrudRoutes };
export {};
