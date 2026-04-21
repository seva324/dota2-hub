import { describe, expect, it } from 'vitest';
import { parseDltvFeaturedTournamentPage } from '../../../../lib/server/featured-tournament.js';

const definition = {
  id: 'esl-one-birmingham-2026',
  sourceLabel: 'DLTV',
  sourceUrl: 'https://dltv.org/events/esl-one-birmingham-2026',
  format: 'round-robin',
};

const fixture = `
<section class="group__stage">
  <div class="table__head-item width-70 width-m-55 big-text">Group A</div>
  <a href="https://dltv.org/teams/yakult-brothers" class="table__body-row">
    <div class="cell__coloured">1</div>
    <div class="cell__logo" data-theme-light="https://cdn.example/yb.png"></div>
    <div class="cell__name">
      <div>Yakult Brothers</div>
      <div class="cell__name-text">China</div>
    </div>
    <div class="cell__text"><strong>5 - 1 - 1</strong></div>
    <div class="cell__text">11 - 3</div>
  </a>
  <a href="https://dltv.org/teams/team-liquid" class="table__body-row">
    <div class="cell__coloured">4</div>
    <div class="cell__logo" data-theme-light="https://cdn.example/liquid.png"></div>
    <div class="cell__name">
      <div>Team Liquid</div>
      <div class="cell__name-text">Europe</div>
    </div>
    <div class="cell__text"><strong>3 - 2 - 2</strong></div>
    <div class="cell__text">8 - 7</div>
  </a>
  <div class="table__head-item width-70 width-m-55 big-text">Group B</div>
  <a href="https://dltv.org/teams/xtreme-gaming" class="table__body-row">
    <div class="cell__coloured">2</div>
    <div class="cell__logo" data-theme-light="https://cdn.example/xg.png"></div>
    <div class="cell__name">
      <div>Xtreme Gaming</div>
      <div class="cell__name-text">China</div>
    </div>
    <div class="cell__text"><strong>4 - 2 - 1</strong></div>
    <div class="cell__text">10 - 4</div>
  </a>
  <a href="https://dltv.org/teams/aurora" class="table__body-row">
    <div class="cell__coloured">6</div>
    <div class="cell__logo" data-theme-light="https://cdn.example/aurora.png"></div>
    <div class="cell__name">
      <div>Aurora</div>
      <div class="cell__name-text">SEA</div>
    </div>
    <div class="cell__text"><strong>1 - 1 - 5</strong></div>
    <div class="cell__text">4 - 10</div>
  </a>
</section>
<section class="playoffs">
  <div class="playoffs__box-row__col small-upper-2 no-connectors">
    <div class="col__head">Upper Bracket R1</div>
    <div class="col__serie ">
      <a href="https://dltv.org/matches/1/yakult-brothers-vs-xtreme-gaming-esl-one-birmingham-2026">
        <div class="col__serie-date__item"><div>2026-04-20</div><div>18:00</div></div>
        <div class="col__serie-teams">
          <div class="col__serie-teams__item">
            <div class="logo" data-theme-light="https://cdn.example/yb.png"></div>
            <div class="name overflow-text-2">Yakult Brothers</div>
            <div class="score">0</div>
          </div>
          <div class="col__serie-teams__item">
            <div class="logo" data-theme-light="https://cdn.example/xg.png"></div>
            <div class="name overflow-text-2">Xtreme Gaming</div>
            <div class="score">0</div>
          </div>
        </div>
      </a>
    </div>
  </div>
  <div class="playoffs__box-row__col">
    <div class="col__head">Grand Finals</div>
  </div>
</section>
<section class="matches__scores"></section>
`;

