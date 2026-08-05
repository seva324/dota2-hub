import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamsPage } from '@/pages/TeamsPage';

function buildTeams(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    rank: index + 1,
    name: `Team ${index + 1}`,
    logo: null,
    teamUrl: null,
    players: [],
  }));
}

function createFetchStub(teams: ReturnType<typeof buildTeams>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/team-ranking') {
      return {
        ok: true,
        json: async () => ({ teams, updatedAt: undefined }),
      } as Response;
    }
    throw new Error(`Unhandled fetch: ${url}`);
  });
}

describe('TeamsPage expand list', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', createFetchStub(buildTeams(25)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only the top 10 teams by default', async () => {
    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByText('Team 10')).toBeTruthy());
    expect(screen.queryByText('Team 11')).toBeNull();
    expect(screen.queryByText('Team 25')).toBeNull();
    expect(screen.getByText('展开更多（剩余 15 支）')).toBeTruthy();
  });

  it('expands 10 more teams on each click and hides the button once all are shown', async () => {
    render(<TeamsPage />);

    await waitFor(() => expect(screen.getByText('Team 10')).toBeTruthy());

    fireEvent.click(screen.getByText('展开更多（剩余 15 支）'));
    await waitFor(() => expect(screen.getByText('Team 20')).toBeTruthy());
    expect(screen.queryByText('Team 21')).toBeNull();
    expect(screen.getByText('展开更多（剩余 5 支）')).toBeTruthy();

    fireEvent.click(screen.getByText('展开更多（剩余 5 支）'));
    await waitFor(() => expect(screen.getByText('Team 25')).toBeTruthy());
    expect(screen.queryByText(/展开更多/)).toBeNull();
  });
});
