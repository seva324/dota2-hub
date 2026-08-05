import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureHeroLiveScoresTable = vi.fn();
const listRecentActiveHeroLiveScores = vi.fn();
const listActiveHeroLiveScores = vi.fn();
const markHeroLiveScoreEnded = vi.fn();
const upsertHeroLiveScore = vi.fn();
const fetchHtml = vi.fn();
const fetchLiveSeriesDetails = vi.fn();
const parseHawkHomepageSeriesList = vi.fn(() => []);

vi.mock('../../../../lib/server/hero-live-score-cache.js', () => ({
  ensureHeroLiveScoresTable,
  listRecentActiveHeroLiveScores,
  listActiveHeroLiveScores,
  markHeroLiveScoreEnded,
  upsertHeroLiveScore,
}));

vi.mock('../../../../lib/server/hawk-live.js', () => ({
  buildUnorderedTeamKey: (teamA: string, teamB: string) => [teamA, teamB].map((value) => value.toLowerCase()).sort().join('::'),
  fetchHtml,
  fetchLiveSeriesDetails,
  parseHawkHomepageSeriesList,
}));

describe('live hero service league matching', () => {
  beforeEach(() => {
    vi.resetModules();
    ensureHeroLiveScoresTable.mockReset();
    listRecentActiveHeroLiveScores.mockReset();
    listActiveHeroLiveScores.mockReset();
    markHeroLiveScoreEnded.mockReset();
    upsertHeroLiveScore.mockReset();
    fetchHtml.mockReset();
    fetchLiveSeriesDetails.mockReset();
    parseHawkHomepageSeriesList.mockReset();
    parseHawkHomepageSeriesList.mockReturnValue([]);
    listRecentActiveHeroLiveScores.mockResolvedValue([]);
    listActiveHeroLiveScores.mockResolvedValue([]);
    markHeroLiveScoreEnded.mockResolvedValue(null);
  });

  it('matches hawk league names against tournaments by keyword', async () => {
    const { matchLeagueNameToTournaments } = await import('../../../../lib/server/live-hero-service.js');
    const matches = matchLeagueNameToTournaments('PGL Wallachia Season 7: Group Stage', [
      { leagueId: '19435', name: 'PGL Wallachia Season 7', normalized: 'pgl wallachia season 7', tokens: ['pgl', 'wallachia'] },
      { leagueId: '19269', name: 'DreamLeague Season 28', normalized: 'dreamleague season 28', tokens: ['dreamleague'] },
    ] as never);

    expect(matches).toEqual([
      expect.objectContaining({
        leagueId: '19435',
        name: 'PGL Wallachia Season 7',
        fullMatch: true,
      }),
    ]);
  });

  it('loads tournament matchers from tournaments table', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        { league_id: 19435, name: 'PGL Wallachia Season 7', name_cn: 'PGL 瓦拉几亚 S7', tier: 'S' },
        { league_id: 19269, name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
      ]),
    };

    const { loadTournamentLeagueMatchers } = await import('../../../../lib/server/live-hero-service.js');
    const rows = await loadTournamentLeagueMatchers(db as never, { tournamentLimit: 50 });

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM tournaments'), [50]);
    expect(rows).toEqual([
      expect.objectContaining({ leagueId: '19435', tokens: expect.arrayContaining(['pgl', 'wallachia']) }),
      expect.objectContaining({ leagueId: '19269', tokens: expect.arrayContaining(['dreamleague']) }),
    ]);
  });


  it('keeps successful live snapshots when one detail request fails', async () => {
    listRecentActiveHeroLiveScores.mockResolvedValue([]);
    const db = {
      query: vi.fn().mockResolvedValue([
        { league_id: 19435, name: 'PGL Wallachia Season 7', name_cn: null, tier: 'S' },
      ]),
    };
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: '92352',
        slug: 'parivision-vs-natus-vincere',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        teamKey: 'natus vincere::parivision',
        url: 'https://hawk.live/pgl',
      },
      {
        id: '92353',
        slug: 'aurora-vs-heroic',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'Aurora',
        team2Name: 'Heroic',
        teamKey: 'aurora::heroic',
        url: 'https://hawk.live/pgl-2',
      },
    ]);
    fetchLiveSeriesDetails.mockImplementation(async (seriesRow) => {
      if (seriesRow.slug === 'aurora-vs-heroic') {
        throw new Error('temporary detail failure');
      }
      return {
        id: '92352',
        slug: 'parivision-vs-natus-vincere',
        url: 'https://hawk.live/pgl',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        detail: {
          bestOf: 3,
          team1Name: 'PARIVISION',
          team2Name: 'Natus Vincere',
          maps: [],
          liveMap: null,
        },
      };
    });
    upsertHeroLiveScore.mockImplementation(async (snapshot) => ({
      series_key: snapshot.series_key,
      last_seen_at: '2026-03-08T16:01:00.000Z',
      payload: snapshot.payload,
    }));

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: true, maxAgeSeconds: 180 });

    expect(fetchLiveSeriesDetails).toHaveBeenCalledTimes(2);
    expect(payloads).toEqual([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'PARIVISION' }),
          expect.objectContaining({ name: 'Natus Vincere' }),
        ]),
      }),
    ]);
  });

  it('returns matched and unmatched hawk live series in debug mode', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([
        { league_id: 19435, name: 'PGL Wallachia Season 7', name_cn: null, tier: 'S' },
      ]),
    };
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: '92352',
        slug: 'parivision-vs-natus-vincere',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        teamKey: 'natus vincere::parivision',
        startAt: '2026-03-08T14:00:00.000000Z',
        url: 'https://hawk.live/pgl',
      },
      {
        id: '99999',
        slug: 'unknown-vs-unknown',
        leagueName: 'Unknown Weekly Cup',
        team1Name: 'A',
        team2Name: 'B',
        teamKey: 'a::b',
        startAt: '2026-03-08T15:00:00.000000Z',
        url: 'https://hawk.live/unknown',
      },
    ]);

    const { explainLiveHeroMatching } = await import('../../../../lib/server/live-hero-service.js');
    const debug = await explainLiveHeroMatching(db as never, {});

    expect(debug.matched).toEqual([
      expect.objectContaining({
        reason: 'matched_by_league_name',
      }),
    ]);
    expect(debug.unmatchedHawkSeries).toEqual([
      expect.objectContaining({
        reason: 'no_matching_tournament_keyword',
      }),
    ]);
  });

  it('returns fetched snapshots directly without writing to hero_live_scores (request path is Neon-free)', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([]),
    };
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: '92352',
        slug: 'parivision-vs-natus-vincere',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        teamKey: 'natus vincere::parivision',
        url: 'https://hawk.live/pgl',
      },
    ]);
    fetchLiveSeriesDetails.mockResolvedValue({
      id: '92352',
      slug: 'parivision-vs-natus-vincere',
      detail: {
        bestOf: 3,
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        maps: [],
        liveMap: null,
      },
    });

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, {});

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ source: 'hawk.live' });
    expect(upsertHeroLiveScore).not.toHaveBeenCalled();
    expect(listActiveHeroLiveScores).not.toHaveBeenCalled();
  });

  it('persists snapshots to hero_live_scores and marks long-inactive series as ended', async () => {
    const db = {
      query: vi.fn().mockResolvedValue([]),
    };
    const stale = { series_key: 'aurora::heroic', last_seen_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() };
    listActiveHeroLiveScores.mockResolvedValue([stale]);
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: '92352',
        slug: 'parivision-vs-natus-vincere',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        teamKey: 'natus vincere::parivision',
        url: 'https://hawk.live/pgl',
      },
    ]);
    fetchLiveSeriesDetails.mockResolvedValue({
      id: '92352',
      slug: 'parivision-vs-natus-vincere',
      detail: {
        bestOf: 3,
        team1Name: 'PARIVISION',
        team2Name: 'Natus Vincere',
        maps: [],
        liveMap: null,
      },
    });
    upsertHeroLiveScore.mockImplementation(async (snapshot) => ({
      series_key: snapshot.series_key,
      last_seen_at: new Date().toISOString(),
      payload: snapshot.payload,
    }));
    markHeroLiveScoreEnded.mockResolvedValue({ series_key: stale.series_key, status: 'ended' });

    const { persistLiveHeroSnapshots } = await import('../../../../lib/server/live-hero-service.js');
    const result = await persistLiveHeroSnapshots(db as never);

    expect(upsertHeroLiveScore).toHaveBeenCalled();
    expect(markHeroLiveScoreEnded).toHaveBeenCalledWith(stale.series_key, expect.objectContaining({ status: 'ended' }), db);
    expect(result.ended).toHaveLength(1);
  });
});
