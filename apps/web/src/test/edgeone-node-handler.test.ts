import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveApiTarget } from '../../../../lib/server/edgeone-api-router.js';

describe('resolveApiTarget', () => {
  it('maps /api/mp/* requests onto the matches handler rewrite target', () => {
    expect(resolveApiTarget('/api/mp/home')).toEqual({
      key: 'matches',
      routePath: '/api/mp/home',
      queryOverrides: { __mp: 'home' },
    });
  });

  it('maps legacy cron aliases onto /api/cron actions', () => {
    expect(resolveApiTarget('/api/sync-news')).toEqual({
      key: 'cron',
      routePath: '/api/sync-news',
      queryOverrides: { action: 'sync-news' },
    });

    expect(resolveApiTarget('/api/sync-liquipedia')).toEqual({
      key: 'cron',
      routePath: '/api/sync-liquipedia',
      queryOverrides: { action: 'sync-liquipedia' },
    });
  });

  it('maps /api/tournament-background onto the dedicated artwork proxy handler', () => {
    expect(resolveApiTarget('/api/tournament-background')).toEqual({
      key: 'tournament-background',
      routePath: '/api/tournament-background',
      queryOverrides: {},
    });
  });
});

describe('runEdgeOneApiRequest', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../../api/cron.js');
    vi.doUnmock('../../../../api/matches.js');
    vi.doUnmock('../../../../lib/api-handlers/tournament-background.js');
  });

  it('returns 404 for unknown API routes', async () => {
    const { runEdgeOneApiRequest } = await import('../../../../lib/server/edgeone-node-handler.js');
    const response = await runEdgeOneApiRequest(new Request('https://edgeone.example/api/unknown'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'API route not found',
      path: '/api/unknown',
    });
  });

  it('passes sync-news alias requests through the cron handler with the expected action', async () => {
    const cronHandler = vi.fn(async (req, res) => {
      return res.status(200).json({ ok: true, action: req.query.action });
    });

    vi.doMock('../../../../api/cron.js', () => ({
      default: cronHandler,
    }));

    const { runEdgeOneApiRequest } = await import('../../../../lib/server/edgeone-node-handler.js');
    const response = await runEdgeOneApiRequest(new Request('https://edgeone.example/api/sync-news'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, action: 'sync-news' });
    expect(cronHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        query: expect.objectContaining({ action: 'sync-news' }),
      }),
      expect.any(Object),
    );
  });

  it('passes /api/mp/* requests through the matches handler with __mp populated', async () => {
    const matchesHandler = vi.fn(async (req, res) => {
      return res.status(200).json({ ok: true, route: req.query.__mp });
    });

    vi.doMock('../../../../api/matches.js', () => ({
      default: matchesHandler,
    }));

    const { runEdgeOneApiRequest } = await import('../../../../lib/server/edgeone-node-handler.js');
    const response = await runEdgeOneApiRequest(new Request('https://edgeone.example/api/mp/tournament/league-1?limit=5'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      route: 'tournament/league-1',
    });
    expect(matchesHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          __mp: 'tournament/league-1',
          limit: '5',
        }),
      }),
      expect.any(Object),
    );
  });

  it('passes /api/tournament-background through the tournament background handler', async () => {
    const tournamentBackgroundHandler = vi.fn(async (req, res) => {
      return res.status(200).json({ ok: true, slug: req.query.slug });
    });

    vi.doMock('../../../../lib/api-handlers/tournament-background.js', () => ({
      default: tournamentBackgroundHandler,
    }));

    const { runEdgeOneApiRequest } = await import('../../../../lib/server/edgeone-node-handler.js');
    const response = await runEdgeOneApiRequest(new Request('https://edgeone.example/api/tournament-background?slug=dreamleague'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      slug: 'dreamleague',
    });
    expect(tournamentBackgroundHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          slug: 'dreamleague',
        }),
      }),
      expect.any(Object),
    );
  });
});
