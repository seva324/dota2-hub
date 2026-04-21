import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAutoPostSafety,
  hasCompleteTranslatedNewsRow,
  isLocalLlmProvider,
} from '../lib/news-posting-guards.js';

test('isLocalLlmProvider recognizes the local gateway provider', () => {
  assert.equal(isLocalLlmProvider('local-lm'), true);
  assert.equal(isLocalLlmProvider('LOCAL-LM'), true);
  assert.equal(isLocalLlmProvider('openrouter'), false);
});

test('evaluateAutoPostSafety blocks incomplete or non-local translation runs', () => {
  assert.deepEqual(
    evaluateAutoPostSafety({ autoPostEnabled: true, translationCompleted: false, localTranslationTriggered: true }),
    { ok: false, reason: 'translation_incomplete' },
  );
  assert.deepEqual(
    evaluateAutoPostSafety({ autoPostEnabled: true, translationCompleted: true, localTranslationTriggered: false }),
    { ok: false, reason: 'local_model_not_triggered' },
  );
  assert.deepEqual(
    evaluateAutoPostSafety({ autoPostEnabled: true, translationCompleted: true, localTranslationTriggered: true }),
    { ok: true, reason: 'ready' },
  );
});

test('hasCompleteTranslatedNewsRow requires completed status and all zh fields', () => {
  assert.equal(hasCompleteTranslatedNewsRow({
    title_zh: 'Liquid 换人了',
    summary_zh: 'Boxi 这次确认缺席。',
    content_markdown_zh: '正文已经完整翻好。',
    translation_status: 'completed',
  }), true);

  assert.equal(hasCompleteTranslatedNewsRow({
    title_zh: 'Liquid 换人了',
    summary_zh: 'Boxi 这次确认缺席。',
    content_markdown_zh: '',
    translation_status: 'completed',
  }), false);

  assert.equal(hasCompleteTranslatedNewsRow({
    title_zh: 'Liquid 换人了',
    summary_zh: 'Boxi 这次确认缺席。',
    content_markdown_zh: '正文已经完整翻好。',
    translation_status: 'partial',
  }), false);
});
