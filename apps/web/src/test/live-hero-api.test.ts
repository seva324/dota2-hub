import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDltvLive = vi.fn();

vi.mock('../../../../lib/server/dltv-matches-service.js', () => ({
  getDltvLive,
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

const LIVE_MATCH = {
  seriesId: '427391',
  matchId: '8924126326',
  tournament: 'Games of the Future 2026',
  eventUrl: 'https://dltv.org/events/games-of-the-future-2026',
  matchUrl: 'https://dltv.org/matches/427391/enjoy-vs-yakult-brothers',
  stage: "Losers' Match",
  bestOf: 'BO3',
  radiantName: 'ENJOY',
  direName: 'Yakult Brothers',
  radiantLogo: '/uploads/teams/small/a.png',
  direLogo: '/uploads/teams/small/b.png',
  radiantKills: 28,
  direKills: 12,
  seriesWins1: 1,
  seriesWins2: 1,
  gameTime: 1683,
};

describe('/api/live-hero', () => {
  beforeEach(() => {
    vi.resetModules();
    getDltvLive.mockReset();
  });

  it('returns the live hero payload mapped from DLTV', async () => {
    getDltvLive.mockResolvedValue({ live: [LIVE_MATCH], source: 'dltv' });

    const { default: handler } = await import('../../../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.live?.leagueName).toBe('Games of the Future 2026');
    expect(payload.live?.seriesScore).toBe('1:1');
    expect(payload.live?.teams).toHaveLength(2);
    expect(payload.live?.teams[0].name).toBe('ENJOY');
    expect(payload.live?.liveMap?.team1Score).toBe(28);
    expect(payload.liveMatches).toHaveLength(1);
    expect(payload.meta.liveCount).toBe(1);
    expect(payload.meta.source).toBe('dltv');
  });

  it('passes refresh intent to the service', async () => {
    getDltvLive.mockResolvedValue({ live: [], source: 'cache' });
    const { default: handler } = await import('../../../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: { refresh: '1' } } as never, res as never);

    expect(getDltvLive).toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true }));
    expect((res.payload as any).live).toBeNull();
    expect((res.payload as any).liveMatches).toEqual([]);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns an empty envelope when there are no live matches', async () => {
    getDltvLive.mockResolvedValue({ live: [], source: 'dltv' });
    const { default: handler } = await import('../../../../api/live-hero.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect((res.payload as any).live).toBeNull();
    expect((res.payload as any).liveMatches).toEqual([]);
    expect((res.payload as any).meta.hasLive).toBe(false);
  });
});
