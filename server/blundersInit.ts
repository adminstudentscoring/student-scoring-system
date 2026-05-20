const { initBlundersStorage } = require('./blunders/storageInit');
const { wireBlundersModules } = require('./blunders/wiring');

const storage = initBlundersStorage();
const wired = wireBlundersModules(storage);

export {};

module.exports = wired;
