import { describe, expect, it, vi } from 'vitest';
import { backfillDltvTeamLogos } from '../../../../lib/server/dltv-team-logo-backfill.js';
import { buildDltvRankingLogoIndex } from '../../../../lib/server/dltv-team-assets.js';

type TaggedFn = ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {};

const fixture = `
<div class="ranking__list-case__item">
  <a class="item__info-logo" href="/teams/9499402-team-essence" data-theme-light="https://s3.dltv.org/uploads/teams/essence.png"></a>
  <div class="item__info-team">
    <a href="/teams/9499402-team-essence" class="item__info-team__name"><div class="name">Team Essence</div></a>
  </div>
</div>
<div class="ranking__list-case__item">
  <a class="item__info-logo" href="/teams/10007878-team-refuser" data-theme-light="/uploads/teams/refuser.png"></a>
  <div class="item__info-team">
    <a href="/teams/10007878-team-refuser" class="item__info-team__name"><div class="name">Team Refuser</div></a>
  </div>
</div>
`;

function renderSql(strings: TemplateStringsArray) {
  return strings.join(' ').replace(/\s+/g, ' ').trim();
}

describe('backfillDltvTeamLogos', () => {
  it('updates every matching duplicate team row to prefer DLTV logos', async () => {
    const calls: unknown[][] = [];
    const db = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push([strings, ...values]);
      const sql = renderSql(strings);
      if (sql.includes('SELECT team_id')) {
        return [
          {
            team_id: '9499402',
            name: 'Team Essence',
            tag: 'Essence',
            logo_url: 'https://s3.dltv.org/uploads/teams/existing-essence.png',
          },
          {
            team_id: '10047487',
            name: 'Team Essence',
            tag: 'ESS',
            logo_url: 'https://cdn.steamusercontent.com/ugc/old-b/',
          },
          {
            team_id: '10102123',
            name: 'Essence',
            tag: null,
            logo_url: 'https://cdn.steamusercontent.com/ugc/old-c/',
          },
          {
            team_id: '10007878',
            name: 'Team Refuser',
            tag: 'Refuser',
            logo_url: 'https://dltv.org/uploads/teams/refuser.png',
          },
        ];
      }
      return [];
    }) as TaggedFn;

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(fixture),
    });

    expect(result.matched).toBe(4);
    expect(result.updated).toBe(3);
    expect(result.updates.map((entry) => entry.team_id)).toEqual(['9499402', '10047487', '10102123']);

    const updateCalls = calls
      .filter((call) => renderSql(call[0] as TemplateStringsArray).startsWith('UPDATE teams'));
    expect(updateCalls).toHaveLength(3);
    expect(updateCalls[0].slice(1)).toContain('https://s3.dltv.org/uploads/teams/essence.png');
    expect(updateCalls[0].slice(1)).toContain('9499402');
    expect(updateCalls[1].slice(1)).toContain('10047487');
    expect(updateCalls[2].slice(1)).toContain('10102123');
  });

  it('supports dry runs without writing updates', async () => {
    const db = vi.fn(async (strings: TemplateStringsArray) => (
      renderSql(strings).includes('SELECT team_id')
        ? [{ team_id: '10047487', name: 'Team Essence', logo_url: 'https://cdn.steamusercontent.com/ugc/old/' }]
        : []
    )) as unknown as TaggedFn;

    const result = await backfillDltvTeamLogos(db, {
      dryRun: true,
      index: buildDltvRankingLogoIndex(fixture),
    });

    expect(result.dryRun).toBe(true);
    expect(result.updated).toBe(0);
    expect(result.updates).toHaveLength(1);
    expect(db).toHaveBeenCalledTimes(1);
  });

  it('prefers curated GitHub-backed team logos before DLTV fallbacks', async () => {
    const db = vi.fn(async (strings: TemplateStringsArray) => (
      renderSql(strings).includes('SELECT team_id')
        ? [{ team_id: '2163', name: 'Team Liquid', tag: 'Liquid', logo_url: 'https://s3.dltv.org/uploads/teams/liquid.png' }]
        : []
    )) as unknown as TaggedFn;
    const fetchImpl = vi.fn();

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(fixture),
      fetchImpl,
    });

    expect(result.matched).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.updates[0]?.logoUrl).toBe('https://raw.githubusercontent.com/seva324/dota2-hub/main/public/images/mirror/teams/team-liquid.webp');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ignores DLTV placeholder logos so existing sources can remain as fallback', async () => {
    const db = vi.fn(async (strings: TemplateStringsArray) => (
      renderSql(strings).includes('SELECT team_id')
        ? [{ team_id: '10101464', name: 'Dream Placeholder', logo_url: 'https://cdn.steamusercontent.com/ugc/existing/' }]
        : []
    )) as unknown as TaggedFn;
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      text: async () => '',
    }));

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(`
        <div class="ranking__list-case__item">
          <a class="item__info-logo" href="/teams/10101464-dream-placeholder" data-theme-light="https://dltv.org/images/desktop/empty/team.svg"></a>
          <div class="item__info-team">
            <a href="/teams/10101464-dream-placeholder" class="item__info-team__name"><div class="name">Dream Placeholder</div></a>
          </div>
        </div>
      `),
      fetchImpl,
    });

    expect(result.matched).toBe(0);
    expect(result.updated).toBe(0);
    expect(db).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct DLTV team pages when the stats index has no match', async () => {
    const db = vi.fn(async (strings: TemplateStringsArray) => (
      renderSql(strings).includes('SELECT team_id')
        ? [{ team_id: '10007878', name: 'Team Refuser', tag: 'Refuser', logo_url: 'https://cdn.steamusercontent.com/ugc/legacy-refuser/' }]
        : []
    )) as unknown as TaggedFn;

    const fetchImpl = vi.fn(async (url: string) => ({
      ok: url === 'https://dltv.org/teams/team-refuser',
      text: async () => `
        <html>
          <head>
            <meta property="og:title" content="Team Refuser - DLTV" />
          </head>
          <body>
            <div class="team-header__logo" data-theme-light="https://s3.dltv.org/uploads/teams/small/refuser.png"></div>
          </body>
        </html>
      `,
    }));

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(''),
      fetchImpl,
    });

    expect(result.matched).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.updates[0]?.logoUrl).toBe('https://s3.dltv.org/uploads/teams/small/refuser.png');
    expect(fetchImpl).toHaveBeenCalledWith('https://dltv.org/teams/team-refuser', expect.any(Object));
  });

  it('rejects direct-page DLTV logos when the logo already belongs to an unrelated indexed team', async () => {
    const db = vi.fn(async (strings: TemplateStringsArray) => (
      renderSql(strings).includes('SELECT team_id')
        ? [{ team_id: '10101793', name: 'BALU TEAM', tag: 'BALU', logo_url: 'https://cdn.steamusercontent.com/ugc/legacy-balu/' }]
        : []
    )) as unknown as TaggedFn;

    const fetchImpl = vi.fn(async (url: string) => ({
      ok: url === 'https://dltv.org/teams/balu-team',
      text: async () => `
        <html>
          <head>
            <meta property="og:title" content="BALU TEAM - DLTV" />
          </head>
          <body>
            <div class="team-header__logo" data-theme-light="https://s3.dltv.org/uploads/teams/gexfrNniwJNykJuJrvuGwqaPu6tnOqcl.png.webp"></div>
          </body>
        </html>
      `,
    }));

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(`
        <div class="ranking__list-case__item">
          <a class="item__info-logo" href="/teams/2576071-yellow-submarine" data-theme-light="https://s3.dltv.org/uploads/teams/gexfrNniwJNykJuJrvuGwqaPu6tnOqcl.png.webp"></a>
          <div class="item__info-team">
            <a href="/teams/2576071-yellow-submarine" class="item__info-team__name"><div class="name">Yellow Submarine</div></a>
          </div>
        </div>
      `),
      fetchImpl,
    });

    expect(result.matched).toBe(0);
    expect(result.updated).toBe(0);
    expect(db).toHaveBeenCalledTimes(1);
  });
});
