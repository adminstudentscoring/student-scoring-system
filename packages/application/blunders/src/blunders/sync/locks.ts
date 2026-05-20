// Blunders sync lock maps (extracted from sync.ts).
// Do NOT add "use strict" to parent createBlundersSync (breaks with).

function createSyncLocks() {
  return {
    blundersMasterLocks: new Map(),
    blundersLastMasterSync: new Map(),
    blundersLastMasterHistoryScan: new Map()
  };
}

module.exports = { createSyncLocks };

export {};
