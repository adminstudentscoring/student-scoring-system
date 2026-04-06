/**
 * V.Chess invoice PDF(s) → Excel in the same shape as Settings → Sales enrollment export
 * (see `sales-enrollment-export-*.xlsx`: 10 columns, sheet "Sales export").
 *
 * Usage:
 *   pnpm invoice-pdf-to-sales-xlsx <output.xlsx> <a.pdf> [b.pdf ...]
 *   pnpm invoice-pdf-to-sales-xlsx <output.xlsx>   (reads all .pdf from cwd — rarely useful)
 *
 * Example:
 *   pnpm invoice-pdf-to-sales-xlsx ./out.xlsx ~/Desktop/Invoices_20260406_sV.pdf
 */
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import {
  parseInvoiceText,
  pageLooksLikeInvoice,
  splitPageTextIntoInvoiceSegments,
  invoiceRowToSalesEnrollmentExportRow,
  SALES_ENROLLMENT_EXPORT_HEADERS,
  type InvoiceRow
} from './lib/vchess-invoice-parse';

async function readPdfPageTexts(filePath: string): Promise<string[]> {
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    const pages = result.pages;
    if (pages && pages.length > 0) {
      return pages.map((p) => String(p.text || ''));
    }
    return [String(result.text || '')];
  } finally {
    await parser.destroy();
  }
}

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

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  if (argv.length < 2) {
    console.error(
      'Usage: pnpm invoice-pdf-to-sales-xlsx <output.xlsx> <invoice1.pdf> [invoice2.pdf ...]\n' +
        '  Produces one sheet "Sales export" with the same 10 columns as the browser export.'
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
    const part = await parsePdfToInvoiceRows(pdf);
    invoiceRows.push(...part);
  }

  const dataRows = invoiceRows.map(invoiceRowToSalesEnrollmentExportRow);
  const aoa: (string | number)[][] = [[...SALES_ENROLLMENT_EXPORT_HEADERS], ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 22 },
    { wch: 14 },
    { wch: 18 },
    { wch: 44 },
    { wch: 8 },
    { wch: 24 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales export');
  XLSX.writeFile(wb, outPath);

  console.log(
    `Wrote ${dataRows.length} data row(s) from ${pdfs.length} PDF(s) → ${outPath}`
  );
  for (let i = 0; i < invoiceRows.length; i++) {
    const r = invoiceRows[i];
    if (r.parse_note) {
      console.warn(`  row ${i + 1} [${r.source_file}]: ${r.parse_note}`);
    }
  }
}

void main();
