// @student-scoring/core barrel exports

// Types
export * from './types';

// Auth
export * from './auth';

// Middleware
export { authenticateUser, authorizeRole, optionalAuth } from './middleware/auth';
export { createRequireOrganizationAccess, filterStudentsByOrganization, filterUsersByOrganization } from './middleware/dataIsolation';

// Config
export { LEVELS, RANKS } from './config/constants';
export type { Level, Rank } from './config/constants';

// Storage
export { createJsonStore } from './storage/jsonStore';
export { createDataStore } from './storage/dataStore';
export { createChessComSettingsStore } from './storage/chesscomSettings';

// Database
export { getPool, dbQuery, dbPing } from './db/postgres';
export { migrate } from './db/migrate';

// Lib - Date utilities
export {
  parseUciMove,
  dateStrFromYmd,
  parseDateStrToUtcMidnightMs,
  addDays,
  addMonths,
  DOW_NAME_TO_NUM,
  buildSkipDateSet,
  nextOccurrencesForEntry,
  packageLessonCount,
  computePackagePrice
} from './lib/dateUtils';

// V.Chess invoice schedule date parsing (import apply + tooling)
export {
  extractDefaultYearFromInvoiceDate,
  expandVchessScheduleDatesToYmd,
  utcYmdToEnglishDow
} from './lib/vchessScheduleDates';

// Lib - Stats helpers
export {
  getDateKey,
  getWeekKey,
  getMonthKey,
  getYearKey,
  updateStudentStats,
  addRewardPointsToStats,
  getRankInfo
} from './lib/statsHelpers';

// Lib - Subscription helpers
export {
  resolveOrgIdFromUser,
  normalizeSubscriptionStatus,
  normalizePublishState,
  normalizeCurrency,
  dateOnlyTodayString,
  createAppendSubscriptionAudit,
  createCheckExpiredPackages,
  createUpdatePackagesForDeletedCourse
} from './lib/subscriptionHelpers';
