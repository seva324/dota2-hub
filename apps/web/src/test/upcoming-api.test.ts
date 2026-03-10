import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
};

const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const db = (Object.assign(
  async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values),
  { query: vi.fn() }
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

describe('/api/upcoming', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    taggedMock.mockReset();
    neonMock.mockClear();

    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('FROM upcoming_series')) {
        return [{
          id: 1,
          series_id: 11,
          radiant_team_id: 1,
          dire_team_id: 2,
          start_time: 100,
          series_type: 1,
          tournament_name: 'DreamLeague',
          tournament_name_cn: '梦幻联赛',
          tournament_tier: 'S',
          status: 'upcoming',
        }];
      }
      if (sql.includes('SELECT * FROM teams')) {
        return [
          { team_id: 1, name: 'Xtreme Gaming', logo_url: 'https://steamcdn-a.akamaihd.net/logo.png', region: 'China', is_cn_team: 1 },
          { team_id: 2, name: 'Team Spirit', logo_url: null, region: 'Eastern Europe', is_cn_team: 0 },
        ];
      }
      return [];
    });
  });

  it('defaults to a 2-day window and includes the selected days in the response', async () => {
    const { default: handler } = await import('../../../../api/upcoming.js');
    const res = createRes();

    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).days).toBe(2);
    expect((res.payload as any).upcoming).toHaveLength(1);

    const upcomingCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('FROM upcoming_series'));
    expect(upcomingCall).toBeDefined();
    const [, nowValue, maxStartTime] = upcomingCall as unknown as [TemplateStringsArray, number, number];
    expect(maxStartTime - nowValue).toBe(2 * 86400);
  });

  it('caps an oversized days query at 14 days', async () => {
    const { default: handler } = await import('../../../../api/upcoming.js');
    const res = createRes();

    await handler({ method: 'GET', query: { days: '99' } } as never, res as never);

    expect((res.payload as any).days).toBe(14);
    const upcomingCall = taggedMock.mock.calls.findLast((call) => renderSql(call[0] as TemplateStringsArray).includes('FROM upcoming_series'));
    const [, nowValue, maxStartTime] = upcomingCall as unknown as [TemplateStringsArray, number, number];
    expect(maxStartTime - nowValue).toBe(14 * 86400);
  });
});
