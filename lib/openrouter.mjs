/**
 * OpenRouter API helper — replaces codex CLI for structured & free-form LLM calls.
 * Uses the OpenAI-compatible chat completions endpoint with JSON schema output.
 */

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = Math.max(5000, Number(process.env.OPENROUTER_TIMEOUT_MS || '60000') || 60000);

if (!OPENROUTER_KEY) {
  console.error('[openrouter] Missing OPENROUTER_API_KEY');
}

function extractMessageContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return '';
}

async function requestOpenRouter(body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(`[openrouter] request failed: ${err.message || err}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[openrouter] HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return res.json();
}

/**
 * Call OpenRouter chat completions with structured JSON output.
 * @param {string} prompt - The user message
 * @param {object} schema - JSON Schema for the expected output
 * @param {{ model?: string, timeoutMs?: number, system?: string }} opts
 * @returns {Promise<object>} Parsed JSON matching the schema
 */
export async function callLlmJson(prompt, schema, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const system = opts.system || '';

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    reasoning: { enabled: false },
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        strict: true,
        schema,
      },
    },
  };

  const data = await requestOpenRouter(body, timeoutMs);
  const content = extractMessageContent(data);
  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown fence
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`[openrouter] invalid JSON response: ${content.slice(0, 500)}`);
  }
}

/**
 * Call OpenRouter and return plain text (wraps in { text: "..." } schema).
 * @param {string} prompt
 * @param {{ model?: string, timeoutMs?: number, system?: string }} opts
 * @returns {Promise<string>}
 */
export async function callLlmText(prompt, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const system = opts.system || '';

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const body = {
    model,
    messages,
    reasoning: { enabled: false },
  };

  const data = await requestOpenRouter(body, timeoutMs);
  const out = String(extractMessageContent(data) || '').trim();
  if (!out) throw new Error('[openrouter] empty text response');
  return out;
}
