import {
  expandVchessScheduleDatesToYmd,
  extractDefaultYearFromInvoiceDate
} from '@student-scoring/core';
import type { InvoiceRow, InvoiceXlsxExportRow } from './types';

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
  'Local name',
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
    '',
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
