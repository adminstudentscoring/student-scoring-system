/**
 * Parse V.Chess invoice-style date strings (e.g. "2/10, 2/17/2026") as day/month[/year].
 * Used by import apply engine and shareable with CLI/browser tooling.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse d/m/yyyy from invoice "Date:" line; fallback current calendar year. */
export function extractDefaultYearFromInvoiceDate(invoiceDate: string | null | undefined): number {
  if (!invoiceDate || typeof invoiceDate !== 'string') return new Date().getUTCFullYear();
  const m = String(invoiceDate).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return parseInt(m[3], 10);
  const m2 = String(invoiceDate).trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return parseInt(m2[3], 10);
  return new Date().getUTCFullYear();
}

/**
 * Extract calendar dates from a freeform string (comma-separated, parentheses, etc.):
 * - ISO `YYYY-MM-DD` (e.g. Settings → Sales Excel "Enrolled Dates")
 * - HK-style `d/m` or `d/m/y` (V.Chess invoice PDF / classic import columns)
 */
export function expandVchessScheduleDatesToYmd(
  scheduleDatesRaw: string | null | undefined,
  defaultYear: number
): string[] {
  if (!scheduleDatesRaw || typeof scheduleDatesRaw !== 'string') return [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = isoRe.exec(scheduleDatesRaw)) !== null) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const ms = Date.UTC(year, month - 1, day);
    const d = new Date(ms);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) continue;
    seen.add(`${year}-${pad2(month)}-${pad2(day)}`);
  }

  const re = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  while ((m = re.exec(scheduleDatesRaw)) !== null) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = m[3] != null && m[3] !== '' ? parseInt(m[3], 10) : defaultYear;
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const ms = Date.UTC(year, month - 1, day);
    const d = new Date(ms);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) continue;
    const ymd = `${year}-${pad2(month)}-${pad2(day)}`;
    seen.add(ymd);
  }
  return Array.from(seen).sort();
}

export function utcYmdToEnglishDow(ymd: string): string | null {
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const ms = Date.UTC(y, mo, d);
  if (!Number.isFinite(ms)) return null;
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return names[new Date(ms).getUTCDay()] ?? null;
}
