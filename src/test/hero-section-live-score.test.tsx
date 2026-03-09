import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';

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
              startedAt: '2026-03-08T15:00:00.000000Z',
              teams: [
                { side: 'team1', name: 'Aurora', logo: 'https://hawk.live/storage/teams/6274.png' },
                { side: 'team2', name: 'Heroic', logo: 'https://hawk.live/storage/teams/6398.png' },
              ],
              maps: [
                { label: 'Map 1', score: '22 - 30', status: 'completed' },
                { label: 'Map 2', score: '28 - 17', status: 'completed' },
                { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738, team1NetWorthLead: 8400, team2NetWorthLead: null },
              ],
              liveMap: { label: 'Map 3', score: '14 - 11', status: 'live', gameTime: 1738, team1Score: 14, team2Score: 11, team1NetWorthLead: 8400, team2NetWorthLead: null },
              live: true,
              source: 'hawk.live',
              sourceUrl: 'https://hawk.live/dota-2/matches/pgl-wallachia-season-7-group-stage/aurora-vs-heroic',
            },
            liveMatches: [
              {
                leagueName: 'PGL Wallachia Season 7: Group Stage',
                bestOf: 'BO3',
                seriesScore: '1 - 1',
                startedAt: '2026-03-08T15:00:00.000000Z',
                teams: [
                  { side: 'team1', name: 'Aurora', logo: 'https://hawk.live/storage/teams/6274.png' },
                  { side: 'team2', name: 'Heroic', logo: 'https://hawk.live/storage/teams/6398.png' },
                ],
                maps: [
                  { label: 'Map 1', score: '22 - 30', status: 'completed' },
                  { label: 'Map 2', score: '28 - 17', status: 'completed' },
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
            ],
          }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));
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

    fireEvent.click(within(cards[1]).getByRole('button', { name: /map 1/i }));
    await waitFor(() => {
      expect(within(cards[1]).getByText('22')).toBeInTheDocument();
      expect(within(cards[1]).getByText('30')).toBeInTheDocument();
    });
    expect(within(cards[1]).getAllByText('Map 1 已结束')).toHaveLength(2);
    expect(within(cards[1]).queryByText('时长 28:58')).not.toBeInTheDocument();
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
    expect(screen.queryByText('直播对局')).not.toBeInTheDocument();
    expect(screen.getByText('DreamLeague')).toBeInTheDocument();
  });
});
