// Organization billing helpers — shared by org billing route modules.

const fsPromises = require('fs').promises;
const pathMod = require('path');

/** Set QUOTA_PAY_VERBOSE=1 for extra line-by-line JSON dumps on stdout. Base [QuotaPay] logs always print. */
const QUOTA_PAY_VERBOSE = String(process.env.QUOTA_PAY_VERBOSE || '').trim() === '1';

function quotaPayLog(msg: string, data?: Record<string, unknown>): void {
  if (data !== undefined) {
    console.log('[QuotaPay]', msg, data);
  } else {
    console.log('[QuotaPay]', msg);
  }
}

function quotaPayVerbose(msg: string, data?: Record<string, unknown>): void {
  if (!QUOTA_PAY_VERBOSE) return;
  if (data !== undefined) {
    console.log('[QuotaPay:V]', msg, data);
  } else {
    console.log('[QuotaPay:V]', msg);
  }
}

/** Optional file log for enrollments/drop (set DEBUG_ENROLLMENT_DROP=1 or ENROLLMENT_DROP_LOG=/path) */
async function appendEnrollmentDropLog(message: string): Promise<void> {
  const explicit = String(process.env.ENROLLMENT_DROP_LOG || '').trim();
  const defaultPath =
    String(process.env.DEBUG_ENROLLMENT_DROP || '') === '1'
      ? pathMod.join(process.cwd(), process.env.DATA_DIR || 'data', 'enrollment-drop-debug.log')
      : '';
  const filePath = explicit || defaultPath;
  if (!filePath) return;
  try {
    await fsPromises.mkdir(pathMod.dirname(filePath), { recursive: true });
    await fsPromises.appendFile(filePath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch (e) {
    console.error('[appendEnrollmentDropLog]', e);
  }
}

/** Same matching rules as refund logic: order line class vs dropped enrollment date + series entry id */
function classSlotMatchesDroppedEnrollment(
  cls: any,
  enrollment: { date: string; timetableEntryId: string }
): boolean {
  let clsDate: string;
  if (cls.dateString) clsDate = cls.dateString;
  else if (cls.date) clsDate = new Date(cls.date).toISOString().split('T')[0];
  else return false;
  if (clsDate !== enrollment.date) return false;
  const tid = enrollment.timetableEntryId;
  if (cls.id === tid) return true;
  if (typeof cls.id === 'string' && cls.id.startsWith(`${tid}_`)) return true;
  if (cls.entry && cls.entry.id === tid) return true;
  if (typeof cls.id === 'string' && cls.id.includes(tid)) return true;
  return false;
}

/** Remove dropped lessons from unpaid order line items; delete empty unpaid orders */
function pruneUnpaidOrdersAfterEnrollmentDrops(
  orders: any[],
  organizationId: string,
  studentId: string,
  dropped: { date: string; timetableEntryId: string }[]
): void {
  if (!dropped.length || !organizationId) return;
  for (const order of orders) {
    if (
      order.organizationId !== organizationId ||
      String(order.studentId) !== String(studentId) ||
      order.status !== 'unpaid'
    ) {
      continue;
    }
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items) {
      if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
      const oldLen = item.enrolledClasses.length;
      const oldPrice = Number(item.price) || 0;
      item.enrolledClasses = item.enrolledClasses.filter(
        (cls: any) => !dropped.some((enr) => classSlotMatchesDroppedEnrollment(cls, enr))
      );
      const newLen = item.enrolledClasses.length;
      if (newLen < oldLen && oldLen > 0) {
        if (newLen === 0) item.price = 0;
        else item.price = Math.round(((oldPrice * newLen) / oldLen) * 100) / 100;
      }
    }
    order.items = order.items.filter((it: any) => it.enrolledClasses && it.enrolledClasses.length > 0);
    order.totalAmount = order.items.reduce((s: number, it: any) => s + (Number(it.price) || 0), 0);
  }
  for (let i = orders.length - 1; i >= 0; i--) {
    const o = orders[i];
    if (
      o.organizationId === organizationId &&
      o.studentId === studentId &&
      o.status === 'unpaid' &&
      (!o.items || o.items.length === 0)
    ) {
      orders.splice(i, 1);
    }
  }
}

/** YYYY-MM-DD for comparisons (avoids lex bugs e.g. "2026-04-02T00:00:00.000Z" > "2026-04-16"). */
function toComparableYmd(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const head = s.split('T')[0].split(' ')[0];
  const m = head.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, '0');
  const d = m[3].padStart(2, '0');
  const out = `${y}-${mo}-${d}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
}

/** Merge new sales line items into an existing order (same productType + productData.id → combine classes + price). */
function mergeSalesOrderItems(existingItems: any[], appendItems: any[]): any[] {
  const items = JSON.parse(JSON.stringify(existingItems || []));
  const classKey = (c: any): string => {
    let d = '';
    if (c.dateString) d = String(c.dateString).split('T')[0].split(' ')[0];
    else if (c.date) {
      const raw = typeof c.date === 'string' ? c.date : new Date(c.date).toISOString();
      d = raw.split('T')[0].split(' ')[0];
    }
    return `${String(c.id)}|${d}`;
  };
  for (const newItem of appendItems) {
    const pt = newItem.productType;
    const pid = String(newItem.productData?.id ?? '');
    const idx = items.findIndex(
      (it: any) => it.productType === pt && String(it.productData?.id ?? '') === pid
    );
    if (idx === -1) {
      items.push(JSON.parse(JSON.stringify(newItem)));
      continue;
    }
    const cur = items[idx];
    const curClasses = cur.enrolledClasses || [];
    const addClasses = newItem.enrolledClasses || [];
    const seen = new Set(curClasses.map(classKey));
    for (const c of addClasses) {
      const k = classKey(c);
      if (!seen.has(k)) {
        curClasses.push(JSON.parse(JSON.stringify(c)));
        seen.add(k);
      }
    }
    cur.enrolledClasses = curClasses;
    cur.price = (Number(cur.price) || 0) + (Number(newItem.price) || 0);
  }
  return items;
}

function roundMoney(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/** Recorded payments on this order; legacy paid orders without the field = previously fully paid at totalAmount. */
function effectiveAmountPaid(order: any): number {
  if (order.amountPaid != null && Number.isFinite(Number(order.amountPaid))) {
    return roundMoney(Number(order.amountPaid));
  }
  if (order.status === 'paid') return roundMoney(Number(order.totalAmount) || 0);
  return 0;
}

/**
 * Split remaining balance due across order lines that have enrollments so per-lesson tier matches
 * (e.g. $1,800 left on 8 lessons → $225/lesson) for validateLessonQuotaForItems / applyLessonQuotaDeduction.
 */
function buildSyntheticQuotaItemsForBalance(order: any, balanceDue: number): any[] {
  const due = roundMoney(Number(balanceDue) || 0);
  if (due <= 0.005) return [];
  const items = order.items || [];
  const withClasses = items.filter(
    (it: any) => Array.isArray(it.enrolledClasses) && it.enrolledClasses.length > 0
  );
  quotaPayLog('buildSyntheticQuotaItemsForBalance: input', {
    balanceDue: due,
    orderLineCount: items.length,
    linesWithClasses: withClasses.length
  });
  if (withClasses.length === 0) return [];
  const subtotals = withClasses.map((it: any) => roundMoney(Number(it.price) || 0));
  const sumSub = roundMoney(subtotals.reduce((a: number, b: number) => a + b, 0));
  let allocated = 0;
  const out: any[] = [];
  for (let i = 0; i < withClasses.length; i++) {
    const it = withClasses[i];
    let lineDue: number;
    if (i === withClasses.length - 1) {
      lineDue = roundMoney(due - allocated);
    } else if (sumSub > 0.005) {
      lineDue = roundMoney((due * subtotals[i]) / sumSub);
    } else {
      lineDue = roundMoney(due / withClasses.length);
    }
    allocated = roundMoney(allocated + lineDue);
    if (lineDue > 0.005) {
      out.push({
        ...JSON.parse(JSON.stringify(it)),
        price: lineDue
      });
    }
  }
  quotaPayLog('buildSyntheticQuotaItemsForBalance: result', {
    balanceDue: due,
    inputLinesWithClasses: withClasses.length,
    syntheticLines: out.length,
    lines: out.map((x: any) => ({
      price: x.price,
      lessons: Array.isArray(x.enrolledClasses) ? x.enrolledClasses.length : 0,
      unitCents:
        Array.isArray(x.enrolledClasses) && x.enrolledClasses.length > 0
          ? Math.round(((Number(x.price) || 0) * 100) / x.enrolledClasses.length)
          : null
    }))
  });
  return out;
}

function validateLessonQuotaForItems(student: any, items: any[]): string | null {
  if (!student) {
    quotaPayLog('validateLessonQuotaForItems: FAIL no student record (readData)');
    return 'Student not found';
  }
  const q =
    student.lessonQuotaByCents && typeof student.lessonQuotaByCents === 'object'
      ? student.lessonQuotaByCents
      : {};
  const quotaKeysSnapshot = Object.keys(q).filter((k) => Number((q as any)[k]) > 0);
  const quotaBalances: Record<string, number> = {};
  for (const k of quotaKeysSnapshot) {
    quotaBalances[k] = Number((q as any)[k]) || 0;
  }
  quotaPayLog('validateLessonQuotaForItems: start', {
    itemCount: Array.isArray(items) ? items.length : 0,
    studentId: String(student.id ?? ''),
    quotaTiersWithBalance: quotaBalances
  });
  quotaPayVerbose('validateLessonQuotaForItems: raw items', {
    items: (items || []).map((it: any, i: number) => ({
      i,
      price: it?.price,
      classCount: Array.isArray(it?.enrolledClasses) ? it.enrolledClasses.length : 0
    }))
  });

  let linesWithClasses = 0;
  for (let i = 0; i < (items || []).length; i++) {
    const item = items[i];
    const classes = item.enrolledClasses;
    if (!Array.isArray(classes) || classes.length === 0) {
      quotaPayVerbose('validate: skip line (no enrolledClasses)', {
        lineIndex: i,
        price: item?.price
      });
      continue;
    }
    linesWithClasses += 1;
    const n = classes.length;
    const unitCents = Math.round(((Number(item.price) || 0) * 100) / n);
    if (!Number.isFinite(unitCents) || unitCents <= 0) {
      quotaPayLog('validate: FAIL invalid per-lesson tier', { lineIndex: i, price: item.price, n, unitCents });
      return 'Invalid line price for lesson quota (per-lesson amount must be positive)';
    }
    const key = String(unitCents);
    const have = Number((q as any)[key]) || 0;
    quotaPayLog('validate: line tier check', {
      lineIndex: i,
      n,
      linePrice: Number(item.price) || 0,
      unitCents,
      tierKey: key,
      tierDollarsPerLesson: (unitCents / 100).toFixed(2),
      quotaLessonsAvailable: have,
      ok: have >= n
    });
    if (have < n) {
      return `Insufficient lesson quota at $${(unitCents / 100).toFixed(2)}/lesson (need ${n}, have ${have})`;
    }
  }
  if (Array.isArray(items) && items.length > 0 && linesWithClasses === 0) {
    quotaPayLog('validate: FAIL no line had enrolledClasses (cannot infer per-lesson tier)');
    return 'Lesson quota payment requires class dates on order lines (no enrolledClasses found)';
  }
  quotaPayLog('validateLessonQuotaForItems: OK', { linesChecked: linesWithClasses });
  return null;
}

function applyLessonQuotaDeduction(student: any, items: any[]): void {
  if (!student) return;
  if (!student.lessonQuotaByCents || typeof student.lessonQuotaByCents !== 'object') {
    student.lessonQuotaByCents = {};
  }
  const q = student.lessonQuotaByCents;
  for (const item of items) {
    const classes = item.enrolledClasses;
    if (!Array.isArray(classes) || classes.length === 0) continue;
    const n = classes.length;
    const unitCents = Math.round(((Number(item.price) || 0) * 100) / n);
    const key = String(unitCents);
    const have = Number(q[key]) || 0;
    q[key] = Math.max(0, have - n);
  }
}

function syncEnrollmentsOrderIdFromOrder(order: any, enrollments: any[], timetableData: any): number {
  if (!order || !order.id || !order.items || !Array.isArray(order.items)) return 0;
  const studentId = order.studentId;
  const orderId = order.id;
  let updated = 0;
  for (const item of order.items) {
    if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
    for (const cls of item.enrolledClasses) {
      let entryId = cls.id;
      let entry = timetableData.entries.find((e: any) => e.id === entryId);
      if (!entry && typeof cls.id === 'string' && cls.id.includes('_')) {
        const lastUnderscoreIndex = cls.id.lastIndexOf('_');
        if (lastUnderscoreIndex > -1) {
          const potentialId = cls.id.substring(0, lastUnderscoreIndex);
          const potentialEntry = timetableData.entries.find((e: any) => e.id === potentialId);
          if (potentialEntry) {
            entry = potentialEntry;
            entryId = potentialId;
          }
        }
      }
      if (!entry) continue;
      let dateStr: string;
      if (cls.dateString) dateStr = String(cls.dateString).split('T')[0].split(' ')[0];
      else dateStr = new Date(cls.date).toISOString().split('T')[0];
      const ex = enrollments.find(
        (e: any) =>
          String(e.studentId) === String(studentId) &&
          e.timetableEntryId === entry.id &&
          String(e.date).split('T')[0].split(' ')[0] === dateStr
      );
      if (ex && (!ex.orderId || String(ex.orderId).trim() === '')) {
        ex.orderId = orderId;
        updated++;
      }
    }
  }
  if (updated > 0) {
    quotaPayLog('syncEnrollmentsOrderIdFromOrder: linked', { orderId: String(orderId), updated });
  }
  return updated;
}

function pushEnrollmentsFromItems(
  orderId: string,
  studentId: string,
  items: any[],
  enrollments: any[],
  timetableData: any,
  organizationId: string
): void {
  for (const item of items) {
    if (!item.enrolledClasses || !Array.isArray(item.enrolledClasses)) continue;
    for (const cls of item.enrolledClasses) {
      let entryId = cls.id;
      let entry = timetableData.entries.find((e: any) => e.id === entryId);
      if (!entry && typeof cls.id === 'string' && cls.id.includes('_')) {
        const lastUnderscoreIndex = cls.id.lastIndexOf('_');
        if (lastUnderscoreIndex > -1) {
          const potentialId = cls.id.substring(0, lastUnderscoreIndex);
          const potentialEntry = timetableData.entries.find((e: any) => e.id === potentialId);
          if (potentialEntry) {
            entry = potentialEntry;
            entryId = potentialId;
          }
        }
      }

      console.log(`[DEBUG] Processing Item Class ID: ${cls.id}, Resolved EntryID: ${entryId}, Entry Found: ${!!entry}`);

      if (entry) {
        console.log(`[DEBUG] Entry Found: ${entry.className}, isRecurring: ${entry.isRecurring}`);
        let dateStr: string;
        if (cls.dateString) {
          dateStr = cls.dateString;
        } else {
          dateStr = new Date(cls.date).toISOString().split('T')[0];
        }
        console.log(`[DEBUG] Processing enrollment for date ${dateStr}`);
        const exists = enrollments.find(
          (e: any) =>
            e.studentId === studentId && e.timetableEntryId === entry.id && e.date === dateStr
        );
        if (!exists) {
          console.log(`[DEBUG] Adding new enrollment for entry ${entry.id} on ${dateStr}`);
          enrollments.push({
            id: `enr_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            organizationId,
            studentId,
            timetableEntryId: entry.id,
            date: dateStr,
            type: 'single',
            orderId
          });
        } else {
          console.log(`[DEBUG] Enrollment already exists for entry ${entry.id} on ${dateStr}`);
          if (orderId && (!exists.orderId || String(exists.orderId).trim() === '')) {
            exists.orderId = orderId;
            quotaPayLog('pushEnrollments: backfilled orderId on existing enrollment', {
              enrollmentId: exists.id,
              orderId: String(orderId)
            });
          }
        }
      } else {
        console.log(`[DEBUG] Timetable Entry NOT FOUND for ID: ${entryId} (Original: ${cls.id})`);
      }
    }
  }
}

module.exports = {
  quotaPayLog,
  quotaPayVerbose,
  appendEnrollmentDropLog,
  classSlotMatchesDroppedEnrollment,
  pruneUnpaidOrdersAfterEnrollmentDrops,
  toComparableYmd,
  mergeSalesOrderItems,
  roundMoney,
  effectiveAmountPaid,
  buildSyntheticQuotaItemsForBalance,
  validateLessonQuotaForItems,
  applyLessonQuotaDeduction,
  syncEnrollmentsOrderIdFromOrder,
  pushEnrollmentsFromItems
};
export {};
