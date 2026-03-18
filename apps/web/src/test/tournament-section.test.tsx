import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentSection } from '@/sections/TournamentSection';

const matchDetailModalSpy = vi.fn();

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: (props: unknown) => {
    matchDetailModalSpy(props);
    return null;
  },
}));

vi.mock('@/components/custom/PlayerProfileFlyout', () => ({
  PlayerProfileFlyout: () => null,
}));

vi.mock('@/components/custom/TeamFlyout', () => ({
  TeamFlyout: () => null,
}));

vi.mock('@/lib/playerProfile', () => ({
  createMinimalPlayerFlyoutModel: vi.fn(() => null),
  fetchPlayerProfileFlyoutModel: vi.fn(async () => null),
}));

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function buildSeries(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    series_id: `series-${start + index}`,
    series_type: 'BO3',
    radiant_team_id: `r-${start + index}`,
    dire_team_id: `d-${start + index}`,
    radiant_team_name: `Radiant ${start + index}`,
    dire_team_name: `Dire ${start + index}`,
    radiant_score: 2,
    dire_score: 1,
    games: [],
    stage: 'Playoffs',
    stage_kind: 'playoff',
  }));
}

describe('TournamentSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    matchDetailModalSpy.mockReset();
  });

  it('loads 10 series by default and fetches the next page on load more', async () => {
    const firstPage = buildSeries(1, 10);
    const secondPage = buildSeries(11, 2);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0') {
        return createJsonResponse({
          series: firstPage,
          pagination: { total: 12, hasMore: true, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=10') {
        return createJsonResponse({
          series: secondPage,
          pagination: { total: 12, hasMore: false, limit: 10, offset: 10 },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TournamentSection
        tournaments={[
          {
            id: 'dreamleague-s28',
            league_id: 42,
            name: 'DreamLeague Season 28',
            status: 'ongoing',
            tier: 'S',
            location: 'EU',
            start_time: 1_700_000_000,
            end_time: 1_700_100_000,
          },
        ]}
        seriesByTournament={{}}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    await screen.findByText('Radiant 1');
    expect(screen.getByText('Radiant 10')).toBeInTheDocument();
    expect(screen.queryByText('Radiant 11')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

    await screen.findByText('Radiant 11');
    expect(screen.getByText('Dire 12')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0');
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=10');
    });
  });

  it('defaults to the newest tournament even when an older event is marked ongoing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s7&limit=10&offset=0') {
        return createJsonResponse({
          series: [
            {
              series_id: 'series-pgl',
              series_type: 'BO3',
              radiant_team_id: '2586976',
              dire_team_id: '8255888',
              radiant_team_name: 'PARIVISION',
              dire_team_name: 'OG',
              radiant_score: 0,
              dire_score: 1,
              games: [
                {
                  match_id: '8720834598',
                  radiant_team_id: '2586976',
                  dire_team_id: '8255888',
                  radiant_team_name: 'PARIVISION',
                  dire_team_name: 'OG',
                  radiant_score: 18,
                  dire_score: 32,
                  radiant_win: 0,
                  start_time: 1772973304,
                  duration: 2676,
                },
              ],
              stage: 'Group Stage',
              stage_kind: 'group',
            },
          ],
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s7&featured=1') {
        return createJsonResponse({
          tournamentId: 'pgl-wallachia-s7',
          title: 'Main Event',
          sourceLabel: 'DLTV',
          sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
          fetchedAt: '2026-03-12T08:00:00.000Z',
          groupStage: {
            title: 'Group Stage',
            rounds: ['R 1'],
            standings: [
              {
                rank: 1,
                teamName: 'Team Liquid',
                country: 'Sweden',
                record: '3 - 0',
                logoUrl: null,
                advancement: 'playoff',
                rounds: [
                  {
                    roundLabel: 'R 1',
                    pending: false,
                    href: 'https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7',
                    opponentName: 'BetBoom Team',
                    opponentLogoUrl: null,
                    score: '2 - 1',
                  },
                ],
              },
            ],
          },
          playoffs: {
            title: 'Playoffs',
            rounds: [
              {
                roundName: 'Upper Bracket R1 (bo3)',
                matches: [
                  {
                    href: 'https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7',
                    startTime: '2026-03-12 08:00:00',
                    teams: [
                      { name: 'Heroic', logoUrl: null, score: '0' },
                      { name: 'BetBoom Team', logoUrl: null, score: '0' },
                    ],
                  },
                ],
              },
            ],
          },
          matches: {
            title: 'Matches & Scores',
            upcoming: [
              {
                href: 'https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7',
                startTime: '2026-03-12 08:00:00',
                score: null,
                teams: [
                  { name: 'Heroic', shortName: 'Heroic', logoUrl: null },
                  { name: 'BetBoom Team', shortName: 'BetBoom', logoUrl: null },
                ],
              },
            ],
            finished: [
              {
                href: 'https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7',
                startTime: null,
                score: '2-1',
                teams: [
                  { name: 'Team Liquid', shortName: 'Liquid', logoUrl: null },
                  { name: 'BetBoom Team', shortName: 'BetBoom', logoUrl: null },
                ],
              },
            ],
          },
        });
      }
      if (url === '/api/tournaments?tournamentId=epl-world-series&limit=10&offset=0') {
        return createJsonResponse({
          series: [],
          pagination: { total: 0, hasMore: false, limit: 10, offset: 0 },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TournamentSection
        tournaments={[
          {
            id: 'epl-world-series',
            league_id: 18865,
            name: 'EPL World Series: SEA S13',
            status: 'ongoing',
            tier: 'S',
            location: 'SEA',
            start_time: 1_772_553_600,
            end_time: 1_772_700_000,
          },
          {
            id: 'pgl-wallachia-s7',
            league_id: 19435,
            name: 'PGL Wallachia Season 7',
            status: 'Upcoming',
            tier: 'S',
            location: 'Romania',
            start_time: 1_772_841_600,
            end_time: 1_773_532_800,
          },
        ]}
        seriesByTournament={{}}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    expect(await screen.findByText('PARIVISION')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=pgl-wallachia-s7&limit=10&offset=0');
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tournaments?tournamentId=epl-world-series&limit=10&offset=0');
  });

  it('reveals the featured main event panel only after clicking the tournament title', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s7&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(1, 1),
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s7&featured=1') {
        return createJsonResponse({
          tournamentId: 'pgl-wallachia-s7',
          title: 'Main Event',
          sourceLabel: 'DLTV',
          sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
          fetchedAt: '2026-03-12T08:00:00.000Z',
          groupStage: {
            title: 'Group Stage',
            rounds: ['R 1'],
            standings: [
              {
                rank: 1,
                teamId: '2163',
                teamName: 'Team Liquid',
                country: 'Sweden',
                record: '3 - 0',
                logoUrl: null,
                isCnTeam: false,
                advancement: 'playoff',
                rounds: [
                  {
                    roundLabel: 'R 1',
                    pending: false,
                    matchId: '4254021',
                    href: 'https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7',
                    opponentName: 'BetBoom Team',
                    opponentTeamId: '8255888',
                    opponentLogoUrl: null,
                    opponentIsCnTeam: false,
                    score: '2 - 1',
                  },
                ],
              },
            ],
          },
          playoffs: {
            title: 'Playoffs',
            rounds: [
              {
                roundName: 'Upper Bracket R1 (bo3)',
                matches: [
                  {
                    matchId: null,
                    href: 'https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7',
                    startTime: '2026-03-12 08:00:00',
                    teams: [
                      { teamId: '9303484', name: 'HEROIC', logoUrl: null, isCnTeam: false, score: '0' },
                      { teamId: '8255888', name: 'BetBoom Team', logoUrl: null, isCnTeam: false, score: '0' },
                    ],
                  },
                ],
              },
            ],
          },
          matches: {
            title: 'Matches & Scores',
            upcoming: [
              {
                matchId: null,
                href: 'https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7',
                startTime: '2026-03-12 08:00:00',
                score: null,
                teams: [
                  { teamId: '9303484', name: 'HEROIC', shortName: 'Heroic', logoUrl: null, isCnTeam: false },
                  { teamId: '8255888', name: 'BetBoom Team', shortName: 'BetBoom', logoUrl: null, isCnTeam: false },
                ],
              },
            ],
            finished: [
              {
                matchId: '4254021',
                href: 'https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7',
                startTime: null,
                score: '2-1',
                teams: [
                  { teamId: '2163', name: 'Team Liquid', shortName: 'Liquid', logoUrl: null, isCnTeam: false },
                  { teamId: '8255888', name: 'BetBoom Team', shortName: 'BetBoom', logoUrl: null, isCnTeam: false },
                ],
              },
            ],
          },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TournamentSection
        tournaments={[
          {
            id: 'pgl-wallachia-s7',
            league_id: 19435,
            name: 'PGL Wallachia Season 7',
            status: 'ongoing',
            tier: 'S',
            location: 'Romania',
            start_time: 1_772_841_600,
            end_time: 1_773_532_800,
          },
        ]}
        seriesByTournament={{}}
        teams={[
          { team_id: '2163', name: 'Team Liquid', tag: 'Liquid', logo_url: '/liquid.png', region: 'EU' },
          { team_id: '8255888', name: 'BetBoom Team', tag: 'BB', logo_url: '/bb.png', region: 'EEU' },
          { team_id: '9303484', name: 'HEROIC', tag: 'HEROIC', logo_url: '/heroic.png', region: 'SA' },
        ]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    expect(screen.queryByText('Bracket rounds and pairings')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'PGL Wallachia Season 7' })[1]);
    expect(await screen.findByText('Bracket rounds and pairings')).toBeInTheDocument();
    expect(screen.getByText('Upcoming and finished matches').closest('section')).toHaveClass('hidden');
    expect(screen.getAllByText('BetBoom Team').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=pgl-wallachia-s7&featured=1');
  });

  it('does not render the featured matches and scores block after the title is expanded', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s7&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(1, 1),
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s7&featured=1') {
        return createJsonResponse({
          tournamentId: 'pgl-wallachia-s7',
          title: 'Main Event',
          sourceLabel: 'DLTV',
          sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
          fetchedAt: '2026-03-12T08:00:00.000Z',
          groupStage: {
            title: 'Group Stage',
            rounds: [],
            standings: [],
          },
          playoffs: {
            title: 'Playoffs',
            rounds: [],
          },
          matches: {
            title: 'Matches & Scores',
            upcoming: [],
            finished: [
              {
                matchId: '8720834598',
                href: 'https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7',
                startTime: null,
                score: '2-1',
                teams: [
                  { teamId: '2163', name: 'Team Liquid', shortName: 'Liquid', logoUrl: '/liquid.png', isCnTeam: false },
                  { teamId: '8255888', name: 'BetBoom Team', shortName: 'BetBoom', logoUrl: '/bb.png', isCnTeam: false },
                ],
              },
            ],
          },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TournamentSection
        tournaments={[
          {
            id: 'pgl-wallachia-s7',
            league_id: 19435,
            name: 'PGL Wallachia Season 7',
            status: 'ongoing',
            tier: 'S',
            location: 'Romania',
            start_time: 1_772_841_600,
            end_time: 1_773_532_800,
          },
        ]}
        seriesByTournament={{}}
        teams={[
          { team_id: '2163', name: 'Team Liquid', tag: 'Liquid', logo_url: '/liquid.png', region: 'EU' },
          { team_id: '8255888', name: 'BetBoom Team', tag: 'BB', logo_url: '/bb.png', region: 'EEU' },
        ]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'PGL Wallachia Season 7' })[1]);
    await screen.findByText('Main Event');
    expect(screen.getByText('Upcoming and finished matches').closest('section')).toHaveClass('hidden');
  });

  it('does not render tournaments whose tier is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(1, 1),
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TournamentSection
        tournaments={[
          {
            id: 'tierless-open-dota',
            league_id: 999999,
            name: 'OpenDota League 999999',
            status: 'ongoing',
            tier: null,
            location: 'Online',
            start_time: 1_700_000_500,
            end_time: 1_700_100_500,
          },
          {
            id: 'dreamleague-s28',
            league_id: 42,
            name: 'DreamLeague Season 28',
            status: 'ongoing',
            tier: 'S',
            location: 'EU',
            start_time: 1_700_000_000,
            end_time: 1_700_100_000,
          },
        ]}
        seriesByTournament={{}}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    await screen.findByText('Radiant 1');
    expect(screen.queryByText('OpenDota League 999999')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0');
  });
});
