// Timetable helpers for org settings (holiday auto-postpone).
"use strict";

function createOrgSettingsTimetableHelpers() {
  // ==================== Timetable helpers (needed for holiday auto-postpone) ====================
  function isYmd(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function parseYmdToUtcMs(ymd) {
    if (!isYmd(ymd)) return null;
    const ms = Date.parse(`${ymd}T00:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }

  function utcMsToYmd(ms) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function computeNextAvailableDateSameEntry({ entry, fromDate, holidaySet, enrollments, studentId }) {
    if (!entry || !entry.isRecurring) return null;
    if (!isYmd(fromDate)) return null;

    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const dowSet = new Set((Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : []).map(d => dayMap[d]).filter(v => v !== undefined));
    const startBoundary = entry.startDate ? String(entry.startDate).split('T')[0] : null;
    const endBoundary = entry.endDate ? String(entry.endDate).split('T')[0] : null;

    const exceptions = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
    const exceptionSet = new Set(exceptions.filter(isYmd));

    const allStudentDates = new Set((Array.isArray(enrollments) ? enrollments : [])
      .filter(e =>
        String(e?.studentId) === String(studentId) &&
        String(e?.timetableEntryId) === String(entry.id) &&
        isYmd(e?.date)
      )
      .map(e => e.date)
    );

    const baseMs = parseYmdToUtcMs(fromDate);
    if (baseMs == null) return null;

    for (let i = 1; i <= 365; i++) {
      const ms = baseMs + i * 86400000;
      const ds = utcMsToYmd(ms);

      if (startBoundary && ds < startBoundary) continue;
      if (endBoundary && ds > endBoundary) break;

      if (dowSet.size > 0) {
        const dow = new Date(ms).getUTCDay();
        if (!dowSet.has(dow)) continue;
      }
      if (exceptionSet.has(ds)) continue;
      if (holidaySet && holidaySet.has(ds)) continue;
      if (allStudentDates.has(ds)) continue;

      return ds;
    }

    return null;
  }

  return { isYmd, parseYmdToUtcMs, utcMsToYmd, computeNextAvailableDateSameEntry };
}

module.exports = { createOrgSettingsTimetableHelpers };
