// Chess.com settings storage (org-scoped), extracted from server.js.

function createChessComSettingsStore(deps) {
  const fs = deps?.fs;
  const CHESSCOM_SETTINGS_FILE = deps?.CHESSCOM_SETTINGS_FILE;

  if (!fs) throw new Error('createChessComSettingsStore: missing deps.fs');
  if (!CHESSCOM_SETTINGS_FILE) throw new Error('createChessComSettingsStore: missing deps.CHESSCOM_SETTINGS_FILE');

  async function readChessComSettings() {
    try {
      const content = await fs.readFile(CHESSCOM_SETTINGS_FILE, 'utf8');
      const data = JSON.parse(content);
      const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
      return orgs && typeof orgs === 'object' ? orgs : {};
    } catch (error) {
      console.error('Error reading chesscom settings:', error);
      return {};
    }
  }

  async function writeChessComSettings(orgs) {
    try {
      const clean = orgs && typeof orgs === 'object' ? orgs : {};
      await fs.writeFile(CHESSCOM_SETTINGS_FILE, JSON.stringify({ orgs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing chesscom settings:', error);
      return false;
    }
  }

  return { readChessComSettings, writeChessComSettings };
}

module.exports = { createChessComSettingsStore };


