import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildArticleDrivenBody,
  buildArticleDrivenTitle,
  inferTopic,
  sanitizeArticleBody,
} from '../lib/xhs-news-draft.js';

test('sanitizeArticleBody removes repeated title and metadata lines', () => {
  const output = sanitizeArticleBody({
    title_zh: 'MOUZ 注册 Lorenof 参加 DreamLeague 第 29 赛季预选赛',
    content_zh: [
      'MOUZ 注册 Lorenof 参加 DreamLeague 第 29 赛季预选赛',
      '作者：BO3.gg',
      '更新时间：2026-04-12',
      'Lorenof 回到 MOUZ 顶替 MidOne 出战 DL29 预选赛。',
      '原文链接：https://example.com/story',
    ].join('\n'),
  });

  assert.equal(output, 'Lorenof 回到 MOUZ 顶替 MidOne 出战 DL29 预选赛。');
});

test('buildArticleDrivenBody stays article-driven for schedule-like stories', () => {
  const row = {
    title_zh: 'MOUZ 注册 Lorenof 参加 DreamLeague 第 29 赛季预选赛',
    summary_zh: 'Lorenof 回到 MOUZ 顶替 MidOne 出战 DL29 预选赛，具体原因还不清楚，看看这次能否带队出线。',
    content_zh: [
      'MOUZ 注册 Lorenof 出战 DreamLeague Season 29 预选赛。',
      '根据赛事主办方公布的文件显示，Lorenof 已被列入 DreamLeague Season 29 预选赛的大名单，接替 MidOne 出战。',
      '目前尚不清楚 MidOne 缺席本次赛事的具体原因。',
      '在 DreamLeague Season 29 预选赛的第一轮中，MOUZ 将对阵 Team Lynx。',
    ].join('\n'),
  };

  const output = buildArticleDrivenBody(row, { maxLen: 400 });
  assert.match(output, /Team Lynx/);
  assert.doesNotMatch(output, /瑞士轮|双败淘汰赛|可以先把这站记上/);
});

test('buildArticleDrivenTitle prefers the article title and inferTopic stays content-based', () => {
  const row = {
    title_zh: 'MOUZ 注册 Lorenof 参加 DreamLeague 第 29 赛季预选赛',
    summary_zh: 'Lorenof 回到 MOUZ 顶替 MidOne 出战 DL29 预选赛。',
    content_zh: 'DreamLeague Season 29 预选赛第一轮，MOUZ 将对阵 Team Lynx。',
  };

  assert.equal(buildArticleDrivenTitle(row), 'MOUZ 注册 Lorenof 参加 DreamLeague 第 29 赛季预选赛');
  assert.equal(inferTopic(row), 'DreamLeague');
});
