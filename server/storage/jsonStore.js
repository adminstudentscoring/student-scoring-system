/**
 * Generic JSON file store factory.
 *
 * Usage:
 *   const { createJsonStore } = require('./server/storage/jsonStore');
 *   const store = createJsonStore('/path/to/file.json', []);
 *   const data = await store.read();   // returns parsed JSON or defaultValue on error
 *   await store.write(data);           // writes JSON with pretty-print
 */

function createJsonStore(filePath, defaultValue = {}) {
  return {
    async read() {
      try {
        return JSON.parse(await require('fs').promises.readFile(filePath, 'utf8'));
      } catch {
        return typeof defaultValue === 'function' ? defaultValue() : JSON.parse(JSON.stringify(defaultValue));
      }
    },
    async write(data) {
      await require('fs').promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    }
  };
}

module.exports = { createJsonStore };
