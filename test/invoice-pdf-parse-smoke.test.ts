/**
 * Parser smoke tests for V.Chess invoice text extraction (no PDF binary).
 * Run: pnpm invoice-parse-smoke
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseInvoiceText,
  pageLooksLikeInvoice,
  pickBestPriceQtyTotalTriplet,
  splitPageTextIntoInvoiceSegments
} from '../scripts/lib/vchess-invoice-parse';

describe('vchess invoice parse', () => {
  it('picks triplet where price × qty ≈ line total', () => {
    const head =
      'Item Description Price Quantity Total\n' +
      'x\n' +
      '$1,575.0 7.0 $225.0\n' +
      '$225.0 7.0 $1,575.0\n';
    const t = pickBestPriceQtyTotalTriplet(head);
    assert.ok(t);
    assert.strictEqual(t[1], '225.0');
    assert.strictEqual(t[2], '7.0');
    assert.strictEqual(t[3], '1,575.0');
  });

  it('parses typical one-page invoice blob', () => {
    const text = `
Invoice
No.: INV-1-001020
Date: 07/12/2025
To: 葉鴻永 (C100127)
Item Description Price Quantity Total
Chess lesson
19:00-20:00 (23/09, 25/09, 02/10, 09/10, 16/10, 23/10, 30/10)
Teacher: Duck Duck Sir
$225.0 7.0 $1,575.0
Subtotal $1,575.0
TOTAL $1,575.0
Less Amount Paid $1,575.0
AMOUNT DUE $0.0
`.trim();

    const row = parseInvoiceText(text, 'test.pdf · p1');
    assert.strictEqual(row.invoice_no, 'INV-1-001020');
    assert.strictEqual(row.customer_id, 'C100127');
    assert.strictEqual(row.customer_name, '葉鴻永');
    assert.strictEqual(row.quantity, '7.0');
    assert.strictEqual(row.unit_price, '225.0');
    assert.strictEqual(row.line_total, '1,575.0');
    assert.strictEqual(row.lesson_date_count, 7);
    assert.ok(row.teacher?.includes('Duck'));
    assert.ok(row.course_name?.toLowerCase().includes('chess'));
  });

  it('pageLooksLikeInvoice detects invoice pages', () => {
    assert.strictEqual(pageLooksLikeInvoice('random memo'), false);
    assert.strictEqual(pageLooksLikeInvoice('No.: INV-1-001020'), true);
    assert.strictEqual(pageLooksLikeInvoice('To: Foo (C100127)'), true);
  });

  it('splitPageTextIntoInvoiceSegments splits two-up by second No.:', () => {
    const t = `Invoice\nNo.: INV-1-AAA\nTo: A (C100001)\n$10 2 $20\nSubtotal $20\nNo.: INV-1-BBB\nTo: B (C100002)\n$15 3 $45\nSubtotal $45`;
    const segs = splitPageTextIntoInvoiceSegments(t);
    assert.strictEqual(segs.length, 2);
    assert.ok(segs[0].includes('INV-1-AAA'));
    assert.ok(segs[1].includes('INV-1-BBB'));
  });
});
