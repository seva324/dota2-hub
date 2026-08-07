import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventDetailPage } from '@/pages/EventDetailPage';
import { __resetApiCache } from '@/lib/api-cache';

function createJsonResponse(payload: unknown) {
  return { ok: true, json: async () => payload } as Response;
}

const PAYLOAD = {
  slug: 'test-event',
  title: 'Test Event',
  participants: [
    { name: 'Team A', players: [] },
    { name: 'Team B', players: [] },
    { name: 'Team C', players: [] },
    { name: 'Team D', players: [] },
  ],
  matches: {
    // 即将开赛（含 LIVE 由 isLive 区分）
    matches: [
      { url: 'https://dltv.org/matches/111/team-a-vs-team-b-test-event', left: 'Team A', leftSlug: 'team-a', center: '10:00', right: 'Team B', rightSlug: 'team-b', isLive: false },
    ],
    finishedMatches: [
      { url: 'https://dltv.org/matches/222/team-c-vs-team-d-test-event', left: 'Team C', leftSlug: 'team-c', center: '2 - 1', right: 'Team D', rightSlug: 'team-d' },
    ],
  },
};

const LIVE_HERO = {
  source: 'hawk.live',
  sourceSeriesId: '98930',
  sourceSeriesSlug: 'epl-masters-i-team-a-vs-team-b',
  sourceChampionshipSlug: 'epl-masters-i',
  leagueName: 'Test Event',
  bestOf: 'BO3',
  seriesScore: '1 - 0',
  live: true,
  teams: [
    { side: 'team1', name: 'Team A', logo: null },
    { side: 'team2', name: 'Team B', logo: null },
  ],
  maps: [],
  liveMap: { label: 'Game 1', matchId: '999', status: 'live', gameTime: 1200, team1Score: 12, team2Score: 9 },
};

function renderEventDetail() {
  const onOpenTeam = vi.fn();
  const onOpenMatch = vi.fn();
  const onOpenLive = vi.fn();
  render(
    <EventDetailPage slug="test-event" onBack={() => {}} onOpenTeam={onOpenTeam} onOpenMatch={onOpenMatch} onOpenLive={onOpenLive} />,
  );
  return { onOpenMatch, onOpenLive };
}

describe('EventDetailPage navigation', () => {
  beforeEach(() => {
    __resetApiCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/event-detail')) return createJsonResponse(PAYLOAD);
      if (url.startsWith('/api/live-hero')) return createJsonResponse({ liveMatches: [LIVE_HERO] });
      return createJsonResponse({});
    }));
  });

  it('renders 查看详情 as an internal button, not a dltv.org external link', async () => {
    renderEventDetail();
    await waitFor(() => {
      expect(screen.getAllByText('Team A').length).toBeGreaterThan(0);
    });
    // 不再有指向 dltv.org/matches 的外链锚点
    expect(screen.queryByRole('link', { name: /查看详情/ })).toBeNull();
    expect(screen.getByRole('button', { name: /查看详情/ })).toBeTruthy();
  });

  it('navigates to the internal match detail page when clicking 查看详情', async () => {
    const { onOpenMatch } = renderEventDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /查看详情/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /查看详情/ }));
    expect(onOpenMatch).toHaveBeenCalledWith({ matchId: '111', slug: 'team-a-vs-team-b-test-event' });
  });

  it('opens the match detail page when clicking a finished result card', async () => {
    const { onOpenMatch } = renderEventDetail();
    await waitFor(() => {
      expect(screen.getByText('已结束')).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /已结束.*Team C.*Team D/s }));
    expect(onOpenMatch).toHaveBeenCalledWith({ matchId: '222', slug: 'team-c-vs-team-d-test-event' });
  });

  it('renders related live matches from /api/live-hero as home-style live cards', async () => {
    renderEventDetail();
    // live-hero 中两队都属于本赛事 participants → 关联直播展示 LiveMatchCard（含 LIVE 徽标 + 观看按钮）
    await waitFor(() => {
      expect(screen.getByText('关联直播')).toBeTruthy();
    });
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByRole('button', { name: /观看/ })).toBeTruthy();
  });

  it('opens the live detail page when clicking a related live card', async () => {
    const { onOpenLive } = renderEventDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /观看/ })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /观看/ }));
    expect(onOpenLive).toHaveBeenCalledTimes(1);
    expect(onOpenLive).toHaveBeenCalledWith(expect.objectContaining({ sourceSeriesId: '98930' }));
  });

  it('falls back to the DLTV live row when live-hero has no matching match (after live loads)', async () => {
    const payloadWithLive = {
      ...PAYLOAD,
      matches: {
        matches: [
          { url: 'https://dltv.org/matches/333/team-e-vs-team-f-test-event', left: 'Team E', center: '1 - 1', right: 'Team F', isLive: true },
        ],
        finishedMatches: [],
      },
    };
    __resetApiCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/event-detail')) return createJsonResponse(payloadWithLive);
      if (url.startsWith('/api/live-hero')) return createJsonResponse({ liveMatches: [] });
      return createJsonResponse({});
    }));
    renderEventDetail();
    // live-hero 加载完成(空)后才回退到 DLTV isLive 行,渲染 live 卡片
    await waitFor(() => {
      expect(screen.getByText('直播进行中')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /查看详情/ })).toBeTruthy();
  });
});
