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

function renderEventDetail() {
  const onOpenTeam = vi.fn();
  const onOpenMatch = vi.fn();
  render(
    <EventDetailPage slug="test-event" onBack={() => {}} onOpenTeam={onOpenTeam} onOpenMatch={onOpenMatch} />,
  );
  return { onOpenMatch };
}

describe('EventDetailPage navigation', () => {
  beforeEach(() => {
    __resetApiCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/event-detail')) return createJsonResponse(PAYLOAD);
      return createJsonResponse({});
    }));
  });

  it('renders 查看详情 as an internal button, not a dltv.org external link', async () => {
    renderEventDetail();
    await waitFor(() => {
      expect(screen.getByText('Team A')).toBeTruthy();
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
});
