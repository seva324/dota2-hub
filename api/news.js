import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { classifyNewsCategory } from '../lib/server/news-category.js';
import { callLlmText } from '../lib/openrouter.mjs';
import { mapWithConcurrency } from '../lib/server/derived-refresh-utils.js';
import { buildTranslationGlossaryPrompt } from '../lib/translation-glossary.js';

/**
 * News API
 * Multi-source scraper with robust fallbacks.
 *
 * Usage: GET /api/news
 */

const MAX_ITEMS = 30;
const DETAIL_FETCH_LIMIT = 10;
const HAWK_LIST_SCAN_LIMIT = 40;
const CYBERSCORE_LIST_SCAN_LIMIT = 24;
const CYBERSCORE_DETAIL_SCAN_LIMIT = 10;
const CYBERSCORE_FALLBACK_ENRICH_LIMIT = 6;
const CYBERSCORE_DETAIL_CONCURRENCY = 2;
const CYBERSCORE_JINA_RETRY_ATTEMPTS = 2;
const CYBERSCORE_JINA_TIMEOUT_MS = 15000;
const MAX_CONTENT_LENGTH = 5000;
const DEFAULT_NEWS_INCREMENTAL_WINDOW_SECONDS = 24 * 60 * 60;
const JINA_PROXY = 'https://r.jina.ai/http://';
const BO3_API_BASE = 'https://api.bo3.gg/api/v1';
const DATABASE_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
const CYBERSCORE_CATEGORIES = [
  {
    key: 'competitive',
    label: 'Competitive Dota 2',
    url: 'https://cyberscore.live/en/news/category/dota-2-pro-scene/',
    category: 'esports',
  },
  {
    key: 'interviews',
    label: 'Interviews and comments',
    url: 'https://cyberscore.live/en/news/category/interviews-and-comments/',
    category: 'takes',
  },
  {
    key: 'other',
    label: 'Other news',
    url: 'https://cyberscore.live/en/news/category/other/',
    category: 'community',
  },
  {
    key: 'patches',
    label: 'Patches and game meta',
    url: 'https://cyberscore.live/en/news/category/dota-2-patches-game-meta/',
    category: 'patch',
  },
];

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
let sql = null;
const NEWS_TRANSLATION_GUIDANCE = [
  '你现在是一个 Dota2 中文社区内容编辑，擅长把英文电竞新闻改写成中文论坛搬运帖风格。',
  '',
  '你的写作风格：',
  '- 像资深 Dota2 观众在复述消息',
  '- 轻松、自然、口语化',
  '- 不要官方通稿腔，不要逐字直译',
  '- 可以有一点互联网感，但不要乱玩梗',
  '- 重点突出比赛结果、队伍状态、选手发言和观众最关心的信息',
  '- 所有事实必须忠于原文，不能脑补',
  '',
  '每次我给你英文新闻时，请输出：',
  '1. 一个适合中文社区传播的标题',
  '2. 一段自然流畅的正文',
  '3. 一句简短点评/总结',
].join('\n');

function glossaryPromptForItem(item = {}) {
  return buildTranslationGlossaryPrompt({
    title: item?.title || item?.title_en || '',
    summary: item?.summary || item?.summary_en || '',
    content: item?.content_markdown || item?.content_en || item?.content || '',
  });
}

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

function generateId(url, prefix) {
  const hash = url.slice(-60).replace(/[^a-zA-Z0-9]/g, '');
  return `${prefix}-${hash}`;
}

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        Connection: 'keep-alive',
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTextWithRetries(url, options = {}) {
  const timeout = Number.isFinite(Number(options?.timeout))
    ? Math.max(1000, Math.trunc(Number(options.timeout)))
    : 15000;
  const attempts = Number.isFinite(Number(options?.attempts))
    ? Math.max(1, Math.trunc(Number(options.attempts)))
    : 1;
  const retryDelayMs = Number.isFinite(Number(options?.retryDelayMs))
    ? Math.max(0, Math.trunc(Number(options.retryDelayMs)))
    : 600;
  const label = String(options?.label || url);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, { headers: options?.headers || {} }, timeout);
      if (!response.ok) {
        throw new Error(`${label} failed: HTTP ${response.status}`);
      }
      const text = await response.text();
      if (!String(text || '').trim()) {
        throw new Error(`${label} failed: empty body`);
      }
      return text;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      const message = error instanceof Error ? error.message : String(error || '');
      const delay = /\b429\b/.test(message)
        ? Math.max(retryDelayMs, 2500) * attempt
        : retryDelayMs * attempt;
      await sleep(delay);
    }
  }

  throw lastError || new Error(`${label} failed`);
}

function parseJsonLdBlocks(html) {
  const blocks = [];
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else if (parsed && Array.isArray(parsed['@graph'])) {
        blocks.push(...parsed['@graph']);
      } else {
        blocks.push(parsed);
      }
    } catch {
      // Skip invalid JSON-LD blocks
    }
  }

  return blocks;
}

function decodeHtmlEntities(text = '') {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .trim();
}

function stripHtml(input = '') {
  return decodeHtmlEntities(
    input
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function stripHtmlWithParagraphs(input = '') {
  const normalized = input
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|div|section|article|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  return decodeHtmlEntities(normalized).trim();
}

function truncateText(text = '', maxLength = MAX_CONTENT_LENGTH) {
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function cleanJinaBoilerplate(content = '') {
  return String(content)
    .replace(/^Title:.*$/gim, '')
    .replace(/^URL Source:.*$/gim, '')
    .replace(/^Published Time:.*$/gim, '')
    .replace(/^Markdown Content:\s*$/gim, '')
    .trim();
}

function extractMarkdownImageUrls(text = '') {
  const urls = [];
  const regex = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi;
  let match;
  while ((match = regex.exec(String(text))) !== null) {
    urls.push(decodeHtmlEntities(match[1]).replace(/&amp;/g, '&'));
  }
  return urls;
}

function extractAnyImageUrls(text = '') {
  const matches = String(text).match(/https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s)]*)?/gi) || [];
  return Array.from(new Set(matches.map((x) => decodeHtmlEntities(x).replace(/&amp;/g, '&'))));
}

function markdownToText(text = '') {
  return String(text)
    .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, ' ')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeStoredMarkdown(markdown = '', options = {}) {
  const keepImages = Boolean(options?.keepImages);
  let content = String(markdown || '');

  if (!keepImages) {
    return content
      .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, '')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '$1')
      .replace(/https?:\/\/[^\s)]+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  content = content.replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, (_, imageUrl) => {
    const normalized = normalizeCyberScoreImageUrl(imageUrl);
    return `![](${normalized || imageUrl})`;
  });

  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlInlineToMarkdown(input = '', baseUrl = '') {
  const withLinks = String(input).replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const label = stripHtmlWithParagraphs(text).trim() || href;
    const normalized = normalizeUrl(href, baseUrl) || href;
    return `[${label}](${normalized})`;
  });
  return stripHtmlWithParagraphs(withLinks);
}

function extractDivByClass(html = '', className = '') {
  const classPattern = new RegExp(`<div[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'i');
  const startMatch = classPattern.exec(html);
  if (!startMatch || typeof startMatch.index !== 'number') return '';

  const start = startMatch.index;
  const scanner = /<\/?div\b[^>]*>/gi;
  scanner.lastIndex = start;

  let depth = 0;
  let started = false;
  let end = -1;
  let match;

  while ((match = scanner.exec(html)) !== null) {
    const tag = match[0].toLowerCase();
    if (tag.startsWith('</div')) {
      depth -= 1;
    } else {
      depth += 1;
      started = true;
    }
    if (started && depth === 0) {
      end = scanner.lastIndex;
      break;
    }
  }

  if (end === -1) return '';
  return html.slice(start, end);
}

function extractBo3BodyData(detailHtml, baseUrl) {
  const articleBody = extractDivByClass(detailHtml, 'c-article-body');
  if (!articleBody) return { contentMarkdown: '', contentImages: [] };

  const renderBody = extractDivByClass(articleBody, 'c-editorjs-render') || articleBody;
  const contentBlocks = [];
  const images = [];

  const combinedRegex = /<(p|h2|h3)[^>]*class=["'][^"']*(?:ce-paragraph|ce-header)[^"']*["'][^>]*>([\s\S]*?)<\/\1>|<img[^>]*class=["'][^"']*image-tool__image-picture[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = combinedRegex.exec(renderBody)) !== null) {
    if (match[3]) {
      const src = decodeHtmlEntities(match[3]).replace(/&amp;/g, '&');
      const normalized = normalizeUrl(src, baseUrl) || src;
      if (normalized && !images.includes(normalized)) images.push(normalized);
      continue;
    }

    const inline = htmlInlineToMarkdown(match[2] || '', baseUrl).trim();
    if (!inline) continue;
    contentBlocks.push(inline);
  }

  const contentMarkdown = contentBlocks.join('\n\n').trim();
  return { contentMarkdown, contentImages: images };
}

function parseBo3DateTimeString(input = '') {
  const match = String(input).match(/(\d{1,2}:\d{2})\s*,\s*(\d{2}\.\d{2}\.\d{4})/);
  if (!match) return null;

  const [hour, minute] = match[1].split(':').map(Number);
  const [day, month, year] = match[2].split('.').map(Number);
  if ([hour, minute, day, month, year].some((x) => Number.isNaN(x))) return null;
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

function parseJinaPublishedDate(text = '') {
  const matchedLine = String(text).match(/Published Time:\s*([^\n\r]+)/i)?.[1]?.trim();
  if (!matchedLine) return null;

  const direct = parseDate(matchedLine);
  if (direct) return direct;

  const dateOnly = matchedLine.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!dateOnly) return null;
  const fallback = new Date(`${dateOnly}T00:00:00Z`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function slugFromBo3NewsUrl(rawUrl = '') {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== 'bo3.gg' && url.hostname !== 'www.bo3.gg') return '';
    const parts = url.pathname.split('/').filter(Boolean);
    const newsIndex = parts.lastIndexOf('news');
    if (newsIndex === -1 || !parts[newsIndex + 1]) return '';
    return parts[newsIndex + 1];
  } catch {
    return '';
  }
}

function bo3NewsUrlFromSlug(slug = '') {
  const clean = String(slug || '').trim();
  if (!clean) return '';
  return `https://bo3.gg/dota2/news/${clean}`;
}

async function fetchBo3ApiJson(pathname, searchParams = null) {
  const url = new URL(`${BO3_API_BASE}${pathname}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: 'application/json',
      Origin: 'https://bo3.gg',
      Referer: 'https://bo3.gg/dota2/news',
    },
  }, 12000);
  if (!response.ok) throw new Error(`BO3 API HTTP ${response.status}`);
  return response.json();
}

function bo3ApiListParams(limit = DETAIL_FETCH_LIMIT) {
  const params = new URLSearchParams();
  params.set('filter[base_news.discipline_id][eq]', '4');
  params.set('filter[news.locale][eq]', 'en');
  params.set('filter[base_news.section][in]', '1');
  params.set('page[offset]', '0');
  params.set('page[limit]', String(Math.max(1, limit)));
  params.set('sort', '-published_at');
  return params;
}

async function collectBo3UrlsViaApi() {
  try {
    const data = await fetchBo3ApiJson('/base_news', bo3ApiListParams(DETAIL_FETCH_LIMIT * 3));
    const results = Array.isArray(data?.results) ? data.results : [];
    const urls = [];
    const imageHints = new Map();
    for (const item of results) {
      const slug = item?.slug;
      const url = bo3NewsUrlFromSlug(slug);
      if (!url) continue;
      urls.push(url);
      const imageUrl = normalizeBo3CoverImageUrl(item.title_image_url || item.title_image_square_url || item.image);
      if (imageUrl) imageHints.set(url, imageUrl);
    }
    return {
      urls: Array.from(new Set(urls)).slice(0, DETAIL_FETCH_LIMIT),
      imageHints,
    };
  } catch (error) {
    console.warn(`[News API] BO3 API list failed: ${error instanceof Error ? error.message : String(error)}`);
    return { urls: [], imageHints: new Map() };
  }
}

function editorJsInlineMarkdown(input = '') {
  return htmlInlineToMarkdown(String(input || ''), 'https://bo3.gg')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function editorJsBlocksToMarkdown(body = {}) {
  const blocks = Array.isArray(body?.blocks) ? body.blocks : [];
  const out = [];
  const images = [];

  for (const block of blocks) {
    const type = String(block?.type || '').toLowerCase();
    const data = block?.data || {};

    if (type === 'paragraph') {
      const text = editorJsInlineMarkdown(data.text);
      if (text) out.push(text);
      continue;
    }

    if (type === 'header') {
      const text = editorJsInlineMarkdown(data.text);
      if (text) out.push(`## ${text}`);
      continue;
    }

    if (type === 'quote') {
      const text = editorJsInlineMarkdown(data.text);
      const caption = editorJsInlineMarkdown(data.caption);
      if (text) {
        out.push(`> ${text}${caption ? `\n>\n> — ${caption}` : ''}`);
      }
      continue;
    }

    if (type === 'list' && Array.isArray(data.items)) {
      const items = data.items
        .map((item) => {
          const value = typeof item === 'string' ? item : (item?.content || item?.text || '');
          return editorJsInlineMarkdown(value);
        })
        .filter(Boolean)
        .map((item) => `- ${item}`);
      if (items.length) out.push(items.join('\n'));
      continue;
    }

    if (type === 'image' || type === 'simpleimage') {
      const imageUrl = data?.file?.url || data?.url || data?.image || '';
      const normalized = normalizeUrl(imageUrl, 'https://bo3.gg');
      if (normalized) {
        images.push(normalized);
        const caption = editorJsInlineMarkdown(data.caption);
        out.push(`![${caption || 'Image'}](${normalized})`);
      }
    }
  }

  return {
    markdown: out.join('\n\n').trim(),
    images: Array.from(new Set(images)),
  };
}

