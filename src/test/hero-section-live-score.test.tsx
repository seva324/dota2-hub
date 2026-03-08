import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeroSection } from '@/sections/HeroSection';

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
              { team_id: '1', name: 'Xtreme Gaming', region: 'China' },
              { team_id: '2', name: 'Team Spirit', region: 'Eastern Europe' },
            ],
          }),
        } as Response);
      }
      if (url.includes('/api/live-hero')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            live: {
              leagueName: 'PGL Wallachia Season 7: Group Stage',
              bestOf: 'BO3',
              seriesScore: '1 - 1',
              teams: [
                { side: 'team1', name: 'Aurora', logo: 'https://hawk.live/storage/teams/6274.png' },
                { side: 'team2', name: 'Heroic', logo: 'https://hawk.live/storage/teams/6398.png' },
              ],
              maps: [
                { label: 'Map 1', score: '0 - 1', status: 'completed' },
                { label: 'Map 2', score: '1 - 1', status: 'completed' },
                { label: 'Map 3', score: '1 - 1', status: 'live' },
              ],
              liveMap: { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738 },
              live: true,
              source: 'hawk.live',
              sourceUrl: 'https://hawk.live/dota-2/matches/pgl-wallachia-season-7-group-stage/aurora-vs-heroic',
            },
          }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));
  });

  it('renders the live spotlight card and the CN upcoming preview together', async () => {
    render(<HeroSection upcoming={[]} teams={[]} />);

    expect(await screen.findByText('PGL Wallachia Season 7: Group Stage')).toBeInTheDocument();
    expect(screen.getByText('Aurora')).toBeInTheDocument();
    expect(screen.getByText('Heroic')).toBeInTheDocument();
    expect(screen.getByText('14 - 11')).toBeInTheDocument();
    expect(screen.getByTestId('hero-live-maps')).toHaveTextContent('Map 1');
    expect(screen.getByText('中国战队预告')).toBeInTheDocument();
    expect(screen.getByText('DreamLeague')).toBeInTheDocument();
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
              { team_id: '1', name: 'Xtreme Gaming', region: 'China' },
              { team_id: '2', name: 'Team Spirit', region: 'Eastern Europe' },
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
    expect(screen.queryByText('Hero 焦点比分')).not.toBeInTheDocument();
    expect(screen.getByText('DreamLeague')).toBeInTheDocument();
  });
});
