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

function renderSql(strings: TemplateStringsArray) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

describe('/api/tournaments lazy loading', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    taggedMock.mockReset();
    queryMock.mockReset();
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

    const { default: handler } = await import('../../../../api/tournaments.js');
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
          background_image_url: 'https://dotahub.cn/api/tournament-background?slug=dreamleague',
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

    const { default: handler } = await import('../../../../api/tournaments.js');
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

    const { default: handler } = await import('../../../../api/tournaments.js');
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
              radiant_team_logo: '/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fteam-a.png',
              dire_team_logo: '/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fteam-b.png',
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

  it('enriches featured tournament data with site teams and internal match ids', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => `
        <section class="group__stage">
          <div class="row">
            <div class="col-6">
              <div class="table-body">
                <div class="table__body-row">
                  <div class="cell__coloured">1</div>
                  <a href="https://dltv.org/teams/team-liquid" class="table__body-row__cell width-65 width-m-65">
                    <div class="cell__logo" data-theme-light="https://cdn.example/liquid.png"></div>
                    <div class="cell__name">
                      <div>Team Liquid</div>
                      <div class="cell__name-text">Sweden</div>
                    </div>
                  </a>
                  <div class="cell__text big">3 - 0</div>
                </div>
              </div>
            </div>
            <div class="col-6">
              <div class="table__head">
                <div class="table__head-item width-20 width-m-20 text-center">R 1</div>
              </div>
              <div class="table-body">
                <div class="table__body-row">
                  <a href="https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row__cell f-c width-20 width-m-20 align-center leaf-cell">
                    <div class="cell__logo-md" data-theme-light="https://cdn.example/bb.png"></div>
                    <div class="cell__text"><strong>2 - 1</strong></div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="playoffs">
          <div class="playoffs__box-row__col">
            <div class="col__head">Upper Bracket R1 (bo3)</div>
            <div class="col__serie ">
              <a href="https://dltv.org/matches/425448/team-liquid-vs-betboom-team-pgl-wallachia-season-7">
                <div data-moment="MMM">2026-03-12 08:00:00</div>
                <div class="col__serie-teams">
                  <div class="col__serie-teams__item">
                    <div class="logo" data-theme-light="https://cdn.example/liquid.png"></div>
                    <div class="name overflow-text-1">Liquid</div>
                    <div class="score">2</div>
                  </div>
                  <div class="col__serie-teams__item">
                    <div class="logo" data-theme-light="https://cdn.example/bb.png"></div>
                    <div class="name overflow-text-1">BetBoom Team</div>
                    <div class="score">1</div>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </section>
        <section class="matches__scores">
          <div class="table__body">
            <a href="https://dltv.org/matches/425448/team-liquid-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row">
              <div class="cell__logo" data-theme-light="https://cdn.example/liquid.png"></div>
              <div class="cell__name">Liquid</div>
              <span>2</span><span>-</span><span>1</span>
              <div class="cell__name">BetBoom</div>
              <div class="cell__logo" data-theme-light="https://cdn.example/bb.png"></div>
            </a>
          </div>
          <div class="card__title mt-4">Finished matches</div>
          <div class="table__body">
            <a href="https://dltv.org/matches/425448/team-liquid-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row">
              <div class="cell__logo" data-theme-light="https://cdn.example/liquid.png"></div>
              <div class="cell__name">Liquid</div>
              <span>2</span><span>-</span><span>1</span>
              <div class="cell__name">BetBoom</div>
              <div class="cell__logo" data-theme-light="https://cdn.example/bb.png"></div>
            </a>
          </div>
        </section>
      `,
    }));
    vi.stubGlobal('fetch', fetchMock);

    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql === 'SELECT * FROM teams') {
        return [
          { team_id: 2163, name: 'Team Liquid', tag: 'Liquid', logo_url: 'https://steamcdn-a.akamaihd.net/team-liquid.png', region: 'EU', is_cn_team: 0 },
          { team_id: 8255888, name: 'BetBoom Team', tag: 'BB', logo_url: 'https://steamcdn-a.akamaihd.net/bb.png', region: 'EEU', is_cn_team: 0 },
        ];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('FROM series s LEFT JOIN matches m ON m.series_id = s.series_id')) {
        expect(values).toEqual([19435]);
        return [{
          series_id: 'series-1',
          series_start_time: 1773302400,
          series_radiant_team_id: 2163,
          series_dire_team_id: 8255888,
          radiant_wins: 2,
          dire_wins: 1,
          series_type: 1,
          match_id: 9001,
          match_start_time: 1773302400,
          radiant_team_id: 2163,
          dire_team_id: 8255888,
          radiant_score: 32,
          dire_score: 21,
          radiant_win: true,
          duration: 2400,
        }];
      }
      if (normalized.includes('FROM match_details')) {
        expect(values).toEqual([[9001]]);
        return [{ match_id: 9001 }];
      }
      throw new Error(`Unexpected query SQL: ${normalized}`);
    });

    const { default: handler } = await import('../../../../api/tournaments.js');
    const req = { method: 'GET', query: { tournamentId: 'pgl-wallachia-s7', featured: '1' } };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).groupStage.standings[0]).toEqual(expect.objectContaining({
      teamId: '2163',
      teamName: 'Team Liquid',
      logoUrl: '/api/asset-image?url=https%3A%2F%2Fcdn.steamstatic.com%2Fteam-liquid.png',
      isCnTeam: false,
    }));
    expect((res.payload as any).groupStage.standings[0].rounds[0]).toEqual(expect.objectContaining({
      opponentTeamId: '8255888',
      opponentName: 'BetBoom Team',
      matchId: '9001',
    }));
    expect((res.payload as any).matches.finished[0]).toEqual(expect.objectContaining({
      matchId: '9001',
    }));
    expect((res.payload as any).playoffs.rounds[0].matches[0]).toEqual(expect.objectContaining({
      matchId: '9001',
    }));
  });
});
