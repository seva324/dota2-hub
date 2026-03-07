import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
};

const queryMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();

const db = (Object.assign(
  async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values),
  {
    query: (sql: string, params?: unknown[]) => queryMock(sql, params),
  }
) as unknown) as TaggedFn;

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

describe('/api/player-profile account_id filter regression', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    queryMock.mockReset();
    taggedMock.mockReset();
    neonMock.mockClear();

    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('FROM player_profile_cache')) {
        return [];
      }
      if (sql.includes('FROM pro_players') && sql.includes('LIMIT 1')) {
        return [{ account_id: 9001, name: 'Player 9001', team_id: 10, team_name: 'Team A' }];
      }
      if (sql.includes('FROM upcoming_series')) {
        return [];
      }
      return [];
    });
  });

  it('uses robust account extraction keys in SQL and does not hard-filter 180d', async () => {
    const now = Math.floor(Date.now() / 1000);
    queryMock.mockResolvedValue([
      {
        match_id: 999,
        start_time: now - 3600,
        radiant_score: 2,
        dire_score: 1,
        radiant_win: true,
        payload: {
          players: [
            { accountId: '9001', player_slot: '0', hero_id: '12' },
            { account_id: '1', player_slot: '1', hero_id: '1' },
            { account_id: '2', player_slot: '2', hero_id: '2' },
            { account_id: '3', player_slot: '3', hero_id: '3' },
            { account_id: '4', player_slot: '4', hero_id: '4' },
            { account_id: '5', player_slot: '128', hero_id: '5' },
            { account_id: '6', player_slot: '129', hero_id: '6' },
            { account_id: '7', player_slot: '130', hero_id: '7' },
            { account_id: '8', player_slot: '131', hero_id: '8' },
            { account_id: '9', player_slot: '132', hero_id: '9' },
          ],
          picks_bans: [
            { hero_id: '4', team: 'radiant', is_pick: true, order: 7 },
            { hero_id: '1', team: 'radiant', is_pick: true, order: 1 },
            { hero_id: '3', team: 'radiant', is_pick: true, order: 5 },
            { hero_id: '12', team: 'radiant', is_pick: true, order: 3 },
            { hero_id: '2', team: 'radiant', is_pick: true, order: 9 },
          ],
        },
      },
    ]);

    const { default: handler } = await import('../../api/player-profile.js');
    const req = { method: 'GET', query: { account_id: '9001' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Player-Profile-Cache']).toBe('live');
    expect((res.payload as any)?.recent_matches?.length).toBe(1);
    expect((res.payload as any)?.signature_hero).toBeNull();
    expect((res.payload as any)?.signature_heroes).toEqual([]);
    expect((res.payload as any)?.recent_matches?.[0]?.team_hero_ids).toEqual([1, 12, 3, 4, 2]);
    expect((res.payload as any)?.stats?.win_rate).toBe(100);

    const matchRowsCall = queryMock.mock.calls.find((call) => String(call[0]).includes('FROM matches m'));
    expect(matchRowsCall).toBeDefined();
    const [sql, params] = matchRowsCall as [string, unknown[]];
    expect(sql).toContain(`COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')`);
    expect(sql).toContain('LEFT JOIN teams rt');
    expect(sql).toContain('LEFT JOIN teams dt');
    expect(sql).toContain(`to_jsonb(m)->>'league_id'`);
    expect(sql).not.toContain('m.start_time >=');
    expect(params).toEqual([9001, 240]);
  });

  it('returns cached payload directly when cache is fresh', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('FROM player_profile_cache')) {
        return [{
          account_id: 9001,
          payload: { account_id: '9001', player: { name: 'Cached Player' } },
          updated_at: new Date().toISOString(),
        }];
      }
      return [];
    });

    const { default: handler } = await import('../../api/player-profile.js');
    const req = { method: 'GET', query: { account_id: '9001' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Player-Profile-Cache']).toBe('cache');
    expect(res.payload).toEqual({ account_id: '9001', player: { name: 'Cached Player' } });
    expect(queryMock.mock.calls.find((call) => String(call[0]).includes('FROM matches m'))).toBeUndefined();
  });
});
