import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { UpcomingSection } from '@/sections/UpcomingSection';

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

describe('UpcomingSection lazy loading', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
    vi.stubGlobal('fetch', vi.fn());
  });

  it('waits until the section is in view, fetches 2-day upcoming data, and excludes later matches', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        upcoming: (() => {
          const now = Math.floor(Date.now() / 1000);
          return [
            {
              id: 1,
              match_id: 1,
              radiant_team_id: '1',
              dire_team_id: '2',
              radiant_team_name: 'Xtreme Gaming',
              dire_team_name: 'Team Spirit',
              start_time: now + 36 * 3600,
              series_type: 'BO3',
              tournament_name: 'DreamLeague',
            },
            {
              id: 2,
              match_id: 2,
              radiant_team_id: '3',
              dire_team_id: '999',
              radiant_team_name: 'Team Liquid',
              dire_team_name: 'Team Falcons',
              start_time: now + 72 * 3600,
              series_type: 'BO3',
              tournament_name: 'Too Late Cup',
            },
          ];
        })(),
        teams: [
          { team_id: '1', name: 'Xtreme Gaming', region: 'China', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/8261500.png' },
          { team_id: '2', name: 'Team Spirit', region: 'Eastern Europe', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/7119388.png' },
        ],
      }),
    } as Response);

    render(<UpcomingSection upcoming={[]} teams={[]} allMatches={[]} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('DreamLeague')).not.toBeInTheDocument();

    await act(async () => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/upcoming?days=2');
    });

    expect(await screen.findByText('DreamLeague')).toBeInTheDocument();
    expect(screen.queryByText('Too Late Cup')).not.toBeInTheDocument();
    expect(screen.getByText('本周场次').nextElementSibling).toHaveTextContent('1');
    expect(Array.from(document.querySelectorAll('img')).map((node) => node.getAttribute('src') || '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/images/mirror/teams/xtreme-gaming.webp'),
        expect.stringContaining('/images/mirror/teams/team-spirit-white.svg'),
      ])
    );
  });

  it('shows Liquipedia fallback names and disables team flyout when the opponent is missing from teams', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        upcoming: (() => {
          const now = Math.floor(Date.now() / 1000);
          return [
            {
              id: 3,
              match_id: 3,
              radiant_team_id: '1',
              dire_team_id: '999',
              radiant_team_name: 'Xtreme Gaming',
              dire_team_name: 'Team Liquid',
              start_time: now + 3600,
              series_type: 'BO3',
              tournament_name: 'DreamLeague',
            },
          ];
        })(),
        teams: [
          { team_id: '1', name: 'Xtreme Gaming', region: 'China', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/8261500.png' },
        ],
      }),
    } as Response);

    render(<UpcomingSection upcoming={[]} teams={[]} allMatches={[]} />);

    await act(async () => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });

    expect(await screen.findByText('Team Liquid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Team Liquid/i })).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('img')).map((node) => node.getAttribute('src') || '')).toEqual(
      expect.arrayContaining([expect.stringContaining('/images/mirror/teams/team-liquid-white.svg')])
    );
  });
});
