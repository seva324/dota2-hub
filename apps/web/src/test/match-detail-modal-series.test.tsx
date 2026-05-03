import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function createMatch(matchId: number, radiantScore: number, direScore: number) {
  return {
    match_id: matchId,
    series_id: 321,
    series_type: 1,
    radiant_team_id: 1,
    dire_team_id: 2,
    radiant_team_name: 'XG',
    dire_team_name: 'Team Spirit',
    radiant_score: radiantScore,
    dire_score: direScore,
    radiant_win: radiantScore > direScore,
    duration: 1427,
    start_time: 1_700_000_000,
    players: [],
    picks_bans: [],
  };
}

function createErrorResponse() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: 'server error' }),
  } as Response;
}

describe('MatchDetailModal fallback placeholders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('renders labeled hero and item placeholders when API returns empty data', async () => {
    // Mock APIs to return empty data so we exercise the fallback paths
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
      // Fail match details to trigger createFallbackMatchDetail
      if (url.startsWith('/api/match-details')) {
        return createErrorResponse();
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { MatchDetailModal } = await import('@/components/custom/MatchDetailModal');

    render(
      <MatchDetailModal
        matchId={9201}
        open
        onOpenChange={vi.fn()}
        seriesMaps={[
          { label: '地图 1', matchId: '9201', radiantScore: 18, direScore: 9, duration: 1427 },
        ]}
      />
    );

    // Wait for the KDA table to render with player names (desktop + mobile views both show "Ame")
    const ameEntries = await screen.findAllByText('Ame');
    expect(ameEntries.length).toBeGreaterThanOrEqual(1);

    // Item cells should show labeled placeholders via SafeImg fallback
    // Fallback players have items [50, 63, 116, 145, 147, 160] — title attr shows "Item NNN"
    const itemTitles = screen.getAllByTitle(/Item \d+/);
    expect(itemTitles.length).toBeGreaterThanOrEqual(1);
  });
});

describe('MatchDetailModal Series maps', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('switches the loaded match when the user selects another Series map', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url === '/api/match-details?match_id=9101') {
        return createJsonResponse(createMatch(9101, 18, 9));
      }
      if (url === '/api/match-details?match_id=9102') {
        return createJsonResponse(createMatch(9102, 7, 16));
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { MatchDetailModal } = await import('@/components/custom/MatchDetailModal');

    render(
      <MatchDetailModal
        matchId={9101}
        open
        onOpenChange={vi.fn()}
        seriesMaps={[
          { label: '地图 1', matchId: '9101', radiantScore: 18, direScore: 9, duration: 1427 },
          { label: '地图 2', matchId: '9102', radiantScore: 7, direScore: 16, duration: 1022 },
        ]}
      />
    );

    expect(await screen.findByText(/Match ID 9101/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /地图 2/ }));

    await waitFor(() => {
      expect(screen.getByText(/Match ID 9102/)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith('/api/match-details?match_id=9102');
    });
  });
});
