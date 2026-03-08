import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureHeroLiveScoresTable = vi.fn();
const listRecentActiveHeroLiveScores = vi.fn();
const listActiveHeroLiveScores = vi.fn();
const markHeroLiveScoreEnded = vi.fn();
const upsertHeroLiveScore = vi.fn();

vi.mock('../../lib/server/hero-live-score-cache.js', () => ({
  ensureHeroLiveScoresTable,
  listRecentActiveHeroLiveScores,
  listActiveHeroLiveScores,
  markHeroLiveScoreEnded,
  upsertHeroLiveScore,
}));

vi.mock('../../lib/server/hawk-live.js', () => ({
  buildUnorderedTeamKey: (teamA: string, teamB: string) => [teamA, teamB].map((value) => value.toLowerCase()).sort().join('::'),
  fetchHtml: vi.fn(),
  fetchLiveSeriesDetails: vi.fn(),
  parseHawkHomepageSeriesList: vi.fn(() => []),
  selectMatchingLiveSeries: vi.fn(() => []),
}));

describe('live hero service cache behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    ensureHeroLiveScoresTable.mockReset();
    listRecentActiveHeroLiveScores.mockReset();
    listActiveHeroLiveScores.mockReset();
    markHeroLiveScoreEnded.mockReset();
    upsertHeroLiveScore.mockReset();
  });

  it('filters cached live rows by target team key', async () => {
    listRecentActiveHeroLiveScores.mockResolvedValue([
      { series_key: 'betboom team::og', payload: { leagueName: 'PGL', teams: [{ name: 'OG' }, { name: 'BetBoom Team' }] } },
      { series_key: 'navi::parivision', payload: { leagueName: 'PGL', teams: [{ name: 'PARIVISION' }, { name: 'Natus Vincere' }] } },
    ]);
    const now = Math.floor(Date.now() / 1000);
    const db = {
      query: vi.fn().mockResolvedValue([
        {
          series_id: 'live-1',
          start_time: now + 300,
          series_type: 'BO3',
          tournament_name: 'PGL Wallachia Season 7',
          radiant_team_name: 'PARIVISION',
          radiant_team_logo: 'https://cdn.test/pari.png',
          dire_team_name: 'NAVI',
          dire_team_logo: 'https://cdn.test/navi.png',
        },
      ]),
    };

    const { getLiveHeroPayloads } = await import('../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { teamA: 'PARIVISION', teamB: 'NAVI' });

    expect(payloads).toEqual([
      expect.objectContaining({
        teams: [{ name: 'PARIVISION' }, { name: 'Natus Vincere' }],
      }),
    ]);
  });

  it('uses the broader default cache limit for multi-match reads', async () => {
    listRecentActiveHeroLiveScores.mockResolvedValue([]);
    const db = { query: vi.fn().mockResolvedValue([]) };

    const { getLiveHeroPayloads } = await import('../../lib/server/live-hero-service.js');
    await getLiveHeroPayloads(db as never, { forceRefresh: false });

    expect(listRecentActiveHeroLiveScores).toHaveBeenCalledWith(db, 180, 50);
  });

  it('only reads upcoming series candidates within the configured window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const db = {
      query: vi.fn().mockResolvedValue([
        {
          series_id: 'live-1',
          start_time: now - 300,
          series_type: 'BO3',
          tournament_name: 'PGL Wallachia Season 7',
          radiant_team_name: 'Tundra Esports',
          radiant_team_logo: 'https://cdn.test/tundra.png',
          dire_team_name: 'Yellow Submarine',
          dire_team_logo: 'https://cdn.test/ys.png',
        },
      ]),
    };

    const { loadUpcomingCandidates } = await import('../../lib/server/live-hero-service.js');
    const rows = await loadUpcomingCandidates(db as never, { windowBeforeSeconds: 900, windowAfterSeconds: 5 * 3600, limit: 20 });

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM upcoming_series s'), [now - 900, now + 5 * 3600, 20]);
    expect(rows).toEqual([
      expect.objectContaining({
        upcomingSeriesId: 'live-1',
        team1Name: 'Tundra Esports',
        team2Name: 'Yellow Submarine',
        source: 'upcoming_series',
      }),
    ]);
  });

  it('filters cached rows to current upcoming team keys before returning them', async () => {
    const now = Math.floor(Date.now() / 1000);
    listRecentActiveHeroLiveScores.mockResolvedValue([
      { series_key: 'betboom::og', payload: { teams: [{ name: 'OG' }, { name: 'BetBoom Team' }] } },
      { series_key: 'tundra esports::yellow submarine', payload: { teams: [{ name: 'Tundra Esports' }, { name: 'Yellow Submarine' }] } },
    ]);
    const db = {
      query: vi.fn().mockResolvedValue([
        {
          series_id: 'live-1',
          start_time: now - 300,
          series_type: 'BO3',
          tournament_name: 'PGL Wallachia Season 7',
          radiant_team_name: 'Tundra Esports',
          radiant_team_logo: 'https://cdn.test/tundra.png',
          dire_team_name: 'Yellow Submarine',
          dire_team_logo: 'https://cdn.test/ys.png',
        },
      ]),
    };

    const { getLiveHeroPayloads } = await import('../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(payloads).toEqual([
      expect.objectContaining({
        teams: [{ name: 'Tundra Esports' }, { name: 'Yellow Submarine' }],
      }),
    ]);
  });
});
