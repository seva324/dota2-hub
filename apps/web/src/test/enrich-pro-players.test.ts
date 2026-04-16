import { describe, expect, it } from 'vitest';
import {
  buildDbCandidateQuery,
  extractDltvPlayerLinks,
  loadDbCandidates,
  resolveDltvProfileSourceByAccountId,
} from '../../../../scripts/manual-api/enrich-pro-players.js';

describe('extractDltvPlayerLinks', () => {
  it('keeps profile URLs and skips player image assets', () => {
    const raw = `
      <a href="/players/ghost">Ghost</a>
      <a href="https://dltv.org/players/ghostik">Ghostik</a>
      <img src="/players/medium/pFKsdt46dSsZrUOA1wibrqBNUuYoXUc7.png">
      <img src="https://dltv.org/players/3CpNFkFn6yA9Ha1eBqE0D6D3QhfU9n7F.png.webp">
    `;

    expect(extractDltvPlayerLinks(raw)).toEqual([
      'https://dltv.org/players/ghost',
      'https://dltv.org/players/ghostik',
    ]);
  });
});

describe('resolveDltvProfileSourceByAccountId', () => {
  it('selects the DLTV profile whose embedded Steam ID matches the target account id', async () => {
    const searchHtml = `
      <a href="/players/ghost">Ghost</a>
      <a href="/players/ghostik">Ghostik</a>
    `;
    const ghostHtml = `
      <html>
        <head><title>Ghost - Nigma Galaxy</title></head>
        <body>
          <h1>Ghost</h1>
          <a href="https://steamcommunity.com/profiles/76561198166908095">Steam</a>
        </body>
      </html>
    ` + ' '.repeat(300);
    const ghostikHtml = `
      <html>
        <head><title>Ghostik - Team</title></head>
        <body>
          <h1>Ghostik</h1>
          <a href="https://steamcommunity.com/profiles/76561197960266727">Steam</a>
        </body>
      </html>
    ` + ' '.repeat(300);

    const fetchImpl = async (url: string | URL) => {
      if (String(url) === 'https://dltv.org/search/players?q=Ghost') {
        return { ok: true, text: async () => searchHtml };
      }
      if (String(url) === 'https://dltv.org/players/ghost') {
        return { ok: true, text: async () => ghostHtml };
      }
      if (String(url) === 'https://dltv.org/players/ghostik') {
        return { ok: true, text: async () => ghostikHtml };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const resolved = await resolveDltvProfileSourceByAccountId(
      { account_id: 206642367, name: 'Ghost' },
      fetchImpl,
    );

    expect(resolved?.url).toBe('https://dltv.org/players/ghost');
    expect(resolved?.parsed.account_id).toBe(206642367);
    expect(resolved?.parsed.player_name).toBe('Ghost');
  });
});

describe('buildDbCandidateQuery', () => {
  it('limits DB backfill targets to recent active players and includes missing-row candidates', () => {
    const query = buildDbCandidateQuery({
      recentDays: 60,
      skipUpdatedHours: 24,
      includeMissingRows: true,
      limit: 25,
    });

    expect(query.params).toEqual([60, 24, 25]);
    expect(query.sql).toContain('WITH recent_players AS');
    expect(query.sql).toContain('JOIN match_summary ms ON ms.match_id = ps.match_id');
    expect(query.sql).toContain("ms.start_time >= NOW() - ($1 * INTERVAL '1 day')");
    expect(query.sql).toContain('LEFT JOIN pro_players pp ON pp.account_id::BIGINT = rp.account_id');
    expect(query.sql).toContain('(pp.account_id IS NULL) AS is_missing_row');
    expect(query.sql).toContain("COALESCE(NULLIF(BTRIM(pp.name), ''), rp.recent_name) AS name");
    expect(query.sql).toContain('pp.team_id IS NOT NULL');
    expect(query.sql).toContain('pp.account_id IS NULL OR');
    expect(query.sql).toContain("pp.updated_at < NOW() - ($2 * INTERVAL '1 hour')");
  });
});

describe('loadDbCandidates', () => {
  it('passes the derived-selector SQL and params through to db.query', async () => {
    const db = {
      query: async (sql: string, params: unknown[]) => [{ sql, params }],
    };

    const rows = await loadDbCandidates(db as any, {
      recentDays: 45,
      skipUpdatedHours: 0,
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].params).toEqual([45, 0, 10]);
    expect(rows[0].sql).toContain('FROM recent_players rp');
    expect(rows[0].sql).toContain('pp.team_id IS NOT NULL');
    expect(rows[0].sql).not.toContain('pp.account_id IS NULL OR');
    expect(rows[0].sql).not.toContain("pp.updated_at < NOW() - ($2 * INTERVAL '1 hour')");
  });
});
