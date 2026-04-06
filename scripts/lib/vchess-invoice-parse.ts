/**
 * V.Chess invoice text → row fields. Used by CLI and tests; keep browser HTML in sync.
 * Schedule date expansion lives in @student-scoring/core (single source of truth for import apply).
 */
import {
  expandVchessScheduleDatesToYmd,
  extractDefaultYearFromInvoiceDate,
  utcYmdToEnglishDow
} from '@student-scoring/core';

export { expandVchessScheduleDatesToYmd, extractDefaultYearFromInvoiceDate, utcYmdToEnglishDow };

export type InvoiceRow = {
  source_file: string;
  invoice_no: string | null;
  invoice_date: string | null;
  student_display: string | null;
  customer_name: string | null;
  customer_id: string | null;
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  lesson_date_count: number | null;
  teacher: string | null;
  item_description: string | null;
  unit_price: string | null;
  quantity: string | null;
  line_total: string | null;
  subtotal: string | null;
  total: string | null;
  amount_paid: string | null;
  amount_due: string | null;
  fps_number: string | null;
  payee_name: string | null;
  quantity_vs_dates_note: string | null;
  parse_note: string | null;
};

/** Columns written to PDF→Excel only (11 fields); parsing still fills full `InvoiceRow`. */
export type InvoiceXlsxExportRow = {
  student_name: string | null;
  student_id: string | null;
  teacher: string | null;
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  unit_price: string | null;
  quantity: string | null;
  line_total: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
};

export function toInvoiceXlsxExportRow(row: InvoiceRow): InvoiceXlsxExportRow {
  return {
    student_name: row.customer_name,
    student_id: row.customer_id,
    teacher: row.teacher,
    course_name: row.course_name,
    schedule_time: row.schedule_time,
    schedule_dates: row.schedule_dates,
    unit_price: row.unit_price,
    quantity: row.quantity,
    line_total: row.line_total,
    invoice_no: row.invoice_no,
    invoice_date: row.invoice_date
  };
}

/** Same column order as browser Settings → Sales enrollment Excel export. */
export const SALES_ENROLLMENT_EXPORT_HEADERS = [
  'Student Name',
  'Student ID',
  'Account Balance',
  'Lesson Quota',
  'Class Name',
  'Time Slot',
  'Teacher',
  'Enrolled Dates',
  'Date Count',
  'Order ID'
] as const;

function normalizeTimeSlotForSalesExport(slot: string | null | undefined): string {
  if (!slot) return '';
  const m = String(slot).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (m) return `${m[1]} - ${m[2]}`;
  return String(slot).trim();
}

/**
 * Map parsed invoice row → Sales export sheet row (matches `sales-enrollment-export-*.xlsx`).
 * Account Balance uses invoice AMOUNT DUE when present (not student wallet — PDF has no wallet).
 */
export function invoiceRowToSalesEnrollmentExportRow(row: InvoiceRow): (string | number)[] {
  const defaultYear = extractDefaultYearFromInvoiceDate(row.invoice_date);
  const ymds = expandVchessScheduleDatesToYmd(row.schedule_dates, defaultYear);
  const datesStr = ymds.join(', ');
  const countFromYmd = ymds.length;
  const count =
    row.lesson_date_count != null && Number.isFinite(Number(row.lesson_date_count))
      ? Number(row.lesson_date_count)
      : countFromYmd;

  let balance = '0.00';
  if (row.amount_due != null && String(row.amount_due).trim() !== '') {
    const n = parseFloat(String(row.amount_due).replace(/,/g, ''));
    if (Number.isFinite(n)) balance = n.toFixed(2);
  }

  const name = (row.customer_name ?? row.student_display ?? '').trim();
  const sid = (row.customer_id ?? '').trim();

  return [
    name,
    sid,
    balance,
    'No quota credit',
    (row.course_name ?? '').trim(),
    normalizeTimeSlotForSalesExport(row.schedule_time),
    (row.teacher ?? '').trim(),
    datesStr,
    count,
    (row.invoice_no ?? '').trim()
  ];
}

export type InvoiceMoneyTriplet = {
  /** Matched substring (for slicing item description). */
  raw: string;
  index: number;
  unitPrice: string;
  quantity: string;
  lineTotal: string;
};

