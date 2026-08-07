import { callLlmJson, callLlmText } from '../openrouter.mjs';
import { loadWebsiteNewsTranslationGuidance } from '../news-translation-guidance.js';
import { sanitizeTranslatedArticleMarkdown, stripMarkdownEmphasis } from '../news-translation-cleanup.js';
import {
  buildRequiredTranslationGlossaryPrompt,
  normalizeGlossaryTranslations,
  normalizeGlossaryTranslationsInMarkdown,
} from '../translation-glossary.js';
import { reviewTranslation } from '../translation-review.js';
import { fetchWithTimeout, markdownToText, looksChinese } from './news-utils.js';

const MINIMAX_API_URL = process.env.MINIMAX_API_URL || 'https://api.minimax.io/anthropic/v1/messages';
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
const OPENROUTER_TRANSLATION_MODEL =
  process.env.NEWS_TRANSLATE_OPENROUTER_MODEL ||
  process.env.NEWS_TRANSLATE_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'google/gemini-2.5-flash';
const NEWS_TRANSLATION_PROVIDER = 'minimax';
const OPENROUTER_TRANSLATION_PROVIDER = 'openrouter';
const TRANSLATION_STATUS_PENDING = 'pending';
const TRANSLATION_STATUS_PARTIAL = 'partial';
const TRANSLATION_STATUS_COMPLETED = 'completed';
const NEWS_TRANSLATION_GUIDANCE = loadWebsiteNewsTranslationGuidance();
const REVIEW_ENABLED =
  Boolean(process.env.OPENROUTER_API_KEY) &&
  !['0', 'false', 'no', 'off'].includes(String(process.env.NEWS_TRANSLATE_REVIEW || '1').toLowerCase());

function glossaryPromptForItem(item = {}) {
  return buildTranslationGlossaryPrompt({
    title: item?.title || item?.title_en || '',
    summary: item?.summary || item?.summary_en || '',
    content: item?.content_markdown || item?.content_en || item?.content || '',
  });
}

function requiredGlossaryPromptForItem(item = {}) {
  return buildRequiredTranslationGlossaryPrompt({
    title: item?.title || item?.title_en || '',
    summary: item?.summary || item?.summary_en || '',
    content: item?.content_markdown || item?.content_en || item?.content || '',
  });
}

function applyGlossaryText(value = '', item = {}) {
  return normalizeGlossaryTranslations(value, {
    title: item?.title || item?.title_en || '',
    summary: item?.summary || item?.summary_en || '',
    content: item?.content_markdown || item?.content_en || item?.content || '',
  });
}

function applyGlossaryMarkdown(value = '', item = {}) {
  return sanitizeTranslatedArticleMarkdown(stripMarkdownEmphasis(normalizeGlossaryTranslationsInMarkdown(value, {
    title: item?.title || item?.title_en || '',
    summary: item?.summary || item?.summary_en || '',
    content: item?.content_markdown || item?.content_en || item?.content || '',
  })), item?.title_zh || item?.title || item?.title_en || '');
}

export function getTranslationApiKey() {
  return process.env.MINIMAX_API_KEY || process.env.MINIMAX_TEXT_API_KEY || '';
}

export function getPreferredTranslationProvider(apiKey = '') {
  if (process.env.OPENROUTER_API_KEY) return OPENROUTER_TRANSLATION_PROVIDER;
  if (apiKey) return NEWS_TRANSLATION_PROVIDER;
  return null;
}

function normalizeModelOutputText(value = '') {
  let text = String(value || '').trim();
  if (!text) return '';

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  if (fenced) {
    text = fenced.trim();
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return String(parsed).trim();
    if (parsed && typeof parsed.text === 'string') return String(parsed.text).trim();
  } catch {
    // ignore
  }

  const textField = text.match(/^\s*"text"\s*:\s*([\s\S]+)$/i)?.[1];
  if (textField) {
    return textField.trim().replace(/^"(.*)"$/s, '$1').trim();
  }

  return text;
}

