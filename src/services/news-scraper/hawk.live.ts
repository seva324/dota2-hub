import type { ScraperResult, ScraperNewsItem } from './types';
import { generateId, fetchWithTimeout } from './types';

export async function scrapeHawkLive(): Promise<ScraperResult> {
  const source = 'hawk';
  const baseUrl = 'https://hawk.live';
  const tagUrl = '/tags/dota-2-news';

  try {
    const response = await fetchWithTimeout(`${baseUrl}${tagUrl}`, {}, 15000);
    const html = await response.text();

    const items: ScraperNewsItem[] = [];

    // Pattern: <img alt="TITLE" src="..." datetime="2026-03-01T11:38:00.000000Z">
    // The images for posts are in /storage/images/posts/ directory
    // And the links are in <a href="/posts/{id}"> format

    // Extract article links and their info from the page
    // Pattern 1: Extract from article blocks with images
    const articleBlockRegex = /<a[^>]+href="(\/posts\/\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[^>]*>[\s\S]*?datetime="([^"]+)"/gi;
    let match;

    const foundArticles = new Map<string, { imageUrl: string; title: string; datetime: string }>();

    while ((match = articleBlockRegex.exec(html)) !== null) {
      const url = match[1];
      const imageUrl = match[2];
      const title = match[3].trim();
      const datetime = match[4];

      if (title && title.length > 5 && !title.includes('logo')) {
        foundArticles.set(url, { imageUrl, title, datetime });
      }
    }

    // Pattern 2: Also check for simpler img patterns
    const imgPatternRegex = /<img[^>]+src="(\/storage\/images\/posts\/[^"]+)"[^>]+alt="([^"]+)"[^>]*>/gi;
    while ((match = imgPatternRegex.exec(html)) !== null) {
      const imageUrl = match[1];
      const title = match[2].trim();

      if (title && title.length > 5 && !foundArticles.has(title)) {
        foundArticles.set(title, { imageUrl, title, datetime: new Date().toISOString() });
      }
    }

    // Convert to items
    for (const [url, data] of foundArticles) {
      const fullImageUrl = data.imageUrl.startsWith('http')
        ? data.imageUrl
        : `${baseUrl}${data.imageUrl}`;

      // Convert post URL from image path
      // /storage/images/posts/123-abc.jpg -> /posts/123
      const postIdMatch = data.imageUrl.match(/\/posts\/(\d+)/);
      const postId = postIdMatch ? postIdMatch[1] : url.split('/').pop();

      items.push({
        id: generateId(url, source),
        title: data.title,
        url: `${baseUrl}/posts/${postId}`,
        imageUrl: fullImageUrl,
        source: 'Hawk Live',
        publishedAt: new Date(data.datetime),
        category: 'tournament',
      });
    }

    // If no items found, try simpler pattern
    if (items.length === 0) {
      // Fallback: look for any post links with timestamps
      const fallbackRegex = /href="(\/posts\/\d+)"[^>]*>[\s\S]{0,500}?(\d{4}-\d{2}-\d{2})/gi;
      while ((match = fallbackRegex.exec(html)) !== null && items.length < 10) {
        const url = match[1];
        const datetime = match[2];

        items.push({
          id: generateId(url, source),
          title: `Hawk Live Post ${url.split('/').pop()}`,
          url: `${baseUrl}${url}`,
          source: 'Hawk Live',
          publishedAt: new Date(datetime),
          category: 'tournament',
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: generateId(tagUrl, source),
        title: 'Hawk Live Dota 2 新闻',
        summary: '最新Dota 2赛事新闻',
        url: `${baseUrl}${tagUrl}`,
        source: 'Hawk Live',
        publishedAt: new Date(),
        category: 'tournament',
      });
    }

    return { items: items.slice(0, 12), source: 'hawk', success: true };
  } catch (error) {
    return {
      items: [],
      source: 'hawk',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
