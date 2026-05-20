import type { InvoiceRow } from './types';
import { extractInvoiceCustomer, parseDescriptionDetail, cleanItemDescriptionRaw } from './description';
import { pickBestInvoiceMoneyTriplet, findLastMoneyTripletSliceIndex } from './money';

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

/** Row ready for Sales / V.Chess apply: student id + class/time/dates signal, no parse warnings. */
export function isCleanInvoiceRow(r: InvoiceRow): boolean {
  if (r.parse_note) return false;
  if (!String(r.customer_id || '').trim()) return false;
  const hasSchedule =
    String(r.course_name || '').trim() ||
    String(r.schedule_time || '').trim() ||
    String(r.schedule_dates || '').trim();
  if (!hasSchedule) return false;
  return true;
}

export function compareInvoiceRowsNeat(a: InvoiceRow, b: InvoiceRow): number {
  const sfile = (a.source_file || '').localeCompare(b.source_file || '');
  if (sfile !== 0) return sfile;
  const cid = (a.customer_id || '').localeCompare(b.customer_id || '');
  if (cid !== 0) return cid;
  const inv = (a.invoice_no || '').localeCompare(b.invoice_no || '');
  if (inv !== 0) return inv;
  return String(a.invoice_date || '').localeCompare(String(b.invoice_date || ''));
}

export const SALES_EXPORT_ISSUE_EXTRA_HEADERS = ['source_file', 'parse_note'] as const;
