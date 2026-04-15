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

describe('/api/pro-players', () => {
  beforeEach(() => {
    vi.resetModules();
    queryMock.mockReset();
    taggedMock.mockReset();
    neonMock.mockClear();
    process.env.DATABASE_URL = 'postgres://example.test/db';
  });

  it('returns a single player when account_id is provided', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('WHERE account_id =')) {
        return [
          {
            account_id: 1001,
            name: 'Player One',
            name_cn: null,
            team_id: 2001,
            team_name: 'Team Alpha',
            country_code: 'CN',
            avatar_url: null,
            realname: 'Real One',
            birth_date: null,
            birth_year: 1999,
            birth_month: 5,
          },
        ];
      }
      return [];
    });

    const { default: handler } = await import('../../../../api/pro-players.js');
    const req = { method: 'GET', query: { account_id: '1001' } };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        name: 'Player One',
        team_id: '2001',
        team_name: 'Team Alpha',
        country_code: 'CN',
      })
    );
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('maps known DLTV avatar urls to a current-host CN-reachable asset url', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('WHERE account_id =')) {
        return [
          {
            account_id: 1001,
            name: 'Player One',
            name_cn: null,
            team_id: 2001,
            team_name: 'Team Alpha',
            country_code: 'CN',
            avatar_url: 'https://s3.dltv.org/uploads/players/5oQ0XCp7aqrvWr0yzeoL7bb5M5FvFe5H.png',
            realname: 'Real One',
            birth_date: null,
            birth_year: 1999,
            birth_month: 5,
          },
        ];
      }
      return [];
    });

    const { default: handler } = await import('../../../../api/pro-players.js');
    const req = {
      method: 'GET',
      query: { account_id: '1001' },
      headers: { host: 'prod.example.com', 'x-forwarded-proto': 'https' },
    };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any)?.avatar_url).toBe('https://prod.example.com/images/mirror/players/9403474.png');
  });

  it('returns the full map when no account_id is provided', async () => {
    queryMock.mockResolvedValue([
      {
        account_id: 1001,
        name: 'Player One',
        name_cn: null,
        team_id: 2001,
        team_name: 'Team Alpha',
        country_code: null,
        avatar_url: 'https://s3.dltv.org/uploads/players/5oQ0XCp7aqrvWr0yzeoL7bb5M5FvFe5H.png',
        realname: null,
        birth_date: null,
        birth_year: null,
        birth_month: null,
      },
    ]);

    const { default: handler } = await import('../../../../api/pro-players.js');
    const req = { method: 'GET', query: {} };
    const res = createRes();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      '1001': expect.objectContaining({
        name: 'Player One',
        team_id: '2001',
        team_name: 'Team Alpha',
        avatar_url: '/images/mirror/players/9403474.png',
      }),
    });
  });
});
