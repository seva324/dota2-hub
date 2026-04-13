import { describe, expect, it } from 'vitest';
import {
  buildTournamentBackgroundUrl,
  getTournamentBackgroundSourceUrl,
  resolveTournamentBackgroundSlug,
} from '../../../../lib/tournament-backgrounds.js';

describe('tournament backgrounds', () => {
  it('matches background slugs case-insensitively from tournament names', () => {
    expect(resolveTournamentBackgroundSlug({ name: 'ELS ONE Bangkok 2026' })).toBe('els-one');
    expect(resolveTournamentBackgroundSlug({ name: 'PGL Wallachia Season 9' })).toBe('wallachia');
    expect(resolveTournamentBackgroundSlug({ name: 'BLAST SLAM IV' })).toBe('blast-slam');
    expect(resolveTournamentBackgroundSlug({ name: 'DreamLeague Season 31' })).toBe('dreamleague');
    expect(resolveTournamentBackgroundSlug({ name: 'Premier Series Finals' })).toBe('premier-series');
  });

  it('prefers the exact FISSURE Universe Episode 8 mapping', () => {
    expect(resolveTournamentBackgroundSlug({ name: 'FISSURE Universe Episode 8 \n' })).toBe('fissure-universe-episode-8');
    expect(getTournamentBackgroundSourceUrl('fissure-universe-episode-8')).toContain('/7y8afruiGSdAYnLvjZUBHFXaqVoEEwRk.png');
  });

  it('builds production-safe dotahub.cn image urls', () => {
    expect(buildTournamentBackgroundUrl({ name: 'DreamLeague Season 31' })).toBe(
      'https://dotahub.cn/api/tournament-background?slug=dreamleague'
    );
  });

  it('falls back to dotahub.cn when edge runtime passes an internal qcloud host', () => {
    expect(buildTournamentBackgroundUrl(
      { name: 'DreamLeague Season 31' },
      {
        headers: {
          host: 'pages-pro-7-e197.pages-scf-gz-pro.qcloudteo.com',
          'x-forwarded-proto': 'https',
        },
      }
    )).toBe('https://dotahub.cn/api/tournament-background?slug=dreamleague');
  });

  it('prefers a forwarded public host when present', () => {
    expect(buildTournamentBackgroundUrl(
      { name: 'DreamLeague Season 31' },
      {
        headers: {
          host: 'pages-pro-7-e197.pages-scf-gz-pro.qcloudteo.com',
          'x-forwarded-host': 'dotahub.cn',
          'x-forwarded-proto': 'https',
        },
      }
    )).toBe('https://dotahub.cn/api/tournament-background?slug=dreamleague');
  });
});
