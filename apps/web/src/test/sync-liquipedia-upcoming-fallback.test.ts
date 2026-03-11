import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    const liquipediaHtml = (`
      <div class="match-info">
        <div data-timestamp="${Math.floor(Date.now() / 1000) + 3600}"></div>
        <a href="/dota2/Glyph" title="Glyph"><img /></a>
        <a href="/dota2/Cloud_Rising" title="Cloud Rising"><img /></a>
        <div class="match-info-tournament" title="EPL World Series: SEA/S13"></div>
        <span>(Bo3)</span>
      </div>
    ` + ' '.repeat(1200));

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('liquipedia.net')) {
        return {
          ok: true,
          text: async () => JSON.stringify({ parse: { text: { '*': liquipediaHtml } } }),
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

  it('persists Liquipedia team names when a team id is missing', async () => {
    const { runSyncLiquipedia } = await import('../../../../lib/server/sync-liquipedia.js');

    await runSyncLiquipedia();

    const insertCall = taggedMock.mock.calls.find((call) => renderSql(call[0] as TemplateStringsArray).includes('INSERT INTO upcoming_series'));
    expect(insertCall).toBeDefined();

    const values = insertCall?.slice(1) ?? [];
    expect(values).toContain('Glyph');
    expect(values).toContain('Cloud Rising');
  });
});
