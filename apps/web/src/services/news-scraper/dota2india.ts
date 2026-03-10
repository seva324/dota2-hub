import type { ScraperResult, ScraperNewsItem } from './types';
import { generateId, fetchWithTimeout } from './types';

export async function scrapeDota2India(): Promise<ScraperResult> {
  const source = 'dota2india';
  const baseUrl = 'https://dota2india.org';

  try {
    const response = await fetchWithTimeout(`${baseUrl}/news`, {}, 15000);
    const html = await response.text();

    const items: ScraperNewsItem[] = [];

    const titlePattern = /<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i;
    const imgPattern = /<img[^>]+src="([^"]+)"[^>]*>/i;
    const datePattern = /(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/;
    const excerptPattern = /<p[^>]*>([^<]+)<\/p>/i;

    // Try to find news links
    const linkRegex = /href="(\/news\/[^"#]+)"/gi;
    let match;

    const foundUrls = new Set<string>();
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (!foundUrls.has(url) && url.length > 10) {
        foundUrls.add(url);
      }
    }

    // If we found links, fetch individual pages to get details
    const limitUrls = Array.from(foundUrls).slice(0, 10);

    for (const newsUrl of limitUrls) {
      try {
        const detailResponse = await fetchWithTimeout(`${baseUrl}${newsUrl}`, {}, 8000);
        const detailHtml = await detailResponse.text();

        const titleMatch = detailHtml.match(titlePattern);
        const imgMatch = detailHtml.match(imgPattern);
        const dateMatch = detailHtml.match(datePattern);
        const excerptMatch = detailHtml.match(excerptPattern);

        const title = titleMatch ? titleMatch[1].trim() : 'Dota 2 News';
        const imageUrl = imgMatch ? imgMatch[1] : undefined;
        const summary = excerptMatch ? excerptMatch[1].trim().slice(0, 200) : undefined;
        const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date();

        if (title && title !== 'Dota 2 News') {
          items.push({
            id: generateId(newsUrl, source),
            title,
            summary,
            url: `${baseUrl}${newsUrl}`,
            imageUrl,
            source: 'Dota2India',
            publishedAt,
            category: 'tournament',
          });
        }
      } catch {
        // Skip failed individual pages
      }
    }

    // If no items from detailed parsing, try to extract from main page
    if (items.length === 0) {
      // Fallback: create a placeholder item linking to main news page
      items.push({
        id: generateId('/news', source),
        title: 'Dota 2 India News',
        summary: 'Latest Dota 2 news from the Indian competitive scene',
        url: `${baseUrl}/news`,
        source: 'Dota2India',
        publishedAt: new Date(),
        category: 'tournament',
      });
    }

    return { items, source: 'dota2india', success: true };
  } catch (error) {
    return {
      items: [],
      source: 'dota2india',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
