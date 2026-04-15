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
  <a class="item__info-logo" href="/teams/2163-team-liquid" data-theme-light="/uploads/teams/liquid.png"></a>
  <div class="item__info-team">
    <a href="/teams/2163-team-liquid" class="item__info-team__name"><div class="name">Team Liquid</div></a>
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
            team_id: '2163',
            name: 'Team Liquid',
            tag: 'Liquid',
            logo_url: 'https://dltv.org/uploads/teams/liquid.png',
          },
        ];
      }
      return [];
    }) as TaggedFn;

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(fixture),
    });

    expect(result.matched).toBe(4);
    expect(result.updated).toBe(2);
    expect(result.updates.map((entry) => entry.team_id)).toEqual(['10047487', '10102123']);

    const updateCalls = calls
      .filter((call) => renderSql(call[0] as TemplateStringsArray).startsWith('UPDATE teams'));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0].slice(1)).toContain('https://s3.dltv.org/uploads/teams/existing-essence.png');
    expect(updateCalls[0].slice(1)).toContain('10047487');
    expect(updateCalls[1].slice(1)).toContain('10102123');
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

  it('ignores DLTV placeholder logos so existing sources can remain as fallback', async () => {
    const db = vi.fn(async (strings: TemplateStringsArray) => (
      renderSql(strings).includes('SELECT team_id')
        ? [{ team_id: '10101464', name: 'Mideng dreamer', logo_url: 'https://cdn.steamusercontent.com/ugc/existing/' }]
        : []
    )) as unknown as TaggedFn;

    const result = await backfillDltvTeamLogos(db, {
      index: buildDltvRankingLogoIndex(`
        <div class="ranking__list-case__item">
          <a class="item__info-logo" href="/teams/10101464-mideng-dreamer" data-theme-light="https://dltv.org/images/desktop/empty/team.svg"></a>
          <div class="item__info-team">
            <a href="/teams/10101464-mideng-dreamer" class="item__info-team__name"><div class="name">Mideng dreamer</div></a>
          </div>
        </div>
      `),
    });

    expect(result.matched).toBe(0);
    expect(result.updated).toBe(0);
    expect(db).toHaveBeenCalledTimes(1);
  });
});