function scoreUnitQtyTotal(unit: number, qty: number, total: number): number {
  if (!Number.isFinite(unit) || !Number.isFinite(qty) || !Number.isFinite(total)) return -1;
  if (qty < 0 || qty > 500) return -1;
  if (unit < 0 || unit > 1e7) return -1;
  const expected = unit * qty;
  const err = Math.abs(expected - total);
  const rel = total !== 0 ? err / Math.abs(total) : err;
  if (rel > 0.08 && err > 1) return -1;
  return 1000 - rel * 100;
}

/** After-discount lines: total ≤ unit×qty (e.g. 1×1000 with 10% off → 900). */
function scoreUnitQtyTotalDiscounted(unit: number, qty: number, total: number): number {
  if (!Number.isFinite(unit) || !Number.isFinite(qty) || !Number.isFinite(total)) return -1;
  if (qty < 0 || qty > 500 || unit < 0 || total < 0) return -1;
  if (total > unit * qty + 0.05) return -1;
  const expected = unit * qty;
  if (expected < 1e-6) return total < 0.01 ? 400 : -1;
  const rel = Math.abs(expected - total) / expected;
  if (rel > 0.55) return -1;
  return 550 - rel * 100;
}

/**
 * PDF table row is either `$unit qty $total` or `qty $unit $total` (common in V.Chess exports).
 * Picks the match where unit × qty ≈ line total.
 */
function collectMoneyTriplets(
  head: string,
  scoreFn: (u: number, q: number, t: number) => number
): InvoiceMoneyTriplet[] {
  const out: InvoiceMoneyTriplet[] = [];
  const rePriceFirst = /\$\s*([\d,]+\.?\d*)\s+(\d+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = rePriceFirst.exec(head)) !== null) {
    const unit = parseFloat(m[1].replace(/,/g, ''));
    const qty = parseFloat(m[2].replace(/,/g, ''));
    const total = parseFloat(m[3].replace(/,/g, ''));
    if (scoreFn(unit, qty, total) < 0) continue;
    out.push({
      raw: m[0],
      index: m.index,
      unitPrice: m[1],
      quantity: m[2],
      lineTotal: m[3]
    });
  }
  const reQtyFirst = /(\d+\.?\d*)\s+\$\s*([\d,]+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/g;
  while ((m = reQtyFirst.exec(head)) !== null) {
    const qty = parseFloat(m[1].replace(/,/g, ''));
    const unit = parseFloat(m[2].replace(/,/g, ''));
    const total = parseFloat(m[3].replace(/,/g, ''));
    if (scoreFn(unit, qty, total) < 0) continue;
    out.push({
      raw: m[0],
      index: m.index,
      unitPrice: m[2],
      quantity: m[1],
      lineTotal: m[3]
    });
  }
  return out;
}

export function pickBestInvoiceMoneyTriplet(head: string): InvoiceMoneyTriplet | null {
  let candidates = collectMoneyTriplets(head, scoreUnitQtyTotal);
  if (candidates.length === 0) {
    candidates = collectMoneyTriplets(head, scoreUnitQtyTotalDiscounted);
  }
  if (candidates.length === 0) return null;

  function rank(c: InvoiceMoneyTriplet): number {
    const u = parseFloat(c.unitPrice.replace(/,/g, ''));
    const q = parseFloat(c.quantity.replace(/,/g, ''));
    const t = parseFloat(c.lineTotal.replace(/,/g, ''));
    let sc = scoreUnitQtyTotal(u, q, t);
    if (sc < 0) sc = scoreUnitQtyTotalDiscounted(u, q, t);
    return sc + c.index * 1e-6;
  }

  let best = candidates[0];
  let bestScore = rank(best);
  for (let i = 1; i < candidates.length; i++) {
    const sc = rank(candidates[i]);
    if (sc > bestScore) {
      bestScore = sc;
      best = candidates[i];
    }
  }
  return best;
}

/**
 * @deprecated Prefer pickBestInvoiceMoneyTriplet — kept for tests; returns exec array [full, unit, qty, total].
 */
export function pickBestPriceQtyTotalTriplet(head: string): RegExpExecArray | null {
  const t = pickBestInvoiceMoneyTriplet(head);
  if (!t) return null;
  const fake = [t.raw, t.unitPrice, t.quantity, t.lineTotal] as unknown as RegExpExecArray;
  fake.index = t.index;
  return fake;
}

