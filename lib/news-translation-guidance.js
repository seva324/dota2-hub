import fs from 'node:fs';
import path from 'node:path';

const PROMPT_FILE_NAME = '网站翻译需求.md';
const PROMPT_FILE_CANDIDATES = [
  path.resolve(process.cwd(), 'docs', PROMPT_FILE_NAME),
  path.resolve(process.cwd(), '..', 'docs', PROMPT_FILE_NAME),
  path.resolve(process.cwd(), '..', '..', 'docs', PROMPT_FILE_NAME),
  path.resolve('/Users/ein/dota2-hub/docs', PROMPT_FILE_NAME),
];

const PROMPT_FALLBACK = [
  '你现在是一个 Dota2 中文社区内容编辑，擅长把英文电竞新闻改写成自然、完整、可读的简体中文内容。',
  '语言要像懂比赛的人在复述消息，不要翻译腔，不要官方通稿腔。',
  '保留事实准确性与信息密度，专有名词保留原文。',
].join('\n');

export function loadWebsiteNewsTranslationGuidance() {
  for (const filePath of PROMPT_FILE_CANDIDATES) {
    if (!fs.existsSync(filePath)) continue;
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  return PROMPT_FALLBACK;
}
