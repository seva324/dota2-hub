import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDltvUpcoming = vi.fn();

vi.mock('../../../../lib/server/dltv-matches-service.js', () => ({
  getDltvUpcoming,
}));

vi.mock('../../../../lib/team-logo-overrides.js', () => ({
  getCuratedTeamLogoGithubUrl: ({ name }: { name?: string }) =>
    name ? `https://raw.githubusercontent.com/seva324/dota2-hub/main/public/images/mirror/teams/${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-ranking-dark.webp` : null,
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

const UPCOMING_MATCH = {
  seriesId: '427594',
  radiantName: 'Team NS',
  direName: 'Team VooDooSh',
  radiantLogo: '/uploads/teams/cw5MeHtSNB8jkfJIaO8VEa3gzhjJ2Oxr.webp',
  direLogo: '/uploads/teams/uf7JIQl2vVKv8q9UafIFhR6j8IknHYBV.webp',
  tournament: 'BETBOOM Streamers Battle 14',
  eventUrl: 'https://dltv.org/events/betboom-streamers-battle-14',
  matchUrl: 'https://dltv.org/matches/427594/team-ns-vs-team-voodoosh',
  stage: "Losers' Round 1",
  bestOf: 'BO3',
  timestamp: Math.floor(Date.now() / 1000) + 3600,
};

describe('/api/upcoming', () => {
  beforeEach(() => {
    vi.resetModules();
    getDltvUpcoming.mockReset();
    getDltvUpcoming.mockResolvedValue({ upcoming: [UPCOMING_MATCH], source: 'dltv' });
  });

  it('maps DLTV upcoming matches into the response envelope', async () => {
    const { default: handler } = await import('../../../../api/upcoming.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    const payload = res.payload as any;
    expect(payload.days).toBe(7);
    expect(payload.upcoming).toHaveLength(1);
    expect(payload.teams).toEqual([]);
    expect(payload.upcoming[0].radiant_team_name).toBe('Team NS');
    expect(payload.upcoming[0].dire_team_name).toBe('Team VooDooSh');
    expect(payload.upcoming[0].series_type).toBe('BO3');
    expect(payload.upcoming[0].start_time).toBe(UPCOMING_MATCH.timestamp);
    expect(payload.upcoming[0].radiant_team_logo).toContain('raw.githubusercontent.com');
  });

  it('defaults days to 7 and caps at 14', async () => {
    const { default: handler } = await import('../../../../api/upcoming.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);
    expect((res.payload as any).days).toBe(7);

    const res2 = createRes();
    await handler({ method: 'GET', query: { days: '99' } } as never, res2 as never);
    expect((res2.payload as any).days).toBe(14);
  });

  it('returns empty upcoming when the service returns nothing', async () => {
    getDltvUpcoming.mockResolvedValue({ upcoming: [], source: 'dltv' });
    const { default: handler } = await import('../../../../api/upcoming.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect((res.payload as any).upcoming).toEqual([]);
  });
});
