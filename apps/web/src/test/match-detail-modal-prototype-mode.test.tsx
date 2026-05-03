import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUsePrototypeMode } = vi.hoisted(() => ({
  mockUsePrototypeMode: vi.fn(() => false),
}));

vi.mock('@/lib/prototypeMode', () => ({
  usePrototypeMode: mockUsePrototypeMode,
  PROTOTYPE_SEARCH_PARAM: 'prototype',
}));

vi.mock('@/components/custom/MatchGraphs', () => ({
  MatchGraphs: () => null,
}));

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

function createErrorResponse() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: 'server error' }),
  } as Response;
}

function createMatch() {
  return {
    match_id: 9201,
    series_id: 321,
    series_type: 1,
    radiant_team_id: 8261500,
    dire_team_id: 7119388,
    radiant_team_name: 'XG',
    dire_team_name: 'Team Spirit',
    radiant_score: 18,
    dire_score: 9,
    radiant_win: true,
    duration: 1427,
    start_time: 1_700_000_000,
    players: [],
    picks_bans: [],
  };
}

describe('MatchDetailModal prototype mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUsePrototypeMode.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders PrototypeOverview draft section when prototype mode is on', async () => {
    mockUsePrototypeMode.mockReturnValue(true);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
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
          { label: 'Map 1', matchId: '9201', radiantScore: 18, direScore: 9, duration: 1427 },
        ]}
      />
    );

    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('概述')).toBeInTheDocument();
  });

  it('does not render PrototypeOverview when prototype mode is off', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
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
          { label: 'Map 1', matchId: '9201', radiantScore: 18, direScore: 9, duration: 1427 },
        ]}
      />
    );

    const ameEntries = await screen.findAllByText('Ame');
    expect(ameEntries.length).toBeGreaterThanOrEqual(1);

    expect(screen.queryByText('Draft')).not.toBeInTheDocument();
    expect(screen.queryByText('概述')).not.toBeInTheDocument();
  });

  it('shows economy tab as default when prototype mode is on', async () => {
    mockUsePrototypeMode.mockReturnValue(true);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url.startsWith('/api/match-details')) {
        return createJsonResponse(createMatch());
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
          { label: 'Map 1', matchId: '9201', radiantScore: 18, direScore: 9, duration: 1427 },
        ]}
      />
    );

    await waitFor(() => {
      const economyTab = screen.getByText('经济').closest('button');
      expect(economyTab?.dataset.state).toBe('active');
    });
  });

  it('shows KDA tab as default when prototype mode is off', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
      if (url.startsWith('/api/match-details')) {
        return createJsonResponse(createMatch());
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
          { label: 'Map 1', matchId: '9201', radiantScore: 18, direScore: 9, duration: 1427 },
        ]}
      />
    );

    await waitFor(() => {
      const kdaTab = screen.getByText('KDA').closest('button');
      expect(kdaTab?.dataset.state).toBe('active');
    });
  });

  it('renders both PrototypeOverview and economy tab in prototype mode with fallback', async () => {
    mockUsePrototypeMode.mockReturnValue(true);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/pro-players' || url === '/api/heroes') {
        return createJsonResponse({});
      }
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
          { label: 'Map 1', matchId: '9201', radiantScore: 18, direScore: 9, duration: 1427 },
        ]}
      />
    );

    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('概述')).toBeInTheDocument();

    const economyTab = screen.getByText('经济').closest('button');
    expect(economyTab?.dataset.state).toBe('active');
  });
});
