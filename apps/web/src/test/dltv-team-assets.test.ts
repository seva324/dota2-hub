import { describe, expect, it } from 'vitest';
import {
  buildDltvLookupKeys,
  buildDltvRankingLogoIndex,
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
    expect(entries[0]).toEqual({
      name: 'Team Liquid',
      teamUrl: 'https://dltv.org/teams/2163-team-liquid',
      logoUrl: 'https://dltv.org/uploads/teams/2163.png',
      lookupKeys: ['team liquid', 'liquid'],
    });
    expect(entries[1].name).toBe('Xtreme Gaming');
    expect(entries[1].logoUrl).toBe('https://cdn.example/xg.png');
    expect(entries[1].teamUrl).toBe('https://dltv.org/teams/8261500-xtreme-gaming');
  });

  it('extracts team names, logo URLs, and team links from stats rows', () => {
    const entries = parseDltvRankingLogos(statsFixture);

    expect(entries).toEqual([{
      name: 'Natus Vincere',
      teamUrl: 'https://vn.dltv.org/teams/natus-vincere',
      logoUrl: 'https://s3.dltv.org/uploads/teams/4Qxd8LGsNkAKWHKwfoSJiRoRE8IdflDI.png.webp',
      lookupKeys: ['natus vincere'],
    }]);
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
});
