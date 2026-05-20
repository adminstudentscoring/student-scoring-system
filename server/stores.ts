const fs = require('fs').promises;
const path = require('path');
const bootstrap = require('./bootstrap');

const {
  ROOT_DIR,
  DATA_FILE,
  SAVES_DIR,
  GAME_SAVES_DIR,
  RUNNING_QUEEN_LEADERBOARD_FILE,
  ROYAL_EXCHANGE_LEADERBOARD_FILE,
  HOPE_MATE_LEADERBOARD_FILE,
  HOPE_MATE_CHALLENGE_LEADERBOARD_FILE,
  HOPE_MATE_STAGE_PUZZLES_FILE,
  VCP_CHESS_GAMES_FILE,
  CHESSCOM_SETTINGS_FILE,
  BLUNDERS_PUZZLES_FILE,
  BLUNDERS_STATS_FILE,
  BLUNDERS_SETTINGS_FILE,
  BLUNDERS_MASTER_PROGRESS_FILE,
  BLUNDERS_CHALLENGE_SESSIONS_FILE,
  BLUNDERS_CHALLENGE_LEADERBOARD_FILE,
  BLUNDERS_TEACHER_JOBS_FILE,
  CHESSCOM_RATINGS_FILE,
  USERS_FILE,
  ORGANIZATIONS_FILE,
  COURSES_FILE,
  PACKAGES_FILE,
  SUBSCRIPTION_PRICES_FILE,
  SUBSCRIPTION_PACKAGES_FILE,
  SUBSCRIPTION_AUDIT_FILE,
  TIMETABLE_FILE,
  ORDERS_FILE,
  VCHESS_INVOICE_IMPORTS_FILE,
  ENROLLMENTS_FILE,
  ATTENDANCE_FILE,
  TRANSACTIONS_FILE,
  EXPENSES_FILE
} = bootstrap;

// Generic JSON store factory
const { createJsonStore } = require('@student-scoring/core');

// --- JSON stores for simple read/write pairs ---
const ordersStore = createJsonStore(ORDERS_FILE, []);
const vchessInvoiceImportsStore = createJsonStore(VCHESS_INVOICE_IMPORTS_FILE, { imports: [] });
const enrollmentsStore = createJsonStore(ENROLLMENTS_FILE, []);
const attendanceStore = createJsonStore(ATTENDANCE_FILE, []);
const transactionsStore = createJsonStore(TRANSACTIONS_FILE, []);
const expensesStore = createJsonStore(EXPENSES_FILE, []);

const billingDb = require('@student-scoring/billing/src/db');
const paypal = require('@student-scoring/billing/src/paypal');
const { createPayPalBillingHelpers } = require('@student-scoring/billing');
const appDb = require('@student-scoring/core/src/db/postgres');

// --- JSON stores for wrapped-field pairs (used internally by their wrapper functions) ---
const organizationsStore = createJsonStore(ORGANIZATIONS_FILE, { organizations: [], lastUpdate: null });
const usersStore = createJsonStore(USERS_FILE, { users: [], lastUpdate: null });
const coursesStore = createJsonStore(COURSES_FILE, { courses: [], lastUpdate: null });
const packagesStore = createJsonStore(PACKAGES_FILE, { packages: [], lastUpdate: null });
const subscriptionPricesStore = createJsonStore(SUBSCRIPTION_PRICES_FILE, { prices: [], lastUpdate: null });
const subscriptionPackagesStore = createJsonStore(SUBSCRIPTION_PACKAGES_FILE, { packages: [], lastUpdate: null });

// Import authentication utilities

