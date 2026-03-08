import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureHeroLiveScoresTable = vi.fn();
const getLiveHeroPayload = vi.fn();

vi.mock('../../lib/server/hero-live-score-cache.js', () => ({
  ensureHeroLiveScoresTable,
}));

vi.mock('../../lib/server/live-hero-service.js', () => ({
  getLiveHeroPayload,
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => ({ query: vi.fn() })),
}));

function createRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 200,
    payload: null as unknown,
    setHeader(key: string, value: string) {
      headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe('/api/live-hero', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    ensureHeroLiveScoresTable.mockReset();
    getLiveHeroPayload.mockReset();
  });

  it('returns the live hero payload', async () => {
    getLiveHeroPayload.mockResolvedValue({
      leagueName: 'PGL Wallachia Season 7: Group Stage',
      seriesScore: '1 - 1',
      teams: [{ name: 'Aurora' }, { name: 'Heroic' }],
      maps: [],
      live: true,
      source: 'hawk.live',
    });

    const { default: handler } = await import('../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).live?.leagueName).toBe('PGL Wallachia Season 7: Group Stage');
    expect(getLiveHeroPayload).toHaveBeenCalled();
    expect(ensureHeroLiveScoresTable).toHaveBeenCalled();
  });

  it('passes refresh intent and team filters through to the live hero service', async () => {
    getLiveHeroPayload.mockResolvedValue(null);
    const { default: handler } = await import('../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: { refresh: '1', max_age: '90', team_a: 'Aurora', team_b: 'Heroic' } } as never, res as never);

    expect(getLiveHeroPayload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      forceRefresh: true,
      maxAgeSeconds: 90,
      teamA: 'Aurora',
      teamB: 'Heroic',
    }));
    expect((res.payload as any).live).toBeNull();
  });
});
