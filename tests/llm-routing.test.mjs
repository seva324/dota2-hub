import test from 'node:test';
import assert from 'node:assert/strict';

const MODULE_URL = new URL('../lib/openrouter.mjs', import.meta.url);
const ENV_KEYS = [
  'LOCAL_LLM_BASE_URL',
  'LOCAL_LLM_MODEL',
  'LOCAL_LLM_TIMEOUT_MS',
  'LM_STUDIO_BASE_URL',
  'LM_STUDIO_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_BASE_URL',
  'NEWS_TRANSLATE_OPENROUTER_MODEL',
];

async function importWithEnv(overrides) {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);

  try {
    return await import(`${MODULE_URL.href}?t=${Date.now()}-${Math.random()}`);
  } finally {
    for (const key of ENV_KEYS) {
      if (previous.get(key) === undefined) delete process.env[key];
      else process.env[key] = previous.get(key);
    }
  }
}

test('getLlmRoutingConfig prefers local LM Studio and keeps OpenRouter as fallback', async () => {
  const mod = await importWithEnv({
    LOCAL_LLM_BASE_URL: 'http://100.109.56.73:1234',
    LOCAL_LLM_MODEL: 'google/gemma-4-e4b',
    LOCAL_LLM_TIMEOUT_MS: '12000',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'google/gemma-4-31b-it',
  });

  const config = mod.getLlmRoutingConfig({ model: 'google/gemma-4-e4b', timeoutMs: 12000 });
  assert.equal(config.primaryProvider, 'local-lm');
  assert.equal(config.providers[0].baseUrl, 'http://100.109.56.73:1234/v1');
  assert.equal(config.providers[0].model, 'google/gemma-4-e4b');
  assert.equal(config.providers[0].timeoutMs, 12000);
  assert.equal(config.providers[1].label, 'openrouter');
  assert.equal(config.providers[1].model, 'google/gemma-4-31b-it');
});

test('getLlmRoutingConfig falls back to OpenRouter only when no local endpoint is configured', async () => {
  const mod = await importWithEnv({
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL: 'google/gemini-2.5-flash',
  });

  const config = mod.getLlmRoutingConfig({ model: 'google/gemma-4-e4b' });
  assert.equal(config.primaryProvider, 'openrouter');
  assert.equal(config.providers.length, 1);
  assert.equal(config.providers[0].baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(config.providers[0].model, 'google/gemini-2.5-flash');
});
