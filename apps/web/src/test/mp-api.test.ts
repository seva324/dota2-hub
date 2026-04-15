import { beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {};

const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values)) as TaggedFn;
const neonMock = vi.fn(() => db);
const getLiveHeroPayloadsMock = vi.fn();
const getTeamFlyoutCachePayloadMock = vi.fn();
const enrichRecentMatchesWithTeamHeroesMock = vi.fn();

vi.mock('@neondatabase/serverless', () => ({
  neon: neonMock,
}));

vi.mock('../../../../lib/server/live-hero-service.js', () => ({
  getLiveHeroPayloads: getLiveHeroPayloadsMock,
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

async function callMpRoute(query: Record<string, string>, headers: Record<string, string> = {}) {
  const { default: handler } = await import('../../../../api/matches.js');
  const res = createRes();
  await handler({ method: 'GET', query, headers } as never, res as never);
  return res;
}

describe('/api/mp/*', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    delete process.env.PUBLIC_SITE_ORIGIN;
    delete process.env.VITE_PUBLIC_SITE_ORIGIN;
    delete process.env.SITE_URL;
    taggedMock.mockReset();
    neonMock.mockClear();
    getLiveHeroPayloadsMock.mockReset();
    getTeamFlyoutCachePayloadMock.mockReset();
    enrichRecentMatchesWithTeamHeroesMock.mockReset();
  });

  it('returns a mini-program-ready home payload', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('COUNT(*)::int AS count') && sql.includes('FROM tournaments')) {
        return [{ count: 1 }];
      }
      if (sql.includes('FROM tournaments') && sql.includes('LIMIT')) {
        return [{
          id: 'dreamleague-s28',
          league_id: 42,
          name: 'DreamLeague Season 28',
          tier: 'S',
          status: 'ongoing',
        }];
      }
      if (sql.includes('COUNT(*)::int AS count') && sql.includes('FROM upcoming_series')) {
        return [{ count: 1 }];
      }
      if (sql.includes('FROM upcoming_series s')) {
        return [{
          id: 1,
          series_id: 11,
          radiant_team_id: 1,
          dire_team_id: 2,
          start_time: 1700000100,
          series_type: 1,
          tournament_name: 'DreamLeague Season 28',
          tournament_tier: 'S',
          status: 'upcoming',
        }];
      }
      if (sql === 'SELECT * FROM teams') {
        return [
          { team_id: 1, name: 'Xtreme Gaming', logo_url: 'https://steamcdn-a.akamaihd.net/xg.png', region: 'China', is_cn_team: 1 },
          { team_id: 2, name: 'Team Spirit', logo_url: 'https://steamcdn-a.akamaihd.net/ts.png', region: 'EEU', is_cn_team: 0 },
        ];
      }
      if (sql.includes('FROM news_articles')) {
        return [{
          id: 'news-1',
          source: 'BO3.gg',
          url: 'https://example.test/news-1',
          category: 'tournament',
          image_url: 'https://files.bo3.gg/uploads/news/471032/title_image/webp-a1ad4563323fda40b1520cf8559625c2.webp',
          published_at: 1700000200,
          title_en: 'English title',
          summary_en: 'English summary',
          title_zh: '中文标题',
          summary_zh: '中文摘要',
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    getLiveHeroPayloadsMock.mockResolvedValue([{
      source: 'hawk.live',
      leagueName: 'DreamLeague Season 28',
      seriesScore: '1-0',
      live: true,
      teams: [
        { side: 'team1', name: 'Xtreme Gaming', logo: null },
        { side: 'team2', name: 'Team Spirit', logo: null },
      ],
      maps: [],
      liveMap: null,
    }]);

    const res = await callMpRoute(
      { __mp: 'home' },
      { host: 'pages-pro-7-e197.pages-scf-gz-pro.qcloudteo.com' },
    );

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      ok: true,
      data: expect.objectContaining({
        liveMatchCount: 1,
        heroLive: expect.objectContaining({ leagueName: 'DreamLeague Season 28' }),
        tournaments: [expect.objectContaining({
          league_id: 42,
          background_image_url: 'https://dotahub.cn/api/tournament-background?slug=dreamleague',
        })],
        upcoming: [expect.objectContaining({ series_id: '11' })],
        news: [expect.objectContaining({
          title: '中文标题',
          image_url: 'https://dotahub.cn/api/bo3-image?url=https%3A%2F%2Ffiles.bo3.gg%2Fuploads%2Fnews%2F471032%2Ftitle_image%2Fwebp-a1ad4563323fda40b1520cf8559625c2.webp',
        })],
      }),
      error: null,
      meta: expect.objectContaining({
        generatedAt: expect.any(String),
      }),
    });
  });

  it('returns paginated mini-program upcoming matches', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('COUNT(*)::int AS count') && sql.includes('FROM upcoming_series')) {
        return [{ count: 2 }];
      }
      if (sql.includes('FROM upcoming_series s')) {
        return [{
          id: 1,
          series_id: 11,
          radiant_team_id: 1,
          dire_team_id: 2,
          start_time: 1700000100,
          series_type: 1,
          tournament_name: 'DreamLeague Season 28',
          tournament_name_cn: '梦幻联赛',
          tournament_tier: 'S',
          status: 'upcoming',
        }];
      }
      if (sql === 'SELECT * FROM teams') {
        return [
          { team_id: 1, name: 'Xtreme Gaming', logo_url: 'https://steamcdn-a.akamaihd.net/xg.png', region: 'China', is_cn_team: 1 },
          { team_id: 2, name: 'Team Spirit', logo_url: 'https://steamcdn-a.akamaihd.net/ts.png', region: 'EEU', is_cn_team: 0 },
        ];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = await callMpRoute({ __mp: 'upcoming', days: '3', limit: '1', offset: '0' });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      ok: true,
      data: expect.objectContaining({
        days: 3,
        items: [expect.objectContaining({ tournament_name_cn: '梦幻联赛' })],
        pagination: {
          total: 2,
          offset: 0,
          limit: 1,
          hasMore: true,
          nextCursor: 1,
        },
      }),
      error: null,
      meta: expect.objectContaining({ generatedAt: expect.any(String) }),
    });
  });

  it('returns paginated mini-program tournament detail', async () => {
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
      if (sql.includes('COUNT(*)::int AS count') && sql.includes('FROM series')) {
        return [{ count: 12 }];
      }
      if (sql.includes('FROM series') && sql.includes('LIMIT')) {
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
          picks_bans: [],
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = await callMpRoute({ __mp: 'tournament/42', limit: '10', offset: '0' });

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).data).toEqual(expect.objectContaining({
      tournament: expect.objectContaining({ league_id: 42 }),
      items: [
        expect.objectContaining({
          series_id: 'series-1',
          games: [expect.objectContaining({
            match_id: '101',
            radiant_team_logo: 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fteam-a.png',
            dire_team_logo: 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fteam-b.png',
          })],
        }),
      ],
      pagination: expect.objectContaining({ hasMore: true, nextCursor: 1 }),
    }));
  });

  it('returns paginated mini-program team detail', async () => {
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
      if (sql.includes('FROM upcoming_series u')) {
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

    const res = await callMpRoute({ __mp: 'team/1', limit: '5', offset: '0' });

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).data.team).toEqual(expect.objectContaining({
      team_id: '1',
      name: 'Team Alpha',
      logo_url: 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fa.png',
    }));
    expect((res.payload as any).data.items[0]).toEqual(expect.objectContaining({ match_id: '100', team_hero_ids: [1, 2, 3, 4, 5] }));
    expect((res.payload as any).data.pagination).toEqual(expect.objectContaining({ hasMore: true, nextCursor: 5 }));
  });

  it('returns match detail in the stable mini-program envelope', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('CREATE TABLE IF NOT EXISTS match_details')) {
        return [];
      }
      if (sql === 'SELECT * FROM teams') {
        return [
          {
            team_id: 9886289,
            name: 'Cloud Rising',
            tag: null,
            logo_url: 'https://s3.dltv.org/uploads/teams/qOxveFIjlAHAnKvYzsaScK4YdNwpTcBb.png.webp',
          },
          {
            team_id: 9444076,
            name: 'NGNB',
            tag: null,
            logo_url: 'https://s3.dltv.org/uploads/teams/undGjRoa9Vzm2ahfsXMCN5RLljkwsS5v.png.webp',
          },
        ];
      }
      if (sql.includes('FROM match_details')) {
        return [{
          payload: {
            match_id: 123,
            duration: 2400,
            radiant_score: 30,
            dire_score: 20,
            radiant_win: true,
            radiant_team_id: 9886289,
            dire_team_id: 9444076,
            radiant_team: {
              team_id: 9886289,
              name: 'Cloud Rising',
              logo_url: 'https://cdn.steamusercontent.com/ugc/legacy-cloud-rising/',
            },
            dire_team: {
              team_id: 9444076,
              name: 'NGNB',
              logo_url: 'https://cdn.steamusercontent.com/ugc/legacy-ngnb/',
            },
            players: [],
            picks_bans: [],
          },
        }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const res = await callMpRoute({ __mp: 'match/123' });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      ok: true,
      data: expect.objectContaining({
        match_id: 123,
        radiant_score: 30,
        radiant_team: expect.objectContaining({
          name: 'Cloud Rising',
          logo_url: 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fs3.dltv.org%2Fuploads%2Fteams%2FqOxveFIjlAHAnKvYzsaScK4YdNwpTcBb.png.webp',
        }),
        dire_team: expect.objectContaining({
          name: 'NGNB',
          logo_url: 'https://dotahub.cn/api/asset-image?url=https%3A%2F%2Fs3.dltv.org%2Fuploads%2Fteams%2FundGjRoa9Vzm2ahfsXMCN5RLljkwsS5v.png.webp',
        }),
      }),
      error: null,
      meta: expect.objectContaining({ generatedAt: expect.any(String) }),
    });
  });
});
