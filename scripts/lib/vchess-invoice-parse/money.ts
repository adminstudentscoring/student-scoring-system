import type { InvoiceMoneyTriplet } from './types';

function scoreUnitQtyTotal(unit: number, qty: number, total: number): number {
  if (!Number.isFinite(unit) || !Number.isFinite(qty) || !Number.isFinite(total)) return -1;
  if (qty < 0 || qty > 500) return -1;
  if (unit < 0 || unit > 1e7) return -1;
  const expected = unit * qty;
  const err = Math.abs(expected - total);
  const rel = total !== 0 ? err / Math.abs(total) : err;
  if (rel > 0.08 && err > 1) return -1;
  return 1000 - rel * 100;
}

/** After-discount lines: total ≤ unit×qty (e.g. 1×1000 with 10% off → 900). */
function scoreUnitQtyTotalDiscounted(unit: number, qty: number, total: number): number {
  if (!Number.isFinite(unit) || !Number.isFinite(qty) || !Number.isFinite(total)) return -1;
  if (qty < 0 || qty > 500 || unit < 0 || total < 0) return -1;
  if (total > unit * qty + 0.05) return -1;
  const expected = unit * qty;
  if (expected < 1e-6) return total < 0.01 ? 400 : -1;
  const rel = Math.abs(expected - total) / expected;
  if (rel > 0.55) return -1;
  return 550 - rel * 100;
}

/**
 * PDF table row is either `$unit qty $total` or `qty $unit $total` (common in V.Chess exports).
 * Picks the match where unit × qty ≈ line total.
 */
function collectMoneyTriplets(
  head: string,
  scoreFn: (u: number, q: number, t: number) => number
): InvoiceMoneyTriplet[] {
  const out: InvoiceMoneyTriplet[] = [];
  const rePriceFirst = /\$\s*([\d,]+\.?\d*)\s+(\d+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = rePriceFirst.exec(head)) !== null) {
    const unit = parseFloat(m[1].replace(/,/g, ''));
    const qty = parseFloat(m[2].replace(/,/g, ''));
    const total = parseFloat(m[3].replace(/,/g, ''));
    if (scoreFn(unit, qty, total) < 0) continue;
    out.push({
      raw: m[0],
      index: m.index,
      unitPrice: m[1],
      quantity: m[2],
      lineTotal: m[3]
    });
  }
  const reQtyFirst = /(\d+\.?\d*)\s+\$\s*([\d,]+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/g;
  while ((m = reQtyFirst.exec(head)) !== null) {
    const qty = parseFloat(m[1].replace(/,/g, ''));
    const unit = parseFloat(m[2].replace(/,/g, ''));
    const total = parseFloat(m[3].replace(/,/g, ''));
    if (scoreFn(unit, qty, total) < 0) continue;
    out.push({
      raw: m[0],
      index: m.index,
      unitPrice: m[2],
      quantity: m[1],
      lineTotal: m[3]
    });
  }
  /** e.g. pypdf line `9.0$225.0 $2,025.0` (no space before first $) */
  const reQtyGluedToPrice = /(\d+\.?\d*)\$\s*([\d,]+\.?\d*)\s+\$\s*([\d,]+\.?\d*)/g;
  while ((m = reQtyGluedToPrice.exec(head)) !== null) {
    const qty = parseFloat(m[1].replace(/,/g, ''));
    const unit = parseFloat(m[2].replace(/,/g, ''));
    const total = parseFloat(m[3].replace(/,/g, ''));
    if (scoreFn(unit, qty, total) < 0) continue;
    out.push({
      raw: m[0],
      index: m.index,
      unitPrice: m[2],
      quantity: m[1],
      lineTotal: m[3]
    });
  }
  return out;
}

export function pickBestInvoiceMoneyTriplet(head: string): InvoiceMoneyTriplet | null {
  let candidates = collectMoneyTriplets(head, scoreUnitQtyTotal);
  if (candidates.length === 0) {
    candidates = collectMoneyTriplets(head, scoreUnitQtyTotalDiscounted);
  }
  if (candidates.length === 0) return null;

  function rank(c: InvoiceMoneyTriplet): number {
    const u = parseFloat(c.unitPrice.replace(/,/g, ''));
    const q = parseFloat(c.quantity.replace(/,/g, ''));
    const t = parseFloat(c.lineTotal.replace(/,/g, ''));
    let sc = scoreUnitQtyTotal(u, q, t);
    if (sc < 0) sc = scoreUnitQtyTotalDiscounted(u, q, t);
    return sc + c.index * 1e-6;
  }

  let best = candidates[0];
  let bestScore = rank(best);
  for (let i = 1; i < candidates.length; i++) {
    const sc = rank(candidates[i]);
    if (sc > bestScore) {
      bestScore = sc;
      best = candidates[i];
    }
  }
  return best;
}

/**
 * @deprecated Prefer pickBestInvoiceMoneyTriplet — kept for tests; returns exec array [full, unit, qty, total].
 */
export function pickBestPriceQtyTotalTriplet(head: string): RegExpExecArray | null {
  const t = pickBestInvoiceMoneyTriplet(head);
  if (!t) return null;
  const fake = [t.raw, t.unitPrice, t.quantity, t.lineTotal] as unknown as RegExpExecArray;
  fake.index = t.index;
  return fake;
}

/** Last index of money triplet in PDF text (tabs/newlines vs spaces differ from triplet.raw). */
export function findLastMoneyTripletSliceIndex(haystack: string, tripletRaw: string): number {
  const direct = haystack.lastIndexOf(tripletRaw);
  if (direct >= 0) return direct;
  const tokens = tripletRaw.trim().match(/\S+/g);
  if (!tokens || tokens.length < 3) return -1;
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = tokens.map(esc).join('\\s+');
  const re = new RegExp(pattern, 'gi');
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) {
    last = m.index;
  }
  return last;
}
