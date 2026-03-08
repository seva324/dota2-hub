import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {};

const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values)) as TaggedFn;
const neonMock = vi.fn(() => db);

vi.mock('@neondatabase/serverless', () => ({
  neon: neonMock,
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

function renderSql(strings: TemplateStringsArray) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

describe('/api/tournaments lazy loading', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    taggedMock.mockReset();
    neonMock.mockClear();
  });

  it('returns tournament summaries without series data when no tournamentId is provided', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('FROM tournaments') && !sql.includes('WHERE CAST(league_id AS TEXT)')) {
        return [{
          id: 'dreamleague-s28',
          league_id: 42,
          name: 'DreamLeague Season 28',
          tier: 'S',
          location: 'EU',
          status: 'ongoing',
          start_time: 1700000000,
          end_time: 1701000000,
          prize_pool_usd: 1000000,
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { default: handler } = await import('../../api/tournaments.js');
    const req = { method: 'GET', query: {} };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      tournaments: [
        expect.objectContaining({
          id: 'dreamleague-s28',
          league_id: 42,
          name: 'DreamLeague Season 28',
        }),
      ],
    });
    expect(taggedMock.mock.calls.some((call) => renderSql(call[0] as TemplateStringsArray).includes('FROM series'))).toBe(false);
  });

  it('filters out tournaments whose tier is empty in the summary list query', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('FROM tournaments') && !sql.includes('WHERE CAST(league_id AS TEXT)')) {
        expect(sql).toContain(`WHERE NULLIF(BTRIM(COALESCE(tier, '')), '') IS NOT NULL`);
        return [{
          id: 'pgl-wallachia-s7',
          league_id: 19435,
          name: 'PGL Wallachia Season 7',
          tier: 'S',
          location: 'Romania',
          status: 'ongoing',
          start_time: 1700000000,
          end_time: 1701000000,
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { default: handler } = await import('../../api/tournaments.js');
    const req = { method: 'GET', query: {} };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).tournaments).toHaveLength(1);
    expect((res.payload as any).tournaments[0]).toEqual(expect.objectContaining({
      league_id: 19435,
      tier: 'S',
    }));
  });

  it('returns paginated series for a selected tournament', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = renderSql(strings);
      if (sql.includes('WHERE CAST(league_id AS TEXT)')) {
        return [{
          id: 'dreamleague-s28',
          league_id: 42,
          name: 'DreamLeague Season 28',
          status: 'ongoing',
          stage_windows: [{ label: 'Playoffs', kind: 'playoff', start: 1700000000, end: 1701000000, priority: 1 }],
        }];
      }
      if (sql.includes('COUNT(*)::int AS count')) {
        return [{ count: 12 }];
      }
      if (sql.includes('FROM series')) {
        expect(values).toEqual([42, 10, 0]);
        return [{
          series_id: 'series-1',
          league_id: 42,
          radiant_team_id: 1,
          dire_team_id: 2,
          radiant_wins: 2,
          dire_wins: 1,
          series_type: 1,
          stage: 'Playoffs',
          start_time: 1700500000,
        }];
      }
      if (sql === 'SELECT * FROM teams') {
        return [
          { team_id: 1, name: 'Team A', logo_url: 'https://steamcdn-a.akamaihd.net/team-a.png' },
          { team_id: 2, name: 'Team B', logo_url: 'https://steamcdn-a.akamaihd.net/team-b.png' },
        ];
      }
      if (sql.includes('FROM matches')) {
        expect(values).toEqual(['series-1']);
        return [{
          match_id: 101,
          series_id: 'series-1',
          radiant_team_id: 1,
          dire_team_id: 2,
          radiant_score: 30,
          dire_score: 20,
          radiant_win: true,
          start_time: 1700500000,
          duration: 2400,
          picks_bans: [{ hero_id: 1, team: 'radiant', is_pick: true, order: 1 }],
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { default: handler } = await import('../../api/tournaments.js');
    const req = { method: 'GET', query: { tournamentId: '42', limit: '10', offset: '0' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      tournament: expect.objectContaining({ id: 'dreamleague-s28', league_id: 42 }),
      series: [
        expect.objectContaining({
          series_id: 'series-1',
          series_type: 'BO3',
          radiant_team_name: 'Team A',
          dire_team_name: 'Team B',
          stage_kind: 'playoff',
          games: [
            expect.objectContaining({
              match_id: '101',
              radiant_team_logo: 'https://cdn.steamstatic.com/team-a.png',
              dire_team_logo: 'https://cdn.steamstatic.com/team-b.png',
              picks_bans: [{ hero_id: 1, team: 'radiant', is_pick: true, order: 1 }],
            }),
          ],
        }),
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 12,
        hasMore: true,
      },
    });
  });
});
