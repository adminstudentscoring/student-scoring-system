// Organization billing + finance routes extracted from server.js to keep the entry file manageable.
// All route behavior should remain identical.

// Thin wrapper delegating to focused sub-modules under routes/org/.

const { registerOrgBillingPaypalRoutes } = require('./org/orgBillingPaypalRoutes');
const { registerOrgFinanceRoutes } = require('./org/orgFinanceRoutes');
const { registerOrgOrdersRoutes } = require('./org/orgOrdersRoutes');

function registerOrganizationsBillingRoutes(app: any, deps: any): void {
  registerOrgBillingPaypalRoutes(app, deps);
  registerOrgFinanceRoutes(app, deps);
  registerOrgOrdersRoutes(app, deps);
}

module.exports = { registerOrganizationsBillingRoutes };
export {};
