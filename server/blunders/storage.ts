// Blunders storage + settings helpers extracted from server.js.
// This module is intentionally dependency-injected so we can reuse the same paths/constants from server.js.

function createBlundersStorage(deps: any): any {
  const fs = deps?.fs;
  const path = require('path');

  const BLUNDERS_PUZZLES_FILE = deps?.BLUNDERS_PUZZLES_FILE;
  const BLUNDERS_STATS_FILE = deps?.BLUNDERS_STATS_FILE;
  const BLUNDERS_SETTINGS_FILE = deps?.BLUNDERS_SETTINGS_FILE;
  const BLUNDERS_MASTER_PROGRESS_FILE = deps?.BLUNDERS_MASTER_PROGRESS_FILE;
  const BLUNDERS_CHALLENGE_SESSIONS_FILE = deps?.BLUNDERS_CHALLENGE_SESSIONS_FILE;
  const BLUNDERS_CHALLENGE_LEADERBOARD_FILE = deps?.BLUNDERS_CHALLENGE_LEADERBOARD_FILE;
  const BLUNDERS_TEACHER_JOBS_FILE = deps?.BLUNDERS_TEACHER_JOBS_FILE;

  if (!fs) throw new Error('createBlundersStorage: missing deps.fs');

  // ===== Blunders: Puzzle storage (JSON file) =====
  let blundersPuzzlesWriteLock = Promise.resolve();

  async function readBlundersPuzzles() {
    try {
      // Avoid reading while a write is in-progress (prevents transient empty/partial reads).
      await blundersPuzzlesWriteLock.catch(() => {});
      const content = await fs.readFile(BLUNDERS_PUZZLES_FILE, 'utf8');
      const data = JSON.parse(content);
      const puzzles = data && typeof data === 'object' ? (data.puzzles || []) : [];
      return Array.isArray(puzzles) ? puzzles : [];
    } catch (error) {
      console.error('Error reading blunders puzzles:', error);
      return [];
    }
  }

  async function writeBlundersPuzzles(puzzles) {
    const arr = Array.isArray(puzzles) ? puzzles : [];
    // Serialize writes to prevent concurrent truncation/read issues.
    const run = async () => {
      try {
        await fs.writeFile(BLUNDERS_PUZZLES_FILE, JSON.stringify({ puzzles: arr, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
        return true;
      } catch (error) {
        console.error('Error writing blunders puzzles:', error);
        return false;
      }
    };
    blundersPuzzlesWriteLock = blundersPuzzlesWriteLock.then(run, run);
    return await blundersPuzzlesWriteLock;
  }

  // ===== Blunders: Stats (cumulative analyzed games) =====
  async function readBlundersStats() {
    try {
      const content = await fs.readFile(BLUNDERS_STATS_FILE, 'utf8');
      const data = JSON.parse(content);
      const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
      return (orgs && typeof orgs === 'object') ? orgs : {};
    } catch (error) {
      console.error('Error reading blunders stats:', error);
      return {};
    }
  }

  async function writeBlundersStats(orgs) {
    try {
      const clean = orgs && typeof orgs === 'object' ? orgs : {};
      await fs.writeFile(BLUNDERS_STATS_FILE, JSON.stringify({ orgs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing blunders stats:', error);
      return false;
    }
  }

  async function blundersMarkGamesAnalyzed(orgId, studentId, games) {
    const oid = String(orgId || '');
    const sid = String(studentId || '');
    if (!oid || !sid) return { ok: false };
    const list = Array.isArray(games) ? games : [];
    const orgs = await readBlundersStats();
    if (!orgs[oid] || typeof orgs[oid] !== 'object') orgs[oid] = {};
    const org = orgs[oid];
    if (!org[sid] || typeof org[sid] !== 'object') org[sid] = { analyzed: {}, analyzedCount: 0, lastSyncAt: null };
    const st = org[sid];
    if (!st.analyzed || typeof st.analyzed !== 'object') st.analyzed = {};
    let added = 0;
    for (const g of list) {
      const key = String(g?.url || g?.uuid || '').trim();
      if (!key) continue;
      if (st.analyzed[key]) continue;
      st.analyzed[key] = {
        url: String(g?.url || ''),
        uuid: String(g?.uuid || ''),
        endTime: Number(g?.end_time || 0),
        timeClass: String(g?.time_class || '')
      };
      added++;
    }
    st.analyzedCount = Object.keys(st.analyzed).length;
    st.lastSyncAt = new Date().toISOString();
    org[sid] = st;
    orgs[oid] = org;
    await writeBlundersStats(orgs);
    return { ok: true, added, total: st.analyzedCount };
  }

  // ===== Blunders: Settings (per-student config + masters) =====
  const BLUNDERS_DEFAULTS = {
    maxGamesPerDay: 10,
    thresholdPoints: 1.0,
    masterMaxGamesPerDay: 10,
    masterThresholdPoints: 1.0
  };

  function normalizeHkDayKey(ymd) {
    const s = String(ymd || '').trim();
    if (!s) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    return s;
  }

  async function readBlundersSettings() {
    try {
      const content = await fs.readFile(BLUNDERS_SETTINGS_FILE, 'utf8');
      const data = JSON.parse(content);
      const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
      return (orgs && typeof orgs === 'object') ? orgs : {};
    } catch (error) {
      console.error('Error reading blunders settings:', error);
      return {};
    }
  }

  async function writeBlundersSettings(orgs) {
    try {
      const clean = orgs && typeof orgs === 'object' ? orgs : {};
      await fs.writeFile(BLUNDERS_SETTINGS_FILE, JSON.stringify({ orgs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing blunders settings:', error);
      return false;
    }
  }

  function defaultMastersPreset() {
    return [
      { id: 'magnuscarlsen', name: 'MagnusCarlsen', username: 'MagnusCarlsen' },
      { id: 'hikaru', name: 'Hikaru', username: 'Hikaru' },
      { id: 'fabianocaruana', name: 'fabianocaruana', username: 'fabianocaruana' }
    ];
  }

  function sanitizeMasterEntry(m) {
    const name = String(m?.name || '').trim();
    const username = String(m?.username || '').trim();
    const id = String(m?.id || '').trim() || username.toLowerCase();
    if (!name || !username) return null;
    return { id, name, username };
  }

  async function getOrgBlundersSettings(orgId) {
    const oid = String(orgId || '');
    if (!oid) return { masters: defaultMastersPreset(), student: {}, master: {} };
    const orgs = await readBlundersSettings();
    if (!orgs[oid] || typeof orgs[oid] !== 'object') orgs[oid] = {};
    const org = orgs[oid];
    if (!Array.isArray(org.masters) || !org.masters.length) org.masters = defaultMastersPreset();
    if (!org.student || typeof org.student !== 'object') org.student = {};
    if (!org.master || typeof org.master !== 'object') org.master = {};
    // Persist back if we auto-filled defaults
    orgs[oid] = org;
    await writeBlundersSettings(orgs);
    return org;
  }

  async function getStudentBlundersConfig(orgId, studentId) {
    const org = await getOrgBlundersSettings(orgId);
    const sid = String(studentId || '');
    const ov = (org.student && org.student[sid] && typeof org.student[sid] === 'object') ? org.student[sid] : {};
    const maxGamesPerDay = Math.max(1, Math.min(50, Number(ov.maxGamesPerDay ?? BLUNDERS_DEFAULTS.maxGamesPerDay) || BLUNDERS_DEFAULTS.maxGamesPerDay));
    const thresholdPoints = Math.max(0.1, Math.min(10, Number(ov.thresholdPoints ?? BLUNDERS_DEFAULTS.thresholdPoints) || BLUNDERS_DEFAULTS.thresholdPoints));
    return { maxGamesPerDay, thresholdPoints };
  }

  async function getMasterBlundersConfig(orgId) {
    const org = await getOrgBlundersSettings(orgId);
    const ov = (org.master && typeof org.master === 'object') ? org.master : {};
    const maxGamesPerDay = Math.max(1, Math.min(50, Number(ov.maxGamesPerDay ?? BLUNDERS_DEFAULTS.masterMaxGamesPerDay) || BLUNDERS_DEFAULTS.masterMaxGamesPerDay));
    const thresholdPoints = Math.max(0.1, Math.min(10, Number(ov.thresholdPoints ?? BLUNDERS_DEFAULTS.masterThresholdPoints) || BLUNDERS_DEFAULTS.masterThresholdPoints));
    return { maxGamesPerDay, thresholdPoints };
  }

  // ===== Blunders: Master progress (per-student completion) =====
  async function readBlundersMasterProgress() {
    try {
      const content = await fs.readFile(BLUNDERS_MASTER_PROGRESS_FILE, 'utf8');
      const data = JSON.parse(content);
      const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
      return (orgs && typeof orgs === 'object') ? orgs : {};
    } catch (error) {
      console.error('Error reading blunders master progress:', error);
      return {};
    }
  }

  async function writeBlundersMasterProgress(orgs) {
    try {
      const clean = orgs && typeof orgs === 'object' ? orgs : {};
      await fs.writeFile(BLUNDERS_MASTER_PROGRESS_FILE, JSON.stringify({ orgs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing blunders master progress:', error);
      return false;
    }
  }

  // ===== Blunders Challenge: Sessions + Leaderboard storage =====
  async function readBlundersChallengeSessions() {
    try {
      const content = await fs.readFile(BLUNDERS_CHALLENGE_SESSIONS_FILE, 'utf8');
      const data = JSON.parse(content);
      const sessions = data && typeof data === 'object' ? (data.sessions || {}) : {};
      return (sessions && typeof sessions === 'object') ? sessions : {};
    } catch (error) {
      console.error('Error reading blunders challenge sessions:', error);
      return {};
    }
  }

  async function writeBlundersChallengeSessions(sessions) {
    try {
      const clean = sessions && typeof sessions === 'object' ? sessions : {};
      await fs.writeFile(BLUNDERS_CHALLENGE_SESSIONS_FILE, JSON.stringify({ sessions: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing blunders challenge sessions:', error);
      return false;
    }
  }

  async function readBlundersChallengeLeaderboard() {
    try {
      const content = await fs.readFile(BLUNDERS_CHALLENGE_LEADERBOARD_FILE, 'utf8');
      const data = JSON.parse(content);
      const orgs = data && typeof data === 'object' ? (data.orgs || {}) : {};
      return (orgs && typeof orgs === 'object') ? orgs : {};
    } catch (error) {
      console.error('Error reading blunders challenge leaderboard:', error);
      return {};
    }
  }

  async function writeBlundersChallengeLeaderboard(orgs) {
    try {
      const clean = orgs && typeof orgs === 'object' ? orgs : {};
      await fs.writeFile(BLUNDERS_CHALLENGE_LEADERBOARD_FILE, JSON.stringify({ orgs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
      return true;
    } catch (error) {
      console.error('Error writing blunders challenge leaderboard:', error);
      return false;
    }
  }

  // ===== Blunders Teacher Jobs (async background processing) =====
  let blundersTeacherJobsWriteLock = Promise.resolve();
  let blundersTeacherJobsLastGood = null;

  async function readBlundersTeacherJobs() {
    try {
      // Avoid reading while a write is in-progress (prevents transient empty/partial reads).
      await blundersTeacherJobsWriteLock.catch(() => {});
      const content = await fs.readFile(BLUNDERS_TEACHER_JOBS_FILE, 'utf8');
      const data = JSON.parse(content);
      const jobs = data && typeof data === 'object' ? (data.jobs || {}) : {};
      const out = (jobs && typeof jobs === 'object') ? jobs : {};
      blundersTeacherJobsLastGood = out;
      return out;
    } catch (error) {
      console.error('Error reading blunders teacher jobs:', error);
      // If we hit a transient JSON parse error mid-write, fall back to last known good snapshot.
      return (blundersTeacherJobsLastGood && typeof blundersTeacherJobsLastGood === 'object') ? blundersTeacherJobsLastGood : {};
    }
  }

  async function writeBlundersTeacherJobs(jobs) {
    const clean = jobs && typeof jobs === 'object' ? jobs : {};
    // Serialize writes to prevent concurrent truncation/read issues.
    const run = async () => {
      try {
        // Ensure parent directory exists (some deployments may start without data dir prepared).
        await fs.mkdir(path.dirname(BLUNDERS_TEACHER_JOBS_FILE), { recursive: true }).catch(() => {});
        await fs.writeFile(BLUNDERS_TEACHER_JOBS_FILE, JSON.stringify({ jobs: clean, lastUpdate: new Date().toISOString() }, null, 2), 'utf8');
        blundersTeacherJobsLastGood = clean;
        return true;
      } catch (error) {
        console.error('Error writing blunders teacher jobs:', error);
        return false;
      }
    };
    blundersTeacherJobsWriteLock = blundersTeacherJobsWriteLock.then(run, run);
    return await blundersTeacherJobsWriteLock;
  }

  return {
    // constants
    BLUNDERS_DEFAULTS,
    // settings helpers
    normalizeHkDayKey,
    defaultMastersPreset,
    sanitizeMasterEntry,
    getOrgBlundersSettings,
    getStudentBlundersConfig,
    getMasterBlundersConfig,
    // puzzles
    readBlundersPuzzles,
    writeBlundersPuzzles,
    // stats
    readBlundersStats,
    writeBlundersStats,
    blundersMarkGamesAnalyzed,
    // settings storage
    readBlundersSettings,
    writeBlundersSettings,
    // master progress
    readBlundersMasterProgress,
    writeBlundersMasterProgress,
    // challenge storage
    readBlundersChallengeSessions,
    writeBlundersChallengeSessions,
    readBlundersChallengeLeaderboard,
    writeBlundersChallengeLeaderboard,
    // teacher jobs storage
    readBlundersTeacherJobs,
    writeBlundersTeacherJobs
  };
}

module.exports = { createBlundersStorage };


