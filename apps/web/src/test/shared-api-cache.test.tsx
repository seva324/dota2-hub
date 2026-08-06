import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeDashboard } from '@/sections/HomeDashboard';
import { MatchesPage } from '@/pages/MatchesPage';
import { apiFetch, getCachedValue, __resetApiCache } from '@/lib/api-cache';
import type { RouteState } from '@/lib/hashRouter';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: () => null,
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

  it('home → matches navigation reuses cached payloads (incl. short-lived live) without re-fetching', async () => {
    const { unmount } = renderHome();
    // 等首屏把共享端点拉起来
    await waitFor(() => expect(countCalls('/api/matches?limit=40')).toBe(1));
    expect(countCalls('/api/upcoming?limit=20&days=7')).toBe(1);

    const homeCalls = {
      upcoming: countCalls('/api/upcoming?limit=20&days=7'),
      matches: countCalls('/api/matches?limit=40'),
      live: countCalls('/api/live-hero'),
    };

    // 卸载首页，挂载比赛页（与真实 hash 路由切换一致：旧组件卸载 + 新组件挂载）
    unmount();

    render(<MatchesPage onOpenMatch={vi.fn()} />);
    // 同步初始化从共享缓存读首帧数据：无需等网络就渲染出比赛行
    await waitFor(() => expect(screen.getByText('Midas Club')).toBeTruthy());

    // 共享端点全部命中缓存，0 重新请求：upcoming/results 5min TTL，
    // live 也有 20s 短缓存（返回页面时立即显示旧比分，后台再刷新）。
    expect(countCalls('/api/upcoming?limit=20&days=7')).toBe(homeCalls.upcoming);
    expect(countCalls('/api/matches?limit=40')).toBe(homeCalls.matches);
    expect(countCalls('/api/live-hero')).toBe(homeCalls.live);
  });

  it('matches page keeps upcoming/completed rendered when live-hero request fails', async () => {
    // 回归：曾因 Promise.all + 单个 catch，live(ttl 0) 失败时整页 setState 全部丢弃，
    // 从详情页返回后 matches 信息"不见了"。现在各段独立加载，互不影响。
    const failingLive = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/live-hero') throw new Error('live down');
      return createFetchStub()(input);
    });
    vi.stubGlobal('fetch', failingLive);

    render(<MatchesPage onOpenMatch={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Midas Club')).toBeTruthy());
    expect(screen.getByText('Team A')).toBeTruthy();
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

  it('does not cache retryable timeout payloads so auto-retry re-fetches', async () => {
    // 回归：match-page 冷启动超时返回 source:'timeout'，若被缓存，SeriesMatchPage 的
    // 2.5s 自动重试会命中旧缓存，永远拿不到后台抓取完成后的数据。
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ seriesId: 1, source: 'timeout', maps: [] }) }) as Response);
    await apiFetch('/api/match-page?series_id=1', { ttlMs: 5 * 60 * 1000, cacheEmpty: false, fetchImpl: fetcher });
    await apiFetch('/api/match-page?series_id=1', { ttlMs: 5 * 60 * 1000, cacheEmpty: false, fetchImpl: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('getCachedValue reads cached payload synchronously (page remount first paint)', async () => {
    // 页面切换 = 旧组件卸载 + 新组件挂载。挂载时 useState 初始化同步读缓存，
    // 首帧直接渲染旧数据（不闪空），异步 apiFetch 再后台刷新。
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ value: 7 }) }) as Response);
    await apiFetch('/api/sync-read', { ttlMs: 60_000, fetchImpl: fetcher });
    expect(getCachedValue('/api/sync-read')).toEqual({ value: 7 });

    // ttl 0 不写缓存 → 同步读不到
    await apiFetch('/api/sync-read-0', { ttlMs: 0, fetchImpl: fetcher });
    expect(getCachedValue('/api/sync-read-0')).toBeUndefined();

    // 缓存被清空后同步读不到
    __resetApiCache();
    expect(getCachedValue('/api/sync-read')).toBeUndefined();
  });
});
