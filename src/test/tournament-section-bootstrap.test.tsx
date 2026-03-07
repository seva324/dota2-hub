import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  createMinimalPlayerFlyoutModel: vi.fn(),
  fetchPlayerProfileFlyoutModel: vi.fn(),
}));

import { TournamentSection } from '@/sections/TournamentSection';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly callback: IntersectionObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([
      {
        isIntersecting,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      } as IntersectionObserverEntry,
    ], this as unknown as IntersectionObserver);
  }
}

describe('TournamentSection bootstrap lazy loading', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      if (url === '/api/tournaments') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            tournaments: [
              {
                id: 'dreamleague-s28',
                name: 'DreamLeague Season 28',
                status: 'completed',
                tier: 'S',
                start_time: 1700000000,
                end_time: 1701000000,
              },
            ],
          }),
        } as Response);
      }
      if (url === '/api/teams') {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as Response);
      }
      if (url === '/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            series: [
              {
                series_id: 'series-1',
                series_type: 'BO3',
                radiant_team_id: '1',
                dire_team_id: '2',
                radiant_team_name: 'Team A',
                dire_team_name: 'Team B',
                radiant_score: 2,
                dire_score: 1,
                games: [],
                stage: 'Playoffs',
                stage_kind: 'playoff',
              },
            ],
            pagination: {
              total: 1,
              hasMore: false,
              limit: 10,
              offset: 0,
            },
          }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }));
  });

  it('bootstraps tournaments when the empty-state section enters view', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TournamentSection tournaments={[]} teams={[]} allMatches={[]} upcoming={[]} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/heroes');
    });

    expect(screen.getByText('暂无 T1 赛事数据')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tournaments');

    await act(async () => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments');
      expect(fetchMock).toHaveBeenCalledWith('/api/teams');
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0');
    });

    expect((await screen.findAllByText('DreamLeague Season 28')).length).toBeGreaterThan(0);
    expect(await screen.findByText('Team A')).toBeInTheDocument();
  });
});
