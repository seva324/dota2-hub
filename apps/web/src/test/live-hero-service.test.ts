import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCuratedTeamLogoMirrorPath } from '../../../../lib/team-logo-overrides.js';

const ensureHeroLiveScoresTable = vi.fn();
const listRecentActiveHeroLiveScores = vi.fn();
const listActiveHeroLiveScores = vi.fn();
const markHeroLiveScoreEnded = vi.fn();
const upsertHeroLiveScore = vi.fn();
const fetchHtml = vi.fn();
const fetchLiveSeriesDetails = vi.fn();
const parseHawkHomepageSeriesList = vi.fn(() => []);
const readLiveHeroHotCache = vi.fn();
const writeLiveHeroHotCache = vi.fn();
const tryAcquireLiveHeroRefreshLock = vi.fn();

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

vi.mock('../../../../lib/server/live-hero-hot-cache.js', () => ({
  readLiveHeroHotCache,
  writeLiveHeroHotCache,
  tryAcquireLiveHeroRefreshLock,
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
    readLiveHeroHotCache.mockReset();
    writeLiveHeroHotCache.mockReset();
    tryAcquireLiveHeroRefreshLock.mockReset();
    readLiveHeroHotCache.mockResolvedValue(null);
    writeLiveHeroHotCache.mockResolvedValue(undefined);
    tryAcquireLiveHeroRefreshLock.mockResolvedValue(false);
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

  it('returns hot cache payloads immediately when the live hot cache is fresh', async () => {
    readLiveHeroHotCache.mockResolvedValue({
      refreshedAt: new Date().toISOString(),
      payloads: [
        {
          leagueName: 'PGL Wallachia Season 7: Group Stage',
          teams: [{ name: 'OG' }, { name: 'BetBoom Team' }],
        },
      ],
    });

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(null as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(payloads).toEqual([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'OG', logo: getCuratedTeamLogoMirrorPath('OG') }),
          expect.objectContaining({ name: 'BetBoom Team', logo: getCuratedTeamLogoMirrorPath('BetBoom Team') }),
        ]),
      }),
    ]);
    expect(listRecentActiveHeroLiveScores).not.toHaveBeenCalled();
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(fetchLiveSeriesDetails).not.toHaveBeenCalled();
    expect(upsertHeroLiveScore).not.toHaveBeenCalled();
    expect(writeLiveHeroHotCache).not.toHaveBeenCalled();
  });

  it('retains recently seen hot-cache payloads when a refresh temporarily misses one live series', async () => {
    readLiveHeroHotCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        refreshedAt: new Date(Date.now() - 20_000).toISOString(),
        payloads: [
          {
            sourceSeriesId: 'hawk-xg-spirit',
            sourceUrl: 'https://hawk.live/pgl-xg-spirit',
            leagueName: 'PGL Wallachia Season 8: Group Stage',
            startedAt: '2026-04-22T15:00:00.000Z',
            fetchedAt: new Date().toISOString(),
            teams: [{ name: 'Xtreme Gaming' }, { name: 'Team Spirit' }],
          },
        ],
      });
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: 'hawk-lynx-nemiga',
        slug: 'team-lynx-vs-nemiga-gaming',
        leagueName: 'DreamLeague Division 2 Season 4: Group Stage',
        team1Name: 'Team Lynx',
        team2Name: 'Nemiga Gaming',
        teamKey: 'nemiga gaming::team lynx',
        url: 'https://hawk.live/dreamleague-lynx',
      },
    ]);
    fetchLiveSeriesDetails.mockResolvedValue({
      id: 'hawk-lynx-nemiga',
      slug: 'team-lynx-vs-nemiga-gaming',
      url: 'https://hawk.live/dreamleague-lynx',
      leagueName: 'DreamLeague Division 2 Season 4: Group Stage',
      team1Name: 'Team Lynx',
      team2Name: 'Nemiga Gaming',
      detail: {
        bestOf: 3,
        team1Name: 'Team Lynx',
        team2Name: 'Nemiga Gaming',
        maps: [],
        liveMap: null,
      },
    });

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(null as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(payloads).toHaveLength(2);
    expect(payloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'Xtreme Gaming' }),
          expect.objectContaining({ name: 'Team Spirit' }),
        ]),
      }),
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'Team Lynx' }),
          expect.objectContaining({ name: 'Nemiga Gaming' }),
        ]),
      }),
    ]));
    expect(writeLiveHeroHotCache).toHaveBeenCalledWith(expect.objectContaining({
      payloads: expect.arrayContaining([
        expect.objectContaining({ sourceSeriesId: 'hawk-xg-spirit' }),
        expect.objectContaining({ sourceSeriesId: 'hawk-lynx-nemiga' }),
      ]),
    }));
  });

  it('merges recent DB live rows into the hot cache when Hawk omits one live series', async () => {
    readLiveHeroHotCache
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    listRecentActiveHeroLiveScores.mockResolvedValue([
      {
        series_key: 'team spirit::xtreme gaming',
        last_seen_at: new Date().toISOString(),
        payload: {
          sourceSeriesId: 'hawk-xg-spirit',
          sourceUrl: 'https://hawk.live/pgl-xg-spirit',
          leagueName: 'PGL Wallachia Season 8: Group Stage',
          startedAt: '2026-04-22T15:00:00.000Z',
          fetchedAt: new Date().toISOString(),
          teams: [{ name: 'Xtreme Gaming' }, { name: 'Team Spirit' }],
        },
      },
    ]);
    const db = { query: vi.fn() };
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: 'hawk-lynx-nemiga',
        slug: 'team-lynx-vs-nemiga-gaming',
        leagueName: 'DreamLeague Division 2 Season 4: Group Stage',
        team1Name: 'Team Lynx',
        team2Name: 'Nemiga Gaming',
        teamKey: 'nemiga gaming::team lynx',
        url: 'https://hawk.live/dreamleague-lynx',
      },
    ]);
    fetchLiveSeriesDetails.mockResolvedValue({
      id: 'hawk-lynx-nemiga',
      slug: 'team-lynx-vs-nemiga-gaming',
      url: 'https://hawk.live/dreamleague-lynx',
      leagueName: 'DreamLeague Division 2 Season 4: Group Stage',
      team1Name: 'Team Lynx',
      team2Name: 'Nemiga Gaming',
      detail: {
        bestOf: 3,
        team1Name: 'Team Lynx',
        team2Name: 'Nemiga Gaming',
        maps: [],
        liveMap: null,
      },
    });
    upsertHeroLiveScore.mockImplementation(async (snapshot) => ({
      series_key: snapshot.series_key,
      last_seen_at: snapshot.last_seen_at,
      payload: snapshot.payload,
    }));

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(payloads).toHaveLength(2);
    expect(listRecentActiveHeroLiveScores).toHaveBeenCalledWith(db, 180, 50);
    expect(upsertHeroLiveScore).toHaveBeenCalledTimes(1);
    expect(writeLiveHeroHotCache).toHaveBeenCalledWith(expect.objectContaining({
      payloads: expect.arrayContaining([
        expect.objectContaining({ sourceSeriesId: 'hawk-xg-spirit' }),
        expect.objectContaining({ sourceSeriesId: 'hawk-lynx-nemiga' }),
      ]),
    }));
  });

  it('force refresh bypasses the fresh cache and stores rebuilt live snapshots', async () => {
    listRecentActiveHeroLiveScores.mockResolvedValue([
      {
        series_key: 'aurora::heroic',
        last_seen_at: '2026-03-08T16:00:00.000Z',
        payload: { leagueName: 'PGL Wallachia Season 7: Group Stage', teams: [{ name: 'Aurora' }, { name: 'Heroic' }] },
      },
    ]);
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
    ]);
    fetchLiveSeriesDetails.mockResolvedValue({
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
    });
    upsertHeroLiveScore.mockImplementation(async (snapshot) => ({
      series_key: snapshot.series_key,
      last_seen_at: '2026-03-08T16:01:00.000Z',
      payload: snapshot.payload,
    }));

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: true, maxAgeSeconds: 180 });

    expect(fetchLiveSeriesDetails).toHaveBeenCalled();
    expect(payloads).toHaveLength(1);
    expect(upsertHeroLiveScore).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({
            name: 'PARIVISION',
            logo: getCuratedTeamLogoMirrorPath('PARIVISION'),
          }),
          expect.objectContaining({
            name: 'Natus Vincere',
            logo: getCuratedTeamLogoMirrorPath('Natus Vincere'),
          }),
        ]),
      }),
    }), expect.anything());
    expect(payloads).toEqual([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'PARIVISION' }),
          expect.objectContaining({ name: 'Natus Vincere' }),
        ]),
      }),
    ]);
  });

  it('falls back to cached rows when live refresh fails', async () => {
    listRecentActiveHeroLiveScores.mockResolvedValue([
      {
        series_key: 'natus vincere::parivision',
        last_seen_at: '2026-03-08T16:00:00.000Z',
        payload: {
          leagueName: 'PGL Wallachia Season 7: Group Stage',
          teams: [
            { name: 'PARIVISION', logo: 'https://hawk.live/storage/teams/parivision.png' },
            { name: 'Natus Vincere', logo: 'https://hawk.live/storage/teams/navi.png' },
          ],
        },
      },
    ]);
    const db = {
      query: vi.fn().mockResolvedValue([
        { league_id: 19435, name: 'PGL Wallachia Season 7', name_cn: null, tier: 'S' },
      ]),
    };
    fetchHtml.mockRejectedValue(new Error('temporary hawk failure'));

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(payloads).toEqual([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({
            name: 'PARIVISION',
            logo: getCuratedTeamLogoMirrorPath('PARIVISION'),
          }),
          expect.objectContaining({
            name: 'Natus Vincere',
            logo: getCuratedTeamLogoMirrorPath('Natus Vincere'),
          }),
        ]),
      }),
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
});
