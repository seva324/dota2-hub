import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: ({ matchId, open }: { matchId: number; open: boolean }) =>
    open ? <div role="dialog">比赛详情 {matchId}</div> : null,
}));

vi.mock('@/components/custom/PlayerProfileFlyout', () => ({
  PlayerProfileFlyout: () => null,
}));

vi.mock('@/lib/playerProfile', () => ({
  createMinimalPlayerFlyoutModel: vi.fn(() => null),
  fetchPlayerProfileFlyoutModel: vi.fn(async () => null),
}));

import { HomeDashboard } from '@/sections/HomeDashboard';
import type { RouteState } from '@/lib/hashRouter';
import { __resetApiCache } from '@/lib/api-cache';

function finishedMatch(overrides: Record<string, unknown> = {}) {
  return {
    match_id: '427386',
    radiant_team_name: 'Midas Club',
    dire_team_name: 'Team Resilience',
    radiant_score: 2,
    dire_score: 1,
    start_time: Math.floor(Date.now() / 1000) - 3600,
    tournament_name: 'Games of the Future 2026',
    series_type: 'BO3',
    match_url: 'https://dltv.org/matches/427386/midas-club-vs-team-resilience-games-of-the-future-2026',
    ...overrides,
  };
}

function createFetchStub(resultMatches: unknown[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/matches')) {
      return { ok: true, json: async () => resultMatches } as Response;
    }
    if (url === '/api/live-hero') {
      return { ok: true, json: async () => ({ liveMatches: [] }) } as Response;
    }
    if (url.startsWith('/api/upcoming')) {
      return { ok: true, json: async () => ({ upcoming: [] }) } as Response;
    }
    if (url.startsWith('/api/news')) {
      return { ok: true, json: async () => [] } as Response;
    }
    if (url === '/api/ept-ranking') {
      return { ok: true, json: async () => ({ teams: [] }) } as Response;
    }
    if (url === '/api/primary-leagues') {
      return { ok: true, json: async () => ({ tournaments: [] }) } as Response;
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });
}

function renderHomeDashboard() {
  const navigate = vi.fn();
  const closeOverlay = vi.fn();
  const initialRoute: RouteState = { page: 'home', overlay: null };
  render(<HomeDashboard route={initialRoute} navigate={navigate} closeOverlay={closeOverlay} />);
  return { navigate, closeOverlay };
}

describe('HomeDashboard result navigation (Part 3)', () => {
  beforeEach(() => {
    __resetApiCache();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('navigates to the match detail page (not the modal) when a result has a DLTV slug', async () => {
    vi.stubGlobal('fetch', createFetchStub([finishedMatch()]));

    const { navigate } = renderHomeDashboard();

    await waitFor(() => expect(screen.getByText('Midas Club')).toBeInTheDocument());

    const resultCard = screen.getByRole('button', { name: /Midas Club.*Team Resilience/s });
    fireEvent.click(resultCard);

    expect(navigate).toHaveBeenCalledWith(
      { page: 'match', overlay: null, matchId: '427386', slug: 'midas-club-vs-team-resilience-games-of-the-future-2026' },
      { replace: false },
    );
  });

  it('opens the match modal (navigate with home overlay) when a result has no DLTV slug', async () => {
    vi.stubGlobal('fetch', createFetchStub([finishedMatch({ match_url: null })]));

    const { navigate } = renderHomeDashboard();

    await waitFor(() => expect(screen.getByText('Midas Club')).toBeInTheDocument());

    const resultCard = screen.getByRole('button', { name: /Midas Club.*Team Resilience/s });
    fireEvent.click(resultCard);

    // 无 slug → openOverlay：navigate({ page: 'home', overlay: { type: 'match', matchId } })
    expect(navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ page: 'match' }),
      expect.anything(),
    );
    expect(navigate).toHaveBeenCalledWith(
      { page: 'home', overlay: { type: 'match', matchId: '427386' } },
      { replace: false },
    );
  });

  it('polls live-hero every 30s and updates live matches without a page reload', async () => {
    vi.useFakeTimers();

    const liveResponse = {
      liveMatches: [{ leagueName: 'L', teams: [{ name: 'Team A', logo: null }, { name: 'Team B', logo: null }], maps: [] }],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/live-hero') {
        return { ok: true, json: async () => liveResponse } as Response;
      }
      if (url.startsWith('/api/matches')) return { ok: true, json: async () => [] } as Response;
      if (url.startsWith('/api/upcoming')) return { ok: true, json: async () => ({ upcoming: [] }) } as Response;
      if (url.startsWith('/api/news')) return { ok: true, json: async () => [] } as Response;
      if (url === '/api/ept-ranking') return { ok: true, json: async () => ({ teams: [] }) } as Response;
      if (url === '/api/primary-leagues') return { ok: true, json: async () => ({ tournaments: [] }) } as Response;
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderHomeDashboard();

    // 首屏 mount 的初始 live fetch
    await act(async () => { await Promise.resolve(); });
    const callsAfterMount = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/live-hero').length;

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

    const callsAfter30s = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/live-hero').length;
    expect(callsAfter30s).toBeGreaterThan(callsAfterMount);
    expect(screen.getByText('Team A')).toBeInTheDocument();
  });
});