/** Last index of money triplet in PDF text (tabs/newlines vs spaces differ from triplet.raw). */
export function findLastMoneyTripletSliceIndex(haystack: string, tripletRaw: string): number {
  const direct = haystack.lastIndexOf(tripletRaw);
  if (direct >= 0) return direct;
  const tokens = tripletRaw.trim().match(/\S+/g);
  if (!tokens || tokens.length < 3) return -1;
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = tokens.map(esc).join('\\s+');
  const re = new RegExp(pattern, 'gi');
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) {
    last = m.index;
  }
  return last;
}

/** Extract customer name + id when `To:` is empty and name is on the line after `Date:`. */
export function extractInvoiceCustomer(full: string): {
  customerName: string | null;
  customerId: string | null;
} {
  let customerName: string | null = null;
  let customerId: string | null = null;

  const toLine = full.match(/(?:^|\n)\s*To:\s*([^\n]*)/im);
  if (toLine) {
    const rest = (toLine[1] || '').trim();
    if (rest.length > 0) {
      const paren = rest.match(/^(.+?)\s*\(\s*([^)]+?)\s*\)\s*$/);
      if (paren) {
        customerName = paren[1].replace(/\s+/g, ' ').trim();
        customerId = paren[2].trim();
      }
    }
  }

  if (!customerName || !customerId) {
    const afterDate = full.match(
      /\bDate\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\s*\r?\n\s*([^\n(]+?)\s*\(\s*([A-Za-z]?\d{3,})\s*\)/im
    );
    if (afterDate) {
      customerName = afterDate[1].replace(/\s+/g, ' ').trim();
      customerId = afterDate[2].trim();
    }
  }

  if (!customerName || !customerId) {
    const oneLine = full.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ');
    const inline = oneLine.match(
      /\bDate\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\s+(.{1,120}?)\s*\(\s*([A-Za-z]?\d{3,})\s*\)/i
    );
    if (inline) {
      customerName = inline[1].replace(/\s+/g, ' ').trim();
      customerId = inline[2].trim();
    }
  }

  if (!customerName || !customerId) {
    const legacy = full.match(/To:\s*([\s\S]*?)\s*\(\s*([^)]+?)\s*\)/i);
    if (legacy) {
      const candName = legacy[1]?.replace(/\s+/g, ' ').trim() ?? '';
      if (
        candName &&
        candName.length <= 120 &&
        !/\bTotal\s+Price\b/i.test(candName) &&
        !/\bItem\s+Description\b/i.test(candName) &&
        !/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(candName)
      ) {
        customerName = candName;
        customerId = legacy[2].trim();
      }
    }
  }

  if (customerName && /^(total|price|quantity)$/i.test(customerName)) {
    customerName = null;
    customerId = null;
  }
  if (customerName && (/\btotal\s+price\b/i.test(customerName) || /^price\b/i.test(customerName.trim()))) {
    customerName = null;
    customerId = null;
  }

  return { customerName, customerId };
}

function cleanItemDescriptionRaw(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:.*?\bItem\s+Description\b\s*)+/i, '');
  s = s.replace(/^(?:.*?\bPrice\b\s+\bQuantity\b\s+\bTotal\b\s*)+/i, '');
  s = s.replace(/^(?:.*?\bTotal\s+Price\b\s*)+/i, '');
  s = s.replace(/^\s*Quantity\s+/i, '');
  s = s.replace(/^\s*Total\s+Price\s+/i, '');
  return s.trim();
}

