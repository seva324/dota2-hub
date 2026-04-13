import { describe, expect, it } from 'vitest';

import { prioritizeCyberScoreDetailUrls } from '../../../../api/news.js';

describe('prioritizeCyberScoreDetailUrls', () => {
  it('prefers the newest fallback URLs before older list URLs', () => {
    const urls = [
      'https://cyberscore.live/en/news/older-a/',
      'https://cyberscore.live/en/news/newest/',
      'https://cyberscore.live/en/news/older-b/',
      'https://cyberscore.live/en/news/mid/',
    ];
    const fallbackItems = [
      { url: 'https://cyberscore.live/en/news/mid/', publishedAt: new Date('2026-04-12T10:00:00Z') },
      { url: 'https://cyberscore.live/en/news/newest/', publishedAt: new Date('2026-04-13T09:00:00Z') },
    ];

    expect(prioritizeCyberScoreDetailUrls(urls, fallbackItems, 3)).toEqual([
      'https://cyberscore.live/en/news/newest/',
      'https://cyberscore.live/en/news/mid/',
      'https://cyberscore.live/en/news/older-a/',
    ]);
  });

  it('keeps original list order when no fallback dates are available', () => {
    const urls = [
      'https://cyberscore.live/en/news/a/',
      'https://cyberscore.live/en/news/b/',
      'https://cyberscore.live/en/news/c/',
    ];

    expect(prioritizeCyberScoreDetailUrls(urls, [], 2)).toEqual([
      'https://cyberscore.live/en/news/a/',
      'https://cyberscore.live/en/news/b/',
    ]);
  });
});
