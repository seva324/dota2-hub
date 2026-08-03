import { beforeEach, describe, expect, it, vi } from 'vitest';

const getLiveHeroPayloads = vi.fn();

vi.mock('../../../../lib/server/live-hero-service.js', () => ({
  getLiveHeroPayloads,
}));

vi.mock('../../../../lib/db.js', () => ({
  getDb: () => null,
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

const LIVE_PAYLOAD = {
  source: 'hawk.live',
  sourceSeriesId: '427391',
  leagueName: 'Games of the Future 2026',
  bestOf: 'BO3',
  live: true,
  startedAt: null,
  seriesScore: '1 - 1',
  teams: [
    { side: 'team1', name: 'ENJOY', logo: '/logo-a.png' },
    { side: 'team2', name: 'Yakult Brothers', logo: '/logo-b.png' },
  ],
  maps: [],
  liveMap: {
    label: 'Map 1',
    status: 'live',
    team1Score: 28,
    team2Score: 12,
    gameTime: 1683,
  },
};

describe('/api/live-hero', () => {
  beforeEach(() => {
    vi.resetModules();
    getLiveHeroPayloads.mockReset();
  });

  it('returns the live hero payload mapped from HAWK', async () => {
    getLiveHeroPayloads.mockResolvedValue([LIVE_PAYLOAD]);

    const { default: handler } = await import('../../../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.live?.leagueName).toBe('Games of the Future 2026');
    expect(payload.live?.seriesScore).toBe('1 - 1');
    expect(payload.live?.teams).toHaveLength(2);
    expect(payload.live?.teams[0].name).toBe('ENJOY');
    expect(payload.live?.liveMap?.team1Score).toBe(28);
    expect(payload.liveMatches).toHaveLength(1);
    expect(payload.meta.liveCount).toBe(1);
    expect(payload.meta.source).toBe('hawk');
  });

  it('passes refresh intent and the request context to the service', async () => {
    getLiveHeroPayloads.mockResolvedValue([]);
    const { default: handler } = await import('../../../../api/live-hero.js');
    const res = createRes();
    const req = { method: 'GET', query: { refresh: '1' } };

    await handler(req as never, res as never);

    expect(getLiveHeroPayloads).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ forceRefresh: true, maxAgeSeconds: 180, req }),
    );
    expect((res.payload as any).live).toBeNull();
    expect((res.payload as any).liveMatches).toEqual([]);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns an empty envelope when there are no live matches', async () => {
    getLiveHeroPayloads.mockResolvedValue([]);
    const { default: handler } = await import('../../../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect((res.payload as any).live).toBeNull();
    expect((res.payload as any).liveMatches).toEqual([]);
    expect((res.payload as any).meta.hasLive).toBe(false);
  });
});