export function parseDescriptionDetail(
  itemDescription: string | null,
  teacherFromDocument: string | null
): {
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  lesson_date_count: number | null;
  teacher: string | null;
} {
  const out = {
    course_name: null as string | null,
    schedule_time: null as string | null,
    schedule_dates: null as string | null,
    lesson_date_count: null as number | null,
    teacher: teacherFromDocument
  };
  if (!itemDescription) {
    if (
      teacherFromDocument &&
      teacherFromDocument.length > 40 &&
      /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(teacherFromDocument)
    ) {
      return parseDescriptionDetail(teacherFromDocument, null);
    }
    return out;
  }

  let work = itemDescription.replace(/\s+/g, ' ').trim();

  /**
   * PDFs often emit "Teacher: Duck Duck Sir Elite Class 19:00-20:30 (...)" on one line.
   * A trailing-only Teacher regex would put the entire string in teacher and clear work.
   */
  if (/^\s*Teacher\s*:?\s*/i.test(work)) {
    work = work.replace(/^\s*Teacher\s*:?\s*/i, '');
    const stopRe =
      /\b(?:Chess|Elite|Beginner|Advanced|Private|Primary|Intermediate|Group|December|lesson|class)\b|[\u4e00-\u9fff]{2,}|\d{1,2}:\d{1,2}|-\s*(?:Old\s+Student|Discount)/i;
    const stop = work.search(stopRe);
    if (stop > 0) {
      out.teacher = work.slice(0, stop).trim();
      work = work.slice(stop).trim();
    } else if (work.length > 0 && work.length <= 80) {
      out.teacher = work.trim();
      work = '';
    }
  } else {
    const teachEnd = work.match(/\bTeacher\s*:?\s*(.+)$/i);
    if (teachEnd && teachEnd.index !== undefined && teachEnd.index > 0) {
      out.teacher = teachEnd[1].trim();
      work = work.slice(0, teachEnd.index).trim();
    }
  }

  const timeM = work.match(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/);
  if (timeM) {
    out.schedule_time = timeM[1].replace(/\s/g, '');
  }

  let bestInner: string | null = null;
  let bestN = 0;
  const parenRe = /\(([^)]+)\)/g;
  let pm: RegExpExecArray | null;
  while ((pm = parenRe.exec(work)) !== null) {
    const inner = pm[1];
    const dates = inner.match(/\d{1,2}\/\d{1,2}/g);
    const n = dates?.length ?? 0;
    if (n > bestN || (n === bestN && n > 0 && inner.length > (bestInner?.length ?? 0))) {
      bestN = n;
      bestInner = inner;
    }
  }
  if (bestInner && bestN > 0) {
    out.schedule_dates = bestInner;
    out.lesson_date_count = bestN;
  }

  let course_name: string | null = null;
  if (timeM && timeM.index !== undefined) {
    course_name = work.slice(0, timeM.index).replace(/\s+/g, ' ').trim();
  } else if (bestInner !== null) {
    const idx = work.indexOf('(');
    course_name = (idx >= 0 ? work.slice(0, idx) : work).replace(/\s+/g, ' ').trim();
  } else {
    course_name = work.trim();
  }

  course_name = course_name
    .replace(/^[\s\S]*?item\s+description\s*/i, '')
    .replace(/^\s*quantity\s+/i, '')
    .replace(/^\s*total\s+price\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  out.course_name = course_name || null;

  return out;
}

/**
 * One PDF page may contain two invoices (two-column layout). Split when there are
 * two `No.: INV-…` blocks or two `To:` lines at line starts (text order: often
 * left column then right).
 */
export function splitPageTextIntoInvoiceSegments(pageText: string): string[] {
  const t = pageText.replace(/\r\n/g, '\n');
  if (!t.trim()) return [];

  const noLineRe = /(?:^|\n)\s*No\.?\s*:\s*(INV-[\dA-Za-z-]+)/gim;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = noLineRe.exec(t)) !== null) {
    starts.push(m.index);
  }
  if (starts.length >= 2) {
    const parts: string[] = [];
    for (let i = 0; i < starts.length; i++) {
      parts.push(t.slice(starts[i], starts[i + 1] ?? t.length).trim());
    }
    return parts.filter((p) => p.length > 25);
  }

  const toRe = /(?:^|\n)\s*To:\s*/gim;
  const toStarts: number[] = [];
  while ((m = toRe.exec(t)) !== null) {
    toStarts.push(m.index);
  }
  if (toStarts.length >= 2) {
    const parts: string[] = [];
    for (let i = 0; i < toStarts.length; i++) {
      parts.push(t.slice(toStarts[i], toStarts[i + 1] ?? t.length).trim());
    }
    return parts.filter((p) => p.length > 25);
  }

  return [t.trim()];
}

export function pageLooksLikeInvoice(text: string): boolean {
  const t = text || '';
  if (!t.trim()) return false;
  if (/\bINV-[\dA-Za-z-]+\b/.test(t)) return true;
  if (/\bTo:\s*[\s\S]{0,240}\(\s*[A-Za-z]?\d{3,}\s*\)/i.test(t)) return true;
  if (/\bChess\s+lesson\b/i.test(t) && /\bSubtotal\b/i.test(t)) return true;
  return false;
}

