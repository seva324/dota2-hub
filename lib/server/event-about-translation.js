/**
 * 赛事详情简介翻译 — about 结构化中文翻译。
 *
 * 复用 news 翻译管线（callTranslationModel：OpenRouter 优先 + MiniMax fallback）。
 * 将 about { intro, sections[{heading, body}] } 序列化为 key||| 行一次性翻译，
 * 全部 key 命中才替换（避免半成品），失败/超时返回 null 由调用方回退英文原文。
 */

import {
  callTranslationModel,
  getTranslationApiKey,
  getPreferredTranslationProvider,
} from './news-translation.js';
import { looksChinese } from './news-utils.js';

const MAX_ABOUT_CHARS = 6000;
const TRANSLATION_TIMEOUT_MS = 20000;

function serializeAbout(about) {
  if (!about || typeof about !== 'object') return null;
  const lines = [];
  if (about.intro) lines.push(`intro|||${about.intro.replace(/\n/g, ' ')}`);
  (about.sections || []).forEach((section, index) => {
    if (section?.heading) lines.push(`section:${index}:heading|||${section.heading.replace(/\n/g, ' ')}`);
    if (section?.body) lines.push(`section:${index}:body|||${section.body.replace(/\n/g, ' ')}`);
  });
  return lines.length > 0 ? lines.join('\n') : null;
}

function parseTranslatedLines(outputText) {
  const map = new Map();
  const lines = String(outputText || '').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^|]+)\|\|\|(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const text = match[2].trim();
    if (key && text) map.set(key, text);
  }
  return map;
}

/**
 * 翻译 about。已是中文返回原样；无翻译能力/失败返回 null（调用方保留英文）。
 * 成功时返回翻译后的 about 结构（仅替换命中项，缺失项保留原文）。
 */
export async function translateEventAbout(about) {
  if (!about || !about.intro || looksChinese(about.intro)) return about;

  const source = serializeAbout(about);
  if (!source || source.length > MAX_ABOUT_CHARS) return null;

  const apiKey = getTranslationApiKey();
  const provider = getPreferredTranslationProvider(apiKey);
  if (!provider) return null;

  const prompt = [
    '你是赛事简介翻译助手，把英文赛事简介翻译为简体中文。',
    '保留队伍名、选手名、赛事名、金额、日期等专有名词原文。',
    '请严格按以下格式逐行输出，不要输出任何额外解释：',
    'key|||翻译结果',
    '输入：',
    source,
  ].join('\n');

  try {
    const outputText = await callTranslationModel(apiKey, prompt, 3000, TRANSLATION_TIMEOUT_MS);
    const map = parseTranslatedLines(outputText);
    const expectedKeys = [...source.matchAll(/^([^|\n]+)\|\|\|/gm)].map((m) => m[1]);
    const allHit = expectedKeys.length > 0 && expectedKeys.every((key) => map.has(key));
    if (!allHit || map.size === 0) return null;

    return {
      intro: map.get('intro') || about.intro,
      sections: (about.sections || []).map((section, index) => ({
        heading: map.get(`section:${index}:heading`) || section.heading,
        body: map.get(`section:${index}:body`) || section.body,
      })),
      prizeBreakdown: about.prizeBreakdown || [],
    };
  } catch (error) {
    console.error('[event-about] translation failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}
