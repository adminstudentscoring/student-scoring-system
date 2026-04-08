/**
 * Sales xlsx row helpers + optional PDF fallback smoke (JO.pdf on developer machine).
 * Run: pnpm invoice-sales-xlsx-smoke
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  compareInvoiceRowsNeat,
  isCleanInvoiceRow,
  parseInvoiceText
} from '../scripts/lib/vchess-invoice-parse';
import { readPdfPageTexts } from '../scripts/lib/readPdfPageTexts';

describe('invoice sales xlsx helpers', () => {
  it('isCleanInvoiceRow requires customer_id, schedule fields, no parse_note', () => {
    const goodText = `
No.: INV-1-00999
Date: 01/02/2026
測試學生 (C100999)
Invoice
To:
Total	Price	Item Description Quantity
Teacher: Duck Duck Sir Elite Class 19:00-20:30 (04/02, 11/02, 25/02)
4.0 $300.0 $1,200.0
Subtotal $1,200.0
TOTAL $1,200.0
`.trim();
    const row = parseInvoiceText(goodText, 'elite.pdf · p1');
    assert.ok(!row.parse_note, row.parse_note || '');
    assert.ok(isCleanInvoiceRow(row), 'expected clean row');

    const bad = { ...row, parse_note: 'broken' };
    assert.ok(!isCleanInvoiceRow(bad));
    const noId = { ...row, customer_id: null };
    assert.ok(!isCleanInvoiceRow(noId));
  });

  it('compareInvoiceRowsNeat sorts by source_file then customer_id', () => {
    const a = parseInvoiceText('No.: INV-A\nDate: 1/1/2026\nZ (C2)\nInvoice\nTo:\n3.0 $1 $3\n$3 Subtotal', 'b.pdf');
    const b = parseInvoiceText('No.: INV-B\nDate: 1/1/2026\nA (C1)\nInvoice\nTo:\n3.0 $1 $3\n$3 Subtotal', 'a.pdf');
    const sorted = [a, b].sort(compareInvoiceRowsNeat);
    assert.ok(sorted[0].source_file.startsWith('a.pdf'));
  });
});

describe('readPdfPageTexts pypdf fallback (optional)', () => {
  it('reads Invoices_20260407_JO.pdf from Downloads when present', async () => {
    const jo = path.join(process.env.HOME || '', 'Downloads', 'Invoices_20260407_JO.pdf');
    if (!fs.existsSync(jo)) {
      return;
    }
    const pages = await readPdfPageTexts(jo);
    assert.ok(pages.length >= 1);
    const joined = pages.join('\n');
    assert.ok(/\bINV-/i.test(joined), 'expected invoice numbers in text');
  });
});
