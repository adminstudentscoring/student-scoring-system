/**
 * V.Chess invoice PDF(s) → Excel matching Settings → Sales enrollment export (11 columns).
 *
 * Output workbook:
 *   - "Sales export" — rows that pass validation (sorted: file, student id, invoice no)
 *   - "Needs review" — parse warnings / PDF read placeholders (+ source_file, parse_note)
 *
 * Damaged PDFs: pdf-parse may fail; install `pip3 install --user pypdf` for Python fallback.
 *
 * Usage:
 *   pnpm invoice-pdf-to-sales-xlsx <output.xlsx> <a.pdf> [b.pdf ...]
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import {
  compareInvoiceRowsNeat,
  isCleanInvoiceRow,
  invoiceRowToSalesEnrollmentExportRow,
  pageLooksLikeInvoice,
  parseInvoiceText,
  SALES_ENROLLMENT_EXPORT_HEADERS,
  SALES_EXPORT_ISSUE_EXTRA_HEADERS,
  splitPageTextIntoInvoiceSegments,
  type InvoiceRow
} from './lib/vchess-invoice-parse';
import { readPdfPageTexts } from './lib/readPdfPageTexts';

function emptyInvoiceRow(source: string, note: string): InvoiceRow {
  return {
    source_file: source,
    invoice_no: null,
    invoice_date: null,
    student_display: null,
    customer_name: null,
    customer_id: null,
    course_name: null,
    schedule_time: null,
    schedule_dates: null,
    lesson_date_count: null,
    teacher: null,
    item_description: null,
    unit_price: null,
    quantity: null,
    line_total: null,
    subtotal: null,
    total: null,
    amount_paid: null,
    amount_due: null,
    fps_number: null,
    payee_name: null,
    quantity_vs_dates_note: null,
    parse_note: note
  };
}

async function parsePdfToInvoiceRows(pdfPath: string): Promise<InvoiceRow[]> {
  const base = path.basename(pdfPath);
  const rows: InvoiceRow[] = [];
  const pageTexts = await readPdfPageTexts(pdfPath);
  const anyText = pageTexts.some((t) => t.trim());
  if (!anyText) {
    rows.push(
      emptyInvoiceRow(
        base,
        'empty PDF text — likely scanned image; use OCR or export as text PDF'
      )
    );
    return rows;
  }

  let added = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    const t = pageTexts[i];
    if (!t.trim()) continue;
    const segments = splitPageTextIntoInvoiceSegments(t);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (seg.length < 25) continue;
      if (!pageLooksLikeInvoice(seg) && !/\bINV-[\dA-Za-z-]+\b/i.test(seg)) continue;
      const label =
        segments.length > 1 ? `${base} · p${i + 1}·${si + 1}` : `${base} · p${i + 1}`;
      rows.push(parseInvoiceText(seg, label));
      added++;
    }
  }

  if (added === 0) {
    const merged = pageTexts.join('\n\n----\n\n');
    rows.push(parseInvoiceText(merged, base));
  }

  return rows;
}

const COL_WIDTHS = [
  { wch: 18 },
  { wch: 14 },
  { wch: 14 },
  { wch: 12 },
  { wch: 24 },
  { wch: 22 },
  { wch: 14 },
  { wch: 18 },
  { wch: 44 },
  { wch: 8 },
  { wch: 24 },
  { wch: 28 },
  { wch: 56 }
];

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  if (argv.length < 2) {
    console.error(
      'Usage: pnpm invoice-pdf-to-sales-xlsx <output.xlsx> <invoice1.pdf> [invoice2.pdf ...]\n' +
        '  Sheets: "Sales export" (clean rows), "Needs review" (issues + diagnostics).'
    );
    process.exit(1);
  }

  const outPath = path.resolve(argv[0]);
  const pdfArgs = argv.slice(1);
  const pdfs = pdfArgs
    .map((p) => path.resolve(p))
    .filter((p) => p.toLowerCase().endsWith('.pdf'));

  if (pdfs.length === 0) {
    console.error('No PDF paths after output file. Provide at least one .pdf');
    process.exit(1);
  }

  const invoiceRows: InvoiceRow[] = [];
  for (const pdf of pdfs) {
    if (!fs.existsSync(pdf)) {
      console.error(`Missing file: ${pdf}`);
      process.exit(1);
    }
    try {
      const part = await parsePdfToInvoiceRows(pdf);
      invoiceRows.push(...part);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`PDF skipped (read error): ${pdf}\n  ${msg}`);
      invoiceRows.push(emptyInvoiceRow(path.basename(pdf), `PDF read failed: ${msg}`));
    }
  }

  const sortedAll = [...invoiceRows].sort(compareInvoiceRowsNeat);
  const cleanRows = sortedAll.filter(isCleanInvoiceRow);
  const issueRows = sortedAll.filter((r) => !isCleanInvoiceRow(r));

  const cleanAoa: (string | number)[][] = [
    [...SALES_ENROLLMENT_EXPORT_HEADERS],
    ...cleanRows.map(invoiceRowToSalesEnrollmentExportRow)
  ];
  const issueAoa: (string | number)[][] = [
    [...SALES_ENROLLMENT_EXPORT_HEADERS, ...SALES_EXPORT_ISSUE_EXTRA_HEADERS],
    ...issueRows.map((r) => [
      ...invoiceRowToSalesEnrollmentExportRow(r),
      r.source_file,
      r.parse_note || ''
    ])
  ];

  const wsClean = XLSX.utils.aoa_to_sheet(cleanAoa);
  wsClean['!cols'] = COL_WIDTHS.slice(0, 11);
  const wsIssues = XLSX.utils.aoa_to_sheet(issueAoa);
  wsIssues['!cols'] = COL_WIDTHS;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsClean, 'Sales export');
  XLSX.utils.book_append_sheet(wb, wsIssues, 'Needs review');
  XLSX.writeFile(wb, outPath);

  console.log(
    `Wrote "${path.basename(outPath)}": ${cleanRows.length} clean row(s), ${issueRows.length} need review (from ${invoiceRows.length} parsed, ${pdfs.length} PDF(s))`
  );
  if (issueRows.length > 0 && issueRows.length <= 30) {
    for (const r of issueRows) {
      if (r.parse_note) {
        console.warn(`  [${r.source_file}] ${r.parse_note}`);
      }
    }
  } else if (issueRows.length > 30) {
    console.warn(`  (${issueRows.length} issue rows — see "Needs review" sheet)`);
  }
}

void main();
