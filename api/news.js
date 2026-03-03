import { neon } from '@neondatabase/serverless';

/**
 * News API
 * Multi-source scraper with robust fallbacks.
 *
 * Usage: GET /api/news
 */

const MAX_ITEMS = 30;
const DETAIL_FETCH_LIMIT = 10;
const MAX_CONTENT_LENGTH = 5000;
const JINA_PROXY = 'https://r.jina.ai/http://';
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const TRANSLATE_BATCH_LIMIT = 2;

const MINIMAX_API_URL = 'https://api.minimax.io/anthropic/v1/messages';
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
let sql = null;

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

function sanitizeStoredMarkdown(markdown = '') {
  return String(markdown || '')
    .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '$1')
    .replace(/https?:\/\/[^\s)]+/gi, '')
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

function parseBo3PublishedAt(detailHtml) {
  const dateLiMatch = detailHtml.match(
    /<li[^>]*class=["'][^"']*o-list-bare__item[^"']*\bdate\b[^"']*["'][^>]*>\s*<p[^>]*>\s*(\d{1,2}:\d{2})\s*,\s*(\d{2}\.\d{2}\.\d{4})\s*<\/p>/i
  );
  const anyPMatch = detailHtml.match(/<p[^>]*>\s*(\d{1,2}:\d{2})\s*,\s*(\d{2}\.\d{2}\.\d{4})\s*<\/p>/i);
  return parseBo3DateTimeString(dateLiMatch?.[0] || anyPMatch?.[0] || detailHtml);
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

function cutBo3ContentBeforeComments(text = '') {
  if (!text) return text;
  let content = String(text);

  const stopPatterns = [
    /\nGo to Twitter bo3\.gg/i,
    /\nComments?\b/i,
    /\nRelated News\b/i,
    /\nNext article\b/i,
    /\nRead more\b/i,
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
  const noisyLine = /^(Sign In|Home|Matches|Schedule and Live|Finished|Upcoming and Ongoing|Players|Teams|News|Articles|Predictions|Heroes|Dota2|Dota 2|Games|eng|ua|ru|pt|de|pl|fr|es|tr|vn|id|kr|jp|ph|my|Like \d+)$/i;
  const keep = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^•\s*$/.test(t)) continue;
    if (noisyLine.test(t)) continue;
    if (/^•\s*(Sign In|Home|Matches|Schedule and Live|Finished|Upcoming and Ongoing|Players|Teams|News|Articles|Predictions|Heroes|Dota2|Dota 2|Games)\b/i.test(t)) continue;
    keep.push(line);
  }
  return keep.join('\n').trim();
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

function extractHawkListUrls(html, baseUrl) {
  const urls = new Set();

  const jsonLd = parseJsonLdBlocks(html);
  for (const block of jsonLd) {
    if (block?.['@type'] !== 'ItemList' || !Array.isArray(block.itemListElement)) continue;
    for (const item of block.itemListElement) {
      const raw = item?.url || item?.item?.url;
      if (typeof raw === 'string' && raw.includes('/posts/')) {
        const normalized = normalizeUrl(raw, baseUrl);
        if (normalized) urls.add(normalized);
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
        if (normalized) urls.add(normalized);
      }

      const pathValues = collectValuesByKey(nextData, 'url').flat().filter(Boolean);
      for (const path of pathValues) {
        if (typeof path !== 'string' || !path.includes('/posts/')) continue;
        const normalized = normalizeUrl(path, baseUrl);
        if (normalized) urls.add(normalized);
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
    if (normalized) urls.add(normalized);
  }

  return Array.from(urls).slice(0, DETAIL_FETCH_LIMIT);
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

      return {
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
    if (!res.ok) return [];
    const text = await res.text();
    const matches = text.match(/https?:\/\/bo3\.gg\/dota2\/news\/[a-z0-9-]+/gi) || [];
    const normalized = matches
      .map((x) => normalizeBo3NewsUrl(x, baseUrl))
      .filter(Boolean);
    return Array.from(new Set(normalized)).slice(0, DETAIL_FETCH_LIMIT);
  } catch {
    return [];
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

    if (urls.length === 0) {
      // Strategy 1: RSS
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

      // Strategy 2: HTML list parsing
      try {
        const response = await fetchWithTimeout(listUrl, {}, 9000);
        if (response.ok) {
          const html = await response.text();
          urls = extractBo3NewsUrls(html, baseUrl);
        }
      } catch {
        // Continue to fallback
      }

      // Strategy 3: sitemap fallback when HTML fails
      if (urls.length === 0) {
        urls = await collectBo3FallbackUrls(baseUrl);
      }

      // Strategy 4: jina.ai fallback for anti-bot pages
      if (urls.length === 0) {
        urls = await collectBo3UrlsViaJina(baseUrl);
      }
    }

    console.log(`[News API] BO3 list URLs: ${urls.length}`);

    if (urls.length === 0) {
      return { items: [], source, success: false, error: 'No BO3 article URLs found' };
    }

    const detailTasks = urls.map(async (url) => {
      let detailHtml = '';
      let article = {};
      let detailLd = [];

      try {
        const detailResponse = await fetchWithTimeout(url, {}, 20000);
        detailHtml = await detailResponse.text();
        if (!detailResponse.ok && !detailHtml.includes('c-article-body')) {
          throw new Error(`HTTP ${detailResponse.status}`);
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
        const contentMarkdown = truncateText(cleaned);
        const content = truncateText(markdownToText(contentMarkdown));
        const fallbackTitle = titleFromSlug(url);
        return {
          id: generateId(url, source),
          title: titleFromJinaText(textContent, fallbackTitle),
          summary: content.slice(0, 220),
          content,
          content_markdown: contentMarkdown,
          url,
          imageUrl: images[0],
          source: 'BO3.gg',
          publishedAt: parseBo3DateTimeString(textContent) || new Date(),
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

      contentMarkdown = sanitizeStoredMarkdown(cutBo3ContentBeforeComments(contentMarkdown || ''));
      const content = truncateText(markdownToText(contentMarkdown || ''));
      const fallbackImage = imageUrl && !imageUrl.includes('/img/logo-og') ? imageUrl : undefined;
      const preferredImage = htmlImages[0] || jinaImageUrl || fallbackImage || imageUrl;

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

function normalizeAndSortNews(items) {
  const seen = new Set();
  const normalized = [];

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
    const sanitizedMarkdown = sanitizeStoredMarkdown(rawMarkdown);
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
      image_url: item.imageUrl ? normalizeUrl(item.imageUrl, item.url || normalizedUrl) || item.imageUrl : undefined,
      published_at: publishedAt,
      category: item.category || 'tournament',
    });
  }

  normalized.sort((a, b) => b.published_at - a.published_at);
  return normalized.slice(0, MAX_ITEMS);
}

function looksChinese(text = '') {
  return /[\u4e00-\u9fff]/.test(text);
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

async function translateNewsWithMiniMax(news) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!Array.isArray(news) || news.length === 0) return news;
  if (!apiKey) {
    console.warn('[News API] MINIMAX_API_KEY is missing, skip translation');
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
          max_tokens: 2500,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: prompt }],
            },
          ],
        }),
      },
      25000
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`MiniMax HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = await response.json();
    const outputText = extractMiniMaxText(payload);
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await db`ALTER TABLE news_articles DROP COLUMN IF EXISTS content_images`;
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

async function translateShortText(apiKey, text) {
  if (!text || looksChinese(text)) return text;
  try {
    const prompt = `将下面内容翻译为简体中文，保留专有名词原文，不要解释：\n${text}`;
    const res = await fetchWithTimeout(
      MINIMAX_API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MINIMAX_MODEL,
          max_tokens: 800,
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        }),
      },
      18000
    );
    if (!res.ok) return text;
    const data = await res.json();
    return extractMiniMaxText(data).trim() || text;
  } catch {
    return text;
  }
}

async function translateLongMarkdown(apiKey, text) {
  if (!text || looksChinese(text)) return text;
  const chunks = splitTextChunks(text, 1300);
  const translated = [];

  for (const chunk of chunks) {
    try {
      const prompt = [
        '将下面 Dota2 新闻正文翻译为简体中文。',
        '要求：保留 markdown 链接与图片语法；保留专有名词原文；保持段落。',
        chunk,
      ].join('\n');
      const res = await fetchWithTimeout(
        MINIMAX_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MINIMAX_MODEL,
            max_tokens: 1800,
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          }),
        },
        22000
      );
      if (!res.ok) {
        translated.push(chunk);
        continue;
      }
      const data = await res.json();
      translated.push(extractMiniMaxText(data).trim() || chunk);
    } catch {
      translated.push(chunk);
    }
  }

  return translated.join('\n\n');
}

async function translateItem(apiKey, item) {
  if (!apiKey) {
    return {
      title_zh: item.title,
      summary_zh: item.summary,
      content_zh: item.content,
      content_markdown_zh: item.content_markdown,
    };
  }

  const [title_zh, summary_zh, content_markdown_zh] = await Promise.all([
    translateShortText(apiKey, item.title),
    item.summary ? translateShortText(apiKey, item.summary) : Promise.resolve(item.summary),
    item.content_markdown ? translateLongMarkdown(apiKey, item.content_markdown) : Promise.resolve(item.content_markdown),
  ]);

  return {
    title_zh,
    summary_zh,
    content_markdown_zh,
    content_zh: content_markdown_zh ? markdownToText(content_markdown_zh) : item.content,
  };
}

async function getStoredNews(db, limit = 20) {
  const rows = await db`
    SELECT *
    FROM news_articles
    ORDER BY published_at DESC, updated_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    url: row.url,
    category: row.category || 'tournament',
    image_url: row.image_url,
    published_at: Number(row.published_at),
    title: row.title_zh || row.title_en,
    summary: row.summary_zh || row.summary_en,
    content: row.content_zh || row.content_en,
    content_markdown: row.content_markdown_zh || row.content_markdown_en,
  })).filter((x) => !isBettingNews(x));
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

  const onlySource = options?.onlySource === 'bo3' || options?.onlySource === 'hawk'
    ? options.onlySource
    : null;
  const sourceTasks = [];
  if (!onlySource || onlySource === 'hawk') {
    sourceTasks.push(scrapeHawkLive());
  }
  if (!onlySource || onlySource === 'bo3') {
    const testUrl = options?.bo3TestUrl ? normalizeBo3NewsUrl(options.bo3TestUrl, 'https://bo3.gg') : null;
    sourceTasks.push(scrapeBO3({ urls: testUrl ? [testUrl] : [] }));
  }

  const sourceResults = await Promise.allSettled(sourceTasks);
  const allItems = [];

  for (const result of sourceResults) {
    if (result.status === 'fulfilled' && result.value?.success && Array.isArray(result.value.items)) {
      allItems.push(...result.value.items);
    }
  }

  let news = normalizeAndSortNews(allItems);
  news = news.filter((x) => !isBettingNews(x));
  if (news.length === 0) news = makeFallbackNews();

  const urls = news.map((x) => x.url);
  const existingRows = urls.length > 0
    ? await db`SELECT url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh FROM news_articles WHERE url = ANY(${urls})`
    : [];
  const existingMap = new Map(existingRows.map((r) => [r.url, r]));
  const apiKey = process.env.MINIMAX_API_KEY;

  let translatedCount = 0;
  const pendingTranslateItems = [];
  for (const item of news) {
    const existing = existingMap.get(item.url);
    const enChanged =
      !existing ||
      existing.title_en !== item.title ||
      (existing.summary_en || '') !== (item.summary || '') ||
      (existing.content_en || '') !== (item.content || '') ||
      (existing.content_markdown_en || '') !== (item.content_markdown || '');
    const needTranslate = enChanged || !existing?.title_zh || !existing?.content_markdown_zh;
    const hasChineseBody = looksChinese(existing?.content_markdown_zh || '');
    const shouldTranslate = needTranslate || !hasChineseBody;

    const existingZh = {
      title_zh: existing?.title_zh || null,
      summary_zh: existing?.summary_zh || null,
      content_zh: existing?.content_zh || null,
      content_markdown_zh: existing?.content_markdown_zh || null,
    };

    await db`
      INSERT INTO news_articles (
        id, source, url, category, image_url, published_at,
        title_en, summary_en, content_en, content_markdown_en,
        title_zh, summary_zh, content_zh, content_markdown_zh,
        updated_at
      ) VALUES (
        ${item.id}, ${item.source}, ${item.url}, ${item.category}, ${item.image_url || null}, ${item.published_at},
        ${item.title}, ${item.summary || null}, ${item.content || null}, ${item.content_markdown || null},
        ${existingZh.title_zh || null}, ${existingZh.summary_zh || null}, ${existingZh.content_zh || null}, ${existingZh.content_markdown_zh || null},
        NOW()
      )
      ON CONFLICT (url) DO UPDATE SET
        id = EXCLUDED.id,
        source = EXCLUDED.source,
        category = EXCLUDED.category,
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
        updated_at = NOW()
    `;

    if (shouldTranslate) {
      pendingTranslateItems.push(item);
    }
  }

  const translateLimit = Number.isFinite(Number(options?.translateLimit))
    ? Math.max(0, Number(options.translateLimit))
    : TRANSLATE_BATCH_LIMIT;
  for (const item of pendingTranslateItems.slice(0, translateLimit)) {
    const zh = await translateItem(apiKey, item);
    await db`
      UPDATE news_articles
      SET
        title_zh = ${zh.title_zh || null},
        summary_zh = ${zh.summary_zh || null},
        content_zh = ${zh.content_zh || null},
        content_markdown_zh = ${zh.content_markdown_zh || null},
        updated_at = NOW()
      WHERE url = ${item.url}
    `;
    translatedCount += 1;
  }

  return {
    totalFetched: news.length,
    pendingTranslate: Math.max(0, pendingTranslateItems.length - translatedCount),
    translatedCount,
    purgedBo3Count,
    onlySource: onlySource || 'all',
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
