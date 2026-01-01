// Minimal OpenAI client (no extra deps). Uses global fetch (Node 20+).
// NOTE: Do NOT hardcode API keys in code. Use process.env.OPENAI_API_KEY.

function getOpenAiConfig() {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
  return { apiKey, model };
}

function openAiEnabled() {
  const { apiKey } = getOpenAiConfig();
  return !!apiKey;
}

async function openAiJson({ system, user, maxOutputTokens = 250 }) {
  const { apiKey, model } = getOpenAiConfig();
  if (!apiKey) throw new Error('OpenAI not configured (missing OPENAI_API_KEY)');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
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

  const data = await resp.json().catch(() => ({}));
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


