// Thin wrapper for order + enrollment drop routes.

const { registerOrgOrdersCrudRoutes } = require('./orgOrdersCrudRoutes');
const { registerOrgOrdersCreateRoutes } = require('./orgOrdersCreateRoutes');
const { registerOrgEnrollmentsDropRoutes } = require('./orgEnrollmentsDropRoutes');

function registerOrgOrdersRoutes(app: any, deps: any): void {
  registerOrgOrdersCrudRoutes(app, deps);
  registerOrgOrdersCreateRoutes(app, deps);
  registerOrgEnrollmentsDropRoutes(app, deps);
}

module.exports = { registerOrgOrdersRoutes };
export {};
