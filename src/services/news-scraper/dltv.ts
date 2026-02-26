import type { ScraperResult, ScraperNewsItem } from './types';
import { generateId, fetchWithTimeout } from './types';

export async function scrapeDLTV(): Promise<ScraperResult> {
  const source = 'dltv';
  const baseUrl = 'https://dltv.org';

  try {
    const response = await fetchWithTimeout(baseUrl, {}, 15000);
    const html = await response.text();

    const items: ScraperNewsItem[] = [];

    // Pattern to find news links on the main page
    const linkRegex = /href="(\/archives\/[^"#]+)"/gi;
    let match;

    const foundUrls = new Set<string>();
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (!foundUrls.has(url) && url.length > 10) {
        foundUrls.add(url);
      }
    }

    // Fetch details from individual pages
    const limitUrls = Array.from(foundUrls).slice(0, 10);

    for (const newsUrl of limitUrls) {
      try {
        const detailResponse = await fetchWithTimeout(`${baseUrl}${newsUrl}`, {}, 8000);
        const detailHtml = await detailResponse.text();

        // Extract title
        const titleMatch = detailHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                          detailHtml.match(/<title>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim().replace(/ - .*$/, '') : 'DLTV News';

        // Extract image
        const imgMatch = detailHtml.match(/<img[^>]+src="([^"]+(?:\.jpg|\.png|\.webp)[^"]*)"[^>]*>/i);
        const ogImageMatch = detailHtml.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"[^>]*>/i);
        const imageUrl = ogImageMatch ? ogImageMatch[1] : (imgMatch ? imgMatch[1] : undefined);

        // Extract date
        const dateMatch = detailHtml.match(/(\d{4}-\d{2}-\d{2})/);
        const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

        // Extract excerpt/summary
        const excerptMatch = detailHtml.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"[^>]*>/i) ||
                            detailHtml.match(/<p[^>]*>([^<]{20,200})<\/p>/i);
        const summary = excerptMatch ? excerptMatch[1].trim().slice(0, 200) : undefined;

        if (title && title !== 'DLTV News') {
          items.push({
            id: generateId(newsUrl, source),
            title,
            summary,
            url: `${baseUrl}${newsUrl}`,
            imageUrl,
            source: 'DLTV',
            publishedAt,
            category: 'tournament',
          });
        }
      } catch {
        // Skip failed individual pages
      }
    }

    // Fallback if no items found
    if (items.length === 0) {
      items.push({
        id: generateId('/', source),
        title: 'DLTV Dota 2 News',
        summary: 'Latest Dota 2 news and tournaments coverage',
        url: baseUrl,
        source: 'DLTV',
        publishedAt: new Date(),
        category: 'tournament',
      });
    }

    return { items, source: 'dltv', success: true };
  } catch (error) {
    return {
      items: [],
      source: 'dltv',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
