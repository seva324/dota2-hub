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

    const loadMoreButton = await screen.findByRole('button', { name: '加载更多' });
    expect(loadMoreButton).toBeInTheDocument();

    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(screen.getByText('Radiant 11')).toBeInTheDocument();
      expect(screen.getByText('Dire 12')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0');
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=10');
    });
  }, 30000);

  it('uses white logo overrides in the series list for dark-theme teams', async () => {
    const rawLiquidLogo = 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fs3.dltv.org%2Fuploads%2Fteams%2FjzS2BJn2w338twINzzRUUElFEDvdcQgp.png.webp';
    const rawGamerLegionLogo = 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fs3.dltv.org%2Fuploads%2Fteams%2Fmedium%2FSL5XvIyOVg02fCankoCetSnjT3x7FdVY.png';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0') {
        return createJsonResponse({
          series: [
            {
              series_id: 'series-white-logos',
              series_type: 'BO3',
              radiant_team_id: '2163',
              dire_team_id: '9964962',
              radiant_team_name: 'Team Liquid',
              dire_team_name: 'GamerLegion',
              radiant_team_logo: rawLiquidLogo,
              dire_team_logo: rawGamerLegionLogo,
              radiant_score: 0,
              dire_score: 0,
              games: [],
              stage: 'Playoffs',
              stage_kind: 'playoff',
            },
          ],
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

    const [liquidLogo] = await screen.findAllByAltText('Team Liquid');
    const [gamerLegionLogo] = await screen.findAllByAltText('GamerLegion');

    expect(liquidLogo).toHaveAttribute('src', '/images/mirror/teams/2163-white.png');
    expect(gamerLegionLogo).toHaveAttribute('src', '/images/mirror/teams/9964962-white.png');
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

  it('renders ESL One Birmingham playoff rounds in the original DLTV lane order', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=esl-one-birmingham-2026&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(1, 1),
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=esl-one-birmingham-2026&featured=1') {
        return createJsonResponse({
          tournamentId: 'esl-one-birmingham-2026',
          title: 'Main Event',
          sourceLabel: 'DLTV',
          sourceUrl: 'https://dltv.org/events/esl-one-birmingham-2026',
          fetchedAt: '2026-03-22T08:00:00.000Z',
          groupStage: {
            title: 'Group Stage',
            format: 'round-robin',
            rounds: [],
            groups: [],
            standings: [],
          },
          playoffs: {
            title: 'Playoffs',
            rounds: [
              { roundName: 'Lower Bracket R2', matches: [] },
              { roundName: 'Grand Finals', matches: [] },
              { roundName: 'Upper Bracket Finals', matches: [] },
              { roundName: 'Lower Bracket Finals', matches: [] },
              { roundName: 'Upper Bracket R1', matches: [] },
              { roundName: 'Lower Bracket R1', matches: [] },
              { roundName: 'Lower Bracket R3', matches: [] },
            ],
          },
          matches: {
            title: 'Matches & Scores',
            upcoming: [],
            finished: [],
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
            id: 'esl-one-birmingham-2026',
            league_id: 19422,
            name: 'ESL One Season Birmingham',
            status: 'ongoing',
            tier: 'S',
            location: 'United Kingdom',
            start_time: 1_776_614_400,
            end_time: 1_777_305_600,
          },
        ]}
        seriesByTournament={{}}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'ESL One Season Birmingham' })[1]);
    expect(await screen.findByText('Compact view')).toBeInTheDocument();

    const upperR1 = screen.getAllByText('Upper Bracket R1')[1];
    const upperFinals = screen.getAllByText('Upper Bracket Finals')[1];
    const grandFinals = screen.getAllByText('Grand Finals')[1];
    const lowerR1 = screen.getAllByText('Lower Bracket R1')[1];
    const lowerR2 = screen.getAllByText('Lower Bracket R2')[1];
    const lowerR3 = screen.getAllByText('Lower Bracket R3')[1];
    const lowerFinals = screen.getAllByText('Lower Bracket Finals')[1];

    expect(upperR1.compareDocumentPosition(upperFinals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(upperFinals.compareDocumentPosition(grandFinals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grandFinals.compareDocumentPosition(lowerR1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lowerR1.compareDocumentPosition(lowerR2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lowerR2.compareDocumentPosition(lowerR3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lowerR3.compareDocumentPosition(lowerFinals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=esl-one-birmingham-2026&featured=1');
  });

  it('renders PGL Wallachia playoff compact structure with upper semis and prize placements', async () => {
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
            rounds: [
              { roundName: 'Lower Bracket Final (bo3)', matches: [] },
              { roundName: 'Upper Bracket Final (bo3)', matches: [] },
              {
                roundName: 'Grand Final (bo5)',
                roundKey: 'grand-finals',
                matches: [
                  {
                    href: 'https://dltv.org/matches/425461/team-yandex-vs-team-liquid-pgl-wallachia-season-7',
                    startTime: '2026-03-15 15:02:54',
                    teams: [
                      { name: 'Team Yandex', logoUrl: null, score: '3' },
                      { name: 'Team Liquid', logoUrl: null, score: '2' },
                    ],
                  },
                ],
              },
              { roundName: 'Upper Bracket Semifinal (bo3)', matches: [] },
              { roundName: 'Lower Bracket R2 (bo3)', matches: [] },
              { roundName: 'Lower Bracket R3 (bo3)', matches: [] },
              { roundName: 'Lower Bracket R1 (bo3)', matches: [] },
              { roundName: 'Upper Bracket R1 (bo3)', matches: [] },
            ],
            placementPrizes: [
              { placement: '1st Place', prize: '$300,000' },
              { placement: '2nd Place', prize: '$175,000' },
            ],
          },
          matches: {
            title: 'Matches & Scores',
            upcoming: [],
            finished: [],
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
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'PGL Wallachia Season 7' })[1]);
    expect((await screen.findAllByText('Upper Bracket Semifinal (bo3)')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yandex').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Liquid').length).toBeGreaterThan(0);
    expect(screen.getByText('$300,000')).toBeInTheDocument();
    expect(screen.getByText('$175,000')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=pgl-wallachia-s7&featured=1');
  });

  it('routes PGL Wallachia S8 to the featured view and toggles playoff compact mode', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=1507737505&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(30, 1),
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=pgl-wallachia-s8&featured=1') {
        return createJsonResponse({
          tournamentId: 'pgl-wallachia-s8',
          title: 'Main Event',
          sourceLabel: 'DLTV',
          sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-8',
          fetchedAt: '2026-04-18T08:00:00.000Z',
          groupStage: {
            title: 'Group Stage',
            rounds: ['R 1'],
            standings: [
              {
                rank: 1,
                teamId: '2586976',
                teamName: 'PARIVISION',
                country: 'Russia',
                record: '1 - 0',
                logoUrl: null,
                isCnTeam: false,
                advancement: 'playoff',
                rounds: [
                  {
                    roundLabel: 'R 1',
                    pending: false,
                    matchId: '4261761',
                    href: 'https://dltv.org/matches/426176/parivision-vs-mouz-pgl-wallachia-season-8',
                    opponentName: 'MOUZ',
                    opponentTeamId: 'team-mouz',
                    opponentLogoUrl: null,
                    opponentIsCnTeam: false,
                    score: '2 - 0',
                  },
                ],
              },
            ],
          },
          playoffs: {
            title: 'Playoffs',
            rounds: [
              {
                roundName: 'Upper Bracket R1',
                roundKey: 'upper-r1',
                matches: [
                  {
                    href: 'https://dltv.org/matches/426180/tbd-vs-tbd-pgl-wallachia-season-8',
                    startTime: '2026-04-22 03:00:00',
                    teams: [
                      { name: 'PARIVISION', logoUrl: null, score: '0' },
                      { name: 'MOUZ', logoUrl: null, score: '0' },
                    ],
                  },
                ],
              },
            ],
            placementPrizes: [
              { placement: '1st Place', prize: '$300,000' },
            ],
          },
          matches: {
            title: 'Matches & Scores',
            upcoming: [],
            finished: [],
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
            id: '1507737505',
            league_id: 1507737505,
            name: 'PGL Wallachia Season 8',
            dltv_event_slug: 'pgl-wallachia-season-8',
            status: 'ongoing',
            tier: 'S',
            location: 'Romania',
            start_time: 1_776_355_200,
            end_time: 1_777_046_400,
          },
        ]}
        seriesByTournament={{}}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'PGL Wallachia Season 8' })[1]);
    expect(await screen.findByText('Bracket rounds and pairings')).toBeInTheDocument();

    const noButton = screen.getByRole('button', { name: 'No' });
    const yesButton = screen.getByRole('button', { name: 'Yes' });
    expect(noButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-featured-bracket-mode="standard"]')).not.toBeNull();

    fireEvent.click(yesButton);
    expect(yesButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-featured-bracket-mode="compact"]')).not.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=pgl-wallachia-s8&featured=1');
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

  it('switches BLAST 7 between main event and qualifier tracks without resetting the selection', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=blast-slam-7&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(1, 1),
          pagination: { total: 1, hasMore: false, limit: 10, offset: 0 },
        });
      }
      if (url === '/api/tournaments?tournamentId=blast-slam-7-sea-closed-qualifier&limit=10&offset=0') {
        return createJsonResponse({
          series: buildSeries(20, 1),
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
            id: 'blast-slam-7',
            league_id: 19101,
            name: 'BLAST Slam 7',
            status: 'upcoming',
            tier: 'A',
            location: 'Denmark',
            start_time: 1_701_000_000,
            end_time: 1_701_100_000,
            dltv_event_slug: 'blast-slam-7',
            event_group_slug: 'blast-slam-7',
            related_tournaments: [
              {
                id: 'blast-slam-7-china-closed-qualifier',
                league_id: 19520,
                name: 'BLAST Slam 7: China Closed Qualifier',
                status: 'completed',
                tier: 'A',
                location: 'China',
                start_time: 1_700_800_000,
                end_time: 1_700_860_000,
                dltv_event_slug: 'blast-slam-vii-china-closed-qualifier',
                event_group_slug: 'blast-slam-7',
              },
              {
                id: 'blast-slam-7-sea-closed-qualifier',
                league_id: 19538,
                name: 'BLAST Slam 7: Southeast Asia Closed Qualifier',
                status: 'completed',
                tier: 'A',
                location: 'SEA',
                start_time: 1_700_700_000,
                end_time: 1_700_760_000,
                dltv_event_slug: 'blast-slam-vii-southeast-asia-closed-qualifier',
                event_group_slug: 'blast-slam-7',
              },
              {
                id: 'blast-slam-7-eu-closed-qualifier',
                league_id: 19539,
                name: 'BLAST Slam 7: Europe Closed Qualifier',
                status: 'completed',
                tier: 'A',
                location: 'Europe',
                start_time: 1_700_600_000,
                end_time: 1_700_660_000,
                dltv_event_slug: 'blast-slam-vii-europe-closed-qualifier',
                event_group_slug: 'blast-slam-7',
              },
            ],
          },
        ]}
        seriesByTournament={{}}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    expect(await screen.findByText('Radiant 1')).toBeInTheDocument();
    expect(screen.getByText('4 条赛事路径')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /BLAST Slam 7: Southeast Asia Closed Qualifier/i }));

    await waitFor(() => {
      expect(screen.getByText('Radiant 20')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=blast-slam-7-sea-closed-qualifier&limit=10&offset=0');
    });

    expect(screen.getAllByText('BLAST Slam 7: Southeast Asia Closed Qualifier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BLAST Slam 7').length).toBeGreaterThan(0);
  });

  it('includes A-tier events in the default T1 filter', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/tournaments?tournamentId=blast-slam-7&limit=10&offset=0') {
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
            id: 'blast-slam-7',
            league_id: 19099,
            name: 'BLAST Slam 7',
            status: 'upcoming',
            tier: 'A',
            location: 'Denmark',
            start_time: 1_701_000_000,
            end_time: 1_701_100_000,
          },
          {
            id: 'epl-season-36',
            league_id: 18865,
            name: 'European Pro League Season 36',
            status: 'ongoing',
            tier: 'B',
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

    expect(await screen.findByText('Radiant 1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=blast-slam-7&limit=10&offset=0');
    expect(screen.queryByText('European Pro League Season 36')).not.toBeInTheDocument();
  });
});
