import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerProfileFlyout } from '@/components/custom/PlayerProfileFlyout';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('PlayerProfileFlyout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  it('uses a bottom sheet on mobile viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/heroes') return createJsonResponse({});
      throw new Error(`Unhandled fetch: ${String(input)}`);
    }));

    render(
      <PlayerProfileFlyout
        open
        onOpenChange={() => {}}
        player={{
          accountId: 70388657,
          playerName: 'Ame',
          realName: 'Wang Chunyu',
          teamId: '1',
          teamName: 'XG',
          signatureHeroes: [],
          mostPlayedHeroes: [],
          recentMatches: [],
        }}
      />
    );

    const dialog = await screen.findByRole('dialog', { name: /Ame/ });

    await waitFor(() => {
      expect(dialog.className).toContain('slide-in-from-bottom');
    });
  });

  it('uses visual placeholders instead of broken hero images when hero metadata is unavailable', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/heroes') return createJsonResponse({});
      throw new Error(`Unhandled fetch: ${String(input)}`);
    }));

    render(
      <PlayerProfileFlyout
        open
        onOpenChange={() => {}}
        player={{
          accountId: 898754153,
          playerName: 'Ame',
          teamName: 'XG',
          signatureHeroes: [{ heroId: 11, games: 28, wins: 21, winRate: 75 }],
          mostPlayedHeroes: [{ heroId: 69, games: 24, wins: 17, winRate: 70.8 }],
          recentMatches: [{
            matchId: 9201,
            startTime: 1_750_000_000,
            tournament: 'DreamLeague S23',
            seriesType: 'BO3',
            teamName: 'XG',
            opponentName: 'Yakult Brothers',
            teamPicks: [11, 69, 1],
            playerHeroId: 11,
            won: true,
          }],
        }}
      />
    );

    const dialog = await screen.findByRole('dialog', { name: /Ame/ });
    expect(dialog).toBeInTheDocument();
    expect(screen.queryByAltText('Hero 11')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Hero 69')).not.toBeInTheDocument();
  });
});
