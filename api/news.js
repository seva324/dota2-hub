/**
 * News API
 * Multi-source scraper with robust fallbacks.
 *
 * Usage: GET /api/news
 */

const MAX_ITEMS = 12;
const DETAIL_FETCH_LIMIT = 10;

function generateId(url, prefix) {
  const hash = url.slice(-40).replace(/[^a-zA-Z0-9]/g, '');
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
    .trim();
}

function stripHtml(input = '') {
  return decodeHtmlEntities(input.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
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
    const cleanH1 = stripHtml(h1);
    if (cleanH1) return cleanH1;
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
  if (Array.isArray(article.image) && article.image.length > 0) {
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
      const values = collectValuesByKey(nextData, 'slug').flat().filter(Boolean);
      for (const slugValue of values) {
        if (typeof slugValue !== 'string') continue;
        const normalized = normalizeUrl(`/posts/${slugValue}`, baseUrl);
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
    if (url.hostname !== 'bo3.gg') return null;
    if (!url.pathname.includes('/dota2/news/')) return null;
    if (url.pathname.endsWith('/news') || url.pathname.endsWith('/news/')) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
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
    const pubDateRaw = stripHtml(rawItem.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');

    const enclosureUrl = stripHtml(rawItem.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i)?.[1] || '');
    const mediaContentUrl = stripHtml(rawItem.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*>/i)?.[1] || '');
    const imageUrl = enclosureUrl || mediaContentUrl || undefined;

    if (!title || !link) continue;

    items.push({
      id: generateId(link, sourcePrefix),
      title,
      summary: description || undefined,
      url: link,
      imageUrl,
      source: sourceName,
      publishedAt: parseDate(pubDateRaw) || new Date(),
      category: 'tournament',
    });
  }

  return items;
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
      const detailResponse = await fetchWithTimeout(url, {}, 10000);
      if (!detailResponse.ok) {
        throw new Error(`HTTP ${detailResponse.status}`);
      }

      const detailHtml = await detailResponse.text();
      const detailLd = parseJsonLdBlocks(detailHtml);
      const article = detailLd.find(x => x?.['@type'] === 'NewsArticle') || {};

      const title = article.headline || getMetaContent(detailHtml, 'og:title') || getTitleFromHtml(detailHtml);
      if (!title) return null;

      const publishedAt =
        parseDate(article.datePublished) ||
        parseDate(getMetaContent(detailHtml, 'article:published_time')) ||
        parseDate(detailHtml.match(/datetime=["']([^"']+)["']/i)?.[1]) ||
        new Date();

      const imageUrl =
        normalizeUrl(getArticleImage(article) || getMetaContent(detailHtml, 'og:image') || '', baseUrl) ||
        undefined;

      const summary = stripHtml(article.description || getMetaContent(detailHtml, 'description') || '');

      return {
        id: generateId(url, source),
        title,
        summary: summary || undefined,
        url,
        imageUrl,
        source: 'Hawk Live',
        publishedAt,
        category: 'tournament',
      };
    });

    const settled = await Promise.allSettled(detailTasks);
    const items = settled
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

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

async function scrapeBO3() {
  const source = 'bo3';
  const baseUrl = 'https://bo3.gg';
  const listUrl = `${baseUrl}/dota2/news`;
  const rssUrl = `${baseUrl}/dota2/news/rss`;

  try {
    // Strategy 1: RSS (usually more stable than dynamic HTML)
    try {
      const rssResponse = await fetchWithTimeout(rssUrl, {
        headers: {
          Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7',
        },
      }, 12000);

      if (rssResponse.ok) {
        const rssXml = await rssResponse.text();
        const rssItems = parseSimpleRss(rssXml, 'BO3.gg', source);
        if (rssItems.length > 0) {
          console.log(`[News API] BO3 RSS items: ${rssItems.length}`);
          return { items: rssItems, source, success: true };
        }
      }
    } catch {
      // Fall through to HTML scraping
    }

    // Strategy 2: HTML parsing
    const response = await fetchWithTimeout(listUrl, {}, 15000);
    if (!response.ok) {
      throw new Error(`BO3 list failed: HTTP ${response.status}`);
    }

    const html = await response.text();

    const hrefRegex = /href=["']([^"']+)["']/gi;
    const candidates = new Set();
    let match;

    while ((match = hrefRegex.exec(html)) !== null) {
      const normalized = normalizeBo3NewsUrl(match[1], baseUrl);
      if (normalized) candidates.add(normalized);
    }

    const urls = Array.from(candidates).slice(0, DETAIL_FETCH_LIMIT);
    console.log(`[News API] BO3 list URLs: ${urls.length}`);

    if (urls.length === 0) {
      return { items: [], source, success: false, error: 'No BO3 article URLs found' };
    }

    const detailTasks = urls.map(async (url) => {
      const detailResponse = await fetchWithTimeout(url, {}, 10000);
      if (!detailResponse.ok) {
        throw new Error(`HTTP ${detailResponse.status}`);
      }

      const detailHtml = await detailResponse.text();
      const detailLd = parseJsonLdBlocks(detailHtml);
      const article = detailLd.find(x => x?.['@type'] === 'NewsArticle') || {};

      const title = article.headline || getMetaContent(detailHtml, 'og:title') || getTitleFromHtml(detailHtml);
      if (!title) return null;

      const publishedAt =
        parseDate(article.datePublished) ||
        parseDate(getMetaContent(detailHtml, 'article:published_time')) ||
        parseDate(getMetaContent(detailHtml, 'datePublished')) ||
        new Date();

      const imageUrl =
        normalizeUrl(getArticleImage(article) || getMetaContent(detailHtml, 'og:image') || '', baseUrl) ||
        undefined;

      const summary = stripHtml(article.description || getMetaContent(detailHtml, 'description') || '');

      return {
        id: generateId(url, source),
        title,
        summary: summary || undefined,
        url,
        imageUrl,
        source: 'BO3.gg',
        publishedAt,
        category: 'tournament',
      };
    });

    const settled = await Promise.allSettled(detailTasks);
    const items = settled
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    if (items.length === 0) {
      return { items: [], source, success: false, error: 'No BO3 article details parsed' };
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

function makeFallbackNews() {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 'fallback-hawk-news',
      title: 'Hawk Live Dota 2 新闻聚合',
      summary: '新闻源暂时不可用，已切换到来源页兜底展示。',
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

    normalized.push({
      id: item.id || generateId(normalizedUrl, 'news'),
      title: stripHtml(item.title),
      summary: item.summary ? stripHtml(item.summary).slice(0, 240) : undefined,
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const sourceResults = await Promise.allSettled([scrapeHawkLive(), scrapeBO3()]);

    const allItems = [];
    const sourceErrors = [];

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        const sourceResult = result.value;
        if (sourceResult.success && Array.isArray(sourceResult.items)) {
          allItems.push(...sourceResult.items);
        } else {
          sourceErrors.push({ source: sourceResult.source, error: sourceResult.error || 'Unknown source error' });
        }
      } else {
        sourceErrors.push({ source: 'unknown', error: result.reason?.message || 'Promise rejected' });
      }
    }

    if (sourceErrors.length > 0) {
      console.error('[News API] Source failures:', sourceErrors);
    }

    let news = normalizeAndSortNews(allItems);

    if (news.length === 0) {
      console.warn('[News API] All sources returned empty, using fallback news list');
      news = makeFallbackNews();
    }

    console.log(`[News API] Returning ${news.length} news items`);
    return res.status(200).json(news);
  } catch (error) {
    console.error('[News API] Unexpected error:', error);
    return res.status(200).json(makeFallbackNews());
  }
}