async function ensureDataDir(): Promise<void> {
  const dirs = [
    path.dirname(DATA_FILE),
    SAVES_DIR,
    GAME_SAVES_DIR,
  ];

  const files = [
    { path: RUNNING_QUEEN_LEADERBOARD_FILE,    default: () => JSON.stringify([], null, 2) },
    { path: ROYAL_EXCHANGE_LEADERBOARD_FILE,    default: () => JSON.stringify([], null, 2) },
    { path: HOPE_MATE_LEADERBOARD_FILE,         default: () => JSON.stringify([], null, 2) },
    { path: HOPE_MATE_CHALLENGE_LEADERBOARD_FILE, default: () => JSON.stringify([], null, 2) },
    { path: HOPE_MATE_STAGE_PUZZLES_FILE,       default: () => JSON.stringify({ puzzles: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: VCP_CHESS_GAMES_FILE,               default: () => '' },
    { path: CHESSCOM_SETTINGS_FILE,             default: () => JSON.stringify({ orgs: {} }, null, 2) },
    { path: BLUNDERS_PUZZLES_FILE,              default: () => JSON.stringify({ puzzles: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_STATS_FILE,                default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_SETTINGS_FILE,             default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_MASTER_PROGRESS_FILE,      default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_CHALLENGE_SESSIONS_FILE,   default: () => JSON.stringify({ sessions: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_CHALLENGE_LEADERBOARD_FILE, default: () => JSON.stringify({ orgs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: BLUNDERS_TEACHER_JOBS_FILE,         default: () => JSON.stringify({ jobs: {}, lastUpdate: new Date().toISOString() }, null, 2) },
    { path: CHESSCOM_RATINGS_FILE,              default: () => JSON.stringify({ orgs: {}, meta: { lastRunHkDay: null, lastRunAt: null } }, null, 2) },
    { path: USERS_FILE,                         default: () => JSON.stringify({ users: [] }, null, 2) },
    { path: ORGANIZATIONS_FILE,                 default: () => JSON.stringify({ organizations: [] }, null, 2) },
    { path: COURSES_FILE,                       default: () => JSON.stringify({ courses: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: TIMETABLE_FILE,                     default: () => JSON.stringify({ entries: [], metadata: { classNames: [], classrooms: [], lastUpdate: new Date().toISOString() } }, null, 2) },
    { path: SUBSCRIPTION_PRICES_FILE,           default: () => JSON.stringify({ prices: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: SUBSCRIPTION_PACKAGES_FILE,         default: () => JSON.stringify({ packages: [], lastUpdate: new Date().toISOString() }, null, 2) },
    { path: SUBSCRIPTION_AUDIT_FILE,            default: () => '' },
  ];

  for (const dir of dirs) {
    try { await fs.access(dir); } catch { await fs.mkdir(dir, { recursive: true }); }
  }

  for (const entry of files) {
    try { await fs.access(entry.path); } catch { await fs.writeFile(entry.path, entry.default(), 'utf8'); }
  }
}

// Read organizations data
async function readOrganizations(): Promise<any[]> {
  const data = await organizationsStore.read();
  return data.organizations || [];
}

// Write organizations data
async function writeOrganizations(organizations: any[]): Promise<boolean> {
  return organizationsStore.write({ organizations, lastUpdate: new Date().toISOString() });
}

// Read users data
async function readUsers(): Promise<any[]> {
  const data = await usersStore.read();
  return data.users || [];
}

// Write users data
async function writeUsers(users: any[]): Promise<boolean> {
  return usersStore.write({ users, lastUpdate: new Date().toISOString() });
}

// ===== Chess.com settings storage (org-scoped) =====
// - Teacher Dashboard: stores chessId + password (for Student Dashboard "Chess.com" application)
// - Blunders: uses chessId mapping (studentId -> chessId) for username lookups
//
// Default behavior:
// - If Postgres is configured: store + read from Postgres
// - Else: fallback to JSON file at CHESSCOM_SETTINGS_FILE
let readChessComSettings: (...args: any[]) => Promise<any>;
let writeChessComSettings: (...args: any[]) => Promise<any>;
let getOrgChessComSettings: (...args: any[]) => Promise<any>;
let upsertOrgChessComSettings: (...args: any[]) => Promise<any>;
let getStudentChessComCredentials: (...args: any[]) => Promise<any>;
{
  const { createChessComSettingsStore } = require('@student-scoring/core');
  const fileStore = createChessComSettingsStore({ fs, CHESSCOM_SETTINGS_FILE });

  const { createChessComSettingsDb } = require('@student-scoring/application-blunders');
  const dbStore = createChessComSettingsDb({ appDb });

  writeChessComSettings = fileStore.writeChessComSettings;

  getOrgChessComSettings = async (orgId) => {
    const fromDb = await dbStore.getOrgSettings(orgId);
    if (fromDb !== null) return fromDb;
    const orgs = await fileStore.readChessComSettings();
    const oid = String(orgId || '');
    return (orgs && orgs[oid] && typeof orgs[oid] === 'object') ? orgs[oid] : {};
  };

  upsertOrgChessComSettings = async (orgId, mergedSettings) => {
    const out = await dbStore.upsertOrgSettings(orgId, mergedSettings);
    if (out && out.ok === true) return out;
    // File-store fallback (best-effort)
    try {
      const oid = String(orgId || '');
      if (!oid) return { ok: false, reason: 'missing_org' };
      const orgs = await fileStore.readChessComSettings();
      const prev = (orgs && orgs[oid] && typeof orgs[oid] === 'object') ? orgs[oid] : {};
      orgs[oid] = { ...prev, ...(mergedSettings && typeof mergedSettings === 'object' ? mergedSettings : {}) };
      const ok = await fileStore.writeChessComSettings(orgs);
      return { ok: !!ok, upserted: ok ? Object.keys(mergedSettings || {}).length : 0, source: 'file' };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e) };
    }
  };

  getStudentChessComCredentials = async (orgId, studentId) => {
    const cred = await dbStore.getStudentCredentials(orgId, studentId);
    if (cred !== null) return cred;
    // File-store fallback (if present)
    try {
      const oid = String(orgId || '');
      const sid = String(studentId || '');
      const orgs = await fileStore.readChessComSettings();
      const bucket = (orgs && orgs[oid] && typeof orgs[oid] === 'object') ? orgs[oid] : {};
      const ent = bucket && bucket[sid] && typeof bucket[sid] === 'object' ? bucket[sid] : null;
      if (!ent) return null;
      return {
        chessId: ent.chessId != null ? String(ent.chessId) : '',
        password: ent.password != null ? String(ent.password) : '',
        updatedAt: ent.updatedAt != null ? String(ent.updatedAt) : null
      };
    } catch {
      return null;
    }
  };

  // Used by Blunders Chess.com helpers (needs all org mappings).
  readChessComSettings = async () => {
    const all = await dbStore.getAllSettings();
    if (all !== null) return all;
    return await fileStore.readChessComSettings();
  };
}

// Read courses data
async function readCourses(): Promise<any[]> {
  const data = await coursesStore.read();
  return data.courses || [];
}

// Write courses data
async function writeCourses(courses: any[]): Promise<boolean> {
  return coursesStore.write({ courses, lastUpdate: new Date().toISOString() });
}

// Read packages data
async function readPackages(): Promise<any[]> {
  const data = await packagesStore.read();
  return data.packages || [];
}

// Write packages data
async function writePackages(packages: any[]): Promise<boolean> {
  return packagesStore.write({ packages, lastUpdate: new Date().toISOString() });
}

// Read subscription prices data (Admin Subscription Setting -> Price Setting)
async function readSubscriptionPrices(): Promise<any[]> {
  const data = await subscriptionPricesStore.read();
  return Array.isArray(data.prices) ? data.prices : [];
}

// Write subscription prices data
async function writeSubscriptionPrices(prices: any[]): Promise<boolean> {
  return subscriptionPricesStore.write({ prices, lastUpdate: new Date().toISOString() });
}

// Read subscription packages data (Admin Subscription Setting -> Package Setting)
async function readSubscriptionPackages(): Promise<any[]> {
  const data = await subscriptionPackagesStore.read();
  return Array.isArray(data.packages) ? data.packages : [];
}

const {
  resolveOrgIdFromUser,
  normalizeSubscriptionStatus,
  normalizePublishState,
  normalizeCurrency,
  dateOnlyTodayString,
  createAppendSubscriptionAudit,
  createCheckExpiredPackages,
  createUpdatePackagesForDeletedCourse,
  createRequireOrganizationAccess,
  createDataStore
} = require('@student-scoring/core');

// Write subscription packages data
async function writeSubscriptionPackages(packages: any[]): Promise<boolean> {
  return subscriptionPackagesStore.write({ packages, lastUpdate: new Date().toISOString() });
}

const paypalBilling = createPayPalBillingHelpers({
  billingDb,
  paypal,
  readSubscriptionPrices
});

const appendSubscriptionAudit = createAppendSubscriptionAudit({ fs, SUBSCRIPTION_AUDIT_FILE });
const checkExpiredPackages = createCheckExpiredPackages({ readPackages, writePackages });
const updatePackagesForDeletedCourse = createUpdatePackagesForDeletedCourse({ readPackages, writePackages });

// Read timetable data
async function readTimetable(): Promise<any> {
  try {
    const content = await fs.readFile(TIMETABLE_FILE, 'utf8');
    const data = JSON.parse(content);
    return {
      entries: data.entries || [],
      metadata: data.metadata || { classNames: [], classrooms: [], lastUpdate: new Date().toISOString() }
    };
  } catch (error) {
    console.error('Error reading timetable:', error);
    return {
      entries: [],
      metadata: { classNames: [], classrooms: [], lastUpdate: new Date().toISOString() }
    };
  }
}

// Write timetable data
async function writeTimetable(timetableData: any): Promise<boolean> {
  try {
    timetableData.metadata.lastUpdate = new Date().toISOString();
    await fs.writeFile(TIMETABLE_FILE, JSON.stringify(timetableData, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing timetable:', error);
    return false;
  }
}

// ===== Data store (moved to @student-scoring/core) =====
const _dataStore = createDataStore({ fs, DATA_FILE });
const initializeDataFile = _dataStore.initializeDataFile;
const initializeStudentFields = _dataStore.initializeStudentFields;
// readData and writeData need to be available before this point in the file
// (other init blocks reference them), so we use function declarations that hoist.
function readData(): Promise<any> { return _dataStore.readData(); }
function writeData(data: any): Promise<boolean> { return _dataStore.writeData(data); }

const requireOrganizationAccess = createRequireOrganizationAccess(readUsers);

// Read/write orders data (via jsonStore)
async function readOrders(): Promise<any> { return ordersStore.read(); }
async function writeOrders(orders: any): Promise<boolean> { return ordersStore.write(orders); }

async function readVchessInvoiceImports(): Promise<any> {
  return vchessInvoiceImportsStore.read();
}
async function writeVchessInvoiceImports(data: any): Promise<boolean> {
  return vchessInvoiceImportsStore.write(data);
}

// Read/write enrollments data (via jsonStore)
async function readEnrollments(): Promise<any> { return enrollmentsStore.read(); }
async function writeEnrollments(enrollments: any): Promise<boolean> { return enrollmentsStore.write(enrollments); }

// Read/write attendance data (via jsonStore)
async function readAttendance(): Promise<any> { return attendanceStore.read(); }
async function writeAttendance(data: any): Promise<boolean> { return attendanceStore.write(data); }

// Read/write transactions data (via jsonStore)
async function readTransactions(): Promise<any> { return transactionsStore.read(); }
async function writeTransactions(data: any): Promise<boolean> { return transactionsStore.write(data); }

// Read/write expenses data (via jsonStore)
async function readExpenses(): Promise<any> { return expensesStore.read(); }
async function writeExpenses(data: any): Promise<boolean> { return expensesStore.write(data); }

export {};

module.exports = {
  ROOT_DIR,
  fs,
  path,
  DATA_FILE,
  SAVES_DIR,
  GAME_SAVES_DIR,
  RUNNING_QUEEN_LEADERBOARD_FILE,
  ROYAL_EXCHANGE_LEADERBOARD_FILE,
  HOPE_MATE_LEADERBOARD_FILE,
  HOPE_MATE_CHALLENGE_LEADERBOARD_FILE,
  HOPE_MATE_STAGE_PUZZLES_FILE,
  VCP_CHESS_GAMES_FILE,
  CHESSCOM_SETTINGS_FILE,
  TIMETABLE_FILE,
  ORDERS_FILE,
  TACTICS_FIGHTER_ATTEMPTS_FILE: bootstrap.TACTICS_FIGHTER_ATTEMPTS_FILE,
  SUBSCRIPTION_AUDIT_FILE,
  ensureDataDir,
  readOrganizations,
  writeOrganizations,
  readUsers,
  writeUsers,
  readChessComSettings,
  writeChessComSettings,
  getOrgChessComSettings,
  upsertOrgChessComSettings,
  getStudentChessComCredentials,
  readCourses,
  writeCourses,
  readPackages,
  writePackages,
  readSubscriptionPrices,
  writeSubscriptionPrices,
  readSubscriptionPackages,
  writeSubscriptionPackages,
  readTimetable,
  writeTimetable,
  requireOrganizationAccess,
  readData,
  writeData,
  initializeDataFile,
  initializeStudentFields,
  readOrders,
  writeOrders,
  readVchessInvoiceImports,
  writeVchessInvoiceImports,
  readEnrollments,
  writeEnrollments,
  readAttendance,
  writeAttendance,
  readTransactions,
  writeTransactions,
  readExpenses,
  writeExpenses,
  billingDb,
  paypal,
  paypalBilling,
  appDb,
  appendSubscriptionAudit,
  checkExpiredPackages,
  updatePackagesForDeletedCourse,
  resolveOrgIdFromUser,
  normalizeSubscriptionStatus,
  normalizePublishState,
  normalizeCurrency,
  dateOnlyTodayString
};
