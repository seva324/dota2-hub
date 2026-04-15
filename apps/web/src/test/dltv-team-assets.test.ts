import { describe, expect, it, vi } from 'vitest';
import {
  buildDltvLookupKeys,
  buildDltvRankingLogoIndex,
  fetchDltvRankingLogoIndex,
  hasConflictingDltvLogo,
  findDltvRankingLogo,
  parseDltvRankingLogos,
} from '../../../../lib/server/dltv-team-assets.js';

const fixture = `
<div class="ranking__list-case__item active">
  <div class="item__info">
    <div class="item__position">1</div>
    <a class="item__info-logo" href="/teams/2163-team-liquid" data-theme-light="/uploads/teams/2163.png" style="background-image:url('/uploads/teams/2163.png')"></a>
    <div class="item__info-team">
      <a href="/teams/2163-team-liquid" class="item__info-team__name">
        <div class="name">Team Liquid</div>
        <div class="points">(1,055 points)</div>
      </a>
      <ul class="item__info-team__teammates"><li>miCKe</li><li>Nisha</li></ul>
    </div>
  </div>
</div>
<div class="ranking__list-case__item">
  <div class="item__position">2</div>
  <a class="item__info-logo" href="/teams/8261500-xtreme-gaming" data-theme-light="https://cdn.example/xg.png" style="background-image:url('https://cdn.example/xg.png')"></a>
  <div class="item__info-team">
    <a href="/teams/8261500-xtreme-gaming" class="item__info-team__name"><div class="name">Xtreme Gaming</div></a>
  </div>
</div>
`;

const statsFixture = `
<div class="table-body">
  <div class="table__body-row">
    <div class="table__body-row__cell width-15 width-m-15"><div class="cell__coloured">1</div></div>
    <a href="https://vn.dltv.org/teams/natus-vincere" class="table__body-row__cell width-55 width-m-55">
      <div class="cell__logo" data-theme-light="https://s3.dltv.org/uploads/teams/4Qxd8LGsNkAKWHKwfoSJiRoRE8IdflDI.png.webp"></div>
      <div class="cell__name">
        <div>Natus Vincere</div>
        <div class="cell__name-text">Ukraine</div>
      </div>
    </a>
  </div>
</div>
`;

describe('DLTV ranking logo helpers', () => {
  it('extracts team names, logo URLs, and team links from ranking rows', () => {
    const entries = parseDltvRankingLogos(fixture);

    expect(entries.length).toBe(2);
    expect(entries[0]).toEqual(expect.objectContaining({
      name: 'Team Liquid',
      teamUrl: 'https://dltv.org/teams/2163-team-liquid',
      logoUrl: 'https://dltv.org/uploads/teams/2163.png',
      lookupKeys: ['team liquid', 'liquid'],
      logoFingerprint: 'dltv.org/uploads/teams/2163.png',
    }));
    expect(entries[1].name).toBe('Xtreme Gaming');
    expect(entries[1].logoUrl).toBe('https://cdn.example/xg.png');
    expect(entries[1].teamUrl).toBe('https://dltv.org/teams/8261500-xtreme-gaming');
  });

  it('extracts team names, logo URLs, and team links from stats rows', () => {
    const entries = parseDltvRankingLogos(statsFixture);

    expect(entries).toEqual([expect.objectContaining({
      name: 'Natus Vincere',
      teamUrl: 'https://vn.dltv.org/teams/natus-vincere',
      logoUrl: 'https://s3.dltv.org/uploads/teams/4Qxd8LGsNkAKWHKwfoSJiRoRE8IdflDI.png.webp',
      lookupKeys: ['natus vincere'],
      logoFingerprint: 's3.dltv.org/uploads/teams/4Qxd8LGsNkAKWHKwfoSJiRoRE8IdflDI.png.webp',
    })]);
  });

  it('resolves conservative aliases against the ranking index', () => {
    const index = buildDltvRankingLogoIndex(fixture);

    expect(findDltvRankingLogo(index, 'Liquid')?.logoUrl).toBe('https://dltv.org/uploads/teams/2163.png');
    expect(findDltvRankingLogo(index, 'XG')?.teamUrl).toBe('https://dltv.org/teams/8261500-xtreme-gaming');
    expect(findDltvRankingLogo(index, 'SR')).toBeNull();
    expect(findDltvRankingLogo(index, 'Unknown Team')).toBeNull();
  });

  it('keeps canonical names alongside compact aliases', () => {
    expect(buildDltvLookupKeys('Team Spirit')).toEqual(['team spirit', 'spirit']);
    expect(buildDltvLookupKeys('BB')).toEqual(['betboom team', 'betboom']);
  });

  it('builds a multi-page index from the DLTV stats API', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page') || '1');
      const payloads = {
        1: {
          current_page: 1,
          data: [{ title: 'Team Liquid', slug: 'team-liquid', image: 'https://s3.dltv.org/uploads/teams/liquid.png.webp' }],
        },
        2: {
          current_page: 2,
          data: [{ title: 'Cloud Rising', slug: 'cloud-rising', image: 'https://s3.dltv.org/uploads/teams/cloud-rising.png.webp' }],
        },
        3: {
          current_page: 3,
          data: [],
        },
      } as const;

      return {
        ok: true,
        json: async () => payloads[page as 1 | 2 | 3] || payloads[3],
      };
    });

    const index = await fetchDltvRankingLogoIndex({ fetchImpl, maxPages: 5 });

    expect(findDltvRankingLogo(index, 'Team Liquid')?.logoUrl).toBe('https://s3.dltv.org/uploads/teams/liquid.png.webp');
    expect(findDltvRankingLogo(index, 'Cloud Rising')?.teamUrl).toBe('https://dltv.org/teams/cloud-rising');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('flags direct-page logos that collide with an unrelated indexed team', () => {
    const index = buildDltvRankingLogoIndex(`
      <div class="ranking__list-case__item">
        <a class="item__info-logo" href="/teams/2576071-yellow-submarine" data-theme-light="https://s3.dltv.org/uploads/teams/gexfrNniwJNykJuJrvuGwqaPu6tnOqcl.png.webp"></a>
        <div class="item__info-team">
          <a href="/teams/2576071-yellow-submarine" class="item__info-team__name"><div class="name">Yellow Submarine</div></a>
        </div>
      </div>
      <div class="ranking__list-case__item">
        <a class="item__info-logo" href="/teams/4588-gamerlegion" data-theme-light="https://s3.dltv.org/uploads/teams/medium/SL5XvIyOVg02fCankoCetSnjT3x7FdVY.png"></a>
        <div class="item__info-team">
          <a href="/teams/4588-gamerlegion" class="item__info-team__name"><div class="name">GamerLegion</div></a>
        </div>
      </div>
    `);

    expect(hasConflictingDltvLogo(index, {
      name: 'BALU TEAM',
      logoUrl: 'https://s3.dltv.org/uploads/teams/gexfrNniwJNykJuJrvuGwqaPu6tnOqcl.png.webp',
    }, 'BALU TEAM')).toBe(true);

    expect(hasConflictingDltvLogo(index, {
      name: 'Amaru Flame',
      logoUrl: 'https://s3.dltv.org/uploads/teams/small/SL5XvIyOVg02fCankoCetSnjT3x7FdVY.png',
    }, 'Amaru Flame')).toBe(true);

    expect(hasConflictingDltvLogo(index, {
      name: 'Yellow Submarine',
      logoUrl: 'https://s3.dltv.org/uploads/teams/gexfrNniwJNykJuJrvuGwqaPu6tnOqcl.png.webp',
    }, 'Yellow Submarine')).toBe(false);
  });
});
