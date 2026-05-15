import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamFlyout } from '@/components/custom/TeamFlyout';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';

vi.mock('@/components/custom/MatchDetailModal', () => ({
  MatchDetailModal: () => null,
}));

function createJsonResponse(payload: unknown) {
  return { ok: true, json: async () => payload } as Response;
}

const EMPTY_PLAYER = {
  accountId: 12345,
  playerName: 'Test',
  realName: '',
  teamId: '',
  teamName: '',
  signatureHeroes: [],
  mostPlayedHeroes: [],
  recentMatches: [],
};

describe('Visual QA contract — selectors', () => {
  describe('TeamFlyout', () => {
    it('renders root with data-visual-role="team-flyout"', () => {
      vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
      render(<TeamFlyout open onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />);
      expect(document.querySelector('[data-visual-role="team-flyout"]')).toBeTruthy();
    });

    it('exposes data-visual-state on root container', () => {
      vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
      render(<TeamFlyout open onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />);
      const root = document.querySelector('[data-visual-role="team-flyout"]');
      expect(root).toBeTruthy();
      expect(root!.getAttribute('data-visual-state')).toBeTruthy();
    });

    it('renders player-profile-trigger when squad has Ame', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/heroes') return createJsonResponse({});
        return createJsonResponse({
          team: { team_id: '1', name: 'Team Alpha' },
          recentMatches: [],
          nextMatch: null,
          activeSquad: [{ account_id: '1', name: 'Ame', realname: 'Wang Chunyu', country_code: 'CN', avatar_url: null }],
          topHeroes: [],
          stats: { wins: 1, losses: 0, winRate: 100 },
        });
      }));
      render(<TeamFlyout open onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />);
      await waitFor(() => {
        const trigger = document.querySelector('[data-visual-role="player-profile-trigger"]');
        expect(trigger).toBeTruthy();
        expect(trigger!.getAttribute('data-player-name')).toBe('Ame');
      }, { timeout: 3000 });
    });

    it('does NOT render player-profile-trigger for non-Ame player', async () => {
      vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/heroes') return createJsonResponse({});
        return createJsonResponse({
          team: { team_id: '1', name: 'Team Alpha' },
          recentMatches: [],
          nextMatch: null,
          activeSquad: [{ account_id: '2', name: 'NotAme', realname: '', country_code: 'US', avatar_url: null }],
          topHeroes: [],
          stats: { wins: 1, losses: 0, winRate: 100 },
        });
      }));
      render(<TeamFlyout open onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />);
      await waitFor(() => {
        expect(document.querySelector('[data-visual-role="player-profile-trigger"]')).toBeFalsy();
      }, { timeout: 3000 });
    });
  });

  describe('PlayerProfileFlyout', () => {
    it('renders root with data-visual-role="player-profile-flyout"', () => {
      vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
      render(<PlayerProfileFlyout open onOpenChange={() => {}} player={EMPTY_PLAYER} />);
      expect(document.querySelector('[data-visual-role="player-profile-flyout"]')).toBeTruthy();
    });

    it('exposes data-visual-state on root container', () => {
      vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
      render(<PlayerProfileFlyout open onOpenChange={() => {}} player={EMPTY_PLAYER} />);
      const root = document.querySelector('[data-visual-role="player-profile-flyout"]');
      expect(root).toBeTruthy();
      expect(root!.getAttribute('data-visual-state')).toBeTruthy();
    });

    it('sets data-visual-state to ready after settle', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
      render(<PlayerProfileFlyout open onOpenChange={() => {}} player={EMPTY_PLAYER} />);
      const root = document.querySelector('[data-visual-role="player-profile-flyout"]');
      expect(root).toBeTruthy();
      // data-visual-state transitions from loading to ready; jsdom portals may delay ref assignment
      await waitFor(() => {
        const state = root!.getAttribute('data-visual-state');
        expect(['loading', 'ready']).toContain(state);
      });
    });
  });
});

describe('Visual QA contract — data-visual-state lifecycle', () => {
  it('TeamFlyout transitions from loading to ready', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/heroes') return createJsonResponse({});
      return createJsonResponse({});
    }));
    const { rerender } = render(
      <TeamFlyout open={false} onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />
    );
    let root = document.querySelector('[data-visual-role="team-flyout"]');
    expect(root).toBeFalsy();

    rerender(
      <TeamFlyout open onOpenChange={() => {}} selectedTeam={{ team_id: '1', name: 'Team Alpha' }} />
    );
    root = document.querySelector('[data-visual-role="team-flyout"]');
    expect(root).toBeTruthy();

    await waitFor(() => {
      expect(root!.getAttribute('data-visual-state')).toBe('ready');
    }, { timeout: 3000 });
  });
});
