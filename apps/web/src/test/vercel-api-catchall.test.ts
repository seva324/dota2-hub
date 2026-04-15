import { afterEach, describe, expect, it, vi } from 'vitest';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn(function status(this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function json(this: { body: unknown }, payload: unknown) {
      this.body = payload;
      return this;
    }),
  };
}

describe('Vercel catch-all API route', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../../../lib/api-handlers/asset-image.js');
    vi.doUnmock('../../../../lib/api-handlers/heroes.js');
  });

  it('dispatches consolidated API routes to their moved handler modules', async () => {
    const heroesHandler = vi.fn(async (_req, res) => res.status(200).json({ ok: true }));
    vi.doMock('../../../../lib/api-handlers/heroes.js', () => ({
      default: heroesHandler,
    }));

    const { default: handler } = await import('../../../../api/[...path].js');
    const res = createResponse();

    await handler({ method: 'GET', url: '/api/heroes', query: { path: ['heroes'] } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(heroesHandler).toHaveBeenCalledOnce();
  });

  it('dispatches the asset image proxy through the consolidated catch-all route', async () => {
    const assetImageHandler = vi.fn(async (_req, res) => res.status(200).json({ ok: true, route: 'asset-image' }));
    vi.doMock('../../../../lib/api-handlers/asset-image.js', () => ({
      default: assetImageHandler,
    }));

    const { default: handler } = await import('../../../../api/[...path].js');
    const res = createResponse();

    await handler({ method: 'GET', url: '/api/asset-image', query: { path: ['asset-image'] } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, route: 'asset-image' });
    expect(assetImageHandler).toHaveBeenCalledOnce();
  });

  it('returns 404 for unknown consolidated API routes', async () => {
    const { default: handler } = await import('../../../../api/[...path].js');
    const res = createResponse();

    await handler({ method: 'GET', url: '/api/unknown', query: { path: ['unknown'] } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'API route not found' });
  });
});
