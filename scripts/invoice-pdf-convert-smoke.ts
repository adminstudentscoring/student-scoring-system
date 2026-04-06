/**
 * End-to-end smoke: PDF text extraction + parseInvoiceText per invoice segment.
 * Usage: pnpm invoice-pdf-smoke [path-to.pdf]
 * Default tries Desktop/Invoices_20260404_mR.pdf when present; else exits 0 (skip).
 */
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';
import {
  parseInvoiceText,
  pageLooksLikeInvoice,
  splitPageTextIntoInvoiceSegments
} from './lib/vchess-invoice-parse';

function defaultPdfPath(): string {
  const env = process.env.INVOICE_PDF_SMOKE_PATH;
  if (env && fs.existsSync(env)) return env;
  const desktop = path.join(process.env.HOME || '', 'Desktop', 'Invoices_20260404_mR.pdf');
  if (fs.existsSync(desktop)) return desktop;
  return '';
}

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

async function main() {
  const pdfPath = process.argv[2] || defaultPdfPath();
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.log(
      '[invoice-pdf-smoke] skip: no PDF (pass path arg or set INVOICE_PDF_SMOKE_PATH, or place Invoices_20260404_mR.pdf on Desktop)'
    );
    process.exit(0);
  }

  const pageTexts = await readPdfPageTexts(pdfPath);
  const rows: ReturnType<typeof parseInvoiceText>[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    const t = pageTexts[i];
    if (!t.trim()) continue;
    const segments = splitPageTextIntoInvoiceSegments(t);
    for (const seg of segments) {
      if (seg.length < 25) continue;
      if (!pageLooksLikeInvoice(seg) && !/\bINV-[\dA-Za-z-]+\b/i.test(seg)) continue;
      rows.push(parseInvoiceText(seg, path.basename(pdfPath) + ' · p' + (i + 1)));
    }
  }

  const noCustomer = rows.filter((r) => !r.customer_id);
  const noCourse = rows.filter((r) => !r.course_name);
  const badTriplet = rows.filter(
    (r) => r.parse_note && r.parse_note.includes('no price/qty/line row matched')
  );

  console.log(
    `[invoice-pdf-smoke] ${pdfPath}\n  rows: ${rows.length}\n  missing customer_id: ${noCustomer.length}\n  missing course_name: ${noCourse.length}\n  triplet parse_note: ${badTriplet.length}`
  );

  if (noCustomer.length || noCourse.length || badTriplet.length) {
    const sample = noCustomer[0] || noCourse[0] || badTriplet[0];
    console.error('[invoice-pdf-smoke] sample row:', JSON.stringify(sample, null, 2));
    process.exit(1);
  }

  console.log('[invoice-pdf-smoke] PASS');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
