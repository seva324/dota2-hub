import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeTranslatedArticleMarkdown,
  sanitizeTranslatedChunkMarkdown,
  stripMarkdownEmphasis,
} from '../lib/news-translation-cleanup.js';

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

test('stripMarkdownEmphasis removes inline emphasis markers without touching text', () => {
  const input = '在最近结束的 **Premier Series** 中，*PARIVISION* 击败了 __Nigma Galaxy__。';
  const output = stripMarkdownEmphasis(input);
  assert.equal(output, '在最近结束的 Premier Series 中，PARIVISION 击败了 Nigma Galaxy。');
});

test('sanitizeTranslatedArticleMarkdown removes leading title and metadata lines', () => {
  const input = [
    '# MOUZ 注册 Lorenof 出战 DreamLeague Season 29 预选赛',
    '',
    '2026年4月11日',
    '',
    '5 分钟',
    '',
    '* Fenix',
    '',
    'Lorenof 将再次回归 MOUZ 阵容，接替 MidOne 出战本次预选赛。',
  ].join('\n');

  const output = sanitizeTranslatedArticleMarkdown(input, 'MOUZ 注册 Lorenof 参加 DreamLeague 第 29 赛季预选赛');
  assert.equal(output, 'Lorenof 将再次回归 MOUZ 阵容，接替 MidOne 出战本次预选赛。');
});
