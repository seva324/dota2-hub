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

describe('TournamentSection lazy loading', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      if (url.startsWith('/api/tournaments?')) {
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

  it('waits until the section is in view before fetching series details', async () => {
    const fetchMock = vi.mocked(fetch);

    render(
      <TournamentSection
        tournaments={[
          {
            id: 'dreamleague-s28',
            name: 'DreamLeague Season 28',
            status: 'ongoing',
            tier: 'S',
            start_time: 1700000000,
            end_time: 1701000000,
          },
        ]}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/heroes');
    });

    expect(fetchMock).not.toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0');
    expect(screen.queryByText('Team A')).not.toBeInTheDocument();

    await act(async () => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tournaments?tournamentId=dreamleague-s28&limit=10&offset=0');
    });

    expect(await screen.findByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('总场次').nextElementSibling).toHaveTextContent('1');
  });
});
