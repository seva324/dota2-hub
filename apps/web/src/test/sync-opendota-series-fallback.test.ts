import { describe, expect, it } from 'vitest';
import { resolveFallbackSeriesId } from '../../../../lib/server/sync-opendota.js';

describe('sync-opendota series fallback', () => {
  it('matches the nearest series within the same league for the same two teams regardless of side', () => {
    const target = {
      league_id: 19435,
      start_time: 1773137425,
      radiant_team_id: '726228',
      dire_team_id: '9247354',
    };

    const candidates = [
      {
        series_id: 'far-away',
        league_id: 19435,
        start_time: 1773120000,
        radiant_team_id: '726228',
        dire_team_id: '9247354',
      },
      {
        series_id: '1072891',
        league_id: 19435,
        start_time: 1773141317,
        radiant_team_id: '726228',
        dire_team_id: '9247354',
      },
      {
        series_id: 'wrong-league',
        league_id: 99999,
        start_time: 1773138000,
        radiant_team_id: '726228',
        dire_team_id: '9247354',
      },
      {
        series_id: 'reversed-sides',
        league_id: 19435,
        start_time: 1773136000,
        radiant_team_id: '9247354',
        dire_team_id: '726228',
      },
    ];

    expect(resolveFallbackSeriesId(target, candidates)).toBe('reversed-sides');
  });

  it('returns null when no same-league candidate exists within the 2-hour window', () => {
    const target = {
      league_id: 19435,
      start_time: 1773137425,
      radiant_team_id: '726228',
      dire_team_id: '9247354',
    };

    const candidates = [
      {
        series_id: 'too-far',
        league_id: 19435,
        start_time: 1773120000,
        radiant_team_id: '9247354',
        dire_team_id: '726228',
      },
    ];

    expect(resolveFallbackSeriesId(target, candidates)).toBeNull();
  });
});
