/**
 * V.Chess-style invoice PDF → Excel (.xlsx)
 *
 * Multi-page PDFs + two-up pages: one row per invoice (split by No.: / To: or use browser spatial split).
 *
 * Usage:
 *   pnpm invoice-pdf-to-xlsx <input.pdf | folder> <output.xlsx>
 */
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import {
  parseInvoiceText,
  pageLooksLikeInvoice,
  splitPageTextIntoInvoiceSegments,
  type InvoiceRow
} from './lib/vchess-invoice-parse';

export type { InvoiceRow };

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

function emptyRow(source: string, note: string): InvoiceRow {
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

function collectPdfPaths(input: string): string[] {
  const st = fs.statSync(input);
  if (st.isFile()) {
    if (!input.toLowerCase().endsWith('.pdf')) {
      throw new Error(`Not a PDF file: ${input}`);
    }
    return [path.resolve(input)];
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a file or directory: ${input}`);
  }
  return fs
    .readdirSync(input)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .map((f) => path.resolve(input, f))
    .sort();
}

async function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  if (argv.length < 2) {
    console.error(
      'Usage: pnpm invoice-pdf-to-xlsx <input.pdf|folder> <output.xlsx>\n' +
        '  Text PDFs. Per page: splits 2 invoices when two No.: INV- or two To: blocks.'
    );
    process.exit(1);
  }

  const [inPath, outPath] = argv;
  const pdfs = collectPdfPaths(path.resolve(inPath));
  if (pdfs.length === 0) {
    console.error('No PDF files found.');
    process.exit(1);
  }

  const rows: InvoiceRow[] = [];
  for (const pdf of pdfs) {
    const base = path.basename(pdf);
    try {
      const pageTexts = await readPdfPageTexts(pdf);
      const anyText = pageTexts.some((t) => t.trim());
      if (!anyText) {
        rows.push(
          emptyRow(
            base,
            'empty PDF text — likely scanned image; use OCR or export as text PDF'
          )
        );
        continue;
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
    } catch (e) {
      rows.push(
        emptyRow(base, `read error: ${e instanceof Error ? e.message : String(e)}`)
      );
    }
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
  const outAbs = path.resolve(outPath);
  XLSX.writeFile(wb, outAbs);
  console.log(`Wrote ${rows.length} row(s) → ${outAbs}`);

  if (process.env.INVOICE_CONVERT_SMOKE === '1' && rows[0]) {
    console.log('[invoice-pdf-to-xlsx smoke]', {
      sample: rows[0].invoice_no,
      hasTotal: !!rows[0].total,
      hasCustomer: !!rows[0].customer_id
    });
  }
}

void main();
