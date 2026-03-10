import type { ScraperResult, ScraperNewsItem } from './types';
import { generateId, fetchWithTimeout } from './types';

export async function scrapeBO3(): Promise<ScraperResult> {
  const source = 'bo3';
  const baseUrl = 'https://bo3.gg';

  try {
    // Try different possible news paths
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

    const items: ScraperNewsItem[] = [];

    // Find article/news links
    const linkRegex = /href="(\/(?:news|article|post)[^"#]*)"/gi;
    let match;

    const foundUrls = new Set<string>();
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

        // Extract title
        const titleMatch = detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                          detailHtml.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim().replace(/ [-|].*$/, '').replace(/ \| .*$/, '') : 'BO3 News';

        // Extract image
        const ogImageMatch = detailHtml.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"[^>]*>/i);
        const imgMatch = detailHtml.match(/<img[^>]+src="([^"]+(?:\.jpg|\.png|\.webp)[^"]*)"[^>]*>/i);
        const imageUrl = ogImageMatch ? ogImageMatch[1] : (imgMatch ? imgMatch[1] : undefined);

        // Extract date
        const dateMatch = detailHtml.match(/(\d{4}-\d{2}-\d{2})/) ||
                         detailHtml.match(/(\d{2}\/\d{2}\/\d{4})/);
        const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

        // Extract summary
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
