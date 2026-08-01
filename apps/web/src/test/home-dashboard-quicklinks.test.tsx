import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: ({ matchId, open }: { matchId: number; open: boolean }) => (
    open ? <div role="dialog">比赛详情 {matchId}</div> : null
  ),
}));

vi.mock('@/components/custom/TeamFlyout', () => ({
  TeamFlyout: ({ open, selectedTeam }: { open: boolean; selectedTeam: { name: string } | null }) => (
    open ? <div role="dialog">战队详情 {selectedTeam?.name}</div> : null
  ),
}));

vi.mock('@/components/custom/PlayerProfileFlyout', () => ({
  PlayerProfileFlyout: ({ open, player }: { open: boolean; player: { playerName: string } | null }) => (
    open ? <div role="dialog">选手详情 {player?.playerName ?? 'loading'}</div> : null
  ),
}));

vi.mock('@/lib/playerProfile', () => ({
  createMinimalPlayerFlyoutModel: vi.fn((accountId: number) => ({
    accountId,
    playerName: String(accountId),
    realName: null,
    chineseName: null,
    nationality: null,
    teamId: null,
    teamName: null,
    teamLogoUrl: null,
    avatarUrl: null,
    birthDate: null,
    birthMonth: null,
    birthYear: null,
    age: null,
    winRate: null,
    signatureHeroes: [],
    signatureHero: null,
    mostPlayedHeroes: [],
    nextMatch: null,
    recentMatches: [],
  })),
  fetchPlayerProfileFlyoutModel: vi.fn(async () => null),
}));

import { HomeDashboard } from '@/sections/HomeDashboard';
import type { RouteState } from '@/lib/hashRouter';

const LIVE_HERO = {
  source: 'test',
  leagueName: 'DreamLeague S24',
  stage: '小组赛',
  bestOf: 3,
  seriesScore: '1:0',
  live: true,
  startedAt: Math.floor(Date.now() / 1000) - 600,
  teams: [
    { side: 'team1', name: 'Team Spirit', logo: null },
    { side: 'team2', name: 'Team Falcons', logo: null },
  ],
  maps: [
    { matchId: 90001, label: 'Map 1', score: '18-9', status: 'live', team1Score: 18, team2Score: 9, gameTime: 1427 },
    { matchId: 90002, label: 'Map 2', score: '24-16', status: 'completed', result: 'team1' },
  ],
  liveMap: { matchId: 90001, label: 'Map 1', score: '18-9', status: 'live', gameTime: 1427, team1Score: 18, team2Score: 9 },
};

function renderControlledHomeDashboard() {
  const navigate = vi.fn();
  const closeOverlay = vi.fn();
  const initialRoute: RouteState = { page: 'home', overlay: null };
  const { rerender } = render(
    <HomeDashboard route={initialRoute} navigate={navigate} closeOverlay={closeOverlay} />,
  );
  return { navigate, closeOverlay, rerender };
}

function overlayRoute(overlay: RouteState['overlay']): RouteState {
  return { page: 'home', overlay };
}

describe('HomeDashboard quick links', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/upcoming?limit=12&days=2') {
        return {
          ok: true,
          json: async () => ({ upcoming: [] }),
        } as Response;
      }
      if (url === '/api/live-hero') {
        return {
          ok: true,
          json: async () => ({ liveMatches: [LIVE_HERO] }),
        } as Response;
      }
      if (url === '/api/matches?limit=24') {
        return {
          ok: true,
          json: async () => ([]),
        } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }));
  });

  it('opens match detail surface from a live match card', async () => {
    const { rerender } = renderControlledHomeDashboard();

    const matchButtons = await screen.findAllByRole('button', { name: /观看/ });
    expect(matchButtons.length).toBeGreaterThan(0);
    fireEvent.click(matchButtons[0]);
    rerender(<HomeDashboard route={overlayRoute({ type: 'match', matchId: '90001' })} navigate={vi.fn()} closeOverlay={vi.fn()} />);
    expect(screen.getByText('比赛详情 90001')).toBeInTheDocument();
  });
});
