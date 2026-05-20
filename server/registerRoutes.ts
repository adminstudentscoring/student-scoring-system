import type { Express } from 'express';

const { registerPlatformRoutes } = require('./registerRoutesPlatform');
const { registerAppRoutes } = require('./registerRoutesApps');

function registerRoutes(app: Express): void {
  registerPlatformRoutes(app);
  registerAppRoutes(app);
}

export {};

module.exports = { registerRoutes };
