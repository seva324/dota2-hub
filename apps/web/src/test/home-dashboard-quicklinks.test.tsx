import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { heroSectionSpy } = vi.hoisted(() => ({
  heroSectionSpy: vi.fn(),
}));

vi.mock('@/sections/HeroSection', () => ({
  HeroSection: (props: {
    onOpenMatch?: (matchId: number) => void;
    initialLiveHeroes?: unknown[];
    prototypeMode?: boolean;
  }) => {
    heroSectionSpy(props);
    return (
      <button type="button" onClick={() => props.onOpenMatch?.(123456)}>
        打开测试比赛
      </button>
    );
  },
}));

vi.mock('@/sections/MatchesDashboard', () => ({
  MatchesDashboard: () => <div>赛事列表</div>,
}));

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
  fetchPlayerProfileFlyoutModel: vi.fn(async (accountId: number) => ({
    accountId,
    playerName: 'Ame',
    teamName: 'XG',
    signatureHeroes: [],
    mostPlayedHeroes: [],
    recentMatches: [],
  })),
}));

import { HomeDashboard } from '@/sections/HomeDashboard';
import { fetchPlayerProfileFlyoutModel } from '@/lib/playerProfile';

describe('HomeDashboard quick links', () => {
  beforeEach(() => {
    heroSectionSpy.mockClear();
    window.history.pushState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/ept-ranking') {
        return {
          ok: true,
          json: async () => ({ teams: [] }),
        } as Response;
      }
      if (url === '/api/upcoming?limit=3') {
        return {
          ok: true,
          json: async () => ({ upcoming: [] }),
        } as Response;
      }
      if (url === '/api/live-hero') {
        return {
          ok: true,
          json: async () => ({ liveMatches: [] }),
        } as Response;
      }
      if (url === '/api/news') {
        return {
          ok: true,
          json: async () => ([]),
        } as Response;
      }
      if (url.startsWith('/api/pro-players?account_id=')) {
        const accountId = Number(url.split('=').pop());
        return {
          ok: true,
          json: async () => ({
            name: accountId === 898754153 ? 'Ame' : `Player ${accountId}`,
            team_name: 'XG',
            country_code: 'CN',
            avatar_url: null,
          }),
        } as Response;
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }));
  });

  it('opens match, team, and player detail surfaces from visible dashboard controls', async () => {
    render(<HomeDashboard />);

    fireEvent.click(screen.getByRole('button', { name: '打开测试比赛' }));
    expect(screen.getByText('比赛详情 123456')).toBeInTheDocument();

    const teamSpiritButtons = screen.getAllByRole('button', { name: /Team Spirit/ });
    fireEvent.click(teamSpiritButtons[0]);
    expect(screen.getByText('战队详情 Team Spirit')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ame/ }));

    await waitFor(() => {
      expect(screen.getByText('选手详情 Ame')).toBeInTheDocument();
    });
  });

  it('keeps the curated hot player name when the profile API only returns the account id', async () => {
    vi.mocked(fetchPlayerProfileFlyoutModel).mockResolvedValueOnce({
      accountId: 898754153,
      playerName: '898754153',
      teamName: null,
      signatureHeroes: [],
      mostPlayedHeroes: [],
      recentMatches: [],
    });

    render(<HomeDashboard />);

    fireEvent.click(screen.getByRole('button', { name: /Ame/ }));

    await waitFor(() => {
      expect(screen.getByText('选手详情 Ame')).toBeInTheDocument();
    });
    expect(screen.queryByText('选手详情 898754153')).not.toBeInTheDocument();
  });

  it('does not render HeroSection when prototype mode is enabled', () => {
    render(<HomeDashboard />);

    expect(heroSectionSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      prototypeMode: false,
    }));

    cleanup();
    heroSectionSpy.mockClear();
    window.history.pushState({}, '', '/?prototype=1');

    render(<HomeDashboard />);

    expect(heroSectionSpy).not.toHaveBeenCalled();
  });
});
