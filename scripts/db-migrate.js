// CLI runner: applies db/migrations/*.sql
require('dotenv').config();
const { migrate } = require('../db/migrate');

migrate()
  .then((r) => {
    console.log(`Migrations complete. Applied: ${r.applied} / ${r.total}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  });