async function fetchBo3ArticleViaApi(url) {
  const slug = slugFromBo3NewsUrl(url);
  if (!slug) return null;

  const item = await fetchBo3ApiJson(`/base_news/${encodeURIComponent(slug)}`, new URLSearchParams([['locale', 'en']]));
  if (!item?.slug || String(item?.discipline_id) !== '4') return null;

  const canonicalUrl = bo3NewsUrlFromSlug(item.slug) || url;
  const { markdown, images } = editorJsBlocksToMarkdown(item.body);
  const imageUrl = normalizeBo3CoverImageUrl(item.title_image_url || item.title_image_square_url || item.image || images[0]) || undefined;
  const contentMarkdown = sanitizeStoredMarkdown(normalizeBo3ContentMarkdown(markdown || item.description || ''));
  const content = truncateText(markdownToText(contentMarkdown || item.description || ''));

  const result = {
    id: generateId(canonicalUrl, 'bo3'),
    title: item.title || titleFromSlug(canonicalUrl),
    summary: stripHtml(item.description || content).slice(0, 220) || undefined,
    content,
    content_markdown: contentMarkdown,
    url: canonicalUrl,
    imageUrl,
    source: 'BO3.gg',
    publishedAt: parseDate(item.published_at) || parseDate(item.created_at) || new Date(),
    category: item?.news_category?.title || 'tournament',
  };
  return isBettingNews(result) ? null : result;
}

function parseBo3PublishedAt(detailHtml) {
  const dateLiMatch = detailHtml.match(
    /<li[^>]*class=["'][^"']*o-list-bare__item[^"']*\bdate\b[^"']*["'][^>]*>\s*<p[^>]*>\s*(\d{1,2}:\d{2})\s*,\s*(\d{2}\.\d{2}\.\d{4})\s*<\/p>/i
  );
  const anyPMatch = detailHtml.match(/<p[^>]*>\s*(\d{1,2}:\d{2})\s*,\s*(\d{2}\.\d{2}\.\d{4})\s*<\/p>/i);
  return parseBo3DateTimeString(dateLiMatch?.[0] || anyPMatch?.[0] || detailHtml);
}

async function resolveBo3PublishedAtFromRss(articleUrl, rssUrls, baseUrl) {
  const normalizedArticleUrl = normalizeBo3NewsUrl(articleUrl, baseUrl);
  if (!normalizedArticleUrl) return null;

  for (const rssUrl of rssUrls) {
    try {
      const rssResponse = await fetchWithTimeout(rssUrl, {
        headers: {
          Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7',
        },
      }, 10000);
      if (!rssResponse.ok) continue;

      const rssXml = await rssResponse.text();
      const rssItems = parseSimpleRss(rssXml, 'BO3.gg', 'bo3');
      const matched = rssItems.find((x) => normalizeBo3NewsUrl(x.url, baseUrl) === normalizedArticleUrl);
      if (!matched) continue;
      const parsed = parseDate(matched.publishedAt);
      if (parsed) return parsed;
    } catch {
      // Try next RSS endpoint
    }
  }

  return null;
}

function isBettingNews(item = {}) {
  const haystack = `${item.title || ''}\n${item.summary || ''}\n${item.content || ''}`.toLowerCase();
  const patterns = [
    '1xbit',
    'betting',
    'bookmaker',
    'sportsbook',
    'parlay',
    'odds',
    'wager',
    'casino',
    'bonus bet',
    'bet on',
    '博彩',
    '投注',
    '盘口',
    '赔率',
    '下注',
  ];
  return patterns.some((p) => haystack.includes(p));
}

function isHawkCs2News(item = {}) {
  const haystack = `${item.title || ''}\n${item.summary || ''}\n${item.content || ''}\n${item.url || ''}`.toLowerCase();
  const cs2Patterns = [
    'cs2',
    'counter-strike',
    'counter strike',
    'cs:go',
    'csgo',
  ];
  const hasCs2Signal = cs2Patterns.some((p) => haystack.includes(p));
  if (!hasCs2Signal) return false;

  const hasDotaSignal = /\bdota\b|dota2|dota 2/i.test(haystack);
  return !hasDotaSignal;
}

function hasHawkCs2Tag(detailHtml = '') {
  const html = String(detailHtml || '').toLowerCase();
  if (!html) return false;
  return /\/tags\/cs2(?:-news|-players|-teams)?\b/.test(html);
}

function cutBo3ContentBeforeComments(text = '') {
  if (!text) return text;
  let content = String(text);

  const stopPatterns = [
    /\nGo to Twitter bo3\.gg/i,
    /\nComments?\b/i,
    /\nRelated News\b/i,
    /\nNext article\b/i,
    /\nRead more\b/i,
    /\nSource\b/i,
    /\nTAGS?\b/i,
    /\nAdditional content available\b/i,
    /\nYou can follow the tournament schedule and results at this\b/i,
    /\nDreamLeague Season \d+ runs from\b/i,
    /\n!\[Image 2:/i,
  ];

  for (const pattern of stopPatterns) {
    const match = content.match(pattern);
    if (match && typeof match.index === 'number') {
      content = content.slice(0, match.index).trim();
    }
  }

  const firstTitle = content.search(/^Title:/im);
  if (firstTitle >= 0) {
    const secondTitle = content.slice(firstTitle + 6).search(/\nTitle:/i);
    if (secondTitle >= 0) {
      content = content.slice(0, firstTitle + 6 + secondTitle).trim();
    }
  }

  return content.trim();
}

function sanitizeBo3JinaContent(text = '') {
  const raw = cutBo3ContentBeforeComments(cleanJinaBoilerplate(text));
  const lines = String(raw).split('\n');
  const noisyLine = /^(Sign In|Home|Matches|Schedule and Live|Finished|Tournaments|Upcoming and Ongoing|Players|Teams|News|Articles|Predictions|Heroes|Dota2|Dota 2|Games|eng|ua|ru|pt|de|pl|fr|es|tr|vn|id|kr|jp|ph|my|Like \d+|CS2|Valorant|R6S|LoL|MLBB)$/i;
  const keep = [];
  for (const line of lines) {
    const t = line.trim();
    const normalized = t
      .replace(/^[*•-]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .trim();
    const alphaKey = normalized.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!t) continue;
    if (/^•\s*$/.test(t)) continue;
    if (/^\[\]\([^)]*\)$/.test(t)) continue;
    if (/^={3,}$/.test(t)) continue;
    if (/^[*•-]\s*(deffy|transfers?)$/i.test(t)) continue;
    if (/^[*•-]\s*\d{1,2}:\d{2}\s*,\s*\d{2}\.\d{2}\.\d{4}$/i.test(t)) continue;
    if (/^[*•-]\s*like\s*\d+/i.test(t)) continue;
    if (noisyLine.test(t) || noisyLine.test(normalized)) continue;
    if (/^•\s*(Sign In|Home|Matches|Schedule and Live|Finished|Upcoming and Ongoing|Players|Teams|News|Articles|Predictions|Heroes|Dota2|Dota 2|Games)\b/i.test(t)) continue;
    if (/^[*•-]\s*(Sign In|Home|Matches|Schedule and Live|Finished|Upcoming and Ongoing|Players|Teams|News|Articles|Predictions|Heroes|Dota2|Dota 2|Games|CS2|Valorant|R6S|LoL|MLBB)\b/i.test(t)) continue;
    if (/^(https?:\/\/|www\.)/i.test(normalized)) continue;
    keep.push(line);
  }

  const compact = keep.map((x) => x.trim()).filter(Boolean);
  const firstParagraphIndex = compact.findIndex((line) => line.length >= 100 && /[.!?]"?$/.test(line));
  if (firstParagraphIndex > 0) {
    let titleIndex = -1;
    for (let i = firstParagraphIndex - 1; i >= 0; i -= 1) {
      const line = compact[i];
      if (/^[*•-]/.test(line)) continue;
      if (/^(Source|TAGS?)$/i.test(line)) continue;
      if (line.length >= 20 && line.length <= 160) {
        titleIndex = i;
        break;
      }
    }

    const start = titleIndex >= 0 ? titleIndex : firstParagraphIndex;
    const head = compact.slice(start, firstParagraphIndex);
    const body = compact.slice(firstParagraphIndex);
    const cleanedHead = head.filter((line, idx) => {
      if (idx === 0) return true;
      if (/^[*•-]\s*(\d{1,2}:\d{2}\s*,\s*\d{2}\.\d{2}\.\d{4}|like\s*\d+|\d+)$/i.test(line)) return false;
      if (/^[*•-]\s*[\w-]{1,24}$/i.test(line)) return false;
      return line.length > 24;
    });
    return [...cleanedHead, ...body].join('\n').trim();
  }

  return compact.join('\n').trim();
}

function normalizeBo3ContentMarkdown(markdown = '') {
  const raw = cutBo3ContentBeforeComments(String(markdown || ''));
  const lines = raw.split('\n');
  const noisyLine = /^(Sign In|Home|Matches|Schedule and Live|Finished|Tournaments|Upcoming and Ongoing|Players|Teams|News|Articles|Predictions|Heroes|Dota2|Dota 2|Games|eng|ua|ru|pt|de|pl|fr|es|tr|vn|id|kr|jp|ph|my|CS2|Valorant|R6S|LoL|MLBB)$/i;

  const filtered = [];
  for (const line of lines) {
    const t = line.trim();
    const normalized = t
      .replace(/^[*•-]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .trim();
    const alphaKey = normalized.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!t) continue;
    if (/^\[\]\([^)]*\)$/.test(t)) continue;
    if (/^={3,}$/.test(t)) continue;
    if (noisyLine.test(t) || noisyLine.test(normalized)) continue;
    if (/^[*•-]\s*(deffy|transfers?)$/i.test(t)) continue;
    if (alphaKey === 'deffy' || alphaKey === 'transfers') continue;
    if (/^[*•-]\s*\d{1,2}:\d{2}\s*,\s*\d{2}\.\d{2}\.\d{4}$/i.test(t)) continue;
    if (/^[*•-]\s*like\s*\d+/i.test(t)) continue;
    if (/^[*•-]\s*\d+\s*$/i.test(t)) continue;
    if (/^(https?:\/\/|www\.)/i.test(normalized)) continue;
    filtered.push(line);
  }

  return filtered.join('\n').trim();
}

function extractBo3ImagesFromHtml(html = '') {
  const urls = new Set();
  const imageToolRegex = /<img[^>]+class=["'][^"']*image-tool__image-picture[^"']*["'][^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imageToolRegex.exec(html)) !== null) {
    const src = decodeHtmlEntities(match[1]).replace(/&amp;/g, '&');
    if (src) urls.add(src);
  }

  const fileImageRegex = /https?:\/\/files\.bo3\.gg\/uploads\/image\/[^\s"'<>]+/gi;
  let urlMatch;
  while ((urlMatch = fileImageRegex.exec(html)) !== null) {
    urls.add(urlMatch[0]);
  }

  return Array.from(urls);
}

function getMetaContent(html, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escapedKey}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escapedKey}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escapedKey}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const matched = html.match(pattern);
    if (matched?.[1]) return decodeHtmlEntities(matched[1]);
  }

  return undefined;
}

function getTitleFromHtml(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) {
    const clean = stripHtml(h1);
    if (clean) return clean;
  }

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return undefined;
  return stripHtml(title).replace(/ \| .*$/, '').replace(/ [-|].*$/, '').trim();
}

