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

vi.mock('@/sections/TournamentSection', () => ({
  TournamentSection: () => <div>赛事列表</div>,
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

  it('only passes prototype live fixtures when prototype mode is enabled', () => {
    render(<HomeDashboard />);

    expect(heroSectionSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      initialLiveHeroes: undefined,
      prototypeMode: false,
    }));

    cleanup();
    heroSectionSpy.mockClear();
    window.history.pushState({}, '', '/?prototype=1');

    render(<HomeDashboard />);

    expect(heroSectionSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      prototypeMode: true,
    }));
    expect(heroSectionSpy.mock.calls.at(-1)?.[0].initialLiveHeroes).toHaveLength(3);
  });
});
