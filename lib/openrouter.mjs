/**
 * Local-first LLM gateway.
 *
 * Primary path: LM Studio / other OpenAI-compatible local server on the LAN.
 * Fallback path: OpenRouter.
 */

const LOCAL_LLM_BASE = normalizeOpenAiBase(
  process.env.LOCAL_LLM_BASE_URL
  || process.env.LM_STUDIO_BASE_URL
  || process.env.LMSTUDIO_BASE_URL
  || ''
);
const LOCAL_LLM_KEY =
  process.env.LOCAL_LLM_API_KEY
  || process.env.LM_STUDIO_API_KEY
  || process.env.LMSTUDIO_API_KEY
  || '';
const DEFAULT_LOCAL_MODEL =
  process.env.LOCAL_LLM_MODEL
  || process.env.LM_STUDIO_MODEL
  || process.env.LMSTUDIO_MODEL
  || 'google/gemma-4-e4b';
const LOCAL_LLM_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.LOCAL_LLM_TIMEOUT_MS || process.env.LM_STUDIO_TIMEOUT_MS || '45000') || 45000,
);

const OPENROUTER_BASE = normalizeOpenAiBase(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1');
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
const DEFAULT_OPENROUTER_TIMEOUT_MS = Math.max(5000, Number(process.env.OPENROUTER_TIMEOUT_MS || '60000') || 60000);

function normalizeOpenAiBase(rawBase) {
  const trimmed = String(rawBase || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/\/(v1|api\/v1)$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
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

function parseJsonContent(content) {
  const text = String(content || '').trim();
  if (!text) throw new Error('empty JSON response');
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    return parseJsonContent(fenced[1]);
  }

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error(`invalid JSON response: ${text.slice(0, 500)}`);
}

function buildHeaders(provider) {
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.kind === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || process.env.SITE_BASE_URL || 'https://local.dota2hub';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'dota2-hub';
  }
  return headers;
}

function buildMessages(prompt, system = '') {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return messages;
}

function resolveRouting(opts = {}) {
  const localEnabled = Boolean(LOCAL_LLM_BASE);
  const openrouterEnabled = Boolean(OPENROUTER_KEY);

  const localModel =
    opts.localModel
    || opts.primaryModel
    || process.env.NEWS_TRANSLATE_LOCAL_MODEL
    || DEFAULT_LOCAL_MODEL
    || opts.model
    || DEFAULT_OPENROUTER_MODEL;

  const fallbackModel =
    opts.fallbackModel
    || process.env.NEWS_TRANSLATE_OPENROUTER_MODEL
    || process.env.XHS_OPENROUTER_MODEL
    || DEFAULT_OPENROUTER_MODEL
    || opts.model
    || localModel;

  const providers = [];
  if (localEnabled && opts.preferLocal !== false) {
    providers.push({
      kind: 'local-lm',
      label: 'local-lm',
      baseUrl: LOCAL_LLM_BASE,
      apiKey: LOCAL_LLM_KEY,
      model: localModel,
      timeoutMs: Math.max(5000, Number(opts.localTimeoutMs || LOCAL_LLM_TIMEOUT_MS) || LOCAL_LLM_TIMEOUT_MS),
    });
  }
  if (openrouterEnabled) {
    providers.push({
      kind: 'openrouter',
      label: 'openrouter',
      baseUrl: OPENROUTER_BASE,
      apiKey: OPENROUTER_KEY,
      model: fallbackModel,
      timeoutMs: Math.max(5000, Number(opts.timeoutMs || DEFAULT_OPENROUTER_TIMEOUT_MS) || DEFAULT_OPENROUTER_TIMEOUT_MS),
    });
  }

  return {
    localEnabled,
    openrouterEnabled,
    localModel,
    fallbackModel,
    providers,
    primaryProvider: providers[0]?.label || null,
  };
}

export function getLlmRoutingConfig(opts = {}) {
  const routing = resolveRouting(opts);
  return {
    localEnabled: routing.localEnabled,
    openrouterEnabled: routing.openrouterEnabled,
    localModel: routing.localModel,
    fallbackModel: routing.fallbackModel,
    primaryProvider: routing.primaryProvider,
    providers: routing.providers.map((provider) => ({
      label: provider.label,
      model: provider.model,
      baseUrl: provider.baseUrl,
      timeoutMs: provider.timeoutMs,
    })),
  };
}

async function runWithTimeout(promiseFactory, timeoutMs, onTimeout) {
  let timer = null;
  try {
    return await Promise.race([
      promiseFactory(),
      new Promise((_, reject) => {
        timer = setTimeout(async () => {
          try {
            await onTimeout?.();
          } catch {}
          reject(new Error(`request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestChatCompletions(provider, body) {
  const maxAttempts = provider.kind === 'openrouter' ? 4 : 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();

    try {
      const payload = await runWithTimeout(async () => {
        const res = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: buildHeaders(provider),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.ok) {
          return res.json();
        }

        const text = await res.text().catch(() => '');
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          throw Object.assign(new Error(`${provider.label} retryable HTTP ${res.status}: ${text.slice(0, 500)}`), {
            retryable: true,
          });
        }
        throw new Error(`${provider.label} HTTP ${res.status}: ${text.slice(0, 500)}`);
      }, provider.timeoutMs, async () => {
        controller.abort();
      });

      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = Boolean(error?.retryable)
        || /timed out/i.test(message)
        || /aborted/i.test(message)
        || /ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(message);
      if (attempt >= maxAttempts || !retryable) {
        throw new Error(`${provider.label} request failed: ${message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
    }
  }

  throw new Error(`${provider.label} request failed after retries`);
}

async function runJsonRequest(prompt, schema, opts = {}) {
  const routing = resolveRouting(opts);
  if (!routing.providers.length) {
    throw new Error('No LLM provider configured. Set LOCAL_LLM_BASE_URL/LM_STUDIO_BASE_URL or OPENROUTER_API_KEY.');
  }

  const messages = buildMessages(prompt, opts.system || '');
  const errors = [];

  for (const provider of routing.providers) {
    try {
      const body = {
        model: provider.model,
        messages,
        ...(Number.isFinite(Number(opts.maxTokens)) ? { max_tokens: Number(opts.maxTokens) } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema,
          },
        },
      };
      if (provider.kind === 'openrouter') {
        body.reasoning = { enabled: false };
      }

      const data = await requestChatCompletions(provider, body);
      return {
        data: parseJsonContent(extractMessageContent(data)),
        meta: { provider: provider.label, model: provider.model, baseUrl: provider.baseUrl },
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(' | '));
}

async function runTextRequest(prompt, opts = {}) {
  const routing = resolveRouting(opts);
  if (!routing.providers.length) {
    throw new Error('No LLM provider configured. Set LOCAL_LLM_BASE_URL/LM_STUDIO_BASE_URL or OPENROUTER_API_KEY.');
  }

  const messages = buildMessages(prompt, opts.system || '');
  const errors = [];

  for (const provider of routing.providers) {
    try {
      const body = {
        model: provider.model,
        messages,
        ...(Number.isFinite(Number(opts.maxTokens)) ? { max_tokens: Number(opts.maxTokens) } : {}),
      };
      if (provider.kind === 'openrouter') {
        body.reasoning = { enabled: false };
      }

      const data = await requestChatCompletions(provider, body);
      const text = String(extractMessageContent(data) || '').trim();
      if (!text) throw new Error(`${provider.label} empty text response`);
      return {
        text,
        meta: { provider: provider.label, model: provider.model, baseUrl: provider.baseUrl },
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors.join(' | '));
}

export async function callLlmJsonWithMeta(prompt, schema, opts = {}) {
  return runJsonRequest(prompt, schema, opts);
}

export async function callLlmTextWithMeta(prompt, opts = {}) {
  return runTextRequest(prompt, opts);
}

export async function callLlmJson(prompt, schema, opts = {}) {
  const result = await callLlmJsonWithMeta(prompt, schema, opts);
  return result.data;
}

export async function callLlmText(prompt, opts = {}) {
  const result = await callLlmTextWithMeta(prompt, opts);
  return result.text;
}
