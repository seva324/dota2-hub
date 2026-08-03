import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeDashboard } from '@/sections/HomeDashboard';
import { MatchesPage } from '@/pages/MatchesPage';
import { apiFetch, __resetApiCache } from '@/lib/api-cache';
import type { RouteState } from '@/lib/hashRouter';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: () => null,
}));

vi.mock('@/components/custom/TeamFlyout', () => ({
  TeamFlyout: () => null,
}));

vi.mock('@/components/custom/PlayerProfileFlyout', () => ({
  PlayerProfileFlyout: () => null,
}));

vi.mock('@/lib/playerProfile', () => ({
  createMinimalPlayerFlyoutModel: vi.fn(() => null),
  fetchPlayerProfileFlyoutModel: vi.fn(async () => null),
}));

function finishedMatch(overrides: Record<string, unknown> = {}) {
  return {
    match_id: '427386',
    series_id: '427386',
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

function createFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/upcoming?limit=20&days=7') {
      return {
        ok: true,
        json: async () => ({
          upcoming: [{
            id: '1',
            series_id: '1',
            start_time: Math.floor(Date.now() / 1000) + 3600,
            radiant_team_name: 'Team A',
            dire_team_name: 'Team B',
            series_type: 'BO3',
            tournament_name: 'Test League',
          }],
        }),
      } as Response;
    }
    if (url === '/api/live-hero') {
      return { ok: true, json: async () => ({ liveMatches: [] }) } as Response;
    }
    if (url === '/api/matches?limit=40') {
      return { ok: true, json: async () => [finishedMatch()] } as Response;
    }
    if (url.startsWith('/api/news')) return { ok: true, json: async () => [] } as Response;
    if (url === '/api/ept-ranking') return { ok: true, json: async () => ({ teams: [] }) } as Response;
    if (url === '/api/primary-leagues') return { ok: true, json: async () => ({ tournaments: [] }) } as Response;
    if (url.startsWith('/api/pro-players')) return { ok: true, json: async () => null } as Response;
    throw new Error(`Unhandled fetch: ${url}`);
  });
}

function renderHome() {
  const route: RouteState = { page: 'home', overlay: null };
  return render(<HomeDashboard route={route} navigate={vi.fn()} closeOverlay={vi.fn()} />);
}

describe('shared api-cache across home and matches pages', () => {
  let fetchMock: ReturnType<typeof createFetchStub>;

  beforeEach(() => {
    __resetApiCache();
    window.history.pushState({}, '', '/');
    fetchMock = createFetchStub();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const countCalls = (url: string) => fetchMock.mock.calls.filter(([input]) => String(input) === url).length;

  it('home → matches navigation reuses upcoming/results from cache without re-fetching', async () => {
    const { unmount } = renderHome();
    // 等首屏把共享端点拉起来
    await waitFor(() => expect(countCalls('/api/matches?limit=40')).toBe(1));
    expect(countCalls('/api/upcoming?limit=20&days=7')).toBe(1);

    const homeCalls = { upcoming: countCalls('/api/upcoming?limit=20&days=7'), matches: countCalls('/api/matches?limit=40') };

    // 卸载首页，挂载比赛页（与真实 hash 路由切换一致：旧组件卸载 + 新组件挂载）
    unmount();

    render(<MatchesPage onOpenMatch={vi.fn()} />);
    // 等比赛页把它的 live-hero 初始请求发出去并完成
    await waitFor(() => expect(countCalls('/api/live-hero')).toBeGreaterThanOrEqual(2));

    // 共享端点不应重新请求（缓存命中），live-hero 是实时数据必须重新拉
    expect(countCalls('/api/upcoming?limit=20&days=7')).toBe(homeCalls.upcoming);
    expect(countCalls('/api/matches?limit=40')).toBe(homeCalls.matches);
  });

  it('single-flight dedupes concurrent apiFetch calls to the same URL', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ value: 42 }) }) as Response);
    const results = await Promise.all([
      apiFetch('/api/shared', { fetchImpl: fetcher }),
      apiFetch('/api/shared', { fetchImpl: fetcher }),
      apiFetch('/api/shared', { fetchImpl: fetcher }),
    ]);
    expect(results.every((r) => (r as { value: number }).value === 42)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('ttl 0 bypasses cache: repeated calls always hit the network', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ live: true }) }) as Response);
    await apiFetch('/api/live-test', { ttlMs: 0, fetchImpl: fetcher });
    await apiFetch('/api/live-test', { ttlMs: 0, fetchImpl: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
