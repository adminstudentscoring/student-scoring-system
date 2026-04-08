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
  splitPageTextIntoInvoiceSegments,
  toInvoiceXlsxExportRow
} from '../scripts/lib/vchess-invoice-parse';

describe('vchess invoice parse', () => {
  it('XLSX export row has exactly 11 keys', () => {
    const row = parseInvoiceText('No.: INV-X\nDate: 1/1/2026\nA (C1)\nInvoice\nTo:\nSubtotal $1', 'x');
    const ex = toInvoiceXlsxExportRow(row);
    assert.strictEqual(Object.keys(ex).length, 11);
    assert.ok('student_name' in ex && 'line_total' in ex);
  });

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

  it('parses Teacher-first line: name then Elite Class + time + dates', () => {
    const text = `
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
    const row = parseInvoiceText(text, 'elite.pdf · p1');
    assert.strictEqual(row.customer_id, 'C100999');
    assert.ok(row.teacher?.includes('Duck'));
    assert.ok(row.course_name?.includes('Elite'), row.course_name);
    assert.strictEqual(row.schedule_time, '19:00-20:30');
    assert.ok((row.schedule_dates || '').includes('04/02'));
    assert.strictEqual(row.quantity, '4.0');
    assert.strictEqual(row.unit_price, '300.0');
  });

  it('parses PDF-style layout: name after Date, empty To:, qty-first money row', () => {
    const text = `
No.: INV-1-001020
Date: 07/12/2025
葉鴻永 (C100127)
Invoice
To:
Total	Price	Item Description Quantity
Chess lesson
19:00-20:00 (23/09, 25/09, 02/10)
Teacher: Duck Duck Sir
3.0	$225.0 $675.0
$675.0	Subtotal
$675.0	TOTAL
`.trim();
    const row = parseInvoiceText(text, 'layout.pdf · p1');
    assert.strictEqual(row.customer_id, 'C100127');
    assert.strictEqual(row.quantity, '3.0');
    assert.strictEqual(row.unit_price, '225.0');
    assert.ok(row.course_name?.includes('Chess'));
    assert.strictEqual(row.lesson_date_count, 3);
  });

  it('parses discounted line total (qty $unit $total after discount)', () => {
    const text = `
No.: INV-1-001120
Date: 06/01/2026
沈雪雲 (C100150)
Invoice
To:
Total	Price	Item Description Quantity
Chess lesson (4 lessons)
08:00-09:00 (13/12, 20/12, 27/12, 03/01)
Teacher: Duck Duck Sir
- Discount (-10.0% / -$100.0)
1.0	$1,000.0 $900.0
$900.0	Subtotal
$900.0	TOTAL
`.trim();
    const row = parseInvoiceText(text, 'disc.pdf · p1');
    assert.strictEqual(row.customer_id, 'C100150');
    assert.strictEqual(row.quantity, '1.0');
    assert.strictEqual(row.unit_price, '1,000.0');
    assert.strictEqual(row.line_total, '900.0');
    assert.strictEqual(row.lesson_date_count, 4);
  });

  it('parses qty glued to unit price (pypdf / broken-spacing layout)', () => {
    const text = `
No.: INV-1-001072
Date: 03/11/2025
曾德壎 (C100037)
Invoice
To:
TotalPriceItem Description Quantity Chess lesson
19:00-20:00 (03/11)
Teacher: Duck Duck Sir
9.0$225.0 $2,025.0
Subtotal $2,025.0
`.trim();
    const row = parseInvoiceText(text, 'jo.pdf · p1');
    assert.strictEqual(row.customer_id, 'C100037');
    assert.strictEqual(row.quantity, '9.0');
    assert.strictEqual(row.unit_price, '225.0');
    assert.strictEqual(row.line_total, '2,025.0');
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
