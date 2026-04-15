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

    const tournamentInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO tournaments'));
    const upcomingInsertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));

    expect(tournamentInsertCall).toBeDefined();
    expect(tournamentInsertCall?.slice(1)).toContain('EPL World Series: SEA Season 13');
    expect(upcomingInsertCall).toBeDefined();
  });
});
