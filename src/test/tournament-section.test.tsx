import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TournamentSection } from '@/sections/TournamentSection';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: () => null,
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
});
