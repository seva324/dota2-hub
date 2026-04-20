import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  query: (...args: unknown[]) => Promise<unknown[]>;
};

const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const queryMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values)) as TaggedFn;
db.query = (...args: unknown[]) => queryMock(...args);
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

describe('/api/heroes cache headers', () => {
  beforeEach(() => {
    vi.resetModules();
    taggedMock.mockReset();
    queryMock.mockReset();
    neonMock.mockClear();
    process.env.DATABASE_URL = 'postgres://example.test/db';
  });

  it('returns cached hero metadata for GET requests', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('CREATE TABLE IF NOT EXISTS heroes')) {
        return [];
      }
      if (sql.includes('SELECT hero_id, name, name_cn, img, img_url')) {
        return [{
          hero_id: 1,
          name: 'Anti-Mage',
          name_cn: '敌法师',
          img: 'antimage',
          img_url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/antimage_lg.png',
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const { default: handler } = await import('../../../../lib/api-handlers/heroes.js');
    const req = { method: 'GET', query: {} };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.payload).toEqual({
      '1': {
        id: 1,
        name: 'Anti-Mage',
        name_cn: '敌法师',
        img: 'antimage',
        img_url: '/images/mirror/heroes/1.png',
      },
    });
  });
});
