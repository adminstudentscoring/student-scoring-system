// Load environment variables
require('dotenv').config();

import type { Express } from 'express';

const bootstrap = require('./server/bootstrap');
const { createApp } = require('./server/createApp');
const { registerRoutes } = require('./server/registerRoutes');
const { startServer } = require('./server/startServer');

// Initialize stores + blunders (module load side effects)
require('./server/stores');
require('./server/blundersInit');

const app: Express = createApp();
registerRoutes(app);

const { logProcessContext, formatError } = bootstrap;

startServer(app).catch((error: any) => {
  logProcessContext('startupFailure', { error: formatError(error) });
  try {
    setTimeout(() => process.exit(1), 50).unref?.();
  } catch {
    process.exit(1);
  }
});
