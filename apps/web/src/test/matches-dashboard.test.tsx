import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MatchesDashboard } from '@/sections/MatchesDashboard';

describe('MatchesDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/upcoming')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            upcoming: [],
          }),
        } as Response);
      }

      if (url.includes('/api/matches')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            {
              match_id: '9101',
              series_id: 'series-xg-spirit',
              radiant_team_id: '1',
              dire_team_id: '2',
              radiant_team_name: 'Xtreme Gaming',
              dire_team_name: 'Team Spirit',
              radiant_team_logo: '/xg.png',
              dire_team_logo: '/spirit.png',
              radiant_score: 18,
              dire_score: 30,
              radiant_win: 0,
              start_time: 1710000000,
              tournament_name: 'DreamLeague S23',
            },
            {
              match_id: '9102',
              series_id: 'series-xg-spirit',
              radiant_team_id: '2',
              dire_team_id: '1',
              radiant_team_name: 'Team Spirit',
              dire_team_name: 'Xtreme Gaming',
              radiant_team_logo: '/spirit.png',
              dire_team_logo: '/xg.png',
              radiant_score: 19,
              dire_score: 24,
              radiant_win: 0,
              start_time: 1710003600,
              tournament_name: 'DreamLeague S23',
            },
            {
              match_id: '9103',
              series_id: 'series-xg-spirit',
              radiant_team_id: '1',
              dire_team_id: '2',
              radiant_team_name: 'Xtreme Gaming',
              dire_team_name: 'Team Spirit',
              radiant_team_logo: '/xg.png',
              dire_team_logo: '/spirit.png',
              radiant_score: 31,
              dire_score: 20,
              radiant_win: 1,
              start_time: 1710007200,
              tournament_name: 'DreamLeague S23',
            },
          ]),
        } as Response);
      }

      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders finished results as aggregated series scores even when sides swap between maps', async () => {
    render(<MatchesDashboard />);

    expect(await screen.findByText('近期赛果')).toBeInTheDocument();

    const row = await waitFor(() => screen.getByRole('button', { name: /Xtreme Gaming.*Team Spirit/i }));
    expect(within(row).getByText('Xtreme Gaming')).toBeInTheDocument();
    expect(within(row).getByText('Team Spirit')).toBeInTheDocument();
    expect(within(row).getByText('DreamLeague S23')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('1')).toBeInTheDocument();
  });
});
