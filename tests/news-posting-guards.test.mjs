import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAutoPostSafety,
  hasCompleteTranslatedNewsRow,
  isGemma4Model,
} from '../lib/news-posting-guards.js';

test('isGemma4Model recognizes aliases and canonical ids', () => {
  assert.equal(isGemma4Model('gemma4'), true);
  assert.equal(isGemma4Model('google/gemma-4-31b-it'), true);
  assert.equal(isGemma4Model('GOOGLE/GEMMA-4'), true);
  assert.equal(isGemma4Model('gpt-5.4-mini'), false);
});

test('evaluateAutoPostSafety blocks incomplete or non-gemma translation runs', () => {
  assert.deepEqual(
    evaluateAutoPostSafety({ autoPostEnabled: true, translationCompleted: false, gemmaTranslationTriggered: true }),
    { ok: false, reason: 'translation_incomplete' },
  );
  assert.deepEqual(
    evaluateAutoPostSafety({ autoPostEnabled: true, translationCompleted: true, gemmaTranslationTriggered: false }),
    { ok: false, reason: 'gemma4_not_triggered' },
  );
  assert.deepEqual(
    evaluateAutoPostSafety({ autoPostEnabled: true, translationCompleted: true, gemmaTranslationTriggered: true }),
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
