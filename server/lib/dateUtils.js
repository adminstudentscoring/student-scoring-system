// Date/schedule helper functions extracted from server.js.

function parseUciMove(uci) {
  const s = String(uci || '').trim().toLowerCase();
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return null;
  const from = s.slice(0, 2);
  const to = s.slice(2, 4);
  const promotion = s.length === 5 ? s[4] : undefined;
  return { from, to, promotion, uci: s };
}

function dateStrFromYmd(y, m, d) {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function parseDateStrToUtcMidnightMs(dateStr) {
  const s = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

function addDays(dateStr, days) {
  const ms = parseDateStrToUtcMidnightMs(dateStr);
  if (ms == null) return null;
  const next = new Date(ms + (Number(days) || 0) * 86400000);
  return dateStrFromYmd(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function addMonths(dateStr, months) {
  const ms = parseDateStrToUtcMidnightMs(dateStr);
  if (ms == null) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + (Number(months) || 0), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay);
  target.setUTCDate(safeDay);
  return dateStrFromYmd(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}

const DOW_NAME_TO_NUM = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6
};

function buildSkipDateSet(entry, orgSettings) {
  const s = new Set();
  const ex = Array.isArray(entry?.exceptions) ? entry.exceptions : [];
  for (const d of ex) if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) s.add(d);
  const hol = orgSettings?.scheduleSettings?.holidays;
  if (Array.isArray(hol)) {
    for (const d of hol) if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) s.add(d);
  }
  return s;
}

function nextOccurrencesForEntry({ entry, startAfterDateStr, count, endDateStrInclusive, orgSettings }) {
  const skip = buildSkipDateSet(entry, orgSettings);
  const days = Array.isArray(entry?.dayOfWeek) ? entry.dayOfWeek : [];
  const dowSet = new Set(days.map(d => DOW_NAME_TO_NUM[d]).filter(v => v !== undefined));
  if (!entry?.isRecurring) return [];
  if (dowSet.size <= 0) return [];

  const startMs = parseDateStrToUtcMidnightMs(startAfterDateStr);
  if (startMs == null) return [];

  const entryStartMs = entry.startDate ? parseDateStrToUtcMidnightMs(entry.startDate) : null;
  const entryEndMs = entry.endDate ? parseDateStrToUtcMidnightMs(entry.endDate) : null;
  const hardStopMs = entryEndMs ?? (startMs + 370 * 86400000); // safety guard ~1 year
  const endMs = endDateStrInclusive ? parseDateStrToUtcMidnightMs(endDateStrInclusive) : null;
  const limitMs = endMs != null ? Math.min(endMs, hardStopMs) : hardStopMs;

  const out = [];
  // start checking from the next day
  let curMs = startMs + 86400000;
  while (curMs <= limitMs) {
    const d = new Date(curMs);
    const ds = dateStrFromYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (entryStartMs != null && curMs < entryStartMs) { curMs += 86400000; continue; }
    if (entryEndMs != null && curMs > entryEndMs) break;
    if (!dowSet.has(d.getUTCDay())) { curMs += 86400000; continue; }
    if (skip.has(ds)) { curMs += 86400000; continue; }
    out.push(ds);
    if (count && out.length >= count) break;
    curMs += 86400000;
  }
  return out;
}

function packageLessonCount(pkg) {
  const courses = Array.isArray(pkg?.courses) ? pkg.courses : [];
  return courses.reduce((sum, c) => sum + (Number(c?.quantity) || 0), 0);
}

function computePackagePrice({ pkg, coursesById, classCount }) {
  const strategy = String(pkg?.priceStrategy || '');
  if (strategy === 'fixed') return Number(pkg?.fixedPrice) || 0;
  if (strategy === 'custom') return Number(pkg?.customPrice) || 0;
  if (strategy === 'monthly') return (Number(pkg?.monthlyLessonPrice) || 0) * (Number(classCount) || 0);
  if (strategy === 'discount') {
    const disc = Number(pkg?.discountPercentage) || 0;
    const base = (Array.isArray(pkg?.courses) ? pkg.courses : []).reduce((sum, c) => {
      const course = coursesById.get(String(c.courseId || ''));
      const qty = Number(c?.quantity) || 0;
      const p = Number(course?.price) || 0;
      return sum + qty * p;
    }, 0);
    const price = base * (1 - Math.max(0, Math.min(100, disc)) / 100);
    return Math.round(price * 100) / 100;
  }
  return 0;
}

module.exports = {
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
};
