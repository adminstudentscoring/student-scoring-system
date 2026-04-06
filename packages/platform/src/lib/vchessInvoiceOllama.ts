/**
 * Local Ollama → structured V.Chess invoice row (11 Excel columns).
 * Uses /api/chat with format: "json" when supported.
 */

export type InvoiceLlmRow = {
  student_name: string | null;
  student_id: string | null;
  teacher: string | null;
  course_name: string | null;
  schedule_time: string | null;
  schedule_dates: string | null;
  unit_price: string | null;
  quantity: string | null;
  line_total: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
};

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

export function emptyInvoiceLlmRow(): InvoiceLlmRow {
  return {
    student_name: null,
    student_id: null,
    teacher: null,
    course_name: null,
    schedule_time: null,
    schedule_dates: null,
    unit_price: null,
    quantity: null,
    line_total: null,
    invoice_no: null,
    invoice_date: null
  };
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function normalizeLlmRow(raw: unknown): InvoiceLlmRow {
  const out = emptyInvoiceLlmRow();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  const inner = (o.row ?? o.invoice ?? o.data ?? o) as Record<string, unknown>;
  if (!inner || typeof inner !== 'object') return out;
  for (const k of KEYS) {
    out[k] = strOrNull(inner[k]);
  }
  return out;
}

function parseJsonFromModelContent(content: string): unknown {
  let t = content.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(t);
}

const SYSTEM_PROMPT = `You extract ONE Hong Kong-style tuition invoice from raw PDF text into JSON.
Rules:
- Output a single JSON object with key "row" only. No markdown, no commentary.
- Field "row" has exactly these string or null keys: student_name, student_id, teacher, course_name, schedule_time, schedule_dates, unit_price, quantity, line_total, invoice_no, invoice_date.
- student_name: customer name without parentheses. student_id: code like C100127 inside parentheses (no parens in value).
- schedule_time: like 19:00-20:00 (no spaces around hyphen).
- schedule_dates: inner part of date list only, e.g. 23/09, 25/09, 02/10 (no outer parentheses).
- unit_price, quantity, line_total: numeric strings as on invoice (unit_price without $; allow commas in line_total like 1,575.0).
- invoice_no: INV-… invoice_date: dd/mm/yyyy
- Copy numbers exactly from the text; use null only if truly absent.`;

export async function extractInvoiceRowWithOllama(
  segmentText: string,
  opts: { baseUrl: string; model: string; timeoutMs?: number }
): Promise<{ row: InvoiceLlmRow; rawContent: string }> {
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = `${base}/api/chat`;
  const timeoutMs = opts.timeoutMs ?? 420_000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    async function chatOnce(useJsonFormat: boolean): Promise<Response> {
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Extract fields from this single invoice text block:\n\n---\n${segmentText.slice(0, 12000)}\n---`
          }
        ],
        stream: false,
        options: { temperature: 0.05, num_predict: 1024 }
      };
      if (useJsonFormat) body.format = 'json';
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal
      });
    }

    let res = await chatOnce(true);
    let text = await res.text();
    if (!res.ok && text.toLowerCase().includes('format')) {
      res = await chatOnce(false);
      text = await res.text();
    }
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    let data: { message?: { content?: string } };
    try {
      data = JSON.parse(text) as { message?: { content?: string } };
    } catch {
      throw new Error(`Ollama non-JSON response: ${text.slice(0, 200)}`);
    }
    const content = data?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('Ollama missing message.content');
    }
    let parsed: unknown;
    try {
      parsed = parseJsonFromModelContent(content);
    } catch (e) {
      throw new Error(`LLM JSON parse failed: ${(e as Error).message}; snippet: ${content.slice(0, 300)}`);
    }
    return { row: normalizeLlmRow(parsed), rawContent: content };
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaHealth(baseUrl: string, timeoutMs = 5000): Promise<{ ok: boolean; error?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${base}/api/tags`, { signal: ac.signal });
    clearTimeout(t);
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Prefer non-null; for money fields prefer ruleRow when LLM differs strongly. */
export function mergeLlmWithRuleRow(llm: InvoiceLlmRow, rule: InvoiceLlmRow): InvoiceLlmRow {
  const out: InvoiceLlmRow = { ...emptyInvoiceLlmRow() };
  const textKeys: (keyof InvoiceLlmRow)[] = [
    'student_name',
    'student_id',
    'teacher',
    'course_name',
    'schedule_time',
    'schedule_dates',
    'invoice_no',
    'invoice_date'
  ];
  for (const k of textKeys) {
    out[k] = llm[k] ?? rule[k] ?? null;
  }
  const money: (keyof InvoiceLlmRow)[] = ['unit_price', 'quantity', 'line_total'];
  for (const k of money) {
    const l = llm[k];
    const r = rule[k];
    if (r && l) {
      const nf = (s: string) => parseFloat(String(s).replace(/,/g, ''));
      const a = nf(l);
      const b = nf(r);
      if (!Number.isNaN(a) && !Number.isNaN(b) && b !== 0 && Math.abs(a - b) / Math.abs(b) > 0.08) {
        out[k] = r;
      } else {
        out[k] = l;
      }
    } else {
      out[k] = l ?? r ?? null;
    }
  }
  return out;
}
