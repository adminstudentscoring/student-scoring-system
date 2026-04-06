/**
 * End-to-end: PDF → segments → POST /api/vchess-invoice-llm/parse-segments (needs pnpm start + Ollama).
 *
 *   pnpm vchess-llm-smoke [path/to.pdf]
 *
 * Env: TEST_SERVER_URL=http://localhost:7001 VCHESS_LLM_SMOKE_MAX_SEGMENTS=3
 */
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';

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
  const base =
    process.env.TEST_SERVER_URL?.replace(/\/$/, '') || 'http://127.0.0.1:7001';
  const maxSeg = Math.max(1, parseInt(process.env.VCHESS_LLM_SMOKE_MAX_SEGMENTS || '2', 10) || 2);

  const pdfPath =
    process.argv[2] ||
    path.join(process.env.HOME || '', 'Desktop', 'Invoices_20260404_mR.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('[vchess-llm-smoke] PDF not found:', pdfPath);
    process.exit(1);
  }

  const h = await fetch(`${base}/api/vchess-invoice-llm/health`);
  if (!h.ok) {
    console.error('[vchess-llm-smoke] health HTTP', h.status, '— is the server running? pnpm start');
    process.exit(1);
  }
  const health = await h.json();
  console.log('[vchess-llm-smoke] health:', health);
  if (!health.ok) {
    console.error('[vchess-llm-smoke] Ollama not reachable at', health.ollamaBaseUrl, health.error || '');
    process.exit(1);
  }

  const parseMod = require(path.join(process.cwd(), 'scripts', 'lib', 'vchess-invoice-parse.ts'));
  const { splitPageTextIntoInvoiceSegments, pageLooksLikeInvoice } = parseMod;

  const pageTexts = await readPdfPageTexts(pdfPath);
  const segments: string[] = [];
  for (const t of pageTexts) {
    if (!t.trim()) continue;
    for (const seg of splitPageTextIntoInvoiceSegments(t)) {
      if (seg.length < 25) continue;
      if (!pageLooksLikeInvoice(seg) && !/\bINV-[\dA-Za-z-]+\b/i.test(seg)) continue;
      segments.push(seg);
      if (segments.length >= maxSeg) break;
    }
    if (segments.length >= maxSeg) break;
  }
  if (segments.length === 0) {
    console.error('[vchess-llm-smoke] no invoice segments from PDF');
    process.exit(1);
  }

  console.log('[vchess-llm-smoke] calling LLM for', segments.length, 'segment(s) — may take minutes on 70B…');

  const model = process.env.OLLAMA_MODEL || 'qwen2.5:72b';
  const pr = await fetch(`${base}/api/vchess-invoice-llm/parse-segments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      segments,
      model,
      mergeWithRules: true
    })
  });
  const body = await pr.json();
  if (!pr.ok || !body.ok) {
    console.error('[vchess-llm-smoke] parse failed', body);
    process.exit(1);
  }

  const required = [
    'invoice_no',
    'invoice_date',
    'student_id',
    'course_name',
    'schedule_time',
    'unit_price',
    'quantity',
    'line_total'
  ] as const;
  let ok = true;
  for (let i = 0; i < body.rows.length; i++) {
    const row = body.rows[i];
    console.log('[vchess-llm-smoke] row', i, JSON.stringify(row, null, 2));
    for (const k of required) {
      if (row[k] == null || String(row[k]).trim() === '') {
        console.error('[vchess-llm-smoke] FAIL missing', k, 'row', i);
        ok = false;
      }
    }
  }

  if (!ok) process.exit(1);
  console.log('[vchess-llm-smoke] PASS (required fields present on all rows)');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
