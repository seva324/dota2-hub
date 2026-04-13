import { describe, expect, it } from 'vitest';
import { normalizeAndSortNews } from '../../../../api/news.js';

describe('normalizeAndSortNews', () => {
  it('keeps all scraped items when sync explicitly disables the global feed limit', () => {
    const base = Date.UTC(2026, 3, 12, 12, 0, 0);
    const hawkItems = Array.from({ length: 30 }, (_, index) => ({
      id: `hawk-${index}`,
      title: `Hawk item ${index}`,
      summary: `Summary ${index}`,
      content: `Content ${index}`,
      source: 'Hawk Live',
      url: `https://hawk.live/news/${index}`,
      publishedAt: new Date(base - (index * 60_000)),
      category: 'esports',
    }));
    const cyberItems = [
      {
        id: 'cyber-1',
        title: 'CyberScore fresh item 1',
        summary: 'Cyber summary 1',
        content: 'Cyber content 1',
        source: 'CyberScore',
        url: 'https://cyberscore.live/en/news/fresh-item-1/',
        publishedAt: new Date(base - (31 * 60_000)),
        category: 'esports',
      },
      {
        id: 'cyber-2',
        title: 'CyberScore fresh item 2',
        summary: 'Cyber summary 2',
        content: 'Cyber content 2',
        source: 'CyberScore',
        url: 'https://cyberscore.live/en/news/fresh-item-2/',
        publishedAt: new Date(base - (32 * 60_000)),
        category: 'patch',
      },
    ];

    const limited = normalizeAndSortNews([...hawkItems, ...cyberItems]);
    expect(limited).toHaveLength(30);
    expect(limited.some((item) => item.source === 'CyberScore')).toBe(false);

    const unlimited = normalizeAndSortNews([...hawkItems, ...cyberItems], { limit: null });
    expect(unlimited).toHaveLength(32);
    expect(unlimited.filter((item) => item.source === 'CyberScore')).toHaveLength(2);
  });
});
