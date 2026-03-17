// Minimal OpenAI client (no extra deps). Uses global fetch (Node 20+).
// NOTE: Do NOT hardcode API keys in code. Use process.env.OPENAI_API_KEY.

interface OpenAiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

function getOpenAiConfig(): OpenAiConfig {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  const baseUrlRaw = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com').trim() || 'https://api.openai.com';
  const baseUrl = baseUrlRaw.replace(/\/+$/, '');
  return { apiKey, model, baseUrl };
}

function openAiEnabled(): boolean {
  const { apiKey } = getOpenAiConfig();
  return !!apiKey;
}

async function openAiJson({ system, user, maxOutputTokens = 250 }: { system: string; user: string; maxOutputTokens?: number }): Promise<any> {
  const { apiKey, model, baseUrl } = getOpenAiConfig();
  if (!apiKey) throw new Error('OpenAI not configured (missing OPENAI_API_KEY)');

  // Supports OpenAI-compatible proxies (set OPENAI_BASE_URL, e.g. https://api.gptsapi.net)
  const url = `${baseUrl}/v1/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: maxOutputTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: String(system || '') },
        { role: 'user', content: String(user || '') }
      ]
    })
  });

  const data = await resp.json().catch(() => ({})) as any;
  if (!resp.ok) {
    const msg = data?.error?.message || `OpenAI HTTP ${resp.status}`;
    throw new Error(msg);
  }

  const content = data?.choices?.[0]?.message?.content || '';
  const usage = data?.usage || null;
  try {
    const parsed = JSON.parse(content);
    return { ok: true, json: parsed, text: null, usage };
  } catch {
    // Fallback: return as raw text (caller may store it)
    return { ok: true, json: null, text: String(content || '').trim(), usage };
  }
}

module.exports = {
  openAiEnabled,
  openAiJson
};


