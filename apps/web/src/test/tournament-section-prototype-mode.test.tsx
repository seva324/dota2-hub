import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prevent the TournamentSection bootstrap from making real API calls
vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: () => null,
}));
vi.mock('@/components/custom/PlayerProfileFlyout', () => ({
  PlayerProfileFlyout: () => null,
}));
vi.mock('@/components/custom/TeamFlyout', () => ({
  TeamFlyout: () => null,
}));
vi.mock('@/lib/playerProfile', () => ({
  createMinimalPlayerFlyoutModel: vi.fn(),
  fetchPlayerProfileFlyoutModel: vi.fn(),
}));

import { TournamentSection } from '@/sections/TournamentSection';

describe('TournamentSection prototype mode completed rows', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (url === '/api/tournaments') {
        return { ok: true, json: async () => ({ tournaments: [] }) } as Response;
      }
      if (url === '/api/teams') {
        return { ok: true, json: async () => [] } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders finished match rows with readable team names and scores', async () => {
    render(
      <TournamentSection
        tournaments={[]}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
        prototypeMode={true}
      />
    );

    // Section heading is present
    expect(await screen.findByText('已结束的比赛')).toBeInTheDocument();

    // Finished rows contain readable team and score labels (some teams/scores appear
    // in both upcoming and finished sections, so use getAllByText for deduped labels)
    expect(screen.getAllByText('XG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('YB').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('胜利').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('2 - 0').length).toBeGreaterThanOrEqual(2);

    expect(screen.getAllByText('Team Spirit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('9Pandas').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2 - 1')).toBeInTheDocument();

    expect(screen.getAllByText('Falcons').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Nigma Galaxy')).toBeInTheDocument();

    expect(screen.getAllByText('Aurora').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BetBoom').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0 - 2')).toBeInTheDocument();
    expect(screen.getByText('失败')).toBeInTheDocument();

    // Duration labels are present (not empty) — format MM:SS
    const durations = screen.getAllByText(/^\d{2}:\d{2}$/);
    expect(durations.length).toBeGreaterThanOrEqual(4);

    // "即将开始" section is also present
    expect(screen.getByText('即将开始')).toBeInTheDocument();
  });

  it('renders finished match rows with mobile-readable structure (no cramped grid, draft visible)', async () => {
    render(
      <TournamentSection
        tournaments={[]}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
        prototypeMode={true}
      />
    );

    await screen.findByText('已结束的比赛');

    // Draft text is visible at all widths (was hidden on mobile in old layout)
    expect(screen.getByText(/Ban 12\s+Pick 24/)).toBeInTheDocument();
    expect(screen.getByText(/Ban 18\s+Pick 30/)).toBeInTheDocument();
    expect(screen.getByText(/Ban 10\s+Pick 22/)).toBeInTheDocument();
    expect(screen.getByText(/Ban 11\s+Pick 24/)).toBeInTheDocument();

    // Each row exposes event/date, teams, score, duration, and draft in separate blocks
    const eventLabels = screen.getAllByText(/DreamLeague S23|ESL One|PGL Wallachia/);
    expect(eventLabels.length).toBeGreaterThanOrEqual(4);

    const times = screen.getAllByText(/^\d{2}-\d{2}\s/);
    expect(times.length).toBeGreaterThanOrEqual(4);

    const scores = screen.getAllByText(/^\d\s-\s\d$/);
    expect(scores.length).toBeGreaterThanOrEqual(4);

    const durations = screen.getAllByText(/^\d{2}:\d{2}$/);
    expect(durations.length).toBeGreaterThanOrEqual(4);

    // Team labels present in separate blocks
    expect(screen.getAllByText('XG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('YB').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Falcons').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Aurora').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BetBoom').length).toBeGreaterThanOrEqual(1);
  });

  it('does not call tournament bootstrap API when prototypeMode is on', async () => {
    render(
      <TournamentSection
        tournaments={[]}
        teams={[]}
        allMatches={[]}
        upcoming={[]}
        prototypeMode={true}
      />
    );

    expect(await screen.findByText('已结束的比赛')).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    const tournamentCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).includes('/api/tournaments?tournamentId=')
    );
    expect(tournamentCalls).toHaveLength(0);
  });
});
