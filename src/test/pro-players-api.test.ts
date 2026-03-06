import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const neonMock = vi.fn(() => ({ query: mockQuery }));

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

describe('/api/pro-players', () => {
  beforeEach(() => {
    vi.resetModules();
    mockQuery.mockReset();
    neonMock.mockClear();
    process.env.DATABASE_URL = 'postgres://example.test/db';
  });

  it('syncs pro_players from match_details data before returning payload', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const query = String(sql);
      if (query.includes('to_regclass')) {
        return [{ matches_table: 'matches', match_details_table: 'match_details' }];
      }
      if (query.includes('WITH extracted AS')) {
        return [{ discovered_count: 2, upserted_count: 2 }];
      }
      if (query.includes('FROM pro_players')) {
        return [
          {
            account_id: 1001,
            name: 'Player One',
            name_cn: null,
            team_id: 2001,
            team_name: 'Team Alpha',
            country_code: null,
            avatar_url: null,
            realname: null,
            birth_date: null,
            birth_year: null,
            birth_month: null,
          },
        ];
      }
      return [];
    });

    const { default: handler } = await import('../../api/pro-players.js');
    const req = { method: 'GET' };
    const res = createRes();

    await handler(req as any, res as any);

    const sqls = mockQuery.mock.calls.map((call) => String(call[0]));
    const syncSql = sqls.find((sql) => sql.includes('WITH extracted AS'));
    expect(syncSql).toBeDefined();
    expect(syncSql).toContain('LEFT JOIN teams rt');
    expect(syncSql).toContain('LEFT JOIN teams dt');
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      '1001': expect.objectContaining({
        name: 'Player One',
        team_id: '2001',
        team_name: 'Team Alpha',
      }),
    });
  });

  it('skips match-derived sync if source tables are unavailable', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const query = String(sql);
      if (query.includes('to_regclass')) {
        return [{ matches_table: null, match_details_table: null }];
      }
      if (query.includes('FROM pro_players')) {
        return [];
      }
      return [];
    });

    const { default: handler } = await import('../../api/pro-players.js');
    const req = { method: 'GET' };
    const res = createRes();

    await handler(req as any, res as any);

    const sqls = mockQuery.mock.calls.map((call) => String(call[0]));
    expect(sqls.some((sql) => sql.includes('WITH extracted AS'))).toBe(false);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({});
  });
});
