/**
 * News API
 * Scrapes news from hawk.live and bo3.gg using firecrawl
 *
 * Usage: GET /api/news
 */

// Import scrapers using dynamic import
const { scrapeHawkLive } = await import('../src/services/news-scraper/hawk.live');
const { scrapeBO3 } = await import('../src/services/news-scraper/bo3.gg');

// Firecrawl import - optional, falls back to HTTP scraping
let FirecrawlApp = null;
try {
  const firecrawl = await import('firecrawl');
  FirecrawlApp = firecrawl.FirecrawlApp;
} catch {
  console.log('[News API] Firecrawl not available, using HTTP scraping');
}

// Try to use firecrawl if available
async function scrapeWithFirecrawl(url) {
  if (!FirecrawlApp) {
    return [];
  }

  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.log('[News API] No FIRECRAWL_API_KEY found');
    return [];
  }

  try {
    const app = new FirecrawlApp({ apiKey });
    const result = await app.crawlUrl(url, {
      limit: 10,
      scrapeOptions: {
        formats: ['markdown', 'html'],
      }
    });

    // Transform firecrawl result to our format
    const items = [];
    if (result.data) {
      for (const doc of result.data) {
        const title = doc.metadata?.title || (doc.markdown ? doc.markdown.slice(0, 100) : 'News');
        const imageUrl = doc.metadata?.ogImage || doc.metadata?.image;

        items.push({
          id: `firecrawl-${Date.now()}-Math.random().toString(36).slice(2, 8)}`,
          title: title.slice(0, 200),
          url: doc.metadata?.url || url,
          imageUrl,
          source: 'Firecrawl',
          publishedAt: new Date(doc.metadata?.publishedTime || Date.now()),
          category: 'tournament',
        });
      }
    }
    return items;
  } catch (error) {
    console.log('[News API] Firecrawl error:', error.message);
    return [];
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
    // Try firecrawl first
    const firecrawlItems = await scrapeWithFirecrawl('https://hawk.live/tags/dota-2-news');

    // Fallback to HTTP scraping
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

    // Merge items (firecrawl first, then hawk, then bo3)
    const allItems = [...firecrawlItems, ...hawkItems, ...bo3Items];

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