function extractMiniMaxText(data) {
  if (Array.isArray(data?.content)) {
    return data.content
      .filter((x) => x?.type === 'text' && typeof x?.text === 'string')
      .map((x) => x.text)
      .join('\n');
  }

  if (typeof data?.output_text === 'string') return data.output_text;
  return '';
}

async function callTranslationModel(apiKey, prompt, maxTokens = 1200, timeoutMs = 20000) {
  const errors = [];

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const outputText = normalizeModelOutputText(await callLlmText(prompt, {
        model: OPENROUTER_TRANSLATION_MODEL,
        timeoutMs: Math.max(timeoutMs, 30000),
        maxTokens,
      })).trim();
      if (!outputText) {
        throw new Error('openrouter returned empty translations');
      }
      return outputText;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`openrouter: ${message}`);
      console.warn(`[News API] OpenRouter translation fallback failed: ${message}`);
    }
  }

  if (!apiKey) {
    throw new Error(errors.length ? errors.join(' | ') : 'No translation model API key configured');
  }

  try {
    const response = await fetchWithTimeout(
      MINIMAX_API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MINIMAX_MODEL,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        }),
      },
      timeoutMs
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(`minimax HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
    }

    const payload = await response.json();
    const outputText = normalizeModelOutputText(extractMiniMaxText(payload)).trim();
    if (!outputText) {
      throw new Error('minimax returned empty translations');
    }
    return outputText;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`minimax: ${message}`);
    throw new Error(errors.join(' | '));
  }
}

async function translateNewsWithMiniMax(news) {
  const apiKey = getTranslationApiKey();
  if (!Array.isArray(news) || news.length === 0) return news;
  if (!apiKey) {
    console.warn('[News API] translation API key is missing, skip translation');
    return news;
  }

  const tasks = [];
  for (let i = 0; i < news.length; i++) {
    const item = news[i];
    if (item?.title && !looksChinese(item.title)) {
      tasks.push({ key: `${i}:title`, text: item.title });
    }
    if (item?.summary && !looksChinese(item.summary)) {
      tasks.push({ key: `${i}:summary`, text: item.summary });
    }
  }

  if (tasks.length === 0) return news;
  console.log(`[News API] MiniMax translation tasks: ${tasks.length}`);

  try {
    const sourceLines = tasks.map((t) => `${t.key}|||${t.text.replace(/\n/g, ' ')}`).join('\n');
    const prompt = [
      '你是新闻翻译助手，把英文翻译为简体中文，保留战队名、选手名、赛事名原文。',
      '请严格按以下格式逐行输出，不要输出任何额外解释：',
      'key|||翻译结果',
      '输入：',
      sourceLines,
    ].join('\n');

    const outputText = await callTranslationModel(apiKey, prompt, 2500, 25000);
    const map = new Map();
    const lines = String(outputText || '').split('\n');
    for (const line of lines) {
      const m = line.match(/^([^|]+)\|\|\|(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const text = m[2].trim();
      if (key && text) map.set(key, text);
    }

    if (map.size === 0) {
      throw new Error('MiniMax returned empty translations');
    }

    console.log(`[News API] MiniMax translated entries: ${map.size}`);

    return news.map((item, index) => ({
      ...item,
      title: map.get(`${index}:title`) || item.title,
      summary: map.get(`${index}:summary`) || item.summary,
      content: item.content,
    }));
  } catch (error) {
    console.error('[News API] MiniMax translation failed:', error instanceof Error ? error.message : error);
    return news;
  }
}

function splitTextChunks(text, maxLen = 1400) {
  const parts = String(text || '').split('\n\n');
  const chunks = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (part.length <= maxLen) {
      current = part;
    } else {
      for (let i = 0; i < part.length; i += maxLen) {
        chunks.push(part.slice(i, i + maxLen));
      }
      current = '';
    }
  }

  if (current) chunks.push(current);
  return chunks.slice(0, 8);
}

export function hasCompleteChineseBody(value, fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh) return false;
  if (!looksChinese(zh)) return false;
  const en = markdownToText(fallbackEn || '');
  const zhText = markdownToText(zh);
  if (!zhText) return false;
  if (en && zhText === en) return false;
  if (en && zhText.length < Math.min(120, Math.floor(en.length * 0.45))) return false;
  return true;
}

function looksLikeTranslationRefusal(value = '') {
  return /抱歉|请提供|请把完整|无法保证|没有看到正文|只看到了标题|not enough|provide the full|由于.*没有提供.*(?:英文|正文|素材)|请发送.*(?:英文|内容|正文)|没有提供需要翻译|缺乏具体.*(?:正文|新闻)|无法为您翻译完整/i.test(String(value));
}

function looksLikeStructuredArticle(value = '') {
  return /标题[:：]|正文[:：]|总结[:：]|点评[:：]/.test(String(value));
}

function hasChineseTitle(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeStructuredArticle(zh) || looksLikeTranslationRefusal(zh)) return false;
  return !fallbackEn || zh !== String(fallbackEn || '').trim();
}

function hasChineseSummary(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeStructuredArticle(zh) || looksLikeTranslationRefusal(zh)) return false;
  return !fallbackEn || zh !== String(fallbackEn || '').trim();
}

export function buildTranslationMeta(item, translated, provider = null) {
  const sourceBody = item?.content_markdown || item?.content || '';
  const titleDone = item?.title ? hasChineseTitle(translated?.title_zh, item.title) : true;
  const summaryDone = item?.summary ? hasChineseSummary(translated?.summary_zh, item.summary) : true;
  const bodyDone = sourceBody ? hasCompleteChineseBody(translated?.content_markdown_zh || translated?.content_zh || '', sourceBody) : true;
  const anyDone = titleDone || summaryDone || bodyDone;
  const complete = titleDone && summaryDone && bodyDone;
  const needsReview = Boolean(translated?.needs_review);
  const reviewReason = translated?.review_reason || null;
  const resolvedProvider = anyDone ? (provider || translated?._provider || null) : null;

  return {
    translation_status: needsReview
      ? TRANSLATION_STATUS_PARTIAL
      : complete
        ? TRANSLATION_STATUS_COMPLETED
        : anyDone
          ? TRANSLATION_STATUS_PARTIAL
          : TRANSLATION_STATUS_PENDING,
    translation_provider: resolvedProvider,
    translation_needs_review: needsReview,
    translation_review_reason: reviewReason,
    title_zh_provider: titleDone ? resolvedProvider : null,
    summary_zh_provider: summaryDone ? resolvedProvider : null,
    content_zh_provider: bodyDone ? resolvedProvider : null,
    translated_at: anyDone ? new Date().toISOString() : null,
  };
}

async function translateCommunityTitle(apiKey, item) {
  if (!item?.title || looksChinese(item.title)) return item?.title || null;
  const glossaryPrompt = requiredGlossaryPromptForItem(item);
  try {
    const prompt = [
      NEWS_TRANSLATION_GUIDANCE,
      '',
      glossaryPrompt,
      glossaryPrompt ? '' : '',
      '请基于下面英文 Dota2 新闻信息，写一个适合中文社区传播的中文标题。',
      '要求：',
      '- 保留战队名、选手名、赛事名等专有名词原文',
      '- 不要补充原文没有的信息',
      '- 只输出一行中文标题，不要正文，不要点评，不要解释',
      '',
      `英文标题：${item.title}`,
      item.summary ? `英文摘要：${item.summary}` : '',
    ].join('\n');
    let output = await callTranslationModel(apiKey, prompt, 800, 18000);
    if (!output || !looksChinese(output) || looksLikeStructuredArticle(output) || looksLikeTranslationRefusal(output)) {
      const retryPrompt = [
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '把下面英文 Dota2 新闻标题改写成一个中文社区传播标题。',
        '要求：必须输出简体中文；保留专有名词原文；不能输出英文整句；不能输出标题/正文/总结标签；只输出一行标题。',
        item.title,
      ].join('\n');
      output = await callTranslationModel(apiKey, retryPrompt, 400, 15000).catch(() => output);
      if (!output || !looksChinese(output) || looksLikeStructuredArticle(output) || looksLikeTranslationRefusal(output)) {
        const finalPrompt = [
          NEWS_TRANSLATION_GUIDANCE,
          '',
          glossaryPrompt,
          glossaryPrompt ? '' : '',
          '将下面英文 Dota2 新闻标题直接翻译为简体中文标题。',
          '要求：必须输出中文；保留专有名词原文；只输出一行标题；不要解释。',
          item.title,
        ].join('\n');
        output = await callTranslationModel(apiKey, finalPrompt, 400, 15000).catch(() => output);
      }
    }
    return applyGlossaryText(output || item.title, item);
  } catch {
    return item.title;
  }
}

async function translateCommunitySummary(apiKey, item) {
  const seed = item?.summary || item?.content || item?.content_markdown || item?.title;
  if (!seed || looksChinese(seed)) return item?.summary || seed || null;
  const glossaryPrompt = requiredGlossaryPromptForItem(item);
  try {
    const prompt = [
      NEWS_TRANSLATION_GUIDANCE,
      '',
      glossaryPrompt,
      glossaryPrompt ? '' : '',
      '请基于下面英文 Dota2 新闻信息，写一句简短点评/总结。',
      '要求：',
      '- 20 到 50 字',
      '- 口语化，但不要乱玩梗',
      '- 只输出一句中文，不要标题，不要正文，不要解释',
      '',
      `英文标题：${item.title || ''}`,
      item.summary ? `英文摘要：${item.summary}` : '',
      item.content ? `英文正文：${String(item.content).slice(0, 1600)}` : '',
    ].join('\n');
    let output = await callTranslationModel(apiKey, prompt, 800, 18000);
    if (!output || !looksChinese(output) || looksLikeStructuredArticle(output) || looksLikeTranslationRefusal(output)) {
      const retryPrompt = [
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '基于下面英文 Dota2 新闻信息，写一句中文总结。',
        '要求：必须输出简体中文；20到50字；不能道歉；不能要求补充材料；不能输出标题/正文/总结标签；只输出一句话。',
        `标题：${item.title || ''}`,
        item.summary ? `摘要：${item.summary}` : '',
        item.content ? `正文：${String(item.content).slice(0, 1200)}` : '',
      ].join('\n');
      output = await callTranslationModel(apiKey, retryPrompt, 400, 15000).catch(() => output);
      if (!output || !looksChinese(output) || looksLikeStructuredArticle(output) || looksLikeTranslationRefusal(output)) {
        const finalPrompt = [
          NEWS_TRANSLATION_GUIDANCE,
          '',
          glossaryPrompt,
          glossaryPrompt ? '' : '',
          '把下面英文 Dota2 新闻摘要翻译并压缩成一句简体中文总结。',
          '要求：必须输出中文；20到50字；只输出一句话；不要解释。',
          `标题：${item.title || ''}`,
          item.summary ? `摘要：${item.summary}` : '',
          item.content ? `正文：${String(item.content).slice(0, 1200)}` : '',
        ].join('\n');
        output = await callTranslationModel(apiKey, finalPrompt, 400, 15000).catch(() => output);
      }
    }
    return applyGlossaryText(output || item.summary || item.title, item);
  } catch {
    return item.summary || item.title;
  }
}

export async function translateLongMarkdown(apiKey, text, glossaryPrompt = '', item = {}) {
  if (!text || looksChinese(text)) return text;
  const chunks = splitTextChunks(text, 1300);
  const translated = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    try {
      const prompt = [
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        chunks.length > 1
          ? `下面内容是整篇网站文章中的第 ${index + 1}/${chunks.length} 段正文。`
          : '下面内容是需要翻译的网站新闻正文。',
        '只输出最终中文 markdown 正文。',
        '保留 markdown 链接、图片、列表、标题等语法；保留专有名词原文；保持段落结构。',
        '不要输出 JSON、代码块、字段标签，也不要额外补标题、摘要、总结、点评或话题。',
        '',
        chunk,
      ].join('\n');
      let output = await callTranslationModel(apiKey, prompt, 1800, 22000).catch(() => chunk);
      if (!hasCompleteChineseBody(output, chunk) || looksLikeTranslationRefusal(output)) {
        const retryPrompt = [
          NEWS_TRANSLATION_GUIDANCE,
          '',
          glossaryPrompt,
          glossaryPrompt ? '' : '',
          `下面内容只是长文章中的第 ${index + 1}/${chunks.length} 段正文。`,
          '请完整翻成简体中文网站正文。',
          '只输出中文 markdown 正文；保留 markdown 结构和专有名词原文；不要输出 JSON、代码块、字段标签；不要为分段单独起标题。',
          '',
          chunk,
        ].join('\n');
        output = await callTranslationModel(apiKey, retryPrompt, 1800, 22000).catch(() => output);
        if (!hasCompleteChineseBody(output, chunk) || looksLikeTranslationRefusal(output)) {
          const finalPrompt = [
            NEWS_TRANSLATION_GUIDANCE,
            '',
            glossaryPrompt,
            glossaryPrompt ? '' : '',
            `下面内容只是长文章中的第 ${index + 1}/${chunks.length} 段正文。`,
            '请直接翻成简体中文网站正文。',
            '只输出中文 markdown 正文；保留 markdown 结构和专有名词原文；不要解释；不要输出 JSON、代码块、字段标签。',
            '',
            chunk,
          ].join('\n');
          output = await callTranslationModel(apiKey, finalPrompt, 1800, 22000).catch(() => output);
        }
      }
      translated.push(applyGlossaryMarkdown(output, item));
    } catch {
      translated.push(chunk);
    }
  }

  return applyGlossaryMarkdown(translated.join('\n\n'), item);
}

export async function translateItem(apiKey, item) {
  const sourceBody = item.content_markdown || item.content || '';
  const requiredBodyGlossaryPrompt = requiredGlossaryPromptForItem(item);
  const provider = getPreferredTranslationProvider(apiKey);
  if (!provider) {
    return {
      title_zh: null,
      summary_zh: null,
      content_zh: null,
      content_markdown_zh: null,
      _provider: provider,
    };
  }

  const [title_zh, summary_zh, content_markdown_zh] = await Promise.all([
    translateCommunityTitle(apiKey, item),
    translateCommunitySummary(apiKey, item),
    sourceBody ? translateLongMarkdown(apiKey, sourceBody, requiredBodyGlossaryPrompt, item) : Promise.resolve(sourceBody),
  ]);

  let zh = {
    title_zh,
    summary_zh,
    content_markdown_zh,
    content_zh: content_markdown_zh ? markdownToText(content_markdown_zh) : item.content,
  };
  let reviewNeedsReview = false;
  let reviewReason = null;

  if (REVIEW_ENABLED && (item?.title || item?.summary || sourceBody)) {
    const reviewOut = await reviewTranslation({
      source: {
        title_en: item?.title || '',
        summary_en: item?.summary || '',
        content_markdown_en: item?.content_markdown || item?.content || '',
      },
      zh,
      glossaryPrompt: requiredGlossaryPromptForItem(item),
      callJson: (prompt, schema, timeoutMs) =>
        callLlmJson(prompt, schema, {
          model: OPENROUTER_TRANSLATION_MODEL,
          timeoutMs: Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 60000,
        }),
      mdToText: markdownToText,
    });
    if (reviewOut.review_error) {
      console.warn(`[translate] review failed for ${item?.id || ''}: ${reviewOut.review_error}`);
    } else {
      zh = reviewOut.zh;
      reviewNeedsReview = reviewOut.needs_review;
      if (reviewNeedsReview && reviewOut.issues.length) {
        reviewReason = reviewOut.issues.join('；').slice(0, 1000);
      }
    }
  }

  return {
    title_zh: zh.title_zh,
    summary_zh: zh.summary_zh,
    content_markdown_zh: zh.content_markdown_zh,
    content_zh: zh.content_zh,
    _provider: provider,
    needs_review: reviewNeedsReview,
    review_reason: reviewReason,
  };
}

export {
  NEWS_TRANSLATION_PROVIDER,
  OPENROUTER_TRANSLATION_PROVIDER,
  TRANSLATION_STATUS_PENDING,
  TRANSLATION_STATUS_PARTIAL,
  TRANSLATION_STATUS_COMPLETED,
  translateNewsWithMiniMax,
  callTranslationModel,
};
