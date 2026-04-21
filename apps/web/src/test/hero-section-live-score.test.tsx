import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import { getCuratedTeamLogoMirrorPath } from '../../../../lib/team-logo-overrides.js';

import { HeroSection } from '@/sections/HeroSection';

const HERO_LIVE_MATCHES = [
  {
    leagueName: 'PGL Wallachia Season 7: Group Stage',
    bestOf: 'BO3',
    seriesScore: '1 - 1',
    startedAt: '2026-03-08T15:00:00.000000Z',
    teams: [
      { side: 'team1', name: 'Aurora', logo: 'https://hawk.live/storage/teams/6274.png' },
      { side: 'team2', name: 'Heroic', logo: 'https://hawk.live/storage/teams/wrong-heroic.png' },
    ],
    maps: [
      { label: 'Map 1', score: '22 - 30', status: 'completed', result: 'team2', gameTime: 2100, team1Score: 22, team2Score: 30, team2NetWorthLead: 12400 },
      { label: 'Map 2', score: '28 - 17', status: 'completed', result: 'team1', gameTime: 1950, team1Score: 28, team2Score: 17, team1NetWorthLead: 9100 },
      { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738, team1NetWorthLead: 8400, team2NetWorthLead: null },
    ],
    liveMap: { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738, team1Score: 14, team2Score: 11, team1NetWorthLead: 8400, team2NetWorthLead: null },
    live: true,
    source: 'hawk.live',
    sourceUrl: 'https://hawk.live/dota-2/matches/pgl-wallachia-season-7-group-stage/aurora-vs-heroic',
  },
  {
    leagueName: 'PGL Wallachia Season 7: Group Stage',
    bestOf: 'BO3',
    seriesScore: '0 - 0',
    startedAt: '2026-03-08T14:00:00.000000Z',
    teams: [
      { side: 'team1', name: 'PARIVISION', logo: 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/9717246.png' },
      { side: 'team2', name: 'Natus Vincere', logo: 'https://cdn.steamstatic.com/apps/dota2/images/team_logos/36.png' },
    ],
    maps: [
      { label: 'Map 1', score: '12 - 9', status: 'live', gameTime: 620, team1NetWorthLead: 32640, team2NetWorthLead: null },
    ],
    liveMap: { label: 'Map 1', score: '12 - 9', status: 'live', gameTime: 620, team1Score: 12, team2Score: 9, team1NetWorthLead: 32640, team2NetWorthLead: null },
    live: true,
    source: 'hawk.live',
    sourceUrl: 'https://hawk.live/dota-2/matches/pgl-wallachia-season-7-group-stage/parivision-vs-natus-vincere',
  },
] as const;

function cloneLiveMatches() {
  return JSON.parse(JSON.stringify(HERO_LIVE_MATCHES));
}

function buildLiveHeroResponse(liveMatches = cloneLiveMatches()) {
  return {
    live: liveMatches[0] ?? null,
    liveMatches,
  };
}

describe('HeroSection live spotlight', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            upcoming: [
              {
                id: 1,
                match_id: 1,
                radiant_team_id: '1',
                dire_team_id: '2',
                radiant_team_name: 'Xtreme Gaming',
                dire_team_name: 'Team Spirit',
                start_time: Math.floor(Date.now() / 1000) + 3600,
                series_type: 'BO3',
                tournament_name: 'DreamLeague',
              },
            ],
            teams: [
              { team_id: '1', name: 'Xtreme Gaming', region: 'China', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/8261500.png' },
              { team_id: '2', name: 'Team Spirit', region: 'Eastern Europe', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/7119388.png' },
              { team_id: '3', name: 'Heroic', region: 'South America', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/9303484.png' },
            ],
          }),
        } as Response);
      }
      if (url.includes('/api/live-hero')) {
        return Promise.resolve({
          ok: true,
          json: async () => buildLiveHeroResponse(),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the live spotlight card and the CN upcoming preview together', async () => {
    render(<HeroSection upcoming={[]} teams={[]} />);

    expect(await screen.findByText('直播对局')).toBeInTheDocument();
    expect(screen.getAllByText('PGL Wallachia Season 7: Group Stage')).toHaveLength(2);
    expect(screen.getByText('Aurora')).toBeInTheDocument();
    expect(screen.getByText('Heroic')).toBeInTheDocument();
    expect(screen.queryByText('22 - 30')).not.toBeInTheDocument();
    expect(screen.queryByText('28 - 17')).not.toBeInTheDocument();
    expect(screen.getByText('PARIVISION')).toBeInTheDocument();
    expect(screen.getByText('Natus Vincere')).toBeInTheDocument();
    expect(screen.getByText('+32.6k')).toBeInTheDocument();
    expect(screen.getByText('+8.4k')).toBeInTheDocument();
    expect(screen.getByTestId('hero-live-grid')).toHaveTextContent('Map 1');
    expect(screen.getByText('中国战队预告')).toBeInTheDocument();
    expect(screen.getByText('DreamLeague')).toBeInTheDocument();

    const cards = screen.getAllByTestId('hero-live-card');
    expect(within(cards[0]).getByText('PARIVISION')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Natus Vincere')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Aurora')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Heroic')).toBeInTheDocument();
    expect(within(cards[1]).getByText('时长 28:58')).toBeInTheDocument();
    expect(Array.from(cards[1].querySelectorAll('img')).map((node) => node.getAttribute('src') || '')).toEqual(
      expect.arrayContaining([
        getCuratedTeamLogoMirrorPath('Aurora'),
        getCuratedTeamLogoMirrorPath('Heroic'),
      ])
    );

    fireEvent.click(within(cards[1]).getByRole('button', { name: /map 1/i }));
    await waitFor(() => {
      expect(within(cards[1]).getByText('22')).toBeInTheDocument();
      expect(within(cards[1]).getByText('30')).toBeInTheDocument();
    });
    expect(within(cards[1]).getByText('胜利方 · 终盘+12.4k')).toBeInTheDocument();
    expect(within(cards[1]).getByText('失利方')).toBeInTheDocument();
    expect(within(cards[1]).getByText('时长 35:00')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Map 1 已结束')).not.toBeInTheDocument();
  }, 15000);

  it('does not refetch live or upcoming data in a render loop when props are omitted', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<HeroSection />);

    expect(await screen.findByText('直播对局')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/live-hero',
      '/api/upcoming?days=1',
    ]);
  });

  it('polls the live API every 3 seconds without refetching upcoming data', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);

    render(<HeroSection />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('直播对局')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/live-hero',
      '/api/upcoming?days=1',
    ]);

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/live-hero',
      '/api/upcoming?days=1',
      '/api/live-hero',
    ]);
  });

  it('keeps live cards mounted when a poll briefly returns no matches', async () => {
    vi.useFakeTimers();

    const liveResponses = [
      buildLiveHeroResponse(),
      { live: null, liveMatches: [] },
      buildLiveHeroResponse(),
    ];

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            upcoming: [],
            teams: [],
          }),
        } as Response);
      }
      if (url.includes('/api/live-hero')) {
        const nextResponse = liveResponses.shift() ?? buildLiveHeroResponse();
        return Promise.resolve({
          ok: true,
          json: async () => nextResponse,
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));

    render(<HeroSection />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    let cards = screen.getAllByTestId('hero-live-card');
    expect(within(cards[0]).getByText('PARIVISION')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Aurora')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    cards = screen.getAllByTestId('hero-live-card');
    expect(within(cards[0]).getByText('PARIVISION')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Aurora')).toBeInTheDocument();
  });

  it('keeps the existing live card order during refreshes', async () => {
    vi.useFakeTimers();

    const refreshedMatches = cloneLiveMatches();
    refreshedMatches[0].startedAt = '2026-03-08T13:00:00.000000Z';
    refreshedMatches[0].liveMap.score = '15 - 11';
    refreshedMatches[0].liveMap.team1Score = 15;
    refreshedMatches[0].maps[2].score = '15 - 11';
    refreshedMatches[0].maps[2].team1Score = 15;

    const liveResponses = [
      buildLiveHeroResponse(),
      buildLiveHeroResponse(refreshedMatches),
    ];

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            upcoming: [],
            teams: [],
          }),
        } as Response);
      }
      if (url.includes('/api/live-hero')) {
        const nextResponse = liveResponses.shift() ?? buildLiveHeroResponse(refreshedMatches);
        return Promise.resolve({
          ok: true,
          json: async () => nextResponse,
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));

    render(<HeroSection />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    let cards = screen.getAllByTestId('hero-live-card');
    expect(within(cards[0]).getByText('PARIVISION')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Aurora')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    cards = screen.getAllByTestId('hero-live-card');
    expect(within(cards[0]).getByText('PARIVISION')).toBeInTheDocument();
    expect(within(cards[1]).getByText('Aurora')).toBeInTheDocument();
    expect(within(cards[1]).getByText('15')).toBeInTheDocument();
  });

  it('falls back cleanly when the live API returns no match', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            upcoming: [
              {
                id: 1,
                match_id: 1,
                radiant_team_id: '1',
                dire_team_id: '2',
                radiant_team_name: 'Xtreme Gaming',
                dire_team_name: 'Team Spirit',
                start_time: Math.floor(Date.now() / 1000) + 3600,
                series_type: 'BO3',
                tournament_name: 'DreamLeague',
              },
            ],
            teams: [
              { team_id: '1', name: 'Xtreme Gaming', region: 'China', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/8261500.png' },
              { team_id: '2', name: 'Team Spirit', region: 'Eastern Europe', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/7119388.png' },
            ],
          }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ live: null }) } as Response);
    }));

    render(<HeroSection upcoming={[]} teams={[]} />);

    await waitFor(() => {
      expect(screen.getByText('中国战队预告')).toBeInTheDocument();
    });
    expect(screen.queryByText('直播对局')).not.toBeInTheDocument();
    expect(screen.getByText('DreamLeague')).toBeInTheDocument();
  });

  it('renders live content before upcoming content when live resolves first', async () => {
    let resolveLiveJson: ((value: unknown) => void) | null = null;
    let resolveUpcomingJson: ((value: unknown) => void) | null = null;

    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/live-hero')) {
        return Promise.resolve({
          ok: true,
          json: () => new Promise((resolve) => {
            resolveLiveJson = resolve;
          }),
        } as Response);
      }
      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: () => new Promise((resolve) => {
            resolveUpcomingJson = resolve;
          }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));

    render(<HeroSection upcoming={[]} teams={[]} />);

    await waitFor(() => {
      expect(resolveLiveJson).toBeTypeOf('function');
      expect(resolveUpcomingJson).toBeTypeOf('function');
    });

    await act(async () => {
      resolveLiveJson?.({
        live: null,
        liveMatches: [
          {
            leagueName: 'PGL Wallachia Season 7: Group Stage',
            bestOf: 'BO3',
            seriesScore: '1 - 1',
            startedAt: '2026-03-08T15:00:00.000000Z',
            teams: [
              { side: 'team1', name: 'Aurora', logo: 'https://hawk.live/storage/teams/6274.png' },
              { side: 'team2', name: 'Heroic', logo: 'https://hawk.live/storage/teams/wrong-heroic.png' },
            ],
            maps: [
              { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738, team1Score: 14, team2Score: 11, team1NetWorthLead: 8400, team2NetWorthLead: null },
            ],
            liveMap: { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738, team1Score: 14, team2Score: 11, team1NetWorthLead: 8400, team2NetWorthLead: null },
            live: true,
            source: 'hawk.live',
            sourceUrl: 'https://hawk.live/dota-2/matches/pgl-wallachia-season-7-group-stage/aurora-vs-heroic',
          },
        ],
      });
    });

    expect(await screen.findByText('直播对局')).toBeInTheDocument();
    expect(screen.queryByText('中国战队预告')).not.toBeInTheDocument();

    await act(async () => {
      resolveUpcomingJson?.({
        upcoming: [
          {
            id: 1,
            match_id: 1,
            radiant_team_id: '1',
            dire_team_id: '2',
            radiant_team_name: 'Xtreme Gaming',
            dire_team_name: 'Team Spirit',
            start_time: Math.floor(Date.now() / 1000) + 3600,
            series_type: 'BO3',
            tournament_name: 'DreamLeague',
          },
        ],
        teams: [
          { team_id: '1', name: 'Xtreme Gaming', region: 'China', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/8261500.png' },
          { team_id: '2', name: 'Team Spirit', region: 'Eastern Europe', logo_url: 'https://dota2-hub.vercel.app/images/mirror/teams/7119388.png' },
        ],
      });
    });

    expect(await screen.findByText('中国战队预告')).toBeInTheDocument();
  });
});
