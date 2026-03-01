/**
 * News API
 * Scrapes news from hawk.live and bo3.gg
 *
 * Usage: GET /api/news
 */

// Utility functions (inlined)
function generateId(url, prefix) {
  const hash = url.slice(-20).replace(/[^a-zA-Z0-9]/g, '');
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
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Hawk.live scraper - uses Inertia/Nuxt SSR
async function scrapeHawkLive() {
  const source = 'hawk';
  const baseUrl = 'https://hawk.live';
  const tagUrl = '/tags/dota-2-news';

  try {
    // Try to get the initial state from the page
    const response = await fetchWithTimeout(`${baseUrl}${tagUrl}`, {}, 15000);
    const html = await response.text();

    // Look for Inertia page data
    const inertiaMatch = html.match(/window\.__INERTIA_STATE__\s*=\s*({.*?});/s);
    if (inertiaMatch) {
      try {
        const inertiaState = JSON.parse(inertiaMatch[1]);
        // Try to find posts in the component props
        const props = inertiaState?.page?.props || {};
        const posts = props.posts || props.articles || props.data || [];

        if (Array.isArray(posts) && posts.length > 0) {
          const items = posts.slice(0, 12).map(post => ({
            id: generateId(post.slug || post.id, source),
            title: post.title || post.name || 'Hawk Live News',
            summary: post.excerpt || post.description,
            url: post.url || `${baseUrl}/posts/${post.slug || post.id}`,
            imageUrl: post.image || post.cover_image || post.thumbnail,
            source: 'Hawk Live',
            publishedAt: new Date(post.published_at || post.date || post.created_at),
            category: 'tournament',
          }));

          return { items, source: 'hawk', success: true };
        }
      } catch (e) {
        console.log('[News API] Failed to parse Inertia state:', e.message);
      }
    }

    // Fallback: return a placeholder link
    return {
      items: [{
        id: generateId(tagUrl, source),
        title: 'Hawk Live Dota 2 新闻',
        summary: '最新Dota 2赛事新闻 - 点击查看最新资讯',
        url: `${baseUrl}${tagUrl}`,
        source: 'Hawk Live',
        publishedAt: new Date(),
        category: 'tournament',
      }],
      source: 'hawk',
      success: true,
    };
  } catch (error) {
    return {
      items: [],
      source: 'hawk',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// BO3.gg scraper
async function scrapeBO3() {
  const source = 'bo3';
  const baseUrl = 'https://bo3.gg';

  try {
    const paths = ['/news', '/esports/news', '/dota2/news', '/'];
    let html = '';

    for (const path of paths) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}${path}`, {}, 10000);
        if (response.ok) {
          html = await response.text();
          break;
        }
      } catch {
        continue;
      }
    }

    if (!html) {
      return {
        items: [{
          id: generateId('/', source),
          title: 'BO3.gg Dota 2 Coverage',
          summary: 'Dota 2 esports news and tournament coverage',
          url: baseUrl,
          source: 'BO3.gg',
          publishedAt: new Date(),
          category: 'tournament',
        }],
        source: 'bo3',
        success: true,
      };
    }

    const items = [];
    const linkRegex = /href="(\/(?:news|article|post)[^"#]*)"/gi;
    let match;
    const foundUrls = new Set();

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (!foundUrls.has(url) && url.length > 10 && !url.includes('category')) {
        foundUrls.add(url);
      }
    }

    const limitUrls = Array.from(foundUrls).slice(0, 10);

    for (const newsUrl of limitUrls) {
      try {
        const detailResponse = await fetchWithTimeout(`${baseUrl}${newsUrl}`, {}, 8000);
        const detailHtml = await detailResponse.text();

        const titleMatch = detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                          detailHtml.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim().replace(/ [-|].*$/, '').replace(/ \| .*$/, '') : 'BO3 News';

        const ogImageMatch = detailHtml.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"[^>]*>/i);
        const imgMatch = detailHtml.match(/<img[^>]+src="([^"]+(?:\.jpg|\.png|\.webp)[^"]*)"[^>]*>/i);
        const imageUrl = ogImageMatch ? ogImageMatch[1] : (imgMatch ? imgMatch[1] : undefined);

        const dateMatch = detailHtml.match(/(\d{4}-\d{2}-\d{2})/) || detailHtml.match(/(\d{2}\/\d{2}\/\d{4})/);
        const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

        const descMatch = detailHtml.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"[^>]*>/i);
        const excerptMatch = detailHtml.match(/<p[^>]*>([^<]{30,250})<\/p>/i);
        const summary = descMatch ? descMatch[1].trim().slice(0, 200) :
                       (excerptMatch ? excerptMatch[1].trim().slice(0, 200) : undefined);

        if (title && title !== 'BO3 News') {
          items.push({
            id: generateId(newsUrl, source),
            title,
            summary,
            url: `${baseUrl}${newsUrl}`,
            imageUrl,
            source: 'BO3.gg',
            publishedAt,
            category: 'tournament',
          });
        }
      } catch {
        // Skip failed pages
      }
    }

    if (items.length === 0) {
      items.push({
        id: generateId('/', source),
        title: 'BO3.gg Dota 2 News',
        summary: 'Dota 2 esports news, match results, and tournament coverage',
        url: baseUrl,
        source: 'BO3.gg',
        publishedAt: new Date(),
        category: 'tournament',
      });
    }

    return { items, source: 'bo3', success: true };
  } catch (error) {
    return {
      items: [],
      source: 'bo3',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Scrape from both sources
    let hawkItems = [];
    let bo3Items = [];

    try {
      const hawkResult = await scrapeHawkLive();
      if (hawkResult.success) {
        hawkItems = hawkResult.items;
      }
    } catch (e) {
      console.error('[News API] Hawk scraping failed:', e.message);
    }

    try {
      const bo3Result = await scrapeBO3();
      if (bo3Result.success) {
        bo3Items = bo3Result.items;
      }
    } catch (e) {
      console.error('[News API] BO3 scraping failed:', e.message);
    }

    // Merge items
    const allItems = [...hawkItems, ...bo3Items];

    // Deduplicate by URL
    const seen = new Set();
    const uniqueItems = allItems.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    // Transform to API response format
    const news = uniqueItems.slice(0, 12).map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      source: item.source,
      url: item.url,
      image_url: item.imageUrl,
      published_at: Math.floor(item.publishedAt.getTime() / 1000),
      category: item.category || 'tournament',
    }));

    // Sort by date (newest first)
    news.sort((a, b) => b.published_at - a.published_at);

    console.log(`[News API] Returning ${news.length} news items`);

    return res.status(200).json(news);
  } catch (error) {
    console.error('[News API] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
