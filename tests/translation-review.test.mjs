import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReviewPrompt,
  applyReviewFixes,
  reviewTranslation,
  REVIEW_SCHEMA,
} from '../lib/translation-review.js';

const EN_SOURCE = {
  title_en: 'The International 2026 Invitations and Qualifiers',
  summary_en: 'Regional Qualifiers open next month.',
  content_markdown_en: 'Crownfall ends soon. The International prize pool keeps growing.',
};
const ZH = {
  title_zh: '国际邀请赛 2026 邀请与预选赛',
  summary_zh: '地区预选赛下月开赛。',
  content_markdown_zh: '倾天之战即将结束。国际邀请赛总奖金持续增长。',
  content_zh: '倾天之战即将结束。国际邀请赛总奖金持续增长。',
};

test('REVIEW_SCHEMA is strict JSON with required needs_review + issues', () => {
  assert.equal(REVIEW_SCHEMA.type, 'object');
  assert.equal(REVIEW_SCHEMA.additionalProperties, false);
  assert.deepEqual(REVIEW_SCHEMA.required, ['needs_review', 'issues']);
  assert.equal(REVIEW_SCHEMA.properties.needs_review.type, 'boolean');
  assert.equal(REVIEW_SCHEMA.properties.body_corrections.items.required.join(','), 'zh,corrected_zh');
});

test('buildReviewPrompt includes EN source, ZH translation, glossary, and checklist', () => {
  const prompt = buildReviewPrompt({ source: EN_SOURCE, zh: ZH, glossaryPrompt: 'Crownfall -> 倾天之战' });
  assert.match(prompt, /The International 2026 Invitations and Qualifiers/);
  assert.match(prompt, /国际邀请赛 2026 邀请与预选赛/);
  assert.match(prompt, /Crownfall -> 倾天之战/);
  assert.match(prompt, /术语译法/);
  assert.match(prompt, /专有名词/);
  assert.match(prompt, /内容保真/);
  assert.match(prompt, /摘要保真/);
  assert.match(prompt, /body_corrections/);
});

test('buildReviewPrompt truncates long bodies to maxChars', () => {
  const longEn = `E${'x'.repeat(5000)}`;
  const prompt = buildReviewPrompt({ source: { title_en: 't', content_markdown_en: longEn }, zh: {}, maxChars: 100 });
  assert.match(prompt, /\[截断/);
});

test('applyReviewFixes replaces title/summary and does not mutate the input zh', () => {
  const review = {
    needs_review: false,
    fixes: { title_zh: '国际邀请赛 2026 邀请函与预选赛', summary_zh: '地区预选赛将于下月开启。' },
  };
  const result = applyReviewFixes(ZH, review);
  assert.equal(result.zh.title_zh, '国际邀请赛 2026 邀请函与预选赛');
  assert.equal(result.zh.summary_zh, '地区预选赛将于下月开启。');
  // 原文对象不被修改（不可变）
  assert.equal(ZH.title_zh, '国际邀请赛 2026 邀请与预选赛');
  assert.equal(ZH.summary_zh, '地区预选赛下月开赛。');
  assert.deepEqual(result.unresolved, []);
});

test('applyReviewFixes patches body via exact match and recomputes content_zh', () => {
  const review = {
    body_corrections: [{ zh: '倾天之战即将结束', corrected_zh: '倾天之战即将落幕', reason: '用词' }],
  };
  const result = applyReviewFixes(ZH, review, (md) => md.replace(/\*\*/g, ''));
  assert.match(result.zh.content_markdown_zh, /倾天之战即将落幕/);
  assert.equal(result.zh.content_zh, '倾天之战即将落幕。国际邀请赛总奖金持续增长。');
  assert.deepEqual(result.unresolved, []);
});

test('applyReviewFixes keeps unmatched body snippet in unresolved and does not corrupt body', () => {
  const review = {
    body_corrections: [{ zh: '不存在的片段', corrected_zh: '修正片段' }],
  };
  const result = applyReviewFixes(ZH, review);
  assert.equal(result.zh.content_markdown_zh, ZH.content_markdown_zh);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0].zh, '不存在的片段');
});

test('reviewTranslation clean result keeps zh unchanged and needs_review false', async () => {
  const callJson = async () => ({ needs_review: false, issues: [], confidence: 0.95 });
  const out = await reviewTranslation({ source: EN_SOURCE, zh: ZH, callJson, mdToText: (t) => t });
  assert.equal(out.needs_review, false);
  assert.deepEqual(out.issues, []);
  assert.equal(out.review_error, null);
  assert.equal(out.zh.title_zh, ZH.title_zh);
  assert.equal(out.zh.content_markdown_zh, ZH.content_markdown_zh);
});

test('reviewTranslation applies fixes returned by the LLM reviewer', async () => {
  const callJson = async () => ({
    needs_review: false,
    issues: [],
    fixes: { title_zh: '国际邀请赛 2026：邀请与预选赛' },
    body_corrections: [{ zh: '国际邀请赛总奖金', corrected_zh: '国际邀请赛奖池' }],
  });
  const out = await reviewTranslation({ source: EN_SOURCE, zh: ZH, callJson, mdToText: (t) => t });
  assert.equal(out.needs_review, false);
  assert.equal(out.zh.title_zh, '国际邀请赛 2026：邀请与预选赛');
  assert.match(out.zh.content_markdown_zh, /国际邀请赛奖池持续增长/);
});

test('reviewTranslation flags needs_review when LLM cannot fix, keeping zh', async () => {
  const callJson = async () => ({ needs_review: true, issues: ['战队名可能发明，无法确定官方译名'], confidence: 0.4 });
  const out = await reviewTranslation({ source: EN_SOURCE, zh: ZH, callJson });
  assert.equal(out.needs_review, true);
  assert.equal(out.issues.length, 1);
  assert.equal(out.zh.title_zh, ZH.title_zh);
  assert.equal(out.zh.content_markdown_zh, ZH.content_markdown_zh);
});

test('reviewTranslation promotes unresolved body snippet to needs_review', async () => {
  const callJson = async () => ({
    needs_review: false,
    issues: [],
    body_corrections: [{ zh: '找不到的片段', corrected_zh: '修正' }],
  });
  const out = await reviewTranslation({ source: EN_SOURCE, zh: ZH, callJson });
  assert.equal(out.needs_review, true);
  assert.match(out.issues[0], /正文片段未定位/);
});

test('reviewTranslation tolerates callJson failure and keeps zh', async () => {
  const callJson = async () => {
    throw new Error('model unavailable');
  };
  const out = await reviewTranslation({ source: EN_SOURCE, zh: ZH, callJson });
  assert.equal(out.review_error, 'model unavailable');
  assert.equal(out.needs_review, false);
  assert.equal(out.zh.title_zh, ZH.title_zh);
});

test('reviewTranslation returns no-callJson error when callback missing', async () => {
  const out = await reviewTranslation({ source: EN_SOURCE, zh: ZH });
  assert.equal(out.review_error, 'no callJson');
  assert.equal(out.zh.title_zh, ZH.title_zh);
});
