import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTranslatedChunkMarkdown } from '../lib/news-translation-cleanup.js';

test('sanitizeTranslatedChunkMarkdown removes chunk-level title/body/summary scaffolding', () => {
  const input = [
    '标题：7.41b版本最强英雄是谁？',
    '',
    '正文：',
    '狼人是这次7.41b里最强势的英雄之一，胜率已经冲到55%。',
    '',
    '他最大的变化在于节奏更稳定，推进和团战都更容易滚雪球。',
    '',
    '总结：这英雄现在确实值得多练。',
  ].join('\n');

  const output = sanitizeTranslatedChunkMarkdown(input, 'Original source body without a heading.');
  assert.equal(
    output,
    [
      '狼人是这次7.41b里最强势的英雄之一，胜率已经冲到55%。',
      '',
      '他最大的变化在于节奏更稳定，推进和团战都更容易滚雪球。',
    ].join('\n')
  );
});

test('sanitizeTranslatedChunkMarkdown removes markdown-wrapped label lines', () => {
  const input = [
    '**标题：Liquid 临时换人，Boxi 缺席 Premier Series**',
    '',
    '**正文：**',
    'Liquid 这边突然确认 Boxi 无法出战，Ekki 将作为替补顶上。',
    '',
    '**点评：** 这站比赛快打成替补大乱斗了。',
  ].join('\n');

  const output = sanitizeTranslatedChunkMarkdown(input, 'Middle chunk without its own heading.');
  assert.equal(output, 'Liquid 这边突然确认 Boxi 无法出战，Ekki 将作为替补顶上。');
});

test('sanitizeTranslatedChunkMarkdown drops injected short title paragraph for continuation chunks', () => {
  const input = [
    '7.41b版本更新重点',
    '',
    '这次更新主要集中在几位热门英雄和核心装备的数值平衡上，整体方向还是压制当前过强的节奏点。',
    '',
    '另外一些天梯热门英雄也被顺手削了一刀。',
  ].join('\n');

  const output = sanitizeTranslatedChunkMarkdown(input, 'This chunk starts in the middle of a long article body.');
  assert.equal(
    output,
    [
      '这次更新主要集中在几位热门英雄和核心装备的数值平衡上，整体方向还是压制当前过强的节奏点。',
      '',
      '另外一些天梯热门英雄也被顺手削了一刀。',
    ].join('\n')
  );
});
