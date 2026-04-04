/**
 * V.Chess invoice text → row fields. Used by CLI and tests; keep browser HTML in sync.
 */

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

/** Prefer table row where unit × qty ≈ line total (avoids wrong $ triplets from PDF text order). */
export function pickBestPriceQtyTotalTriplet(head: string): RegExpExecArray | null {
  const tripletRe = /\$\s*([\d,]+\.?\d*)\s+(\d+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/gi;
  const candidates: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = tripletRe.exec(head)) !== null) {
    candidates.push(m);
  }
  if (candidates.length === 0) return null;

  function score(c: RegExpExecArray): number {
    const a = parseFloat(c[1].replace(/,/g, ''));
    const b = parseFloat(c[2].replace(/,/g, ''));
    const d = parseFloat(c[3].replace(/,/g, ''));
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(d)) return -1;
    if (b < 0.5 || b > 500) return -1;
    const expected = a * b;
    const err = Math.abs(expected - d);
    const rel = d > 0 ? err / d : err;
    if (rel > 0.08 && err > 1) return -1;
    const positionBonus = (c.index ?? 0) * 1e-6;
    return 1000 - rel * 100 + positionBonus;
  }

  let best: RegExpExecArray | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const s = score(c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best ?? candidates[candidates.length - 1];
}

function cleanItemDescriptionRaw(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:.*?\bItem\s+Description\b\s*)+/i, '');
  s = s.replace(/^(?:.*?\bPrice\b\s+\bQuantity\b\s+\bTotal\b\s*)+/i, '');
  s = s.replace(/^(?:.*?\bTotal\s+Price\b\s*)+/i, '');
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
  if (!itemDescription) return out;

  let work = itemDescription.replace(/\s+/g, ' ').trim();

  const teachEnd = work.match(/\bTeacher\s*:?\s*(.+)$/i);
  if (teachEnd && teachEnd.index !== undefined) {
    out.teacher = teachEnd[1].trim();
    work = work.slice(0, teachEnd.index).trim();
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

  const invoiceDate =
    normalized.match(/\bDate\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/i)?.[1] ?? null;

  const toMatch = full.match(/To:\s*([\s\S]*?)\s*\(\s*([^)]+?)\s*\)/i);
  let customerName = toMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  let customerId = toMatch?.[2]?.trim() ?? null;
  if (
    customerName &&
    (/^(total|price|quantity)$/i.test(customerName) ||
      /\btotal\s+price\b/i.test(customerName) ||
      /^price\b/i.test(customerName.trim()))
  ) {
    customerName = null;
    customerId = null;
  }

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
  const last = pickBestPriceQtyTotalTriplet(head);

  let unitPrice: string | null = null;
  let quantity: string | null = null;
  let lineTotal: string | null = null;
  if (last) {
    unitPrice = last[1];
    quantity = last[2];
    lineTotal = last[3];
  }

  let itemDescription: string | null = null;
  const descStart = head.search(/item\s+description/i);
  if (descStart >= 0 && last && last.index !== undefined) {
    const afterHeader = head.slice(descStart);
    const cutAt = afterHeader.lastIndexOf(last[0]);
    const cut = cutAt >= 0 ? afterHeader.slice(0, cutAt) : afterHeader;
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
  if (!last) notes.push('no price/qty/line row matched — check PDF text order');

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