function parseDate(input) {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function resolveNewsIncrementalWindowSeconds(options = {}) {
  const recentDays = Number(options?.recentDays);
  if (!Number.isFinite(recentDays) || recentDays <= 0) {
    return DEFAULT_NEWS_INCREMENTAL_WINDOW_SECONDS;
  }
  return Math.trunc(recentDays * 24 * 60 * 60);
}

function normalizeUrl(rawUrl, baseUrl) {
  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = '';
    if (url.searchParams.has('utm_source')) url.searchParams.delete('utm_source');
    if (url.searchParams.has('utm_medium')) url.searchParams.delete('utm_medium');
    if (url.searchParams.has('utm_campaign')) url.searchParams.delete('utm_campaign');
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function normalizeBo3CoverImageUrl(rawUrl, baseUrl = 'https://bo3.gg') {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return undefined;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const isBo3NewsTitleImage =
      url.pathname.startsWith('/uploads/news/') &&
      url.pathname.includes('/title_image/');

    if (host === 'image-proxy.bo3.gg') {
      if (!isBo3NewsTitleImage) return normalized;
      if (!url.searchParams.has('w')) url.searchParams.set('w', '960');
      if (!url.searchParams.has('h')) url.searchParams.set('h', '480');
      return url.toString();
    }

    if ((host === 'files.bo3.gg' || host === 'bo3.gg' || host === 'www.bo3.gg') && isBo3NewsTitleImage) {
      return `https://image-proxy.bo3.gg${url.pathname}.webp?w=960&h=480`;
    }

    return normalized;
  } catch {
    return normalized;
  }
}

function getArticleImage(article) {
  if (!article) return undefined;
  if (typeof article.image === 'string' && article.image) return article.image;
  if (Array.isArray(article.image) && article.length > 0) {
    const first = article.image[0];
    if (typeof first === 'string') return first;
    if (first?.url) return first.url;
  }
  if (article.image?.url) return article.image.url;
  return undefined;
}

function collectValuesByKey(target, keyName, results = []) {
  if (!target || typeof target !== 'object') return results;

  if (Array.isArray(target)) {
    for (const item of target) collectValuesByKey(item, keyName, results);
    return results;
  }

  for (const [key, value] of Object.entries(target)) {
    if (key === keyName) results.push(value);
    if (value && typeof value === 'object') collectValuesByKey(value, keyName, results);
  }

  return results;
}

function isValidHawkPostUrl(urlString) {
  try {
    const url = new URL(urlString);
    const path = (url.pathname || '').toLowerCase();
    if (!path.startsWith('/posts/')) return false;
    const slug = path.slice('/posts/'.length).replace(/\/+$/, '');
    if (!slug) return false;
    if (slug === 'dota-2-guide') return false;
    if (slug.startsWith('date/')) return false;
    return true;
  } catch {
    return false;
  }
}

function extractHawkListUrls(html, baseUrl) {
  const urls = new Set();

  const jsonLd = parseJsonLdBlocks(html);
  for (const block of jsonLd) {
    if (block?.['@type'] !== 'ItemList' || !Array.isArray(block.itemListElement)) continue;
    for (const item of block.itemListElement) {
      const raw = item?.url || item?.item?.url;
      if (typeof raw === 'string' && raw.includes('/posts/')) {
        const normalized = normalizeUrl(raw, baseUrl);
        if (normalized && isValidHawkPostUrl(normalized)) urls.add(normalized);
      }
    }
  }

  const nextDataRaw = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextDataRaw) {
    try {
      const nextData = JSON.parse(nextDataRaw);
      const slugValues = collectValuesByKey(nextData, 'slug').flat().filter(Boolean);
      for (const slug of slugValues) {
        if (typeof slug !== 'string') continue;
        const normalized = normalizeUrl(`/posts/${slug}`, baseUrl);
        if (normalized && isValidHawkPostUrl(normalized)) urls.add(normalized);
      }

      const pathValues = collectValuesByKey(nextData, 'url').flat().filter(Boolean);
      for (const path of pathValues) {
        if (typeof path !== 'string' || !path.includes('/posts/')) continue;
        const normalized = normalizeUrl(path, baseUrl);
        if (normalized && isValidHawkPostUrl(normalized)) urls.add(normalized);
      }
    } catch {
      // Ignore malformed NEXT_DATA payload
    }
  }

  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href.includes('/posts/')) continue;
    const normalized = normalizeUrl(href, baseUrl);
    if (normalized && isValidHawkPostUrl(normalized)) urls.add(normalized);
  }

  return Array.from(urls).slice(0, HAWK_LIST_SCAN_LIMIT);
}

function normalizeBo3NewsUrl(rawUrl, baseUrl) {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host !== 'bo3.gg' && host !== 'www.bo3.gg' && !host.endsWith('.bo3.gg')) return null;
    if (!url.pathname.includes('/dota2/news/')) return null;
    if (url.pathname.endsWith('/news') || url.pathname.endsWith('/news/')) return null;
    return `https://bo3.gg${url.pathname}`;
  } catch {
    return null;
  }
}

function normalizeCyberScoreNewsUrl(rawUrl, baseUrl) {
  const normalized = normalizeUrl(rawUrl, baseUrl);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (host !== 'cyberscore.live' && host !== 'www.cyberscore.live') return null;

    const path = String(url.pathname || '').toLowerCase();
    if (!path.includes('/news/')) return null;
    if (path.includes('/news/category/')) return null;
    if (path.endsWith('/news') || path.endsWith('/news/')) return null;
    if (path === '/en/news' || path === '/en/news/') return null;
    if (path === '/news' || path === '/news/') return null;

    return `https://cyberscore.live${url.pathname}`;
  } catch {
    return null;
  }
}

function parseCyberScoreDateText(input = '', now = new Date()) {
  const text = String(input || '').trim();
  if (!text) return null;

  if (/^today$/i.test(text)) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  if (/^yesterday$/i.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    date.setHours(12, 0, 0, 0);
    return date;
  }

  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    if ([day, month, year].every((x) => Number.isFinite(x))) {
      return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
  }

  return parseDate(text);
}

function parseCyberScorePublishedAt(detailHtml = '') {
  const metaDate =
    parseDate(getMetaContent(detailHtml, 'article:published_time')) ||
    parseDate(getMetaContent(detailHtml, 'datePublished'));
  if (metaDate) return metaDate;

  const textWindow = String(detailHtml || '').slice(0, 12000);
  const textDate = textWindow.match(/>\s*(Today|Yesterday|\d{2}\.\d{2}\.\d{4})\s*</i)?.[1];
  return parseCyberScoreDateText(textDate);
}

function isCloudflareChallengePage(html = '') {
  const text = String(html || '');
  return /Just a moment\.\.\.|Enable JavaScript and cookies to continue|__cf_chl_/i.test(text);
}

function trimCyberScoreContent(content = '') {
  let result = String(content || '').trim();
  if (!result) return result;

  const stopPatterns = [
    /\nShare\b/i,
    /\nComments?\b/i,
    /\nNo comments found\b/i,
    /\nLeave your comment\b/i,
    /\nPost Author\b/i,
    /\nOther news\b/i,
  ];

  for (const pattern of stopPatterns) {
    const matched = result.match(pattern);
    if (!matched || typeof matched.index !== 'number') continue;
    result = result.slice(0, matched.index).trim();
  }

  return result;
}

function extractCyberScoreNewsUrls(html, baseUrl) {
  const urls = new Set();

  const hrefRegex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let hrefMatch;
  while ((hrefMatch = hrefRegex.exec(html)) !== null) {
    const raw = hrefMatch[1] || hrefMatch[2] || hrefMatch[3];
    if (!raw) continue;
    const normalized = normalizeCyberScoreNewsUrl(raw, baseUrl);
    if (normalized) urls.add(normalized);
  }

  const absoluteUrlRegex = /https?:\/\/(?:www\.)?cyberscore\.live\/(?:en\/)?news\/[^)\s"'<>]+/gi;
  let absMatch;
  while ((absMatch = absoluteUrlRegex.exec(html)) !== null) {
    const normalized = normalizeCyberScoreNewsUrl(absMatch[0], baseUrl);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls).slice(0, CYBERSCORE_LIST_SCAN_LIMIT);
}

function extractCyberScoreUrlsFromJinaText(text, baseUrl) {
  const matches = String(text || '').match(/https?:\/\/(?:www\.)?cyberscore\.live\/(?:en\/)?news\/[^)\s"'<>]+/gi) || [];
  return Array.from(new Set(matches
    .map((raw) => normalizeCyberScoreNewsUrl(raw, baseUrl))
    .filter(Boolean))).slice(0, CYBERSCORE_LIST_SCAN_LIMIT);
}

export function prioritizeCyberScoreDetailUrls(urls = [], fallbackItems = [], limit = CYBERSCORE_DETAIL_SCAN_LIMIT) {
  const numericLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.trunc(Number(limit))) : null;
  const prioritizedFallbackUrls = [...fallbackItems]
    .filter((item) => item?.url)
    .sort((a, b) => (b?.publishedAt?.getTime?.() || 0) - (a?.publishedAt?.getTime?.() || 0))
    .map((item) => item.url);

  const ordered = [];
  const seen = new Set();
  for (const url of [...prioritizedFallbackUrls, ...urls]) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    ordered.push(url);
    if (numericLimit !== null && ordered.length >= numericLimit) break;
  }

  return numericLimit === null ? ordered : ordered.slice(0, numericLimit);
}

