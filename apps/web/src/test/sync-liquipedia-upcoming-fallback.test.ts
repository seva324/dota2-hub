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
      if (url === 'https://dltv.org/events' || url === 'https://r.jina.ai/http://dltv.org/events') {
        return {
          ok: true,
          text: async () => '<html><body>No demo events</body></html>',
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

    db.query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM tournaments') && sql.includes('ORDER BY updated_at DESC NULLS LAST')) {
        return [{
          league_id: 19538,
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
      if (url === 'https://dltv.org/events' || url === 'https://r.jina.ai/http://dltv.org/events') {
        return {
          ok: true,
          text: async () => '<html><body>No demo events</body></html>',
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
    expect(upcomingInsertCall?.slice(1)).toContain(19538);
    expect(upcomingInsertCall?.slice(1)).toContain('https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier');
    expect(upcomingInsertCall?.slice(1)).toContain('blast-slam-vii-southeast-asia-closed-qualifier');
    expect(upcomingInsertCall?.slice(1)).toContain('blast-slam-7');
  });

  it('hydrates demo tournament rows from the DLTV events catalog before match sync', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id, name, tag FROM teams')) {
        return [];
      }
      return [];
    });

    db.query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM tournaments') && sql.includes('ORDER BY updated_at DESC NULLS LAST')) {
        return [{
          league_id: 19448,
          name: 'DreamLeague Season 29 Qualifiers',
          tier: 'A-QUAL',
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

    const eventsCatalogHtml = `
      <html>
        <body>
          <div class="events__card">
            <a href="https://dltv.org/events/dreamleague-season-29" class="events__card-head">
              <div class="events__card-head__pic">
                <div class="pic" style="background-image: url('https://s3.dltv.org/uploads/events/dreamleague-main.png')">
                  <div class="pic__tag">
                    <span data-datetime-source="2026-05-13 00:00:00">May 12</span>
                    -
                    <span data-datetime-source="2026-05-24 00:00:00">May 23</span>
                  </div>
                </div>
              </div>
              <div class="events__card-head__info">
                <div class="info__col">
                  <div class="info__col-item name">DreamLeague 29</div>
                  <div class="info__col-item"><span>Europe</span></div>
                  <div class="info__col-item prize"><span>Prize pool <strong>$1,000,000</strong></span></div>
                </div>
                <div class="info__col width-50 abs">
                  <div class="info__col-item align-right">A-Tier Tier</div>
                  <div class="info__col-item align-right">8 participants</div>
                </div>
              </div>
            </a>
          </div>
          <div class="events__card">
            <a href="https://dltv.org/events/esl-challenger-china-season-3" class="events__card-head">
              <div class="events__card-head__pic">
                <div class="pic" style="background-image: url('https://s3.dltv.org/uploads/events/esl-china-main.png')">
                  <div class="pic__tag">
                    <span data-datetime-source="2026-04-30 00:00:00">Apr 30</span>
                    -
                    <span data-datetime-source="2026-05-02 00:00:00">May 02</span>
                  </div>
                </div>
              </div>
              <div class="events__card-head__info">
                <div class="info__col">
                  <div class="info__col-item name">ESL Challenger China Season 3</div>
                  <div class="info__col-item"><span>China</span></div>
                  <div class="info__col-item prize"><span>Prize pool <strong>$172,000</strong></span></div>
                </div>
                <div class="info__col width-50 abs">
                  <div class="info__col-item align-right">B-Tier Tier</div>
                  <div class="info__col-item align-right">8 participants</div>
                </div>
              </div>
            </a>
          </div>
          <div class="events__card">
            <a href="https://dltv.org/events/blast-slam-7" class="events__card-head">
              <div class="events__card-head__pic">
                <div class="pic" style="background-image: url('https://s3.dltv.org/uploads/events/blast-main.png')">
                  <div class="pic__tag">
                    <span data-datetime-source="2026-05-26 00:00:00">May 25</span>
                    -
                    <span data-datetime-source="2026-06-07 00:00:00">Jun 06</span>
                  </div>
                </div>
              </div>
              <div class="events__card-head__info">
                <div class="info__col">
                  <div class="info__col-item name">Blast Slam 7</div>
                  <div class="info__col-item"><span>Denmark</span></div>
                  <div class="info__col-item prize"><span>Prize pool <strong>$1,000,000</strong></span></div>
                </div>
                <div class="info__col width-50 abs">
                  <div class="info__col-item align-right">A-Tier Tier</div>
                  <div class="info__col-item align-right">12 participants</div>
                </div>
              </div>
            </a>
          </div>
        </body>
      </html>
    `;
    const eslChinaMainHtml = `
      <html>
        <head>
          <title>ESL Challenger China Season 3 overview | DLTV</title>
          <meta name="description" content="Complete overview of ESL Challenger China Season 3 which will take place from May 01, 2026 to May 03, 2026, a $172,000 Dota 2 tournament.">
        </head>
        <body>
          <h1>ESL Challenger China Season 3</h1>
          <div style="background-image: url('https://s3.dltv.org/uploads/events/big/esl-china-main.png')"></div>
          <a href="https://dltv.org/events/esl-challenger-china-season-3/esl-challenger-china-season-3-open-qualifier-1">Open Qualifier 1</a>
          <a href="https://dltv.org/events/esl-challenger-china-season-3/esl-challenger-china-season-3-open-qualifier-2">Open Qualifier 2</a>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>MAY 01 - MAY 03, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>B-TIER</div>
          <div>PRIZE POOL</div>
          <div>$172,000</div>
        </body>
      </html>
    `;
    const eslChinaOpenQualifier1Html = `
      <html>
        <head>
          <title>ESL Challenger China Season 3: Open Qualifier 1 overview | DLTV</title>
          <meta name="description" content="Complete overview of ESL Challenger China Season 3: Open Qualifier 1 which will take place from Apr 16, 2026 to Apr 18, 2026, a $14,000 Dota 2 tournament.">
        </head>
        <body>
          <h1>ESL Challenger China Season 3: Open Qualifier 1</h1>
          <a href="https://dltv.org/events/esl-challenger-china-season-3">Main event</a>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>APR 16 - APR 18, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>B-QUAL TIER</div>
          <div>PRIZE POOL</div>
          <div>$14,000</div>
        </body>
      </html>
    `;
    const eslChinaOpenQualifier2Html = `
      <html>
        <head>
          <title>ESL Challenger China Season 3: Open Qualifier 2 overview | DLTV</title>
          <meta name="description" content="Complete overview of ESL Challenger China Season 3: Open Qualifier 2 which will take place from Apr 17, 2026 to Apr 19, 2026, a $14,000 Dota 2 tournament.">
        </head>
        <body>
          <h1>ESL Challenger China Season 3: Open Qualifier 2</h1>
          <a href="https://dltv.org/events/esl-challenger-china-season-3">Main event</a>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>APR 17 - APR 19, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>B-QUAL TIER</div>
          <div>PRIZE POOL</div>
          <div>$14,000</div>
        </body>
      </html>
    `;
    const dreamleagueMainHtml = `
      <html>
        <head>
          <title>DreamLeague 29 overview | DLTV</title>
          <meta name="description" content="Complete overview of DreamLeague 29 which will take place from May 13, 2026 to May 24, 2026, a $1,000,000 Dota 2 tournament.">
        </head>
        <body>
          <h1>DreamLeague 29</h1>
          <div style="background-image: url('https://s3.dltv.org/uploads/events/big/dream-main.png')"></div>
          <a href="https://dltv.org/events/dreamleague-season-29/dreamleague-season-29-china-closed-qualifier">China Closed Qualifier</a>
          <a href="https://dltv.org/events/dreamleague-season-29/dreamleague-season-29-south-america-closed-qualifier">South America Closed Qualifier</a>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>MAY 13 - MAY 24, 2026</div>
          <div>COUNTRY</div>
          <div>EUROPE</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
          <div>PRIZE POOL</div>
          <div>$1,000,000</div>
        </body>
      </html>
    `;
    const dreamleagueChinaQualifierHtml = `
      <html>
        <head>
          <title>DreamLeague 29: China Closed Qualifier overview | DLTV</title>
          <meta name="description" content="Complete overview of DreamLeague 29: China Closed Qualifier held from Apr. 12, 2026 to Apr. 14, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>DreamLeague 29: China Closed Qualifier</h1>
          <a href="https://dltv.org/events/dreamleague-season-29">Main event</a>
          <a href="https://dltv.org/events/dreamleague-season-29-china-closed-qualifier/dreamleague-season-29-china-open-qualifier-1">Open Qualifier 1</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 12 - APR 14, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>A-QUAL TIER</div>
        </body>
      </html>
    `;
    const dreamleagueChinaOpenHtml = `
      <html>
        <head>
          <title>DreamLeague Season 29: China Open Qualifier 1 overview | DLTV</title>
          <meta name="description" content="Complete overview of DreamLeague Season 29: China Open Qualifier 1 held from Apr. 08, 2026 to Apr. 09, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>DreamLeague Season 29: China Open Qualifier 1</h1>
          <a href="https://dltv.org/events/dreamleague-season-29/dreamleague-season-29-china-closed-qualifier">China Closed Qualifier</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 08 - APR 09, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>B-QUAL TIER</div>
        </body>
      </html>
    `;
    const dreamleagueSaQualifierHtml = `
      <html>
        <head>
          <title>DreamLeague 29: South America Closed Qualifier overview | DLTV</title>
          <meta name="description" content="Complete overview of DreamLeague 29: South America Closed Qualifier held from Apr. 12, 2026 to Apr. 14, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>DreamLeague 29: South America Closed Qualifier</h1>
          <a href="https://dltv.org/events/dreamleague-season-29">Main event</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 12 - APR 14, 2026</div>
          <div>COUNTRY</div>
          <div>SOUTH AMERICA</div>
          <div>EVENT TIER</div>
          <div>A-QUAL TIER</div>
        </body>
      </html>
    `;
    const blastMainHtml = `
      <html>
        <head>
          <title>Blast Slam 7 overview | DLTV</title>
          <meta name="description" content="Complete overview of Blast Slam 7 which will take place from May 26, 2026 to Jun. 07, 2026, a $1,000,000 Dota 2 tournament.">
        </head>
        <body>
          <h1>BLAST SLAM 7</h1>
          <div style="background-image: url('https://s3.dltv.org/uploads/events/big/blast-main.png')"></div>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier">China Closed Qualifier</a>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-southeast-asia-closed-qualifier">SEA Closed Qualifier</a>
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-europe-closed-qualifier">EU Closed Qualifier</a>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>MAY 26 - JUN 07, 2026</div>
          <div>COUNTRY</div>
          <div>DENMARK</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
          <div>PRIZE POOL</div>
          <div>$1,000,000</div>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('dltv.org/matches')) {
        return {
          ok: true,
          text: async () => '<html><body>No upcoming matches</body></html>',
        } as Response;
      }
      if (url === 'https://dltv.org/events') {
        return {
          ok: true,
          text: async () => eventsCatalogHtml,
        } as Response;
      }
      if (url.endsWith('/events/dreamleague-season-29')) {
        return {
          ok: true,
          text: async () => dreamleagueMainHtml,
        } as Response;
      }
      if (url.endsWith('/events/esl-challenger-china-season-3')) {
        return {
          ok: true,
          text: async () => eslChinaMainHtml,
        } as Response;
      }
      if (url.includes('esl-challenger-china-season-3-open-qualifier-1')) {
        return {
          ok: true,
          text: async () => eslChinaOpenQualifier1Html,
        } as Response;
      }
      if (url.includes('esl-challenger-china-season-3-open-qualifier-2')) {
        return {
          ok: true,
          text: async () => eslChinaOpenQualifier2Html,
        } as Response;
      }
      if (url.includes('dreamleague-season-29-china-closed-qualifier/dreamleague-season-29-china-open-qualifier-1')) {
        return {
          ok: true,
          text: async () => dreamleagueChinaOpenHtml,
        } as Response;
      }
      if (url.includes('dreamleague-season-29/dreamleague-season-29-china-closed-qualifier')) {
        return {
          ok: true,
          text: async () => dreamleagueChinaQualifierHtml,
        } as Response;
      }
      if (url.includes('dreamleague-season-29/dreamleague-season-29-south-america-closed-qualifier')) {
        return {
          ok: true,
          text: async () => dreamleagueSaQualifierHtml,
        } as Response;
      }
      if (url.endsWith('/events/blast-slam-7')) {
        return {
          ok: true,
          text: async () => blastMainHtml,
        } as Response;
      }
      if (url.includes('blast-slam-vii-china-closed-qualifier') || url.includes('blast-slam-vii-southeast-asia-closed-qualifier') || url.includes('blast-slam-vii-europe-closed-qualifier')) {
        return {
          ok: true,
          text: async () => `
            <html>
              <head><title>Qualifier overview | DLTV</title></head>
              <body>
                <h1>Qualifier</h1>
                <a href="https://dltv.org/events/blast-slam-7">Main event</a>
                <div>FINISHED</div>
                <div>DATES</div>
                <div>APR 02 - APR 03, 2026</div>
                <div>COUNTRY</div>
                <div>SEA</div>
                <div>EVENT TIER</div>
                <div>A-QUAL TIER</div>
              </body>
            </html>
          `,
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

    const tournamentInsertCalls = (db.query as any).mock.calls
      .filter((call: unknown[]) => String(call[0] || '').includes('INSERT INTO tournaments'));
    const blastMainInsert = tournamentInsertCalls.find((call: unknown[]) => call[1]?.[0] === 19101);
    const dreamQualifierInsert = tournamentInsertCalls.find((call: unknown[]) => call[1]?.[0] === 19448);
    const eslMainInsert = tournamentInsertCalls.find((call: unknown[]) => call[1]?.[11] === 'https://dltv.org/events/esl-challenger-china-season-3');
    const eslQualifier2Insert = tournamentInsertCalls.find((call: unknown[]) => call[1]?.[11] === 'https://dltv.org/events/esl-challenger-china-season-3/esl-challenger-china-season-3-open-qualifier-2');

    expect(blastMainInsert).toBeDefined();
    expect(blastMainInsert[1]).toEqual(expect.arrayContaining([
      19101,
      'Blast Slam 7',
      'A',
      'DENMARK',
      'upcoming',
      expect.any(Number),
      expect.any(Number),
      '$1,000,000',
      1000000,
      'https://s3.dltv.org/uploads/events/big/blast-main.png',
      'https://flagcdn.com/w40/dk.png',
      'https://dltv.org/events/blast-slam-7',
      'blast-slam-7',
      'blast-slam-7',
      'blast-slam-7',
    ]));

    expect(dreamQualifierInsert).toBeDefined();
    expect(dreamQualifierInsert[1]).toEqual(expect.arrayContaining([
      19448,
      'DreamLeague Season 29 Qualifiers',
      'A-QUAL',
      'Multiple regions',
      'ongoing',
      expect.any(Number),
      expect.any(Number),
      null,
      null,
      'https://s3.dltv.org/uploads/events/big/dream-main.png',
      null,
      'https://dltv.org/events/dreamleague-season-29#qualifiers',
      'dreamleague-season-29-qualifiers',
      'dreamleague-season-29',
      'dreamleague-season-29',
    ]));

    expect(eslMainInsert).toBeDefined();
    expect(eslMainInsert?.[1]).toEqual(expect.arrayContaining([
      expect.any(Number),
      'ESL Challenger China Season 3',
      'B',
      'CHINA',
      'upcoming',
      expect.any(Number),
      expect.any(Number),
      '$172,000',
      172000,
      'https://s3.dltv.org/uploads/events/big/esl-china-main.png',
      'https://flagcdn.com/w40/cn.png',
      'https://dltv.org/events/esl-challenger-china-season-3',
      'esl-challenger-china-season-3',
      'esl-challenger-china-season-3',
      'esl-challenger-china-season-3',
    ]));

    expect(eslQualifier2Insert).toBeDefined();
    expect(eslQualifier2Insert?.[1]).toEqual(expect.arrayContaining([
      expect.any(Number),
      'ESL Challenger China Season 3: Open Qualifier 2',
      'B-QUAL',
      'CHINA',
      'upcoming',
      expect.any(Number),
      expect.any(Number),
      '$14,000',
      14000,
      null,
      'https://flagcdn.com/w40/cn.png',
      'https://dltv.org/events/esl-challenger-china-season-3/esl-challenger-china-season-3-open-qualifier-2',
      'esl-challenger-china-season-3-open-qualifier-2',
      'esl-challenger-china-season-3',
      'esl-challenger-china-season-3',
    ]));
  });

  it('falls back to a synthetic tournament id when an explicit Blast mapping collides with another production row', async () => {
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

    db.query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM tournaments') && sql.includes('ORDER BY updated_at DESC NULLS LAST')) {
        return [{
          league_id: 19520,
          name: 'ESL Challenger China Season 3: Open Qualifier 1',
          tier: 'B-QUAL',
          location: 'China',
          status: 'upcoming',
          start_time: 1776384000,
          end_time: 1776643199,
          prize_pool: '$14,000',
          prize_pool_usd: 14000,
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
          <title>BLAST Slam 7: China Closed Qualifier overview | DLTV</title>
          <meta name="description" content="Complete overview of BLAST Slam 7: China Closed Qualifier held from Apr. 02, 2026 to Apr. 03, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>BLAST SLAM 7: CHINA CLOSED QUALIFIER</h1>
          <a href="https://dltv.org/events/blast-slam-7">MAIN EVENT</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 02 - APR 03, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>A-QUAL TIER</div>
        </body>
      </html>
    `;
    const mainEventHtml = `
      <html>
        <head>
          <title>Blast Slam 7 overview | DLTV</title>
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
      <div class="match upcoming" data-series-id="888888" data-matches-odd="2026-04-14 03:30:00">
        <div class="match__head">
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier"></a>
          <div class="match__head-event"><span>BLAST Slam 7: China Closed Qualifier</span></div>
          <div class="match__head-format text-red">Upper Bracket</div>
          <div class="match__head-format">Bo3</div>
        </div>
        <div class="match__body-details">
          <div class="match__body-details__team"><div class="team__title"><span>Glyph</span></div></div>
          <div class="match__body-details__team"><div class="team__title"><span>Cloud Rising</span></div></div>
        </div>
      </div>
    ` + ' '.repeat(1200));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('dltv.org/matches')) {
        return { ok: true, text: async () => dltvHtml } as Response;
      }
      if (url === 'https://dltv.org/events' || url === 'https://r.jina.ai/http://dltv.org/events') {
        return { ok: true, text: async () => '<html><body>No demo events</body></html>' } as Response;
      }
      if (url.includes('blast-slam-vii-china-closed-qualifier')) {
        return { ok: true, text: async () => qualifierHtml } as Response;
      }
      if (url.endsWith('/events/blast-slam-7')) {
        return { ok: true, text: async () => mainEventHtml } as Response;
      }
      if (url.includes('api.opendota.com')) {
        return { ok: true, json: async () => ([]) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const tournamentInsertCall = (db.query as any).mock.calls.find((call: unknown[]) => (
      String(call[0] || '').includes('INSERT INTO tournaments')
      && Array.isArray(call[1])
      && call[1].includes('https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier')
    ));
    const insertedLeagueId = Number(tournamentInsertCall?.[1]?.[0]);

    expect(tournamentInsertCall).toBeDefined();
    expect(insertedLeagueId).not.toBe(19520);
    expect(tournamentInsertCall?.[1]).toEqual(expect.arrayContaining([
      insertedLeagueId,
      'BLAST Slam 7: China Closed Qualifier',
      'A-QUAL',
      'CHINA',
      'completed',
      'https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier',
      'blast-slam-vii-china-closed-qualifier',
      'blast-slam-7',
      'blast-slam-7',
    ]));

    const upcomingInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));
    expect(upcomingInsertCall?.[3]).toBeTypeOf('number');
    expect(upcomingInsertCall?.[3]).not.toBe(19520);
  });

  it('reuses the existing synthetic Blast China qualifier row and removes duplicate rows on later syncs', async () => {
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

    db.query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM tournaments') && sql.includes('ORDER BY updated_at DESC NULLS LAST')) {
        return [
          {
            league_id: 19520,
            name: 'ESL Challenger China Season 3: Open Qualifier 1',
            tier: 'B-QUAL',
            location: 'China',
            status: 'upcoming',
            source_url: 'https://dltv.org/events/esl-challenger-china-season-3/esl-challenger-china-season-3-open-qualifier-1',
            dltv_event_slug: 'esl-challenger-china-season-3-open-qualifier-1',
            event_group_slug: 'esl-challenger-china-season-3',
          },
          {
            league_id: 1654929017,
            name: 'BLAST Slam 7: China Closed Qualifier',
            tier: 'A-QUAL',
            location: 'China',
            status: 'finished',
            source_url: 'https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier',
            dltv_event_slug: 'blast-slam-vii-china-closed-qualifier',
            dltv_parent_slug: 'blast-slam-7',
            event_group_slug: 'blast-slam-7',
          },
          {
            league_id: 1654929015,
            name: 'BLAST Slam 7: China Closed Qualifier',
            tier: 'A-QUAL',
            location: 'China',
            status: 'finished',
            source_url: 'https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier',
            dltv_event_slug: 'blast-slam-vii-china-closed-qualifier',
            dltv_parent_slug: 'blast-slam-7',
            event_group_slug: 'blast-slam-7',
          },
        ];
      }
      if (sql.includes('SELECT league_id FROM tournaments WHERE league_id =')) {
        return [];
      }
      return [];
    });

    const qualifierHtml = `
      <html>
        <head><title>BLAST Slam 7: China Closed Qualifier overview | DLTV</title></head>
        <body>
          <h1>BLAST SLAM 7: CHINA CLOSED QUALIFIER</h1>
          <a href="https://dltv.org/events/blast-slam-7">MAIN EVENT</a>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>APR 02 - APR 03, 2026</div>
          <div>COUNTRY</div>
          <div>CHINA</div>
          <div>EVENT TIER</div>
          <div>A-QUAL TIER</div>
        </body>
      </html>
    `;
    const dltvHtml = (`
      <div class="match upcoming" data-series-id="999001" data-matches-odd="2026-04-14 03:30:00">
        <div class="match__head">
          <a href="https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier"></a>
          <div class="match__head-event"><span>BLAST Slam 7: China Closed Qualifier</span></div>
          <div class="match__head-format">Bo3</div>
        </div>
        <div class="match__body-details">
          <div class="match__body-details__team"><div class="team__title"><span>Glyph</span></div></div>
          <div class="match__body-details__team"><div class="team__title"><span>Cloud Rising</span></div></div>
        </div>
      </div>
    ` + ' '.repeat(1200));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('dltv.org/matches')) {
        return { ok: true, text: async () => dltvHtml } as Response;
      }
      if (url === 'https://dltv.org/events' || url === 'https://r.jina.ai/http://dltv.org/events') {
        return { ok: true, text: async () => '<html><body>No demo events</body></html>' } as Response;
      }
      if (url.includes('blast-slam-vii-china-closed-qualifier')) {
        return { ok: true, text: async () => qualifierHtml } as Response;
      }
      if (url.endsWith('/events/blast-slam-7')) {
        return { ok: true, text: async () => '<html><body>Blast main</body></html>' } as Response;
      }
      if (url.includes('api.opendota.com')) {
        return { ok: true, json: async () => ([]) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const tournamentInsertCall = (db.query as any).mock.calls.find((call: unknown[]) => (
      String(call[0] || '').includes('INSERT INTO tournaments')
      && Array.isArray(call[1])
      && call[1].includes('https://dltv.org/events/blast-slam-7/blast-slam-vii-china-closed-qualifier')
    ));
    expect(tournamentInsertCall?.[1]?.[0]).toBe(1654929015);

    const deleteCall = (db.query as any).mock.calls.find((call: unknown[]) => (
      String(call[0] || '').includes('DELETE FROM tournaments WHERE league_id = $1')
      && Array.isArray(call[1])
      && call[1][0] === 1654929017
    ));
    expect(deleteCall).toBeDefined();
  });

  it('restores PGL Wallachia Season 7 and creates a separate Season 8 row', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id, name, tag FROM teams')) {
        return [{ team_id: '2163', name: 'Team Liquid', tag: 'TL' }];
      }
      if (sql.includes('SELECT team_id FROM teams WHERE LOWER(name) =')) {
        return [];
      }
      return [];
    });

    db.query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM tournaments') && sql.includes('ORDER BY updated_at DESC NULLS LAST')) {
        return [{
          league_id: 19435,
          name: 'PGL Wallachia Season 8',
          tier: 'A',
          location: 'Romania',
          status: 'upcoming',
          start_time: 1776470400,
          end_time: 1777247999,
          prize_pool: '$1,000,000',
          prize_pool_usd: 1000000,
          image: 'https://s3.dltv.org/uploads/events/big/pgl-s8.png',
          location_flag_url: 'https://flagcdn.com/w40/ro.png',
          source_url: 'https://dltv.org/events/pgl-wallachia-season-8',
          dltv_event_slug: 'pgl-wallachia-season-8',
          dltv_parent_slug: null,
          event_group_slug: 'pgl-wallachia-season-8',
        }];
      }
      if (sql.includes('SELECT league_id FROM tournaments WHERE league_id =')) {
        return [];
      }
      return [];
    });

    const eventsCatalogHtml = `
      <html>
        <body>
          <div class="events__card">
            <a href="https://dltv.org/events/pgl-wallachia-season-8" class="events__card-head">
              <div class="events__card-head__pic">
                <div class="pic" style="background-image: url('https://s3.dltv.org/uploads/events/pgl-s8-card.png')">
                  <div class="pic__tag">
                    <span data-datetime-source="2026-04-18 00:00:00">Apr 18</span>
                    -
                    <span data-datetime-source="2026-04-26 00:00:00">Apr 26</span>
                  </div>
                </div>
              </div>
              <div class="events__card-head__info">
                <div class="info__col">
                  <div class="info__col-item name">PGL Wallachia Season 8</div>
                  <div class="info__col-item"><span>Romania</span></div>
                  <div class="info__col-item prize"><span>Prize pool <strong>$1,000,000</strong></span></div>
                </div>
                <div class="info__col width-50 abs">
                  <div class="info__col-item align-right">A-Tier Tier</div>
                  <div class="info__col-item align-right">16 participants</div>
                </div>
              </div>
            </a>
          </div>
        </body>
      </html>
    `;
    const s7Html = `
      <html>
        <head><title>PGL Wallachia Season 7 overview | DLTV</title></head>
        <body>
          <h1>PGL Wallachia Season 7</h1>
          <div>FINISHED</div>
          <div>DATES</div>
          <div>MAR 08 - MAR 16, 2026</div>
          <div>COUNTRY</div>
          <div>ROMANIA</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
          <div>PRIZE POOL</div>
          <div>$1,000,000</div>
        </body>
      </html>
    `;
    const s8Html = `
      <html>
        <head><title>PGL Wallachia Season 8 overview | DLTV</title></head>
        <body>
          <h1>PGL Wallachia Season 8</h1>
          <div>UPCOMING</div>
          <div>DATES</div>
          <div>APR 18 - APR 26, 2026</div>
          <div>COUNTRY</div>
          <div>ROMANIA</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
          <div>PRIZE POOL</div>
          <div>$1,000,000</div>
        </body>
      </html>
    `;
    const dltvHtml = (`
      <div class="match upcoming" data-series-id="999002" data-matches-odd="2026-04-18 03:30:00">
        <div class="match__head">
          <a href="https://dltv.org/events/pgl-wallachia-season-8"></a>
          <div class="match__head-event"><span>PGL Wallachia Season 8</span></div>
          <div class="match__head-format">Bo3</div>
        </div>
        <div class="match__body-details">
          <div class="match__body-details__team"><div class="team__title"><span>Team Liquid</span></div></div>
          <div class="match__body-details__team"><div class="team__title"><span>Aurora Gaming</span></div></div>
        </div>
      </div>
    ` + ' '.repeat(1200));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('dltv.org/matches')) {
        return { ok: true, text: async () => dltvHtml } as Response;
      }
      if (url === 'https://dltv.org/events') {
        return { ok: true, text: async () => eventsCatalogHtml } as Response;
      }
      if (url === 'https://r.jina.ai/http://dltv.org/events') {
        return { ok: true, text: async () => eventsCatalogHtml } as Response;
      }
      if (url.endsWith('/events/pgl-wallachia-season-7')) {
        return { ok: true, text: async () => s7Html } as Response;
      }
      if (url.endsWith('/events/pgl-wallachia-season-8')) {
        return { ok: true, text: async () => s8Html } as Response;
      }
      if (url.includes('api.opendota.com')) {
        return { ok: true, json: async () => ([]) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }));

    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const tournamentInsertCalls = (db.query as any).mock.calls
      .filter((call: unknown[]) => String(call[0] || '').includes('INSERT INTO tournaments'));

    const repairedS7 = tournamentInsertCalls.find((call: unknown[]) => call[1]?.[0] === 19435);
    const insertedS8 = tournamentInsertCalls.find((call: unknown[]) => (
      Array.isArray(call[1])
      && call[1][0] !== 19435
      && call[1].includes('https://dltv.org/events/pgl-wallachia-season-8')
    ));

    expect(repairedS7?.[1]).toEqual(expect.arrayContaining([
      19435,
      'PGL Wallachia Season 7',
      'A',
      'ROMANIA',
      'completed',
      'https://dltv.org/events/pgl-wallachia-season-7',
      'pgl-wallachia-season-7',
      'pgl-wallachia-season-7',
    ]));
    expect(insertedS8).toBeDefined();
    expect(insertedS8?.[1]?.[0]).not.toBe(19435);

    const upcomingInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));
    expect(upcomingInsertCall?.[3]).not.toBe(19435);
    expect(upcomingInsertCall?.slice(1)).toContain('PGL Wallachia Season 8');
  });

  it('falls back to Jina markdown when the direct DLTV matches page is rate limited', async () => {
    taggedMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id, name, tag FROM teams')) {
        return [
          { team_id: '111', name: 'Team Lynx', tag: 'Lynx' },
          { team_id: '222', name: 'Nemiga Gaming', tag: 'Nemiga' },
        ];
      }
      if (sql.includes('SELECT team_id FROM teams WHERE LOWER(name) =')) {
        return [];
      }
      return [];
    });

    const dltvMarkdown = `
Title: Dota 2 Matches & livescore – DLTV

Markdown Content:
#### April 16 - Thursday[](http://dltv.org/matches)

[](https://dltv.org/events/european-pro-league-season-36)

European Pro League Season 36

Upper Bracket Final

bo3

[](https://dltv.org/matches/426144/team-lynx-vs-nemiga-gaming-european-pro-league-season-36)

Team Lynx

Apr 16**12:00**

Starts in:**06 : 30 : 21**

Nemiga Gaming

[](https://dltv.org/matches/426144/team-lynx-vs-nemiga-gaming-european-pro-league-season-36#lineups)Stats
`;

    const eventHtml = `
      <html>
        <head>
          <title>European Pro League Season 36 overview | DLTV</title>
          <meta name="description" content="Complete overview of European Pro League Season 36 held from Apr. 10, 2026 to Apr. 20, 2026, a Dota 2 tournament.">
        </head>
        <body>
          <h1>European Pro League Season 36</h1>
          <div>ONGOING</div>
          <div>DATES</div>
          <div>APR 10 - APR 20, 2026</div>
          <div>COUNTRY</div>
          <div>ONLINE</div>
          <div>EVENT TIER</div>
          <div>A-TIER</div>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === 'https://dltv.org/matches') {
        return {
          ok: false,
          status: 429,
          text: async () => '',
        } as Response;
      }
      if (url === 'https://r.jina.ai/http://dltv.org/matches') {
        return {
          ok: true,
          status: 200,
          text: async () => dltvMarkdown,
        } as Response;
      }
      if (url === 'https://dltv.org/events' || url === 'https://r.jina.ai/http://dltv.org/events') {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body>No demo events</body></html>',
        } as Response;
      }
      if (url.includes('events/european-pro-league-season-36')) {
        return {
          ok: true,
          status: 200,
          text: async () => eventHtml,
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

    const result = await runSyncLiquipedia();

    const upcomingInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));
    expect(result.success).toBe(true);
    expect(upcomingInsertCall).toBeDefined();
    expect(upcomingInsertCall?.slice(1)).toContain('dltv_426144_1776340800');
    expect(upcomingInsertCall?.slice(1)).toContain('https://dltv.org/events/european-pro-league-season-36');
  });
});
