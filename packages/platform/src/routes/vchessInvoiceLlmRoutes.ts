/**
 * V.Chess invoice PDF text → Ollama → 11-column Excel row (optional merge with rule parser).
 */
import type { Express, Request, Response } from 'express';
import * as path from 'path';
import {
  extractInvoiceRowWithOllama,
  mergeLlmWithRuleRow,
  ollamaHealth,
  type InvoiceLlmRow
} from '../lib/vchessInvoiceOllama';

function loadScriptInvoiceParse(): {
  parseInvoiceText: (raw: string, label: string) => any;
  toInvoiceXlsxExportRow: (row: any) => InvoiceLlmRow;
  splitPageTextIntoInvoiceSegments: (t: string) => string[];
  pageLooksLikeInvoice: (t: string) => boolean;
} {
  const p = path.join(process.cwd(), 'scripts', 'lib', 'vchess-invoice-parse.ts');
  return require(p);
}

export type VchessInvoiceLlmOptions = {
  ollamaBaseUrl?: string;
  defaultModel?: string;
};

export function registerVchessInvoiceLlmRoutes(app: Express, opts?: VchessInvoiceLlmOptions): void {
  const baseUrl = opts?.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
  const defaultModel = opts?.defaultModel ?? process.env.OLLAMA_MODEL ?? 'qwen2.5:72b';

  app.get('/api/vchess-invoice-llm/health', async (_req: Request, res: Response) => {
    const h = await ollamaHealth(baseUrl);
    res.json({
      ok: h.ok,
      ollamaBaseUrl: baseUrl,
      defaultModel,
      error: h.error ?? null
    });
  });

  app.post('/api/vchess-invoice-llm/parse-segments', async (req: Request, res: Response) => {
    try {
      const segments = req.body?.segments;
      const model = String(req.body?.model || defaultModel);
      const mergeWithRules = req.body?.mergeWithRules !== false;
      if (!Array.isArray(segments) || segments.length === 0) {
        res.status(400).json({ ok: false, error: 'segments must be a non-empty array of strings' });
        return;
      }
      const parse = loadScriptInvoiceParse();
      const rows: InvoiceLlmRow[] = [];
      const meta: { sourceIndex: number; warnings: string[] }[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = String(segments[i] || '');
        if (seg.length < 25) continue;
        if (!parse.pageLooksLikeInvoice(seg) && !/\bINV-[\dA-Za-z-]+\b/i.test(seg)) continue;

        const tSeg = Date.now();
        console.log(
          `[vchess-invoice-llm] request ${segments.length} segment(s) · item ${i + 1}/${segments.length} → Ollama (${model})`
        );
        const { row: llmRow } = await extractInvoiceRowWithOllama(seg, {
          baseUrl,
          model,
          timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS) || 420_000
        });

        let finalRow = llmRow;
        if (mergeWithRules) {
          const ruleFull = parse.parseInvoiceText(seg, `llm-merge·${i}`);
          const ruleEx = parse.toInvoiceXlsxExportRow(ruleFull);
          finalRow = mergeLlmWithRuleRow(llmRow, ruleEx);
        }

        const w: string[] = [];
        KEYS.forEach((k) => {
          if (finalRow[k] == null || String(finalRow[k]).trim() === '') w.push(`missing:${k}`);
        });
        rows.push(finalRow);
        meta.push({ sourceIndex: i, warnings: w });
        console.log(
          `[vchess-invoice-llm] item ${i + 1}/${segments.length} done in ${Math.round((Date.now() - tSeg) / 1000)}s`
        );
      }

      res.json({
        ok: true,
        model,
        mergeWithRules,
        rowCount: rows.length,
        rows,
        meta
      });
    } catch (e) {
      console.error('[vchess-invoice-llm/parse-segments]', e);
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  });
}

const KEYS: (keyof InvoiceLlmRow)[] = [
  'student_name',
  'student_id',
  'teacher',
  'course_name',
  'schedule_time',
  'schedule_dates',
  'unit_price',
  'quantity',
  'line_total',
  'invoice_no',
  'invoice_date'
];