function extractCyberScoreItemsFromJinaCategory(text = '', categoryDef = {}, source = 'cyberscore') {
  const items = [];
  const seen = new Set();
  const body = String(text || '');
  const urlRegex = /https?:\/\/(?:www\.)?cyberscore\.live\/(?:en\/)?news\/[^)\s"'<>]+/gi;
  let match;

  while ((match = urlRegex.exec(body)) !== null) {
    const normalizedUrl = normalizeCyberScoreNewsUrl(match[0], 'https://cyberscore.live');
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;

    const contextStart = Math.max(0, match.index - 900);
    const context = body.slice(contextStart, match.index);
    const contextTail = context.slice(-600);
    const headerMatches = Array.from(contextTail.matchAll(/##\s+(.+?)\s+(Today|Yesterday|\d{2}\.\d{2}\.\d{4})\s+\d[\d\s\u00A0]*/gim));
    const headerTitle = headerMatches.length > 0 ? headerMatches[headerMatches.length - 1]?.[1] : '';
    const headerDate = headerMatches.length > 0 ? headerMatches[headerMatches.length - 1]?.[2] : '';
    const titleMatches = Array.from(context.matchAll(/\*\*([^*]{6,240})\*\*/g));
    const rawTitle = headerTitle || (titleMatches.length > 0 ? titleMatches[titleMatches.length - 1]?.[1] : '');
    const title = stripHtml(rawTitle || '')
      .replace(/\\+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || /^(Language|News|Articles|Search input field)$/i.test(title)) continue;

    seen.add(normalizedUrl);
    const dateMatches = Array.from(context.matchAll(/\b(Today|Yesterday|\d{2}\.\d{2}\.\d{4})\b/gi));
    const dateText = headerDate || (dateMatches.length > 0 ? dateMatches[dateMatches.length - 1]?.[1] : '');
    const imageMatches = Array.from(context.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi));
    const imageUrl = imageMatches.length > 0 ? imageMatches[imageMatches.length - 1]?.[1] : '';
    const publishedAt = parseCyberScoreDateText(dateText) || new Date();
    const fallbackSummary = `${categoryDef?.label || 'CyberScore'} · ${dateText || 'Latest'}`;
    const fallbackContent = '正文抓取受限，请点击原文查看完整内容。';

    items.push({
      id: generateId(normalizedUrl, source),
      title: stripHtml(title).replace(/\s*\|\s*CyberScore\s*$/i, '').trim(),
      summary: fallbackSummary,
      content: fallbackContent,
      content_markdown: fallbackContent,
      url: normalizedUrl,
      imageUrl: imageUrl ? decodeHtmlEntities(imageUrl).replace(/&amp;/g, '&') : undefined,
      source: 'CyberScore',
      publishedAt,
      category: categoryDef?.category || 'community',
    });
  }

  return items.slice(0, CYBERSCORE_LIST_SCAN_LIMIT);
}

function normalizeCyberScoreImageUrl(rawUrl = '') {
  if (!rawUrl) return undefined;
  const decoded = decodeHtmlEntities(String(rawUrl)).replace(/&amp;/g, '&').trim();
  if (!decoded) return undefined;
  return normalizeUrl(decoded, 'https://cyberscore.live') || decoded;
}

function pickCyberScoreCoverImage(detailImages = [], fallbackImage) {
  const normalizedFallback = normalizeCyberScoreImageUrl(fallbackImage);
  if (normalizedFallback) return normalizedFallback;

  const normalizedDetail = detailImages
    .map((x) => normalizeCyberScoreImageUrl(x))
    .filter(Boolean);
  if (normalizedDetail.length === 0) return undefined;

  const coverLike = normalizedDetail.find((x) => /\/static\/posts\//i.test(x));
  if (coverLike) return coverLike;

  const nonAd = normalizedDetail.find((x) => !/\/images\/bnrk-res\/|\/images\/logo|\/favicon/i.test(x));
  return nonAd || normalizedDetail[0];
}

function isCyberScoreArticleBodyImage(url = '') {
  const normalized = String(url || '').toLowerCase();
  if (!normalized) return false;
  // Keep only article in-body assets, drop player/team/author cards and recommendation/ad images.
  return /\/static\/content\//i.test(normalized);
}

function sanitizeCyberScoreBodyMarkdown(markdown = '', coverImageUrl = '') {
  const cover = normalizeCyberScoreImageUrl(coverImageUrl);
  const lines = String(markdown || '').split('\n');
  const cleaned = [];

  for (const rawLine of lines) {
    let line = rawLine;
    const imageMatches = Array.from(line.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi));
    if (imageMatches.length === 0) {
      cleaned.push(line);
      continue;
    }

    const urls = imageMatches.map((m) => normalizeCyberScoreImageUrl(m[1])).filter(Boolean);
    const hasAllowed = urls.some((url) => isCyberScoreArticleBodyImage(url) && url !== cover);
    if (!hasAllowed) {
      continue;
    }

    line = line.replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, (matched, imageUrl) => {
      const normalized = normalizeCyberScoreImageUrl(imageUrl);
      if (!normalized) return '';
      if (normalized === cover) return '';
      if (!isCyberScoreArticleBodyImage(normalized)) return '';
      return `![](${normalized})`;
    }).trim();

    if (!line) continue;
    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function pickCyberScoreTitleFromJinaText(text = '', fallbackTitle = '') {
  const headingMatches = Array.from(String(text || '').matchAll(/^#\s+(.+)$/gim))
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean);
  const heading = headingMatches.find((x) => !/\|\s*CyberScore\s*$/i.test(x));
  const fromHeader = titleFromJinaText(text, '');
  const picked = heading || fromHeader || fallbackTitle;
  return stripHtml(String(picked || '').replace(/\s*\|\s*CyberScore\s*$/i, '').trim());
}

function extractCyberScoreDetailFromJina(text = '', fallback = {}) {
  const raw = cleanJinaBoilerplate(String(text || ''));
  if (!raw) return null;

  const title = pickCyberScoreTitleFromJinaText(raw, fallback.title || titleFromSlug(fallback.url || ''));
  const headingMatches = Array.from(raw.matchAll(/^#\s+(.+)$/gim));
  let startIndex = 0;
  const articleHeadingMatch = headingMatches.find((m) => !/\|\s*CyberScore\s*$/i.test(String(m[1] || '')));
  if (articleHeadingMatch && typeof articleHeadingMatch.index === 'number') {
    startIndex = articleHeadingMatch.index;
  } else if (headingMatches.length > 1 && typeof headingMatches[1].index === 'number') {
    startIndex = headingMatches[1].index;
  }

  let markdown = raw.slice(startIndex).trim();
  const stopPatterns = [
    /\nShare\b/i,
    /\nComments?\b/i,
    /\nNo comments found\b/i,
    /\nLeave your comment\b/i,
    /\nOther news\b/i,
    /\n\[Show all]/i,
    /\n###\s+Chat\b/i,
    /\n25\+\s*\n/i,
  ];

  for (const pattern of stopPatterns) {
    const matched = markdown.match(pattern);
    if (!matched || typeof matched.index !== 'number') continue;
    markdown = markdown.slice(0, matched.index).trim();
  }

  markdown = sanitizeCyberScoreBodyMarkdown(markdown, fallback.imageUrl);

  if (!markdown) return null;
  const markdownLines = markdown.split('\n').map((x) => x.trim()).filter(Boolean);
  const summary = markdownLines.find((line) => {
    if (/^#/.test(line)) return false;
    if (/^(Today|Yesterday|\d{2}\.\d{2}\.\d{4}|\d+\s*min\.?|\d+)$/.test(line)) return false;
    if (/^\*\s+\[/.test(line)) return false;
    if (/^!\[/.test(line)) return false;
    return line.length >= 40;
  }) || fallback.summary || '';

  const imageCandidates = extractMarkdownImageUrls(markdown);
  const contentMarkdown = truncateText(markdown);
  const content = truncateText(markdownToText(contentMarkdown));

  return {
    ...fallback,
    title: title || fallback.title,
    summary: summary || fallback.summary,
    content,
    content_markdown: contentMarkdown,
    imageUrl: pickCyberScoreCoverImage(imageCandidates, fallback.imageUrl),
    publishedAt: parseJinaPublishedDate(text) || fallback.publishedAt || new Date(),
  };
}

function hasCyberScoreUsableBody(item = {}) {
  const markdown = String(item?.content_markdown || item?.content || '').trim();
  if (!markdown) return false;
  if (/正文抓取受限|正文暂不可读|请点击原文/i.test(markdown)) return false;
  return markdown.length >= 260;
}

function mergeCyberScoreDetail(primary = {}, secondary = {}) {
  if (!secondary?.url) return primary;
  if (!primary?.url) return secondary;

  const primaryBody = String(primary.content_markdown || primary.content || '');
  const secondaryBody = String(secondary.content_markdown || secondary.content || '');
  const useSecondaryBody =
    hasCyberScoreUsableBody(secondary) &&
    (!hasCyberScoreUsableBody(primary) || secondaryBody.length > primaryBody.length);

  return {
    ...primary,
    title: primary.title || secondary.title,
    summary: (useSecondaryBody ? secondary.summary : primary.summary) || secondary.summary || primary.summary,
    content: useSecondaryBody ? secondary.content : (primary.content || secondary.content),
    content_markdown: useSecondaryBody ? secondary.content_markdown : (primary.content_markdown || secondary.content_markdown),
    imageUrl: primary.imageUrl || secondary.imageUrl,
    publishedAt: primary.publishedAt || secondary.publishedAt,
    category: primary.category || secondary.category,
  };
}

async function fetchCyberScoreDetailFromJina(url, fallback = {}) {
  const jinaUrl = `${JINA_PROXY}${String(url || '').replace(/^https?:\/\//, '')}`;
  const jinaText = await fetchTextWithRetries(jinaUrl, {
    attempts: CYBERSCORE_JINA_RETRY_ATTEMPTS,
    timeout: CYBERSCORE_JINA_TIMEOUT_MS,
    retryDelayMs: 800,
    label: `CyberScore Jina detail ${url}`,
  });
  const parsed = extractCyberScoreDetailFromJina(jinaText, fallback);
  if (!parsed) {
    throw new Error(`CyberScore Jina detail parse failed for ${url}`);
  }
  return parsed;
}

async function fetchCyberScoreDetail(url, context = {}) {
  const fallback = {
    id: context.id || generateId(url, 'cyberscore'),
    title: context.title || titleFromSlug(url),
    summary: context.summary || 'CyberScore · latest',
    content: context.content || '正文抓取受限，请点击原文查看完整内容。',
    content_markdown: context.content_markdown || '正文抓取受限，请点击原文查看完整内容。',
    url,
    imageUrl: context.imageUrl,
    source: context.source || 'CyberScore',
    publishedAt: context.publishedAt || new Date(),
    category: context.category || 'community',
  };

  const detailResponse = await fetchWithTimeout(url, {}, 12000);
  const detailHtml = await detailResponse.text();
  if (isCloudflareChallengePage(detailHtml) || !detailResponse.ok) {
    return fetchCyberScoreDetailFromJina(url, fallback);
  }

  const detailLd = parseJsonLdBlocks(detailHtml);
  const article = detailLd.find((x) => x?.['@type'] === 'NewsArticle') || {};

  const titleRaw = article.headline || getMetaContent(detailHtml, 'og:title') || getTitleFromHtml(detailHtml);
  const title = stripHtml(titleRaw || '').replace(/\s*\|\s*CyberScore\s*$/i, '').trim();
  if (!title) {
    return fetchCyberScoreDetailFromJina(url, fallback);
  }

  const publishedAt =
    parseDate(article.datePublished) ||
    parseCyberScorePublishedAt(detailHtml) ||
    fallback.publishedAt ||
    new Date();

  const summary = stripHtml(article.description || getMetaContent(detailHtml, 'description') || '');
  const content = trimCyberScoreContent(extractArticleContent(detailHtml, article));

  const directItem = {
    ...fallback,
    title,
    summary: summary || fallback.summary,
    content: truncateText(content || summary || ''),
    url,
    imageUrl: normalizeUrl(
      getArticleImage(article) || getMetaContent(detailHtml, 'og:image') || '',
      'https://cyberscore.live'
    ) || fallback.imageUrl,
    source: fallback.source,
    publishedAt,
    category: context.category || fallback.category,
  };

  if (hasCyberScoreUsableBody(directItem)) {
    return directItem;
  }

  try {
    const jinaItem = await fetchCyberScoreDetailFromJina(url, {
      ...fallback,
      title,
      summary: summary || fallback.summary,
      publishedAt,
      category: context.category || fallback.category,
      imageUrl: directItem.imageUrl || fallback.imageUrl,
    });
    return mergeCyberScoreDetail(directItem, jinaItem);
  } catch {
    return directItem;
  }
}

async function enrichCyberScoreFallbackItems(listFallbackItems = [], recentDays = 3) {
  const dayCount = Number.isFinite(Number(recentDays)) && Number(recentDays) > 0
    ? Math.trunc(Number(recentDays))
    : 3;
  const cutoffMs = Date.now() - (dayCount * 24 * 60 * 60 * 1000);
  const filtered = listFallbackItems
    .filter((item) => (item?.publishedAt instanceof Date ? item.publishedAt.getTime() >= cutoffMs : true))
    .sort((a, b) => (b?.publishedAt?.getTime?.() || 0) - (a?.publishedAt?.getTime?.() || 0))
    .slice(0, CYBERSCORE_FALLBACK_ENRICH_LIMIT);

  const uniqueTargets = [];
  const seen = new Set();
  for (const item of filtered) {
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    uniqueTargets.push(item);
  }

  const enriched = [];
  await mapWithConcurrency(uniqueTargets, CYBERSCORE_DETAIL_CONCURRENCY, async (item) => {
    try {
      enriched.push(await fetchCyberScoreDetailFromJina(item.url, item));
    } catch {
      enriched.push(item);
    }
  });

  return enriched.sort((a, b) => (b?.publishedAt?.getTime?.() || 0) - (a?.publishedAt?.getTime?.() || 0));
}

function extractBo3NewsUrls(html, baseUrl) {
  const urls = new Set();

  const hrefRegex = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let hrefMatch;
  while ((hrefMatch = hrefRegex.exec(html)) !== null) {
    const raw = hrefMatch[1] || hrefMatch[2] || hrefMatch[3];
    if (!raw) continue;
    const normalized = normalizeBo3NewsUrl(raw, baseUrl);
    if (normalized) urls.add(normalized);
  }

  const absoluteUrlRegex = /https?:\/\/(?:www\.)?bo3\.gg\/dota2\/news\/[a-z0-9-]+/gi;
  let absMatch;
  while ((absMatch = absoluteUrlRegex.exec(html)) !== null) {
    const normalized = normalizeBo3NewsUrl(absMatch[0], baseUrl);
    if (normalized) urls.add(normalized);
  }

  const pathRegex = /\/dota2\/news\/[a-z0-9-]+/gi;
  let pathMatch;
  while ((pathMatch = pathRegex.exec(html)) !== null) {
    const normalized = normalizeBo3NewsUrl(pathMatch[0], baseUrl);
    if (normalized) urls.add(normalized);
  }

  const unescapedHtml = html.replace(/\\\//g, '/');
  let jsonPathMatch;
  while ((jsonPathMatch = pathRegex.exec(unescapedHtml)) !== null) {
    const normalized = normalizeBo3NewsUrl(jsonPathMatch[0], baseUrl);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls).slice(0, DETAIL_FETCH_LIMIT);
}

function parseSimpleRss(xml, sourceName, sourcePrefix) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch;

  while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < DETAIL_FETCH_LIMIT) {
    const rawItem = itemMatch[1];

    const title = stripHtml(rawItem.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
    const link = stripHtml(rawItem.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const description = stripHtml(rawItem.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '');
    const content = stripHtmlWithParagraphs(rawItem.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1] || '');
    const pubDateRaw = stripHtml(rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    const enclosureUrl = stripHtml(rawItem.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i)?.[1] || '');
    const mediaContentUrl = stripHtml(rawItem.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i)?.[1] || '');
    const imageUrl = enclosureUrl || mediaContentUrl || undefined;

    if (!title || !link) continue;

    items.push({
      id: generateId(link, sourcePrefix),
      title,
      summary: description || undefined,
      content: truncateText(content || description || ''),
      url: link,
      imageUrl,
      source: sourceName,
      publishedAt: parseDate(pubDateRaw) || new Date(),
      category: 'tournament',
    });
  }

  return items;
}

function extractArticleContent(detailHtml, article = {}) {
  if (typeof article.articleBody === 'string' && article.articleBody.trim()) {
    return truncateText(stripHtmlWithParagraphs(article.articleBody));
  }

  const articleBlock = detailHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (articleBlock) {
    const content = stripHtmlWithParagraphs(articleBlock);
    if (content.length > 150) return truncateText(content);
  }

  const contentPattern = /<(div|section)[^>]+(?:class|id)=["'][^"']*(?:content|article|post|entry|body|markdown)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let contentMatch;
  while ((contentMatch = contentPattern.exec(detailHtml)) !== null) {
    const content = stripHtmlWithParagraphs(contentMatch[2]);
    if (content.length > 150) return truncateText(content);
  }

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(detailHtml)) !== null && paragraphs.length < 24) {
    const line = stripHtmlWithParagraphs(pMatch[1]);
    if (line.length > 30) paragraphs.push(line);
  }

  if (paragraphs.length > 0) {
    return truncateText(paragraphs.join('\n\n'));
  }

  const description = stripHtml(getMetaContent(detailHtml, 'description') || '');
  return description || undefined;
}

function parseSitemapLocs(xml, baseUrl) {
  const urls = new Set();
  const locRegex = /<loc>([\s\S]*?)<\/loc>/gi;
  let match;

  while ((match = locRegex.exec(xml)) !== null) {
    const raw = stripHtml(match[1]);
    const normalized = normalizeBo3NewsUrl(raw, baseUrl);
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls);
}

function titleFromSlug(url) {
  try {
    const path = new URL(url).pathname;
    const slug = path.split('/').filter(Boolean).pop() || 'dota2-news';
    return slug
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return 'BO3.gg Dota2 News';
  }
}

function titleFromJinaText(text, fallbackTitle) {
  const lines = String(text || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  const header = lines.find((x) => x.startsWith('Title: ')) || lines[0] || '';
  const title = header.replace(/^Title:\s*/i, '').trim();
  return title || fallbackTitle;
}

async function scrapeHawkLive() {
  const source = 'hawk';
  const baseUrl = 'https://hawk.live';
  const tagUrl = '/tags/dota-2-news';

  try {
    const response = await fetchWithTimeout(`${baseUrl}${tagUrl}`, {}, 15000);
    if (!response.ok) {
      throw new Error(`Hawk list failed: HTTP ${response.status}`);
    }

    const html = await response.text();
    const urls = extractHawkListUrls(html, baseUrl);
    console.log(`[News API] Hawk list URLs: ${urls.length}`);

    if (urls.length === 0) {
      return { items: [], source, success: false, error: 'No Hawk article URLs found' };
    }

    const detailTasks = urls.map(async (url) => {
      const detailResponse = await fetchWithTimeout(url, {}, 12000);
      if (!detailResponse.ok) throw new Error(`HTTP ${detailResponse.status}`);

      const detailHtml = await detailResponse.text();
      if (hasHawkCs2Tag(detailHtml)) return null;
      const detailLd = parseJsonLdBlocks(detailHtml);
      const article = detailLd.find((x) => x?.['@type'] === 'NewsArticle') || {};

      const title = article.headline || getMetaContent(detailHtml, 'og:title') || getTitleFromHtml(detailHtml);
      if (!title) return null;

      const publishedAt =
        parseDate(article.datePublished) ||
        parseDate(getMetaContent(detailHtml, 'article:published_time')) ||
        parseDate(detailHtml.match(/datetime=["']([^"']+)["']/i)?.[1]) ||
        new Date();

      const imageUrl = normalizeUrl(
        getArticleImage(article) || getMetaContent(detailHtml, 'og:image') || '',
        baseUrl
      ) || undefined;

      const summary = stripHtml(article.description || getMetaContent(detailHtml, 'description') || '');
      const content = extractArticleContent(detailHtml, article);
      const candidate = {
        id: generateId(url, source),
        title,
        summary: summary || undefined,
        content,
        url,
        imageUrl,
        source: 'Hawk Live',
        publishedAt,
        category: 'tournament',
      };
      if (isHawkCs2News(candidate)) return null;
      return candidate;
    });

    const settled = await Promise.allSettled(detailTasks);
    const items = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);

    if (items.length === 0) {
      return { items: [], source, success: false, error: 'No Hawk article details parsed' };
    }

    return { items, source, success: true };
  } catch (error) {
    return {
      items: [],
      source,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function scrapeCyberScore(options = {}) {
  const source = 'cyberscore';
  const sourceName = 'CyberScore';
  const baseUrl = 'https://cyberscore.live';

  try {
    const recentDays = Number.isFinite(Number(options?.recentDays)) && Number(options?.recentDays) > 0
      ? Math.trunc(Number(options.recentDays))
      : 3;
    const urlToCategory = new Map();
    const listFallbackItems = [];

    for (const categoryDef of CYBERSCORE_CATEGORIES) {
      try {
        let urls = [];
        const response = await fetchWithTimeout(categoryDef.url, {}, 15000);
        if (response.ok) {
          const html = await response.text();
          if (!isCloudflareChallengePage(html)) {
            urls = extractCyberScoreNewsUrls(html, baseUrl);
          }
        }

        if (urls.length === 0) {
          const jinaListUrl = `${JINA_PROXY}${categoryDef.url.replace(/^https?:\/\//, '')}`;
          const jinaResponse = await fetchWithTimeout(jinaListUrl, {}, 12000);
          if (jinaResponse.ok) {
            const jinaText = await jinaResponse.text();
            urls = extractCyberScoreUrlsFromJinaText(jinaText, baseUrl);
            const fallbackItems = extractCyberScoreItemsFromJinaCategory(jinaText, categoryDef, source);
            listFallbackItems.push(...fallbackItems);
          }
        }

        for (const url of urls) {
          if (!urlToCategory.has(url)) {
            urlToCategory.set(url, categoryDef.category);
          }
        }
      } catch {
        // Skip category page on fetch/parse failure
      }
    }

    const allListUrls = Array.from(urlToCategory.keys());
    const detailUrls = prioritizeCyberScoreDetailUrls(allListUrls, listFallbackItems, CYBERSCORE_DETAIL_SCAN_LIMIT);
    console.log(`[News API] CyberScore list URLs: ${allListUrls.length}, fallback items: ${listFallbackItems.length}, detail URLs: ${detailUrls.length}`);
    if (detailUrls.length === 0 && listFallbackItems.length === 0) {
      return {
        items: [],
        source,
        success: false,
        error: 'No CyberScore article URLs found',
        diagnostics: { listUrlCount: allListUrls.length, fallbackItemCount: listFallbackItems.length, detailUrlCount: detailUrls.length, detailFailureCount: 0 },
      };
    }

    const detailItems = [];
    let detailFailureCount = 0;
    await mapWithConcurrency(detailUrls, CYBERSCORE_DETAIL_CONCURRENCY, async (url) => {
      try {
        const item = await fetchCyberScoreDetail(url, {
          id: generateId(url, source),
          title: titleFromSlug(url),
          summary: `${sourceName} · latest`,
          content: '正文抓取受限，请点击原文查看完整内容。',
          content_markdown: '正文抓取受限，请点击原文查看完整内容。',
          source: sourceName,
          publishedAt: new Date(),
          category: urlToCategory.get(url) || 'community',
        });
        if (item) detailItems.push(item);
      } catch (error) {
        detailFailureCount += 1;
        console.warn(`[News API] CyberScore detail failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    const detailUrlSet = new Set(detailItems.map((item) => item?.url).filter(Boolean));
    const fallbackNeedingDetail = listFallbackItems.filter((item) => !detailUrlSet.has(item?.url));
    const enrichedFallbackItems = await enrichCyberScoreFallbackItems(fallbackNeedingDetail, recentDays);
    const merged = [...detailItems, ...listFallbackItems, ...enrichedFallbackItems];
    const uniqueByUrl = new Map();
    for (const item of merged) {
      if (!item?.url) continue;
      if (uniqueByUrl.has(item.url)) {
        const existing = uniqueByUrl.get(item.url);
        const existingMarkdown = String(existing.content_markdown || existing.content || '');
        const incomingMarkdown = String(item.content_markdown || item.content || '');
        const useIncomingContent =
          incomingMarkdown.length > existingMarkdown.length &&
          !/正文抓取受限|正文暂不可读|请点击原文/i.test(incomingMarkdown);
        uniqueByUrl.set(item.url, {
          ...existing,
          title: existing.title || item.title,
          summary: (useIncomingContent ? item.summary : existing.summary) || item.summary,
          content: useIncomingContent ? item.content : (existing.content || item.content),
          content_markdown: useIncomingContent ? item.content_markdown : (existing.content_markdown || item.content_markdown),
          imageUrl: existing.imageUrl || item.imageUrl,
          publishedAt: existing.publishedAt || item.publishedAt,
          category: existing.category || item.category,
        });
      } else {
        uniqueByUrl.set(item.url, item);
      }
    }
    const items = Array.from(uniqueByUrl.values());

    if (items.length === 0) {
      return {
        items: [],
        source,
        success: false,
        error: 'No CyberScore article details parsed',
        diagnostics: {
          listUrlCount: allListUrls.length,
          fallbackItemCount: listFallbackItems.length,
          detailUrlCount: detailUrls.length,
          detailFailureCount,
          enrichedFallbackCount: enrichedFallbackItems.length,
        },
      };
    }

    return {
      items,
      source,
      success: true,
      diagnostics: {
        listUrlCount: allListUrls.length,
        fallbackItemCount: listFallbackItems.length,
        detailUrlCount: detailUrls.length,
        detailFailureCount,
        enrichedFallbackCount: enrichedFallbackItems.length,
      },
    };
  } catch (error) {
    return {
      items: [],
      source,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function collectBo3FallbackUrls(baseUrl) {
  const urls = new Set();

  const sitemapCandidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemaps/news.xml`,
  ];

  for (const sitemapUrl of sitemapCandidates) {
    try {
      const res = await fetchWithTimeout(sitemapUrl, {
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
      }, 7000);
      if (!res.ok) continue;
      const xml = await res.text();
      parseSitemapLocs(xml, baseUrl).forEach((u) => urls.add(u));
      if (urls.size >= DETAIL_FETCH_LIMIT) break;
    } catch {
      // Ignore and continue
    }
  }

  return Array.from(urls).slice(0, DETAIL_FETCH_LIMIT);
}

async function collectBo3UrlsViaJina(baseUrl) {
  try {
    const url = `${JINA_PROXY}${baseUrl.replace(/^https?:\/\//, '')}/dota2/news`;
    const res = await fetchWithTimeout(url, {}, 9000);
    if (!res.ok) return { urls: [], imageHints: new Map() };
    const text = await res.text();
    const matches = text.match(/https?:\/\/bo3\.gg\/dota2\/news\/[a-z0-9-]+/gi) || [];
    const normalized = matches
      .map((x) => normalizeBo3NewsUrl(x, baseUrl))
      .filter(Boolean);
    const imageHints = new Map();
    const cardRegex = /\[!\[[^\]]*]\((https?:\/\/[^)\s]+)\)\s*[^\]]*]\((https?:\/\/bo3\.gg\/dota2\/news\/[a-z0-9-]+)\)/gi;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(text)) !== null) {
      const imageUrlRaw = decodeHtmlEntities(cardMatch[1] || '').replace(/&amp;/g, '&').trim();
      const articleUrl = normalizeBo3NewsUrl(cardMatch[2], baseUrl);
      if (!imageUrlRaw || !articleUrl) continue;
      imageHints.set(articleUrl, imageUrlRaw);
    }
    return {
      urls: Array.from(new Set(normalized)).slice(0, DETAIL_FETCH_LIMIT),
      imageHints,
    };
  } catch {
    return { urls: [], imageHints: new Map() };
  }
}

async function scrapeBO3(options = {}) {
  const source = 'bo3';
  const baseUrl = 'https://bo3.gg';
  const listUrl = `${baseUrl}/dota2/news`;
  const rssUrls = [
    `${baseUrl}/dota2/news/rss`,
    `${baseUrl}/news/rss`,
    `${baseUrl}/rss`,
  ];

  try {
    // If test URL is specified, bypass list discovery and scrape only target article(s).
    const targetUrls = Array.isArray(options?.urls)
      ? options.urls.map((u) => normalizeBo3NewsUrl(u, baseUrl)).filter(Boolean)
      : [];
    let urls = Array.from(new Set(targetUrls));
    let bo3ImageHints = new Map();

    if (urls.length === 0) {
      // Strategy 1: official BO3 API. The public HTML is Nuxt-only and
      // r.jina.ai can return unrelated SEO/betting text for some slugs, so
      // prefer the same JSON endpoint used by bo3.gg itself.
      const apiList = await collectBo3UrlsViaApi();
      urls = apiList.urls;
      bo3ImageHints = apiList.imageHints;
    }

    if (urls.length === 0) {
      // Strategy 2: RSS
      for (const rssUrl of rssUrls) {
        try {
          const rssResponse = await fetchWithTimeout(rssUrl, {
            headers: {
              Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7',
            },
          }, 8000);

          if (!rssResponse.ok) continue;

          const rssXml = await rssResponse.text();
          const rssItems = parseSimpleRss(rssXml, 'BO3.gg', source).filter((x) => !isBettingNews(x));
          if (rssItems.length > 0) {
            console.log(`[News API] BO3 RSS items: ${rssItems.length}`);
            return { items: rssItems, source, success: true };
          }
        } catch {
          // Try next RSS source
        }
      }

      // Strategy 3: HTML list parsing
      try {
        const response = await fetchWithTimeout(listUrl, {}, 9000);
        if (response.ok) {
          const html = await response.text();
          urls = extractBo3NewsUrls(html, baseUrl);
        }
      } catch {
        // Continue to fallback
      }

      // Strategy 4: sitemap fallback when HTML fails
      if (urls.length === 0) {
        urls = await collectBo3FallbackUrls(baseUrl);
      }

      // Strategy 5: jina.ai fallback for anti-bot pages
      if (urls.length === 0) {
        const jinaList = await collectBo3UrlsViaJina(baseUrl);
        urls = jinaList.urls;
        bo3ImageHints = jinaList.imageHints;
      }
    }

    if (urls.length > 0 && bo3ImageHints.size === 0) {
      const jinaList = await collectBo3UrlsViaJina(baseUrl);
      bo3ImageHints = jinaList.imageHints;
    }

    console.log(`[News API] BO3 list URLs: ${urls.length}`);

    if (urls.length === 0) {
      return { items: [], source, success: false, error: 'No BO3 article URLs found' };
    }

    const detailTasks = urls.map(async (url) => {
      try {
        const apiItem = await fetchBo3ArticleViaApi(url);
        if (apiItem) return apiItem;
      } catch (error) {
        console.warn(`[News API] BO3 API detail failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }

      let detailHtml = '';
      let article = {};
      let detailLd = [];

      try {
        const detailResponse = await fetchWithTimeout(url, {}, 20000);
        detailHtml = await detailResponse.text();
        const hasArticleBody = detailHtml.includes('c-article-body');
        if (!detailResponse.ok && !hasArticleBody) {
          throw new Error(`HTTP ${detailResponse.status}`);
        }
        if (!hasArticleBody) {
          throw new Error('Missing article body');
        }
        detailLd = parseJsonLdBlocks(detailHtml);
        article = detailLd.find((x) => x?.['@type'] === 'NewsArticle') || {};
      } catch {
        const jinaUrl = `${JINA_PROXY}${url.replace(/^https?:\/\//, '')}`;
        const textRes = await fetchWithTimeout(jinaUrl, {}, 10000);
        if (!textRes.ok) throw new Error(`Jina HTTP ${textRes.status}`);
        const textContent = await textRes.text();
        const rawClean = cleanJinaBoilerplate(textContent);
        const cleaned = sanitizeBo3JinaContent(textContent);
        const images = Array.from(new Set([...extractMarkdownImageUrls(rawClean), ...extractAnyImageUrls(rawClean)]));
        const contentMarkdown = truncateText(normalizeBo3ContentMarkdown(cleaned));
        const content = truncateText(markdownToText(contentMarkdown));
        const fallbackTitle = titleFromSlug(url);
        const fallbackPublishedAt =
          parseBo3DateTimeString(textContent) ||
          parseJinaPublishedDate(textContent) ||
          (await resolveBo3PublishedAtFromRss(url, rssUrls, baseUrl)) ||
          new Date();
        return {
          id: generateId(url, source),
          title: titleFromJinaText(textContent, fallbackTitle),
          summary: content.slice(0, 220),
          content,
          content_markdown: contentMarkdown,
          url,
          imageUrl: images[0] || bo3ImageHints.get(url),
          source: 'BO3.gg',
          publishedAt: fallbackPublishedAt,
          category: 'tournament',
        };
      }

      const fallbackTitle = titleFromSlug(url);
      const title = article.headline || getMetaContent(detailHtml, 'og:title') || getTitleFromHtml(detailHtml) || fallbackTitle;
      const publishedAt =
        parseBo3PublishedAt(detailHtml) ||
        parseDate(article.datePublished) ||
        parseDate(getMetaContent(detailHtml, 'article:published_time')) ||
        parseDate(getMetaContent(detailHtml, 'datePublished')) ||
        new Date();

      const imageUrl = normalizeUrl(
        getArticleImage(article) || getMetaContent(detailHtml, 'og:image') || '',
        baseUrl
      ) || undefined;

      const summary = stripHtml(article.description || getMetaContent(detailHtml, 'description') || '');
      const bo3Body = extractBo3BodyData(detailHtml, baseUrl);
      let contentMarkdown = bo3Body.contentMarkdown;
      let jinaImageUrl;
      const htmlImages = [...bo3Body.contentImages, ...extractBo3ImagesFromHtml(detailHtml)];
      if (!contentMarkdown || contentMarkdown.length < 120) {
        try {
          const jinaUrl = `${JINA_PROXY}${url.replace(/^https?:\/\//, '')}`;
          const textRes = await fetchWithTimeout(jinaUrl, {}, 10000);
          if (textRes.ok) {
            const textContent = await textRes.text();
            const rawClean = cleanJinaBoilerplate(textContent);
            const cleaned = sanitizeBo3JinaContent(textContent);
            const images = Array.from(new Set([...extractMarkdownImageUrls(rawClean), ...extractAnyImageUrls(rawClean)]));
            jinaImageUrl = images[0];
            if (cleaned && cleaned.length > (contentMarkdown?.length || 0)) {
              contentMarkdown = cleaned;
            }
          }
        } catch {
          // keep existing content
        }
      } else {
        try {
          const jinaUrl = `${JINA_PROXY}${url.replace(/^https?:\/\//, '')}`;
          const textRes = await fetchWithTimeout(jinaUrl, {}, 7000);
          if (textRes.ok) {
            const textContent = await textRes.text();
            const rawClean = cleanJinaBoilerplate(textContent);
            const images = Array.from(new Set([...extractMarkdownImageUrls(rawClean), ...extractAnyImageUrls(rawClean)]));
            jinaImageUrl = images[0];
          }
        } catch {
          // ignore enrichment failures
        }
      }

      contentMarkdown = sanitizeStoredMarkdown(normalizeBo3ContentMarkdown(contentMarkdown || ''));
      const content = truncateText(markdownToText(contentMarkdown || ''));
      const fallbackImage = imageUrl && !imageUrl.includes('/img/logo-og') ? imageUrl : undefined;
      const hintedImage = bo3ImageHints.get(url);
      const preferredImage = normalizeBo3CoverImageUrl(
        hintedImage || fallbackImage || imageUrl || htmlImages[0] || jinaImageUrl,
        url
      );

      const resultItem = {
        id: generateId(url, source),
        title,
        summary: summary || undefined,
        content,
        content_markdown: contentMarkdown,
        url,
        imageUrl: preferredImage,
        source: 'BO3.gg',
        publishedAt,
        category: 'tournament',
      };
      if (isBettingNews(resultItem)) return null;
      return resultItem;
    });

    const settled = await Promise.allSettled(detailTasks);
    const parsedItems = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);

    if (parsedItems.length > 0) {
      return { items: parsedItems, source, success: true };
    }

    // Strategy 5: last fallback using URL slug if detail pages blocked
    const fallbackItems = urls.slice(0, DETAIL_FETCH_LIMIT).map((url, idx) => ({
      id: generateId(url, source),
      title: titleFromSlug(url),
      summary: '文章详情抓取失败，已保留来源链接。',
      content: '当前文章来源启用了严格防爬策略，正文暂不可读。请点击原文查看完整内容。',
      url,
      imageUrl: undefined,
      source: 'BO3.gg',
      publishedAt: new Date(Date.now() - idx * 60000),
      category: 'tournament',
    }));

    return { items: fallbackItems, source, success: true };
  } catch (error) {
    return {
      items: [],
      source,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function makeFallbackNews() {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 'fallback-cyberscore-news',
      title: 'CyberScore Dota 2 News',
      summary: '新闻源暂时不可用，已切换到来源页兜底展示。',
      content: '当前新闻源可能处于限流或反爬状态，已返回保底聚合入口。',
      source: 'CyberScore',
      url: 'https://cyberscore.live/en/news/',
      image_url: 'https://cyberscore.live/images/opengraph.webp',
      published_at: now - 30,
      category: 'community',
    },
    {
      id: 'fallback-hawk-news',
      title: 'Hawk Live Dota 2 新闻聚合',
      summary: '新闻源暂时不可用，已切换到来源页兜底展示。',
      content: '当前新闻源可能处于限流或反爬状态，已返回保底聚合入口。',
      source: 'Hawk Live',
      url: 'https://hawk.live/tags/dota-2-news',
      image_url: 'https://hawk.live/images/logo.svg',
      published_at: now,
      category: 'tournament',
    },
    {
      id: 'fallback-bo3-news',
      title: 'BO3.gg Dota 2 News',
      summary: '新闻源暂时不可用，已切换到来源页兜底展示。',
      content: '当前新闻源可能处于限流或反爬状态，已返回保底聚合入口。',
      source: 'BO3.gg',
      url: 'https://bo3.gg/dota2/news',
      image_url: undefined,
      published_at: now - 60,
      category: 'tournament',
    },
  ];
}

export function normalizeAndSortNews(items, options = {}) {
  const seen = new Set();
  const normalized = [];
  const hasExplicitLimit = Object.prototype.hasOwnProperty.call(options || {}, 'limit');
  const limit = hasExplicitLimit ? options.limit : MAX_ITEMS;

  for (const item of items) {
    if (!item?.url || !item?.title) continue;

    const normalizedUrl = normalizeUrl(item.url, item.url);
    if (!normalizedUrl || seen.has(normalizedUrl)) continue;

    seen.add(normalizedUrl);

    const publishedDate = item.publishedAt instanceof Date ? item.publishedAt : parseDate(item.publishedAt);
    const publishedAt = Math.floor((publishedDate || new Date()).getTime() / 1000);

    const rawMarkdown = item.content_markdown
      ? cleanJinaBoilerplate(String(item.content_markdown))
      : (item.content ? cleanJinaBoilerplate(String(item.content)) : '');
    const keepImagesInMarkdown = String(item.source || '').toLowerCase() === 'cyberscore';
    const sanitizedMarkdown = sanitizeStoredMarkdown(rawMarkdown, { keepImages: keepImagesInMarkdown });
    const rawContent = item.content ? String(item.content) : markdownToText(stripHtmlWithParagraphs(rawMarkdown));
    const normalizedSummary = item.summary ? stripHtml(item.summary).slice(0, 320) : undefined;
    const normalizedContent = rawContent
      ? truncateText(markdownToText(stripHtmlWithParagraphs(rawContent)))
      : (normalizedSummary || '正文提取受限，请点击原文查看完整内容。');
    const normalizedMarkdown = sanitizedMarkdown ? truncateText(sanitizedMarkdown) : undefined;

    normalized.push({
      id: item.id || generateId(normalizedUrl, 'news'),
      title: stripHtml(item.title),
      summary: normalizedSummary,
      content: normalizedContent,
      content_markdown: normalizedMarkdown,
      source: item.source || 'Unknown',
      url: normalizedUrl,
      image_url: item.imageUrl
        ? (
          String(item.source || '') === 'BO3.gg'
            ? normalizeBo3CoverImageUrl(item.imageUrl, item.url || normalizedUrl)
            : (normalizeUrl(item.imageUrl, item.url || normalizedUrl) || item.imageUrl)
        )
        : undefined,
      published_at: publishedAt,
      category: classifyNewsCategory({
        category: item.category || null,
        title_en: stripHtml(item.title),
        summary_en: normalizedSummary,
        content_en: normalizedContent,
        content_markdown_en: normalizedMarkdown,
      }),
    });
  }

  normalized.sort((a, b) => b.published_at - a.published_at);
  if (limit == null) return normalized;
  if (!Number.isFinite(Number(limit))) return normalized.slice(0, MAX_ITEMS);
  return normalized.slice(0, Math.max(0, Math.trunc(Number(limit))));
}

function looksChinese(text = '') {
  return /[\u4e00-\u9fff]/.test(text);
}

function hasBo3NavNoise(text = '') {
  const t = String(text || '');
  if (!t) return false;
  return (
    /CS2[\s\S]{0,160}Valorant[\s\S]{0,160}R6S[\s\S]{0,160}Dota 2/i.test(t) ||
    /Home[\s\S]{0,120}Matches[\s\S]{0,160}Schedule and Live/i.test(t) ||
    /\[\]\(\)\s*[\s\S]{0,80}\*\s*CS2/i.test(t)
  );
}

function hasBo3JinaTailNoise(text = '') {
  return /Additional content available|Go to Twitter bo3\.gg|By date|Cookies settings|Limited Time Offer|DINAH HOLDINGS LIMITED/i.test(String(text || ''));
}

function tokenizeEnglish(text = '') {
  const words = String(text || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  const stop = new Set([
    'dota', 'news', 'with', 'from', 'this', 'that', 'have', 'will', 'were', 'been', 'into', 'after',
    'before', 'their', 'your', 'for', 'the', 'and', 'said', 'says', 'about', 'misses', 'season',
  ]);
  return Array.from(new Set(words.filter((w) => !stop.has(w))));
}

function countTitleTokenHits(title = '', body = '') {
  const titleTokens = tokenizeEnglish(title);
  if (titleTokens.length === 0) return { total: 0, hits: 0, tokens: [] };
  const haystack = String(body || '').toLowerCase().slice(0, 1800);
  const hits = titleTokens.filter((token) => haystack.includes(token)).length;
  return { total: titleTokens.length, hits, tokens: titleTokens };
}

function hasBo3TitleBodyMismatch(title = '', body = '') {
  const t = String(title || '');
  const b = String(body || '');
  if (!t || !b) return false;

  const stat = countTitleTokenHits(t, b);
  if (stat.total >= 2 && stat.hits === 0) return true;
  if (stat.total >= 4 && stat.hits <= 1) return true;

  // A recurring wrong-body signature currently seen on BO3 fallback pages.
  if (/Álvaro\s+"?Avo\+/.test(b) && !/(organizer|birmingham|avo\+)/i.test(t)) {
    return true;
  }

  return false;
}

function getItemEnglishBody(item = {}) {
  return String(item?.content_markdown || item?.content || '').trim();
}

function getStoredEnglishBody(row = {}) {
  return String(row?.content_markdown_en || row?.content_en || '').trim();
}

function getBodyHash(text = '') {
  const normalized = String(text || '').trim();
  if (!normalized) return '';
  return createHash('sha1').update(normalized).digest('hex');
}

function countMarkdownH1(text = '') {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^#\s+\S/.test(line))
    .length;
}

function hasStrongEnglishBody(text = '', title = '') {
  const body = String(text || '').trim();
  if (!body || body.length < 220) return false;
  if (hasBo3NavNoise(body)) return false;
  if (hasBo3JinaTailNoise(body)) return false;
  if (hasBo3TitleBodyMismatch(title, body)) return false;
  return true;
}

function collectBo3DuplicateBodyHashes(items = []) {
  const groups = new Map();
  for (const item of items) {
    if (String(item?.source || '') !== 'BO3.gg') continue;
    const body = getItemEnglishBody(item);
    if (!body || body.length < 320) continue;
    const hash = getBodyHash(body);
    if (!hash) continue;
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(item.url);
  }

  const duplicateHashes = new Set();
  for (const [hash, urls] of groups.entries()) {
    if (urls.length > 1) duplicateHashes.add(hash);
  }
  return duplicateHashes;
}

function inspectBo3BodyQuality(item, duplicateBodyHashes = new Set()) {
  if (String(item?.source || '') !== 'BO3.gg') return [];
  const reasons = [];
  const body = getItemEnglishBody(item);
  const summary = String(item?.summary || '');
  const content = String(item?.content || '');
  const merged = `${summary}\n${content}\n${body}`;

  if (/抓取失败|正文暂不可读/i.test(merged)) {
    reasons.push('fallback_placeholder');
  }
  if (!body || body.length < 140) {
    reasons.push('too_short');
  }
  if (hasBo3NavNoise(body)) {
    reasons.push('nav_noise');
  }
  if (hasBo3JinaTailNoise(body)) {
    reasons.push('tail_noise');
  }
  if (countMarkdownH1(body) > 1) {
    reasons.push('multiple_h1');
  }
  if (hasBo3TitleBodyMismatch(item?.title || '', body)) {
    reasons.push('title_body_mismatch');
  }

  const hash = getBodyHash(body);
  if (hash && duplicateBodyHashes.has(hash) && body.length >= 320 && hasBo3TitleBodyMismatch(item?.title || '', body)) {
    reasons.push('duplicate_body_batch');
  }

  return reasons;
}

function normalizeTitleForDedupe(title = '') {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ');
}

function safeParseJsonFromText(text = '') {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        // Ignore
      }
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
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

function getTranslationApiKey() {
  return process.env.MINIMAX_API_KEY || process.env.MINIMAX_TEXT_API_KEY || '';
}

function getPreferredTranslationProvider(apiKey = '') {
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

async function ensureNewsTable(db) {
  await db`
    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      category TEXT,
      image_url TEXT,
      published_at BIGINT NOT NULL,
      title_en TEXT NOT NULL,
      summary_en TEXT,
      content_en TEXT,
      content_markdown_en TEXT,
      title_zh TEXT,
      summary_zh TEXT,
      content_zh TEXT,
      content_markdown_zh TEXT,
      translation_status TEXT,
      translation_provider TEXT,
      title_zh_provider TEXT,
      summary_zh_provider TEXT,
      content_zh_provider TEXT,
      translated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`ALTER TABLE news_articles DROP COLUMN IF EXISTS content_images`;
  await db`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS translation_status TEXT`;
  await db`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS translation_provider TEXT`;
  await db`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS title_zh_provider TEXT`;
  await db`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS summary_zh_provider TEXT`;
  await db`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS content_zh_provider TEXT`;
  await db`ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS translated_at TIMESTAMPTZ`;
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

function hasCompleteChineseBody(value, fallbackEn = '') {
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

function buildTranslationMeta(item, translated, provider = null) {
  const sourceBody = item?.content_markdown || item?.content || '';
  const titleDone = item?.title ? hasChineseTitle(translated?.title_zh, item.title) : true;
  const summaryDone = item?.summary ? hasChineseSummary(translated?.summary_zh, item.summary) : true;
  const bodyDone = sourceBody ? hasCompleteChineseBody(translated?.content_markdown_zh || translated?.content_zh || '', sourceBody) : true;
  const anyDone = titleDone || summaryDone || bodyDone;
  const complete = titleDone && summaryDone && bodyDone;
  const resolvedProvider = anyDone ? (provider || translated?._provider || null) : null;

  return {
    translation_status: complete
      ? TRANSLATION_STATUS_COMPLETED
      : anyDone
        ? TRANSLATION_STATUS_PARTIAL
        : TRANSLATION_STATUS_PENDING,
    translation_provider: resolvedProvider,
    title_zh_provider: titleDone ? resolvedProvider : null,
    summary_zh_provider: summaryDone ? resolvedProvider : null,
    content_zh_provider: bodyDone ? resolvedProvider : null,
    translated_at: anyDone ? new Date().toISOString() : null,
  };
}

async function translateCommunityTitle(apiKey, item) {
  if (!item?.title || looksChinese(item.title)) return item?.title || null;
  const glossaryPrompt = glossaryPromptForItem(item);
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
    return output || item.title;
  } catch {
    return item.title;
  }
}

async function translateCommunitySummary(apiKey, item) {
  const seed = item?.summary || item?.content || item?.content_markdown || item?.title;
  if (!seed || looksChinese(seed)) return item?.summary || seed || null;
  const glossaryPrompt = glossaryPromptForItem(item);
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
    return output || item.summary || item.title;
  } catch {
    return item.summary || item.title;
  }
}

async function translateLongMarkdown(apiKey, text, glossaryPrompt = '') {
  if (!text || looksChinese(text)) return text;
  const chunks = splitTextChunks(text, 1300);
  const translated = [];

  for (const chunk of chunks) {
    try {
      const prompt = [
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '请把下面 Dota2 英文新闻正文翻译成中文社区搬运帖风格。',
        '要求：',
        '- 保留 markdown 链接与图片语法',
        '- 保留专有名词原文',
        '- 保持段落结构',
        '- 标题、摘要、正文、点评都要完整，不要只翻译一部分',
        '- 只输出中文正文内容，不要额外解释',
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
          '把下面英文 Dota2 新闻正文翻译成简体中文社区搬运帖风格。',
          '要求：必须输出中文正文；保留 markdown 结构；保留专有名词原文；不要道歉；不要要求补充材料；不要输出标题/总结标签。',
          chunk,
        ].join('\n');
        output = await callTranslationModel(apiKey, retryPrompt, 1800, 22000).catch(() => output);
        if (!hasCompleteChineseBody(output, chunk) || looksLikeTranslationRefusal(output)) {
          const finalPrompt = [
            NEWS_TRANSLATION_GUIDANCE,
            '',
            glossaryPrompt,
            glossaryPrompt ? '' : '',
            '将下面英文 Dota2 新闻正文完整翻译为简体中文。',
            '要求：必须输出中文正文；保留 markdown 结构；保留专有名词原文；不要解释。',
            chunk,
          ].join('\n');
          output = await callTranslationModel(apiKey, finalPrompt, 1800, 22000).catch(() => output);
        }
      }
      translated.push(output);
    } catch {
      translated.push(chunk);
    }
  }

  return translated.join('\n\n');
}

async function translateItem(apiKey, item) {
  const sourceBody = item.content_markdown || item.content || '';
  const glossaryPrompt = glossaryPromptForItem(item);
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
    sourceBody ? translateLongMarkdown(apiKey, sourceBody, glossaryPrompt) : Promise.resolve(sourceBody),
  ]);

  return {
    title_zh,
    summary_zh,
    content_markdown_zh,
    content_zh: content_markdown_zh ? markdownToText(content_markdown_zh) : item.content,
    _provider: provider,
  };
}

async function getStoredNews(db, limit = 20) {
  const rows = await db`
    SELECT *
    FROM news_articles
    ORDER BY published_at DESC, updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => {
    const noisyZh = hasBo3NavNoise(row.content_markdown_zh || row.summary_zh || '');

    return {
      id: row.id,
      source: row.source,
      url: row.url,
      category: row.category || 'community',
      image_url: row.image_url,
      published_at: Number(row.published_at),
      title: row.title_zh || row.title_en,
      summary: noisyZh ? (row.summary_en || row.summary_zh) : (row.summary_zh || row.summary_en),
      content: noisyZh ? (row.content_en || row.content_zh) : (row.content_zh || row.content_en),
      content_markdown: noisyZh
        ? (row.content_markdown_en || row.content_markdown_zh)
        : (row.content_markdown_zh || row.content_markdown_en),
      translation_status: row.translation_status || null,
      translation_provider: row.translation_provider || null,
    };
  }).filter((x) => !isBettingNews(x));
}

export async function upsertSyncedNewsItems(db, items, options = {}) {
  let news = normalizeAndSortNews(items, { limit: null });
  news = news.filter((x) => !isBettingNews(x));
  const totalFetched = news.length;
  const cutoffSeconds = Number.isFinite(Number(options?.cutoffSeconds))
    ? Math.trunc(Number(options.cutoffSeconds))
    : Math.floor(Date.now() / 1000) - resolveNewsIncrementalWindowSeconds(options);

  if (news.length === 0) {
    return {
      totalFetched: 0,
      windowFilteredCount: 0,
      dedupedByTitleCount: 0,
      insertedCount: 0,
      pendingTranslate: 0,
      translatedCount: 0,
      translateAttemptedCount: 0,
      skippedSuspiciousBo3Count: 0,
      cutoffSeconds,
      translationErrors: [],
    };
  }

  news = news.filter((x) => Number(x.published_at) >= cutoffSeconds);
  const windowFilteredCount = news.length;
  if (news.length === 0) {
    return {
      totalFetched,
      windowFilteredCount: 0,
      dedupedByTitleCount: 0,
      insertedCount: 0,
      pendingTranslate: 0,
      translatedCount: 0,
      translateAttemptedCount: 0,
      skippedSuspiciousBo3Count: 0,
      cutoffSeconds,
      translationErrors: [],
    };
  }

  const existingTitleRows = await db`
    SELECT title_en
    FROM news_articles
    WHERE published_at >= ${cutoffSeconds - (7 * 24 * 60 * 60)}
  `;
  const incomingUrls = news.map((x) => x.url);
  const existingUrlRows = incomingUrls.length > 0
    ? await db`SELECT url FROM news_articles WHERE url = ANY(${incomingUrls})`
    : [];
  const existingUrlSet = new Set(existingUrlRows.map((row) => row.url));
  const existingTitleKeys = new Set(
    existingTitleRows
      .map((row) => normalizeTitleForDedupe(row.title_en || ''))
      .filter(Boolean)
  );
  const seenBatchTitleKeys = new Set();
  const beforeTitleDedupeCount = news.length;
  news = news.filter((item) => {
    // Existing URLs should always pass so content can be refreshed.
    if (existingUrlSet.has(item.url)) return true;

    const key = normalizeTitleForDedupe(item.title);
    if (!key) return true;
    if (existingTitleKeys.has(key)) return false;
    if (seenBatchTitleKeys.has(key)) return false;
    seenBatchTitleKeys.add(key);
    return true;
  });
  const dedupedByTitleCount = Math.max(0, beforeTitleDedupeCount - news.length);
  if (news.length === 0) {
    return {
      totalFetched,
      windowFilteredCount,
      dedupedByTitleCount,
      insertedCount: 0,
      pendingTranslate: 0,
      translatedCount: 0,
      translateAttemptedCount: 0,
      skippedSuspiciousBo3Count: 0,
      cutoffSeconds,
      translationErrors: [],
    };
  }

  const urls = news.map((x) => x.url);
  const existingRows = urls.length > 0
    ? await db`SELECT url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh, translation_status, translation_provider, title_zh_provider, summary_zh_provider, content_zh_provider FROM news_articles WHERE url = ANY(${urls})`
    : [];
  const existingMap = new Map(existingRows.map((r) => [r.url, r]));
  const duplicateBo3BodyHashes = collectBo3DuplicateBodyHashes(news);
  const apiKey = getTranslationApiKey();

  let translatedCount = 0;
  let insertedCount = 0;
  let skippedSuspiciousBo3Count = 0;
  const pendingTranslateItems = [];
  for (const item of news) {
    const existing = existingMap.get(item.url);
    const bo3QualityIssues = inspectBo3BodyQuality(item, duplicateBo3BodyHashes);
    if (bo3QualityIssues.length > 0) {
      const reasonText = bo3QualityIssues.join(',');
      const existingBody = getStoredEnglishBody(existing || {});
      const existingTitle = String(existing?.title_en || item.title || '');
      if (hasStrongEnglishBody(existingBody, existingTitle)) {
        skippedSuspiciousBo3Count += 1;
        console.warn(`[News API] Skip BO3 overwrite for ${item.url} reasons=${reasonText}`);
        continue;
      }
      skippedSuspiciousBo3Count += 1;
      console.warn(`[News API] Skip BO3 insert/update for ${item.url} reasons=${reasonText}`);
      continue;
    }

    const isFallbackPlaceholder =
      String(item.summary || '').includes('抓取失败') ||
      String(item.content || '').includes('正文暂不可读');
    if (existing && isFallbackPlaceholder && String(existing.content_markdown_en || '').length > 200) {
      continue;
    }

    const enChanged =
      !existing ||
      existing.title_en !== item.title ||
      (existing.summary_en || '') !== (item.summary || '') ||
      (existing.content_en || '') !== (item.content || '') ||
      (existing.content_markdown_en || '') !== (item.content_markdown || '');
    const englishBody = item.content_markdown || item.content || '';
    const missingCoreZh =
      !existing?.title_zh ||
      !looksChinese(existing?.title_zh) ||
      !existing?.summary_zh ||
      !looksChinese(existing?.summary_zh) ||
      !existing?.content_markdown_zh;
    const needTranslate = enChanged || missingCoreZh;
    const hasChineseBody = hasCompleteChineseBody(existing?.content_markdown_zh || existing?.content_zh || '', englishBody);
    const shouldTranslate = needTranslate || !hasChineseBody;
    const shouldResetZh = item.source === 'BO3.gg' && enChanged;

    const existingZh = {
      title_zh: shouldResetZh ? null : (existing?.title_zh || null),
      summary_zh: shouldResetZh ? null : (existing?.summary_zh || null),
      content_zh: shouldResetZh ? null : (existing?.content_zh || null),
      content_markdown_zh: shouldResetZh ? null : (existing?.content_markdown_zh || null),
      translation_status: shouldResetZh
        ? TRANSLATION_STATUS_PENDING
        : (existing?.translation_status || TRANSLATION_STATUS_PENDING),
      translation_provider: shouldResetZh ? null : (existing?.translation_provider || null),
      title_zh_provider: shouldResetZh ? null : (existing?.title_zh_provider || null),
      summary_zh_provider: shouldResetZh ? null : (existing?.summary_zh_provider || null),
      content_zh_provider: shouldResetZh ? null : (existing?.content_zh_provider || null),
    };

    await db`
      INSERT INTO news_articles (
        id, source, url, category, image_url, published_at,
        title_en, summary_en, content_en, content_markdown_en,
        title_zh, summary_zh, content_zh, content_markdown_zh,
        translation_status, translation_provider, title_zh_provider, summary_zh_provider, content_zh_provider,
        updated_at
      ) VALUES (
        ${item.id}, ${item.source}, ${item.url}, ${item.category}, ${item.image_url || null}, ${item.published_at},
        ${item.title}, ${item.summary || null}, ${item.content || null}, ${item.content_markdown || null},
        ${existingZh.title_zh || null}, ${existingZh.summary_zh || null}, ${existingZh.content_zh || null}, ${existingZh.content_markdown_zh || null},
        ${existingZh.translation_status}, ${existingZh.translation_provider}, ${existingZh.title_zh_provider}, ${existingZh.summary_zh_provider}, ${existingZh.content_zh_provider},
        NOW()
      )
      ON CONFLICT (url) DO UPDATE SET
        id = EXCLUDED.id,
        source = EXCLUDED.source,
        category = CASE
          WHEN news_articles.category IS NULL OR news_articles.category IN ('', 'tournament', 'news', 'results')
            THEN EXCLUDED.category
          ELSE news_articles.category
        END,
        image_url = EXCLUDED.image_url,
        published_at = EXCLUDED.published_at,
        title_en = EXCLUDED.title_en,
        summary_en = EXCLUDED.summary_en,
        content_en = EXCLUDED.content_en,
        content_markdown_en = EXCLUDED.content_markdown_en,
        title_zh = EXCLUDED.title_zh,
        summary_zh = EXCLUDED.summary_zh,
        content_zh = EXCLUDED.content_zh,
        content_markdown_zh = EXCLUDED.content_markdown_zh,
        translation_status = EXCLUDED.translation_status,
        translation_provider = EXCLUDED.translation_provider,
        title_zh_provider = EXCLUDED.title_zh_provider,
        summary_zh_provider = EXCLUDED.summary_zh_provider,
        content_zh_provider = EXCLUDED.content_zh_provider,
        updated_at = NOW()
    `;
    insertedCount += 1;

    if (shouldTranslate) {
      pendingTranslateItems.push(item);
    }
  }

  const translateLimit = Number.isFinite(Number(options?.translateLimit))
    ? Math.max(0, Number(options.translateLimit))
    : pendingTranslateItems.length;
  const translationErrors = [];
  const translateTargets = pendingTranslateItems.slice(0, translateLimit);
  for (const item of translateTargets) {
    try {
      const zh = await translateItem(apiKey, item);
      const meta = buildTranslationMeta(item, zh, zh?._provider || getPreferredTranslationProvider(apiKey));
      await db`
        UPDATE news_articles
        SET
          title_zh = ${meta.title_zh_provider ? zh.title_zh || null : null},
          summary_zh = ${meta.summary_zh_provider ? zh.summary_zh || null : null},
          content_zh = ${meta.content_zh_provider ? zh.content_zh || null : null},
          content_markdown_zh = ${meta.content_zh_provider ? zh.content_markdown_zh || null : null},
          translation_status = ${meta.translation_status},
          translation_provider = ${meta.translation_provider},
          title_zh_provider = ${meta.title_zh_provider},
          summary_zh_provider = ${meta.summary_zh_provider},
          content_zh_provider = ${meta.content_zh_provider},
          translated_at = ${meta.translated_at},
          updated_at = NOW()
        WHERE url = ${item.url}
      `;
      if (meta.translation_status === TRANSLATION_STATUS_COMPLETED) translatedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown translation error';
      translationErrors.push({ url: item.url, message });
      console.warn(`[News API] Translate failed for ${item.url}: ${message}`);
    }
  }

  return {
    totalFetched,
    windowFilteredCount,
    dedupedByTitleCount,
    insertedCount,
    pendingTranslate: Math.max(0, pendingTranslateItems.length - translatedCount),
    translatedCount,
    translateAttemptedCount: translateTargets.length,
    skippedSuspiciousBo3Count,
    cutoffSeconds,
    translationErrors,
  };
}

export async function syncNewsToDb(options = {}) {
  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL not configured');
  }

  await ensureNewsTable(db);
  let purgedBo3Count = 0;
  if (options?.purgeBo3) {
    const removed = await db`DELETE FROM news_articles WHERE source = 'BO3.gg' RETURNING url`;
    purgedBo3Count = removed.length;
  }

  const onlySource = ['bo3', 'hawk', 'cyberscore'].includes(options?.onlySource)
    ? options.onlySource
    : null;
  const sourceTasks = [];
  if (!onlySource || onlySource === 'cyberscore') {
    sourceTasks.push({ key: 'cyberscore', run: () => scrapeCyberScore({ recentDays: options?.recentDays }) });
  }
  if (!onlySource || onlySource === 'hawk') {
    sourceTasks.push({ key: 'hawk', run: () => scrapeHawkLive() });
  }
  if (!onlySource || onlySource === 'bo3') {
    const testUrl = options?.bo3TestUrl ? normalizeBo3NewsUrl(options.bo3TestUrl, 'https://bo3.gg') : null;
    sourceTasks.push({ key: 'bo3', run: () => scrapeBO3({ urls: testUrl ? [testUrl] : [] }) });
  }

  const cutoffSeconds = Math.floor(Date.now() / 1000) - resolveNewsIncrementalWindowSeconds(options);
  const translateLimit = Number.isFinite(Number(options?.translateLimit))
    ? Math.max(0, Number(options.translateLimit))
    : null;
  let remainingTranslateBudget = translateLimit;

  const sourceDiagnostics = [];
  const aggregate = {
    totalFetched: 0,
    windowFilteredCount: 0,
    dedupedByTitleCount: 0,
    insertedCount: 0,
    pendingTranslate: 0,
    translatedCount: 0,
    skippedSuspiciousBo3Count: 0,
    translationErrors: [],
  };

  for (const sourceTask of sourceTasks) {
    try {
      const payload = await sourceTask.run();
      const itemCount = Array.isArray(payload?.items) ? payload.items.length : 0;
      sourceDiagnostics.push({
        source: payload?.source || sourceTask.key,
        success: Boolean(payload?.success),
        itemCount,
        error: payload?.error || null,
        ...(payload?.diagnostics || {}),
      });

      if (!payload?.success || itemCount === 0) {
        if (!payload?.success) {
          console.warn(`[News API] Source failed: ${payload?.source || sourceTask.key} ${payload?.error || 'unknown_error'}`);
        }
        continue;
      }

      const batch = await upsertSyncedNewsItems(db, payload.items, {
        cutoffSeconds,
        translateLimit: remainingTranslateBudget,
      });
      aggregate.totalFetched += batch.totalFetched;
      aggregate.windowFilteredCount += batch.windowFilteredCount;
      aggregate.dedupedByTitleCount += batch.dedupedByTitleCount;
      aggregate.insertedCount += batch.insertedCount;
      aggregate.pendingTranslate += batch.pendingTranslate;
      aggregate.translatedCount += batch.translatedCount;
      aggregate.skippedSuspiciousBo3Count += batch.skippedSuspiciousBo3Count;
      aggregate.translationErrors.push(...(batch.translationErrors || []));
      if (remainingTranslateBudget !== null) {
        remainingTranslateBudget = Math.max(0, remainingTranslateBudget - (batch.translateAttemptedCount || 0));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || 'unknown_error');
      sourceDiagnostics.push({
        source: sourceTask.key,
        success: false,
        itemCount: 0,
        error: errorMessage,
      });
      console.warn(`[News API] Source task rejected: ${errorMessage}`);
    }
  }

  return {
    ...aggregate,
    purgedBo3Count,
    onlySource: onlySource || 'all',
    cutoffSeconds,
    sourceDiagnostics,
  };
}

export async function translateNewsBackfill(options = {}) {
  const db = getDb();
  if (!db) {
    throw new Error('DATABASE_URL not configured');
  }

  await ensureNewsTable(db);
  const apiKey = getTranslationApiKey();
  const preferredProvider = getPreferredTranslationProvider(apiKey);
  if (!preferredProvider) {
    return { scanned: 0, translated: 0, completed: 0, pending: 0, provider: null, skipped: 'missing_api_key' };
  }

  const recentDays = Number.isFinite(Number(options?.recentDays))
    ? Math.max(1, Number(options.recentDays))
    : 2;
  const limit = Number.isFinite(Number(options?.limit))
    ? Math.max(1, Number(options.limit))
    : 20;
  const cutoffSeconds = Math.floor(Date.now() / 1000) - (recentDays * 86400);

  const rows = await db`
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en,
           title_zh, summary_zh, content_zh, content_markdown_zh,
           translation_status, translation_provider, title_zh_provider, summary_zh_provider, content_zh_provider,
           published_at
    FROM news_articles
    WHERE published_at >= ${cutoffSeconds}
      AND (
        COALESCE(title_en, '') <> ''
        OR COALESCE(summary_en, '') <> ''
        OR COALESCE(content_en, '') <> ''
        OR COALESCE(content_markdown_en, '') <> ''
      )
      AND (
        COALESCE(translation_status, ${TRANSLATION_STATUS_PENDING}) <> ${TRANSLATION_STATUS_COMPLETED}
        OR translation_provider = ${preferredProvider}
        OR COALESCE(title_zh, '') = ''
        OR COALESCE(summary_zh, '') = ''
        OR COALESCE(content_zh, '') = ''
        OR COALESCE(content_markdown_zh, '') = ''
      )
    ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${limit}
  `;

  let translated = 0;
  let completed = 0;
  let pending = 0;

  for (const row of rows) {
    const item = {
      title: row.title_en,
      summary: row.summary_en,
      content: row.content_en,
      content_markdown: row.content_markdown_en,
    };
    const zh = await translateItem(apiKey, item);
    const meta = buildTranslationMeta(item, zh, zh?._provider || preferredProvider);
    await db`
      UPDATE news_articles
      SET
        title_zh = ${meta.title_zh_provider ? zh.title_zh || null : null},
        summary_zh = ${meta.summary_zh_provider ? zh.summary_zh || null : null},
        content_zh = ${meta.content_zh_provider ? zh.content_zh || null : null},
        content_markdown_zh = ${meta.content_zh_provider ? zh.content_markdown_zh || null : null},
        translation_status = ${meta.translation_status},
        translation_provider = ${meta.translation_provider},
        title_zh_provider = ${meta.title_zh_provider},
        summary_zh_provider = ${meta.summary_zh_provider},
        content_zh_provider = ${meta.content_zh_provider},
        translated_at = ${meta.translated_at},
        updated_at = NOW()
      WHERE id = ${row.id}
    `;
    translated += 1;
    if (meta.translation_status === TRANSLATION_STATUS_COMPLETED) completed += 1;
    if (meta.translation_status !== TRANSLATION_STATUS_COMPLETED) pending += 1;
  }

  return {
    scanned: rows.length,
    translated,
    completed,
    pending,
    provider: preferredProvider,
    recentDays,
    limit,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = getDb();
    if (!db) {
      return res.status(200).json(makeFallbackNews());
    }

    await ensureNewsTable(db);
    let stored = await getStoredNews(db, MAX_ITEMS);

    // Cold-start fallback: do one sync when table is empty.
    if (stored.length === 0) {
      await syncNewsToDb();
      stored = await getStoredNews(db, MAX_ITEMS);
    }

    if (stored.length === 0) {
      return res.status(200).json(makeFallbackNews());
    }

    return res.status(200).json(stored);
  } catch (error) {
    console.error('[News API] Unexpected error:', error);
    return res.status(200).json(makeFallbackNews());
  }
}
