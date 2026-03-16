/**
 * Generic JSON file store factory.
 *
 * Usage:
 *   const { createJsonStore } = require('./server/storage/jsonStore');
 *   const store = createJsonStore('/path/to/file.json', []);
 *   const data = await store.read();   // returns parsed JSON or defaultValue on error
 *   await store.write(data);           // writes JSON with pretty-print
 */

interface JsonStore<T> {
  read(): Promise<T>;
  write(data: T): Promise<boolean>;
}

function createJsonStore<T>(filePath: string, defaultValue: T = {} as T): JsonStore<T> {
  return {
    async read(): Promise<T> {
      try {
        return JSON.parse(await require('fs').promises.readFile(filePath, 'utf8'));
      } catch {
        return typeof defaultValue === 'function' ? (defaultValue as Function)() : JSON.parse(JSON.stringify(defaultValue));
      }
    },
    async write(data: T): Promise<boolean> {
      await require('fs').promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    }
  };
}

module.exports = { createJsonStore };