describe('parseDltvFeaturedTournamentPage round-robin', () => {
  it('extracts two group standings and bracket lanes for ESL-style events', () => {
    const payload = parseDltvFeaturedTournamentPage(fixture, definition as never);

    expect(payload.groupStage.format).toBe('round-robin');
    expect(payload.groupStage.groups).toHaveLength(2);
    expect(payload.groupStage.groups?.[0]).toEqual(expect.objectContaining({ name: 'Group A' }));
    expect(payload.groupStage.groups?.[1]?.standings[0]).toEqual(expect.objectContaining({
      teamName: 'Xtreme Gaming',
      country: 'China',
      record: '4 - 2 - 1',
      mapRecord: '10 - 4',
      advancement: 'upper',
    }));
    expect(payload.groupStage.groups?.[1]?.standings[1]).toEqual(expect.objectContaining({
      advancement: 'eliminated',
    }));

    expect(payload.playoffs.rounds[0]).toEqual(expect.objectContaining({ roundName: 'Upper Bracket R1' }));
    expect(payload.playoffs.rounds[0]?.matches[0]).toEqual(expect.objectContaining({
      bracketLane: 'upper',
    }));
    expect(payload.playoffs.rounds[0]?.matches[0]?.teams[0]?.name).toBe('Yakult Brothers');
    expect(payload.playoffs.rounds[1]).toEqual(expect.objectContaining({ roundName: 'Grand Finals' }));
  });

  it('normalizes deeper DreamLeague playoff lanes and prize placements', () => {
    const dreamleagueDefinition = {
      id: 'dreamleague-division-2-season-4',
      sourceLabel: 'DLTV',
      sourceUrl: 'https://dltv.org/events/dreamleague-division-2-season-4',
      format: 'round-robin',
    };
    const dreamleagueFixture = `
    <section class="group__stage"></section>
    <section class="playoffs">
      <div class="playoffs__box-row__col">
        <div class="col__head">Upper Bracket R2</div>
        <div class="col__serie ">
          <a href="https://dltv.org/matches/10/nigma-vs-modus-dreamleague-division-2-season-4">
            <div class="col__serie-date"><div class="col__serie-date__item"><div>2026-04-28</div><div>18:00</div></div></div>
            <div class="col__serie-teams">
              <div class="col__serie-teams__item"><div class="logo" data-theme-light="https://cdn.example/nigma.png"></div><div class="name overflow-text-2">Nigma Galaxy</div><div class="score">0</div></div>
              <div class="col__serie-teams__item"><div class="logo" data-theme-light="https://cdn.example/modus.png"></div><div class="name overflow-text-2">Modus</div><div class="score">0</div></div>
            </div>
          </a>
        </div>
      </div>
      <div class="playoffs__box-row__col">
        <div class="col__head">Lower Bracket R4</div>
        <div class="col__serie ">
          <a href="https://dltv.org/matches/11/lynx-vs-1win-dreamleague-division-2-season-4">
            <div class="col__serie-date"><div class="col__serie-date__item"><div>2026-04-29</div><div>17:00</div></div></div>
            <div class="col__serie-teams">
              <div class="col__serie-teams__item"><div class="logo" data-theme-light="https://cdn.example/lynx.png"></div><div class="name overflow-text-2">Team Lynx</div><div class="score">2</div></div>
              <div class="col__serie-teams__item"><div class="logo" data-theme-light="https://cdn.example/1w.png"></div><div class="name overflow-text-2">1win Team</div><div class="score">1</div></div>
            </div>
          </a>
        </div>
      </div>
      <div class="playoffs__box-row__col final">
        <div class="col__head">Grand Finals</div>
        <div class="col__prize gold"><span>1st Place</span><strong>$15,000</strong></div>
      </div>
    </section>
    <section class="matches__scores"></section>
    `;

    const payload = parseDltvFeaturedTournamentPage(dreamleagueFixture, dreamleagueDefinition as never);

    expect(payload.playoffs.rounds[0]).toEqual(expect.objectContaining({ roundName: 'Upper Bracket R2', roundKey: 'upper-r2' }));
    expect(payload.playoffs.rounds[1]).toEqual(expect.objectContaining({ roundName: 'Lower Bracket R4', roundKey: 'lower-r4' }));
    expect(payload.playoffs.placementPrizes).toEqual(expect.arrayContaining([
      expect.objectContaining({ placement: '1st Place', prize: '$15,000' }),
      expect.objectContaining({ placement: '7th - 8th Place', prize: '$1,000' }),
    ]));
  });
});