export function parseInvoiceText(fullRaw: string, sourceFile: string): InvoiceRow {
  const full = fullRaw.replace(/\r\n/g, '\n');
  const normalized = full.replace(/[ \t]+/g, ' ');

  const invoiceNo =
    normalized.match(/\bNo\.?\s*:?\s*(INV-[\dA-Za-z-]+)\b/i)?.[1] ??
    normalized.match(/\b(INV-[\dA-Za-z-]+)\b/)?.[1] ??
    null;

  const oneLineForDate = full.replace(/[\r\n]+/g, ' ').replace(/[ \t]+/g, ' ');
  const invoiceDate =
    normalized.match(/\bDate\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/i)?.[1] ??
    oneLineForDate.match(/\bDate\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/i)?.[1] ??
    null;

  const { customerName: cn, customerId: cid } = extractInvoiceCustomer(full);
  let customerName = cn;
  let customerId = cid;

  const teacherLine = full.match(/Teacher\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? null;

  const subtotalM = normalized.match(/\bSubtotal\s*:?\s*\$?\s*([\d,]+\.?\d*)\b/i);
  const totalM = normalized.match(/\bTOTAL\s*:?\s*\$?\s*([\d,]+\.?\d*)\b/i);
  const subtotal = subtotalM?.[1] ?? null;
  const total = totalM?.[1] ?? null;

  const amountPaidM = normalized.match(/\bLess\s+Amount\s+Paid\s*:?\s*\$?\s*([\d,]+\.?\d*)\b/i);
  const amountDueM = normalized.match(/\bAMOUNT\s+DUE\s*:?\s*\$?\s*([\d,]+\.?\d*)\b/i);
  const amount_paid = amountPaidM?.[1] ?? null;
  const amount_due = amountDueM?.[1] ?? null;

  const fpsNumber =
    normalized.match(/FPS[^\d]{0,80}?(\d{7,12})\b/i)?.[1] ??
    normalized.match(/\b(\d{8})\b[^\d]{0,40}Wong/i)?.[1] ??
    null;

  const payeeName =
    full.match(/Account Name\s*:?\s*([^\n]+)/i)?.[1]?.trim() ??
    normalized.match(/Account Name\s*:?\s*([^.\n]+?)(?:\.|Tuition|$)/i)?.[1]?.trim() ??
    null;

  const subIdx = full.search(/\bsubtotal\b/i);
  const head = subIdx >= 0 ? full.slice(0, subIdx) : full;
  const triplet = pickBestInvoiceMoneyTriplet(head);

  let unitPrice: string | null = null;
  let quantity: string | null = null;
  let lineTotal: string | null = null;
  if (triplet) {
    unitPrice = triplet.unitPrice;
    quantity = triplet.quantity;
    lineTotal = triplet.lineTotal;
  }

  let itemDescription: string | null = null;
  const descStart = head.search(/item\s+description/i);
  if (descStart >= 0) {
    const afterHeader = head.slice(descStart);
    let cut = afterHeader;
    if (triplet) {
      const cutAt = findLastMoneyTripletSliceIndex(afterHeader, triplet.raw);
      if (cutAt >= 0) cut = afterHeader.slice(0, cutAt);
    }
    itemDescription = cleanItemDescriptionRaw(cut).slice(0, 4000) || null;
  }

  const detail = parseDescriptionDetail(itemDescription, teacherLine);

  const student_display =
    customerName && customerId
      ? `${customerName} (${customerId})`
      : customerName || customerId || null;

  let quantity_vs_dates_note: string | null = null;
  if (detail.lesson_date_count != null && quantity != null) {
    const q = parseFloat(String(quantity).replace(/,/g, ''));
    if (!Number.isNaN(q) && Math.abs(q - detail.lesson_date_count) > 0.01) {
      quantity_vs_dates_note = `括號內日期數 ${detail.lesson_date_count} 與 Quantity ${quantity} 不一致 · date count vs qty mismatch`;
    }
  }

  const notes: string[] = [];
  if (!invoiceNo) notes.push('missing invoice number');
  if (!total && !subtotal) notes.push('missing totals');
  if (!triplet) notes.push('no price/qty/line row matched — check PDF text order');

  return {
    source_file: sourceFile,
    invoice_no: invoiceNo,
    invoice_date: invoiceDate,
    student_display,
    customer_name: customerName,
    customer_id: customerId,
    course_name: detail.course_name,
    schedule_time: detail.schedule_time,
    schedule_dates: detail.schedule_dates,
    lesson_date_count: detail.lesson_date_count,
    teacher: detail.teacher,
    item_description: itemDescription,
    unit_price: unitPrice,
    quantity,
    line_total: lineTotal,
    subtotal,
    total,
    amount_paid,
    amount_due,
    fps_number: fpsNumber,
    payee_name: payeeName,
    quantity_vs_dates_note,
    parse_note: notes.length ? notes.join('; ') : null
  };
}
