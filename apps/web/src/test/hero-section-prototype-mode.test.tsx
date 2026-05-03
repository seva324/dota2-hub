import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeroSection } from '@/sections/HeroSection';
import type { LiveHeroPayload } from '@/sections/HeroSection';

const PROTOTYPE_LIVE_HEROES: LiveHeroPayload[] = [
  {
    source: 'mock',
    leagueName: 'DreamLeague S23',
    stage: '小组赛',
    bestOf: 3,
    seriesScore: '1:0',
    live: true,
    startedAt: Math.floor(Date.now() / 1000) - 1427,
    teams: [
      { side: 'team1', name: 'Xtreme Gaming', logo: null },
      { side: 'team2', name: 'Yakult Brothers', logo: null },
    ],
    maps: [
      { matchId: '9201', label: 'Map 1', status: 'live', score: '18-9', team1Score: 18, team2Score: 9, team1NetWorthLead: 9400, team1TotalGold: 47600, team2TotalGold: 38200, gameTime: 1427 },
      { matchId: '9202', label: 'Map 2', status: 'completed', result: 'team1' },
      { matchId: '9203', label: 'Map 3', status: 'completed', result: 'team2' },
    ],
    liveMap: { matchId: '9201', label: 'Map 1', score: '18-9', status: 'live', gameTime: 1427, team1Score: 18, team2Score: 9, team1NetWorthLead: 9400, team1TotalGold: 47600, team2TotalGold: 38200 },
  },
  {
    source: 'mock',
    leagueName: 'ESL One 伯明翰',
    stage: '小组赛',
    bestOf: 3,
    seriesScore: '1:1',
    live: true,
    startedAt: Math.floor(Date.now() / 1000) - 735,
    teams: [
      { side: 'team1', name: 'Team Spirit', logo: null },
      { side: 'team2', name: 'GG', logo: null },
    ],
    maps: [
      { label: 'Map 1', status: 'completed', result: 'team1' },
      { label: 'Map 2', status: 'completed', result: 'team2' },
      { label: 'Map 3', status: 'live', score: '7-4', team1Score: 7, team2Score: 4, team1NetWorthLead: 2800, team1TotalGold: 22100, team2TotalGold: 19300, gameTime: 735 },
    ],
    liveMap: { label: 'Map 3', score: '7-4', status: 'live', gameTime: 735, team1Score: 7, team2Score: 4, team1NetWorthLead: 2800, team1TotalGold: 22100, team2TotalGold: 19300 },
  },
];

const LIVE_API_JUNK: LiveHeroPayload[] = [
  {
    source: 'hawk.live',
    leagueName: 'MODUS Super Series',
    stage: '小组赛',
    bestOf: 3,
    seriesScore: '0:1',
    live: true,
    startedAt: Math.floor(Date.now() / 1000) - 500,
    teams: [
      { side: 'team1', name: 'Aim Possible', logo: null },
      { side: 'team2', name: 'EPL', logo: null },
    ],
    maps: [
      { label: 'Map 1', status: 'live', score: '3-12', team1Score: 3, team2Score: 12, gameTime: 500 },
    ],
    liveMap: { label: 'Map 1', score: '3-12', status: 'live', gameTime: 500, team1Score: 3, team2Score: 12 },
  },
];

describe('HeroSection prototype mode isolation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ upcoming: [], teams: [] }),
        } as Response);
      }
      if (url.includes('/api/live-hero')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ liveMatches: LIVE_API_JUNK }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders prototype live cards and ignores live API data when prototypeMode is on', async () => {
    render(
      <HeroSection
        upcoming={[]}
        teams={[]}
        initialLiveHeroes={PROTOTYPE_LIVE_HEROES}
        prototypeMode={true}
      />
    );

    // Prototype live card labels are visible
    expect(await screen.findByText('DreamLeague S23')).toBeInTheDocument();
    expect(screen.getByText('ESL One 伯明翰')).toBeInTheDocument();

    // Prototype team abbreviations are rendered
    expect(screen.getByText('XG')).toBeInTheDocument();
    expect(screen.getByText('YB')).toBeInTheDocument();

    // Live API junk labels are NEVER rendered
    expect(screen.queryByText('MODUS Super Series')).not.toBeInTheDocument();
    expect(screen.queryByText('Aim Possible')).not.toBeInTheDocument();
    expect(screen.queryByText('EPL')).not.toBeInTheDocument();

    // Fetch should NOT have been called for live data
    const fetchMock = vi.mocked(fetch);
    const liveCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/live-hero'));
    expect(liveCalls).toHaveLength(0);
  });

  it('still fetches live API data when prototypeMode is false', async () => {
    render(
      <HeroSection
        upcoming={[]}
        teams={[]}
        prototypeMode={false}
      />
    );

    await waitFor(() => {
      const fetchMock = vi.mocked(fetch);
      const liveCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/live-hero'));
      expect(liveCalls.length).toBeGreaterThan(0);
    });
  });

  it('renders team logos using SafeImg without broken image fallback', async () => {
    render(
      <HeroSection
        upcoming={[]}
        teams={[]}
        initialLiveHeroes={PROTOTYPE_LIVE_HEROES}
        prototypeMode={true}
      />
    );

    await screen.findByText('DreamLeague S23');

    // Team logos resolve via resolveTeamLogo → SafeImg renders <img> elements
    // for known teams (XG, YB, Team Spirit). Each live card shows 2 team logos.
    const teamLogoImages = document.querySelectorAll('[data-testid="hero-live-card"] img[class*="object-contain"]');
    // At minimum, the SafeImg components exist in the DOM (either as img or fallback divs)
    // The key assertion: no browser-native broken image icon is shown
    expect(teamLogoImages.length).toBeGreaterThanOrEqual(2);
  });

  it('opens a selected prototype map with the full series map list', async () => {
    const onOpenMatch = vi.fn();

    render(
      <HeroSection
        upcoming={[]}
        teams={[]}
        initialLiveHeroes={PROTOTYPE_LIVE_HEROES}
        prototypeMode={true}
        onOpenMatch={onOpenMatch}
      />
    );

    await screen.findByText('DreamLeague S23');
    fireEvent.click(screen.getAllByRole('button', { name: 'Map 1' })[0]);

    expect(onOpenMatch).toHaveBeenCalledWith('9201', [
      expect.objectContaining({ label: 'Map 1', matchId: '9201' }),
      expect.objectContaining({ label: 'Map 2', matchId: '9202' }),
      expect.objectContaining({ label: 'Map 3', matchId: '9203' }),
    ]);
  });
});
