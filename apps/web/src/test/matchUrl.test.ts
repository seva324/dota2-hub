import { describe, expect, it } from 'vitest';
import { slugFromMatchUrl } from '@/lib/matchUrl';

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
