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

  it('filters cached live rows by matched league names', async () => {
    listRecentActiveHeroLiveScores.mockResolvedValue([
      { series_key: 'betboom team::og', league_name: 'PGL Wallachia Season 7: Group Stage', payload: { leagueName: 'PGL Wallachia Season 7: Group Stage', teams: [{ name: 'OG' }, { name: 'BetBoom Team' }] } },
      { series_key: 'other::series', league_name: 'Unknown Weekly Cup', payload: { leagueName: 'Unknown Weekly Cup', teams: [{ name: 'A' }, { name: 'B' }] } },
    ]);
    const db = {
      query: vi.fn().mockResolvedValue([
        { league_id: 19435, name: 'PGL Wallachia Season 7', name_cn: null, tier: 'S' },
      ]),
    };
    fetchHtml.mockResolvedValue('<html></html>');
    parseHawkHomepageSeriesList.mockReturnValue([
      {
        id: '92350',
        slug: 'og-vs-betboom-team',
        leagueName: 'PGL Wallachia Season 7: Group Stage',
        team1Name: 'OG',
        team2Name: 'BetBoom Team',
        teamKey: 'betboom team::og',
        url: 'https://hawk.live/example',
      },
    ]);

    const { getLiveHeroPayloads } = await import('../../../../lib/server/live-hero-service.js');
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(payloads).toEqual([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'OG', logo: getCuratedTeamLogoMirrorPath('OG') }),
          expect.objectContaining({ name: 'BetBoom Team', logo: getCuratedTeamLogoMirrorPath('BetBoom Team') }),
        ]),
      }),
    ]);
  });

  it('merges fresh live snapshots with cached rows instead of short-circuiting on cache hit', async () => {
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
    const payloads = await getLiveHeroPayloads(db as never, { forceRefresh: false, maxAgeSeconds: 180 });

    expect(fetchLiveSeriesDetails).toHaveBeenCalled();
    expect(payloads).toHaveLength(2);
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
    expect(payloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'Aurora' }),
          expect.objectContaining({ name: 'Heroic' }),
        ]),
      }),
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({ name: 'PARIVISION' }),
          expect.objectContaining({ name: 'Natus Vincere' }),
        ]),
      }),
    ]));
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
