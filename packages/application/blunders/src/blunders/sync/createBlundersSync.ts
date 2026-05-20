// Blunders sync factory (thin wrapper over sync/* submodules).

const { createSyncLocks } = require('./locks');
const { createStudentSync } = require('./studentSync');
const { createMasterSync } = require('./masterSync');

function createBlundersSync(deps: any): any {
  const locks = createSyncLocks();
  const d = { ...deps, ...locks };
  const syncBlundersForStudent = createStudentSync(d);
  const syncBlundersForMaster = createMasterSync(d);
  return { syncBlundersForStudent, syncBlundersForMaster };
}

module.exports = { createBlundersSync };

export {};
