import { describe, expect, it } from 'vitest';
import { normalizeAndSortNews } from '../../../../api/news.js';

describe('news ingestion seam: four source adapters share one normalization contract', () => {
  const base = Date.UTC(2026, 3, 12, 12, 0, 0);

  function sourceItem(source: string, url: string, overrides: Record<string, unknown> = {}) {
    return {
      id: `${source}-1`,
      title: `${source} headline`,
      summary: `${source} summary`,
      content: `${source} content body`,
      content_markdown: `# ${source} headline\n\n${source} markdown body`,
      url,
      imageUrl: `https://cdn.example.com/${source.replace(/\./g, '-')}.webp`,
      source,
      publishedAt: new Date(base),
      category: 'esports',
      ...overrides,
    };
  }

  it('normalizes taverna items into the stored contract', () => {
    const out = normalizeAndSortNews(
      [sourceItem('Taverna.gg', 'https://taverna.gg/dota2/news/some-story/')],
      { limit: null },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: 'Taverna.gg',
      url: 'https://taverna.gg/dota2/news/some-story/',
      title: 'Taverna.gg headline',
      summary: 'Taverna.gg summary',
      content: 'Taverna.gg content body',
      content_markdown: expect.stringContaining('Taverna.gg markdown body'),
      image_url: 'https://cdn.example.com/Taverna-gg.webp',
      category: expect.any(String),
    });
    expect(out[0]?.published_at).toBe(Math.floor(base / 1000));
  });

  it('normalizes cyberscore items while keeping images inside markdown', () => {
    const out = normalizeAndSortNews(
      [
        sourceItem(
          'CyberScore',
          'https://cyberscore.live/en/news/dota-2-pro-scene/some-story/',
          { content_markdown: 'text ![img](https://cdn.example.com/inline.webp) more' },
        ),
      ],
      { limit: null },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('CyberScore');
    expect(out[0]?.content_markdown).toContain('![](https://cdn.example.com/inline.webp)');
  });

  it('normalizes hawk items into the stored contract', () => {
    const out = normalizeAndSortNews(
      [sourceItem('Hawk Live', 'https://hawk.live/en/news/some-story')],
      { limit: null },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('Hawk Live');
    expect(out[0]?.url).toBe('https://hawk.live/en/news/some-story');
  });

  it('normalizes BO3 items by routing the cover image through the image proxy', () => {
    const out = normalizeAndSortNews(
      [sourceItem('BO3.gg', 'https://bo3.gg/news/some-story', { imageUrl: 'https://files.bo3.gg/uploads/news/123/title_image/cover.webp' })],
      { limit: null },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('BO3.gg');
    expect(out[0]?.image_url).toContain('image-proxy.bo3.gg');
  });

  it('deduplicates same-url items across sources keeping the first', () => {
    const out = normalizeAndSortNews(
      [
        sourceItem('Taverna.gg', 'https://taverna.gg/dota2/news/dup/'),
        sourceItem('Hawk Live', 'https://taverna.gg/dota2/news/dup/'),
      ],
      { limit: null },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('Taverna.gg');
  });

  it('sorts mixed-source items by published_at descending', () => {
    const older = sourceItem('Hawk Live', 'https://hawk.live/en/news/older', { publishedAt: new Date(base - 3600_000) });
    const newer = sourceItem('CyberScore', 'https://cyberscore.live/en/news/newer', { publishedAt: new Date(base) });
    const out = normalizeAndSortNews([older, newer], { limit: null });
    expect(out.map((x) => x.url)).toEqual([
      'https://cyberscore.live/en/news/newer',
      'https://hawk.live/en/news/older',
    ]);
  });
});
