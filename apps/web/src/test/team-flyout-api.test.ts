import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {};

const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values)) as TaggedFn;
const neonMock = vi.fn(() => db);
const getTeamFlyoutCachePayloadMock = vi.fn();
const enrichRecentMatchesWithTeamHeroesMock = vi.fn();

vi.mock('@neondatabase/serverless', () => ({
  neon: neonMock,
}));

vi.mock('../../../../lib/server/team-flyout-cache.js', () => ({
  getTeamFlyoutCachePayload: getTeamFlyoutCachePayloadMock,
  enrichRecentMatchesWithTeamHeroes: enrichRecentMatchesWithTeamHeroesMock,
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

describe('/api/team-flyout', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    taggedMock.mockReset();
    neonMock.mockClear();
    getTeamFlyoutCachePayloadMock.mockReset();
    enrichRecentMatchesWithTeamHeroesMock.mockReset();
  });

  it('returns 5 recent matches and next cursor for a team', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql === 'SELECT * FROM teams') {
        return [
          { team_id: '1', name: 'Team Alpha', tag: 'ALP', logo_url: 'https://steamcdn-a.akamaihd.net/a.png', region: 'China', is_cn_team: 1 },
          { team_id: '2', name: 'Opp 1', tag: 'O1', logo_url: null, region: 'SEA', is_cn_team: 0 },
        ];
      }
      if (sql.includes('SELECT COUNT(*)::int AS count FROM matches')) {
        return [{ count: 7 }];
      }
      if (sql.includes('SELECT radiant_team_id, dire_team_id, radiant_win FROM matches')) {
        return Array.from({ length: 7 }, () => ({
          radiant_team_id: '1',
          dire_team_id: '2',
          radiant_win: true,
        }));
      }
      if (sql.includes('FROM matches m')) {
        return Array.from({ length: 5 }, (_, index) => ({
          match_id: 100 + index,
          start_time: 1_700_000_000 - index * 3600,
          series_type: 'BO3',
          status: 'completed',
          league_id: 42,
          radiant_team_id: '1',
          dire_team_id: '2',
          radiant_score: 2,
          dire_score: 1,
          radiant_win: true,
          tournament_name: 'DreamLeague',
        }));
      }
      if (sql.includes('FROM upcoming_series')) {
        return [{
          id: 'u1',
          series_id: 'u1',
          start_time: 1_800_000_000,
          series_type: 'BO3',
          league_id: 42,
          radiant_team_id: '1',
          dire_team_id: '2',
          tournament_name: 'DreamLeague',
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    getTeamFlyoutCachePayloadMock.mockResolvedValue({
      active_squad: [{ account_id: '11', name: 'Player 11' }],
      top_heroes_90d: [{ hero_id: 99, matches: 4 }],
    });
    enrichRecentMatchesWithTeamHeroesMock.mockImplementation(async (_db: unknown, rows: any[]) =>
      rows.map((row) => ({ ...row, team_hero_ids: [1, 2, 3, 4, 5] }))
    );

    const { default: handler } = await import('../../../../api/team-flyout.js');
    const req = { method: 'GET', query: { teamId: '1', limit: '5', offset: '0' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).team).toEqual(expect.objectContaining({ team_id: '1', name: 'Team Alpha' }));
    expect((res.payload as any).recentMatches).toHaveLength(5);
    expect((res.payload as any).recentMatches[0].team_hero_ids).toEqual([1, 2, 3, 4, 5]);
    expect((res.payload as any).activeSquad).toEqual([{ account_id: '11', name: 'Player 11' }]);
    expect((res.payload as any).topHeroes).toEqual([{ hero_id: 99, matches: 4 }]);
    expect((res.payload as any).pagination).toEqual(expect.objectContaining({ hasMore: true, nextCursor: 5 }));
  });
});
