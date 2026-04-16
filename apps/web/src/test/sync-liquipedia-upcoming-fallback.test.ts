import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
};

const taggedMock = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const db = (Object.assign(
  async (strings: TemplateStringsArray, ...values: unknown[]) => taggedMock(strings, ...values),
  { query: vi.fn() }
) as unknown) as TaggedFn;

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => db),
}));

function renderSql(strings: TemplateStringsArray) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

describe('runSyncLiquipedia', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T00:00:00Z'));
    process.env.DATABASE_URL = 'postgres://example.test/db';
    taggedMock.mockReset();
    db.query = vi.fn().mockResolvedValue([]);

    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id, name, tag FROM teams')) {
        return [{ team_id: '9886289', name: 'Cloud Rising', tag: 'CR' }];
      }
      if (sql.includes('SELECT team_id FROM teams WHERE LOWER(name) =')) {
        return [];
      }
      if (sql.includes('SELECT league_id FROM tournaments WHERE LOWER(name) =')) {
        return [{ league_id: 18865 }];
      }
      return [];
    });

    const dltvHtml = (`
      <div class="match upcoming" data-series-id="424242" data-matches-odd="2026-04-14 03:30:00">
        <div class="match__head">
          <a href="https://dltv.org/events/epl-world-series-sea-season-13"></a>
          <div class="match__head-event"><span>EPL World Series: SEA Season 13</span></div>
          <div class="match__head-format text-red">Group Stage</div>
          <div class="match__head-format">Bo3</div>
        </div>
        <div class="match__body-details">
          <div class="match__body-details__team">
            <div class="team__title"><span>Glyph</span></div>
          </div>
          <div class="match__body-details__team">
            <div class="team__title"><span>Cloud Rising</span></div>
          </div>
        </div>
      </div>
    ` + ' '.repeat(1200));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('dltv.org/matches')) {
        return {
          ok: true,
          text: async () => dltvHtml,
        } as Response;
      }
      if (url.includes('api.opendota.com')) {
        return {
          ok: true,
          json: async () => ([]),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists DLTV team names when a team id is missing', async () => {
    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const insertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));
    expect(insertCall).toBeDefined();

    const values = insertCall?.slice(1) ?? [];
    expect(values).toContain('dltv_424242');
    expect(values).toContain('Glyph');
    expect(values).toContain('Cloud Rising');
    expect(values).toContain('EPL World Series: SEA Season 13');
    expect(values).toContain('BO3');
  });

  it('creates a tournament stub before saving unknown DLTV tournaments', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id, name, tag FROM teams')) {
        return [{ team_id: '9886289', name: 'Cloud Rising', tag: 'CR' }];
      }
      return [];
    });

    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const tournamentInsertCall = (db.query as any).mock.calls.find((call: unknown[]) => String(call[0] || '').includes('INSERT INTO tournaments'));
    const upcomingInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));

    expect(tournamentInsertCall).toBeDefined();
    expect(tournamentInsertCall?.[1]).toContain('EPL World Series: SEA Season 13');
    expect(upcomingInsertCall).toBeDefined();
  });

  it('maps qualifier aliases onto existing tournaments and stores grouping metadata', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id, name, tag FROM teams')) {
        return [{ team_id: '9886289', name: 'Cloud Rising', tag: 'CR' }];
      }
      if (sql.includes('SELECT team_id FROM teams WHERE LOWER(name) =')) {
        return [];
      }
      return [];
    });

    db.query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM tournaments') && sql.includes('ORDER BY updated_at DESC NULLS LAST')) {
        return [{
          league_id: 19101,
          name: 'RES Unchained - A Blast Dota Slam VII Qualifier SEA',
          tier: null,
          location: null,
          status: null,
          start_time: null,
          end_time: null,
          prize_pool: null,
          prize_pool_usd: null,
          image: null,
          location_flag_url: null,
          source_url: null,
          dltv_event_slug: null,
          dltv_parent_slug: null,
          event_group_slug: null,
        }];
      }
      if (sql.includes('SELECT league_id FROM tournaments WHERE league_id =')) {
        return [];
      }
      return [];
    });

    const qualifierHtml = `
      <html>
        <head>
          <title>BLAST Slam 7: Southeast Asia Closed Qualifier overview | DLTV</title>
          <meta name="description" content="Complete overview of BLAST Slam 7: Southeast Asia Closed Qualifier held from Apr. 02, 2026 to Apr. 03, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>BLAST SLAM 7: SOUTHEAST ASIA CLOSED QUALIFIER</h1>
          <a href="https://dltv.org/events/blast-slam-7">MAIN EVENT</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 02 - APR 03, 2026</div>
          <div>COUNTRY</div>
          <div>SEA</div>
          <div>EVENT TIER</div>
          <div>A-QUAL TIER</div>
        </body>
      </html>
    `;
    const mainEventHtml = `
      <html>
        <head>
          <title>Blast Slam 7 overview | DLTV</title>
          <meta name="description" content="Complete overview of Blast Slam 7 which will take place from May 26, 2026 to Jun. 07, 2026, a $1,000,000 Dota 2 tournament.">
        </head>
        <body>
          <h1>BLAST SLAM 7</h1>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>MAY 26 - JUN 07, 2026</div>
          <div>COUNTRY</div>
          <div>DENMARK</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
        </body>
      </html>
    `;
    const dltvHtml = (`
      <div class="match upcoming" data-series-id="777777" data-matches-odd="2026-04-14 03:30:00">
        <div class="match__head">
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier"></a>
          <div class="match__head-event"><span>BLAST Slam 7: Southeast Asia Closed Qualifier</span></div>
          <div class="match__head-format text-red">Upper Bracket</div>
          <div class="match__head-format">Bo3</div>
        </div>
        <div class="match__body-details">
          <div class="match__body-details__team">
            <div class="team__title"><span>Glyph</span></div>
          </div>
          <div class="match__body-details__team">
            <div class="team__title"><span>Cloud Rising</span></div>
          </div>
        </div>
      </div>
    ` + ' '.repeat(1200));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('dltv.org/matches')) {
        return {
          ok: true,
          text: async () => dltvHtml,
        } as Response;
      }
      if (url.includes('blast-slam-vii-southeast-asia-closed-qualifier')) {
        return {
          ok: true,
          text: async () => qualifierHtml,
        } as Response;
      }
      if (url.endsWith('/events/blast-slam-7')) {
        return {
          ok: true,
          text: async () => mainEventHtml,
        } as Response;
      }
      if (url.includes('api.opendota.com')) {
        return {
          ok: true,
          json: async () => ([]),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const upcomingInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));
    expect(upcomingInsertCall).toBeDefined();
    expect(upcomingInsertCall?.slice(1)).toContain(19101);
    expect(upcomingInsertCall?.slice(1)).toContain('https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier');
    expect(upcomingInsertCall?.slice(1)).toContain('blast-slam-vii-southeast-asia-closed-qualifier');
    expect(upcomingInsertCall?.slice(1)).toContain('blast-slam-7');
  });
});
