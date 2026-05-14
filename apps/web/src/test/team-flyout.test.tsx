import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamFlyout } from '@/components/custom/TeamFlyout';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: () => null,
}));

const NOW = 1_750_000_000;

function buildRecentMatches(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    match_id: String(9000 + index),
    start_time: NOW - (index + 1) * 3600,
    series_type: 'BO3',
    radiant_team_id: '1',
    dire_team_id: String(index + 2),
    radiant_team_name: 'Team Alpha',
    dire_team_name: `Opp ${index + 1}`,
    radiant_team_logo: null,
    dire_team_logo: null,
    radiant_score: 2,
    dire_score: 1,
    radiant_win: 1,
    tournament_name: `Cup ${index + 1}`,
  }));
}

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('TeamFlyout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  it('renders with data-visual-role', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
    render(<TeamFlyout open onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />);
    expect(document.querySelector('[data-visual-role="team-flyout"]')).toBeTruthy();
  });

  it('fetches team flyout data only after the flyout opens', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') return createJsonResponse({});
      if (url === '/api/team-flyout?limit=5&offset=0&teamId=1&name=Team+Alpha') {
        return createJsonResponse({
          team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
          recentMatches: buildRecentMatches(2).map((match) => ({ ...match, team_hero_ids: [1, 2, 3, 4, 5] })),
          nextMatch: null,
          activeSquad: [{ account_id: '11', name: 'Player 11', realname: 'Real 11', country_code: 'CN', avatar_url: null }],
          topHeroes: [{ hero_id: 1, matches: 2 }],
          stats: { wins: 2, losses: 0, winRate: 100 },
          pagination: { hasMore: false, nextCursor: null },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <TeamFlyout
        open={false}
        onOpenChange={() => {}}
        selectedTeam={{ team_id: '1', name: 'Team Alpha' }}
      />
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/heroes');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/team-flyout?limit=5&offset=0&teamId=1&name=Team+Alpha');

    rerender(
      <TeamFlyout
        open
        onOpenChange={() => {}}
        selectedTeam={{ team_id: '1', name: 'Team Alpha' }}
      />
    );

    expect(await screen.findByText('Opp 1')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/team-flyout?limit=5&offset=0&teamId=1&name=Team+Alpha');
  }, 15000);

  it('uses a bottom sheet on mobile viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') return createJsonResponse({});
      if (url === '/api/team-flyout?limit=5&offset=0&teamId=1&name=Team+Alpha') {
        return createJsonResponse({
          team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
          recentMatches: [],
          nextMatch: null,
          activeSquad: [],
          topHeroes: [],
          stats: { wins: 0, losses: 0, winRate: 0 },
          pagination: { hasMore: false, nextCursor: null },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TeamFlyout
        open
        onOpenChange={() => {}}
        selectedTeam={{ team_id: '1', name: 'Team Alpha' }}
      />
    );

    const dialog = await screen.findByRole('dialog', { name: /Team Alpha/ });

    await waitFor(() => {
      expect(dialog.className).toContain('slide-in-from-bottom');
    });
  }, 15000);

  it('does not invent local XG fallback data when the flyout API returns an empty payload', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') return createJsonResponse({});
      if (url === '/api/team-flyout?limit=5&offset=0&teamId=1&name=XG') {
        return createJsonResponse({
          team: { team_id: '1', name: 'XG', tag: 'XG', region: 'China' },
          recentMatches: [],
          nextMatch: null,
          activeSquad: [],
          topHeroes: [],
          stats: { wins: 0, losses: 0, winRate: 0 },
          pagination: { hasMore: false, nextCursor: null },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TeamFlyout
        open
        onOpenChange={() => {}}
        selectedTeam={{ team_id: '1', name: 'XG' }}
        teams={[{ team_id: '1', name: 'XG', tag: 'XG', region: 'China' }]}
        upcoming={[{
          match_id: '9101',
          start_time: NOW + 3600,
          series_type: 'BO3',
          radiant_team_id: '1',
          dire_team_id: '2',
          radiant_team_name: 'XG',
          dire_team_name: 'Tundra',
          tournament_name: 'DreamLeague S23',
        }]}
        matches={[{
          match_id: '9001',
          start_time: NOW - 3600,
          series_type: 'BO3',
          radiant_team_id: '1',
          dire_team_id: '3',
          radiant_team_name: 'XG',
          dire_team_name: 'Yakult Brothers',
          radiant_score: 2,
          dire_score: 0,
          radiant_win: 1,
          tournament_name: 'DreamLeague S23',
          team_hero_ids: [1, 2, 3, 4, 5],
        }]}
      />
    );

    expect(await screen.findByText('暂无最近一场比赛阵容')).toBeInTheDocument();
    expect(screen.queryByText('Ame')).not.toBeInTheDocument();
    expect(screen.queryByText(/Yakult Brothers/)).not.toBeInTheDocument();
    expect(screen.getByText('暂无未来赛程')).toBeInTheDocument();
    expect(screen.getByText('暂无历史比赛')).toBeInTheDocument();
  }, 15000);

  it('shows five recent matches by default and loads more lazily', async () => {
    const matches = buildRecentMatches(8);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') return createJsonResponse({});
      if (url === '/api/team-flyout?limit=5&offset=0&teamId=1&name=Team+Alpha') {
        return createJsonResponse({
          team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
          recentMatches: matches.slice(0, 5).map((match) => ({ ...match, team_hero_ids: [1, 2, 3, 4, 5] })),
          nextMatch: null,
          activeSquad: [{ account_id: '11', name: 'Player 11', realname: 'Real 11', country_code: 'CN', avatar_url: null }],
          topHeroes: [{ hero_id: 1, matches: 5 }],
          stats: { wins: 5, losses: 0, winRate: 100 },
          pagination: { hasMore: true, nextCursor: 5 },
        });
      }
      if (url === '/api/team-flyout?limit=5&offset=5&teamId=1&name=Team+Alpha') {
        return createJsonResponse({
          team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
          recentMatches: matches.slice(5).map((match) => ({ ...match, team_hero_ids: [1, 2, 3, 4, 5] })),
          nextMatch: null,
          activeSquad: [{ account_id: '11', name: 'Player 11', realname: 'Real 11', country_code: 'CN', avatar_url: null }],
          topHeroes: [{ hero_id: 1, matches: 8 }],
          stats: { wins: 8, losses: 0, winRate: 100 },
          pagination: { hasMore: false, nextCursor: null },
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TeamFlyout
        open
        onOpenChange={() => {}}
        selectedTeam={{ team_id: '1', name: 'Team Alpha' }}
      />
    );

    expect(await screen.findByText('Opp 5')).toBeInTheDocument();
    expect(screen.queryByText('Opp 6')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /加载更多比赛/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /加载更多比赛/ }));

    expect(await screen.findByText('Opp 6')).toBeInTheDocument();
    expect(screen.getByText('Opp 8')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/team-flyout?limit=5&offset=5&teamId=1&name=Team+Alpha');
    });
  }, 15000);
});
