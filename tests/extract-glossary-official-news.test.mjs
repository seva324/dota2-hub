import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alignArticle,
  buildExtractionPrompt,
  aggregateCandidates,
} from '../scripts/extract-glossary-from-official-news.mjs';

test('alignArticle pairs EN/ZH blocks 1:1 when structure matches', () => {
  const en = ['![](img-a.png)', 'The International is coming.', 'New Immortals added.'];
  const zh = ['![](img-a.png)', '国际邀请赛即将到来。', '新增不朽饰品。'];
  const pairs = alignArticle(en.join('\n\n'), zh.join('\n\n'));
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].en, '![](img-a.png)');
  assert.equal(pairs[1].en, 'The International is coming.');
  assert.equal(pairs[1].zh, '国际邀请赛即将到来。');
});

test('alignArticle skips an extra image line in one language to keep text aligned', () => {
  const en = ['![](img-a.png)', 'The International is coming.', 'New Immortals added.'];
  const zh = ['![](img-a.png)', '国际邀请赛即将到来。', '![](https://cdn.example.com/extra.png)', '新增不朽饰品。'];
  const pairs = alignArticle(en.join('\n\n'), zh.join('\n\n'));
  assert.equal(pairs.length, 3);
  assert.equal(pairs[1].en, 'The International is coming.');
  assert.equal(pairs[1].zh, '国际邀请赛即将到来。');
  assert.equal(pairs[2].en, 'New Immortals added.');
  assert.equal(pairs[2].zh, '新增不朽饰品。');
});

test('alignArticle truncates to the shorter side when block counts mismatch', () => {
  const en = ['intro', 'patch notes', 'conclusion'];
  const zh = ['导语', '补丁说明', '补充说明', '结语'];
  const pairs = alignArticle(en.join('\n\n'), zh.join('\n\n'));
  assert.equal(pairs.length, 3);
});

test('buildExtractionPrompt includes title and aligned blocks', () => {
  const article = { title_en: 'Summer Scrub', title_zh: '夏令涤尘', id: 'x' };
  const pairs = [{ en: 'Collector\'s Cache', zh: '典藏宝瓶' }];
  const prompt = buildExtractionPrompt(article, pairs);
  assert.match(prompt, /Summer Scrub/);
  assert.match(prompt, /夏令涤尘/);
  assert.match(prompt, /Collector's Cache/);
  assert.match(prompt, /典藏宝瓶/);
});

test('aggregateCandidates drops existing glossary keys', () => {
  const existing = new Set(['tormentor']);
  const raw = [{ terms: [{ en: 'Tormentor', zh: '痛苦魔方', category: 'mechanic', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' }] }];
  const out = aggregateCandidates(raw, existing, {});
  assert.equal(out.length, 0);
});

test('aggregateCandidates drops excluded categories and low confidence', () => {
  const raw = [{
    terms: [
      { en: 'Compendium', zh: '典藏版', category: 'other', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' },
      { en: 'MMR', zh: '天梯分', category: 'general', confidence: 0.4, aliases_en: [], aliases_zh: [], note: '' },
      { en: 'Arcana', zh: '至宝', category: 'esports', confidence: 0.8, aliases_en: [], aliases_zh: [], note: '' },
    ],
  }];
  const out = aggregateCandidates(raw, new Set(), {});
  assert.deepEqual(out.map((t) => t.en), ['Arcana']);
});

test('aggregateCandidates drops noise (numbers, single char, zh equals en)', () => {
  const raw = [{
    terms: [
      { en: '7.41e', zh: '7.41e', category: 'general', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' },
      { en: 'A', zh: '一个', category: 'general', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' },
      { en: 'Dota', zh: 'Dota', category: 'general', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' },
      { en: 'Summer Scrub', zh: '夏令涤尘', category: 'event', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' },
    ],
  }];
  const out = aggregateCandidates(raw, new Set(), {});
  assert.deepEqual(out.map((t) => t.en), ['Summer Scrub']);
});

test('aggregateCandidates dedupes by normalized EN and aggregates occurrences + sources', () => {
  const raw = [
    { title: 'A', terms: [{ en: 'The International', zh: '国际邀请赛', category: 'esports', confidence: 0.8, aliases_en: [], aliases_zh: [], note: '' }] },
    { title: 'B', terms: [{ en: 'The International', zh: 'TI', category: 'esports', confidence: 0.9, aliases_en: [], aliases_zh: [], note: '' }] },
  ];
  const out = aggregateCandidates(raw, new Set(), {});
  assert.equal(out.length, 1);
  assert.equal(out[0].occurrences, 2);
  assert.deepEqual(out[0].sources.sort(), ['A', 'B']);
  // 保留更高置信度的译名
  assert.equal(out[0].zh, 'TI');
});
