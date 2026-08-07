import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDetailPage } from '@/pages/TeamDetailPage';
import { __resetApiCache } from '@/lib/api-cache';

function createJsonResponse(payload: unknown) {
  return { ok: true, json: async () => payload } as Response;
}

const BASE_PAYLOAD = {
  meta: { capturedAt: '2026-08-06T00:00:00Z' },
  team: { name: 'Team Alpha', slug: 'team-alpha', tag: 'ALP', rank: 3, maps: 100, prize: 100000, winrate3m: 60, logo: null },
  nextMatch: null,
  quickStats: [
    { label: '世界排名', value: '#3' },
    { label: '总地图数', value: '100', unit: 'maps' },
    { label: '赛事奖金', value: '$100,000' },
    { label: '近 3 个月地图', value: '20', unit: 'maps' },
    { label: '近 3 个月胜率', value: '60%' },
  ],
  statsOverview: {
    aggregate: { maps: 20, wins: 12, win_rate: 60, avg_kills: 28.5, avg_deaths: 25.2, avg_assists: 60, first_blood_rate: 40, first_ten_rate: 50, win_first_blood_rate: 70, win_first_ten_rate: 75, avg_time_min: 42 },
  },
  draftStats: {
    firstPick: { name: 'Mirana', count: 4 },
    firstBan: { name: 'Naga Siren', count: 10 },
    topPicks: [
      { name: 'Mirana', img: null, maps: 4, rate: '40.00%', wins: 2, losses: 2 },
      { name: 'Dazzle', img: null, maps: 3, rate: '30.00%', wins: 0, losses: 3 },
    ],
    topBans: [
      { name: 'Naga Siren', img: null, rate: '100.00%', mapsVs: 10 },
      { name: 'Meepo', img: null, rate: '80.00%', mapsVs: 8 },
    ],
  },
  h2h: [
    { opponent: 'Team Beta', slug: 'team-beta', logo: null, series: 1, maps: 2, mapsWon: 2, mapsLost: 0, last: '2026-08-04', winRate: '100%' },
  ],
  recentMatches: [
    { date: '2026-08-04', opponent: 'Team Beta', oppSlug: 'team-beta', oppLogo: null, score: '2 : 1', won: true, durationMin: 42, heroes: ['Mirana'] },
    { date: '2026-08-02', opponent: 'Team Gamma', oppSlug: 'team-gamma', oppLogo: null, score: '0 : 2', won: false, durationMin: 35, heroes: [] },
  ],
  squad: [
    { nick: 'Player 1', playerId: 1, role: '一号位', roleKey: '1', rank: 40, flag: '', country: '', photo: '', sig: [] },
  ],
  achievements: [],
};

describe('TeamDetailPage', () => {
  beforeEach(() => {
    __resetApiCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/team-detail')) return createJsonResponse(BASE_PAYLOAD);
      return createJsonResponse({});
    }));
  });

  it('renders team name and profile header', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Team Alpha' })).toBeTruthy();
    });
  });

  it('requests the team-detail API with name and teamId', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/team-detail?teamId=1&name=Team+Alpha');
    });
  });

  it('renders quick stats bar', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByText('世界排名').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('#3').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders stats overview tiles with win rate', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByText('60%').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders h2h cards', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders recent matches table with result chip', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('2 : 1')).toBeTruthy();
    });
  });

  it('links opponent team names to the internal team detail page instead of dltv.org', async () => {
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      const links = screen.getAllByTitle('查看 Team Beta 资料') as HTMLAnchorElement[];
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        // encodeURIComponent 会把空格编码为 %20，与路由 toHash/parseHash 往返一致
        expect(link.getAttribute('href')).toBe('#/team/Team%20Beta?slug=team-beta');
        expect(link.getAttribute('href')).not.toContain('dltv.org');
        expect(link.getAttribute('target')).not.toBe('_blank');
      }
    });
  });

  it('shows error state on failed request', async () => {
    __resetApiCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    render(<TeamDetailPage teamName="Team Alpha" teamId="1" onBack={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/战队数据暂时无法获取/)).toBeTruthy();
    });
  });
});
