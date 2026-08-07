import { describe, expect, it } from 'vitest';
import { seriesIdAndSlugFromMatchUrl, slugFromMatchUrl } from '@/lib/matchUrl';

describe('slugFromMatchUrl', () => {
  it('extracts the slug from a DLTV match URL', () => {
    expect(slugFromMatchUrl('https://dltv.org/matches/427386/midas-club-vs-team-resilience-games-of-the-future-2026')).toBe(
      'midas-club-vs-team-resilience-games-of-the-future-2026',
    );
  });

  it('returns an empty string for URLs without a slug segment', () => {
    expect(slugFromMatchUrl('https://dltv.org/matches/427386/')).toBe('');
    expect(slugFromMatchUrl('https://dltv.org/results')).toBe('');
  });

  it('handles null / undefined / non-string input', () => {
    expect(slugFromMatchUrl(null)).toBe('');
    expect(slugFromMatchUrl(undefined)).toBe('');
    expect(slugFromMatchUrl('')).toBe('');
  });
});

describe('seriesIdAndSlugFromMatchUrl', () => {
  it('extracts seriesId and slug for internal match-detail navigation', () => {
    expect(seriesIdAndSlugFromMatchUrl('https://dltv.org/matches/427386/midas-club-vs-team-resilience-games-of-the-future-2026')).toEqual({
      matchId: '427386',
      slug: 'midas-club-vs-team-resilience-games-of-the-future-2026',
    });
  });

  it('decodes URL-encoded slugs', () => {
    expect(seriesIdAndSlugFromMatchUrl('https://dltv.org/matches/123/a%20b')).toEqual({ matchId: '123', slug: 'a b' });
  });

  it('returns matchId with no slug when the URL has no slug segment', () => {
    expect(seriesIdAndSlugFromMatchUrl('https://dltv.org/matches/42/')).toEqual({ matchId: '42', slug: undefined });
  });

  it('returns null for non-match URLs / empty input', () => {
    expect(seriesIdAndSlugFromMatchUrl('https://dltv.org/results')).toBeNull();
    expect(seriesIdAndSlugFromMatchUrl(null)).toBeNull();
    expect(seriesIdAndSlugFromMatchUrl(undefined)).toBeNull();
  });
});
