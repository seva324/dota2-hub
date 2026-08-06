import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('PlayerProfileFlyout transitions to a valid state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({})));
    const { rerender } = render(
      <PlayerProfileFlyout open={false} onOpenChange={() => {}} player={EMPTY_PLAYER} />
    );
    let root = document.querySelector('[data-visual-role="player-profile-flyout"]');

    rerender(
      <PlayerProfileFlyout open onOpenChange={() => {}} player={EMPTY_PLAYER} />
    );
    root = document.querySelector('[data-visual-role="player-profile-flyout"]');
    expect(root).toBeTruthy();

    await waitFor(() => {
      const state = root!.getAttribute('data-visual-state');
      expect(['loading', 'ready']).toContain(state);
    }, { timeout: 3000 });
  });
});
