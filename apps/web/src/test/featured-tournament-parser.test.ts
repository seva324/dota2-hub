import { describe, expect, it } from 'vitest';
import { parseDltvFeaturedTournamentPage } from '../../../../lib/server/featured-tournament.js';

const definition = {
  id: 'pgl-wallachia-s7',
  sourceLabel: 'DLTV',
  sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
};

const fixture = `
<section class="group__stage">
  <div class="row">
    <div class="col-6">
      <div class="table-body">
        <div class="table__body-row">
          <div class="cell__coloured">1</div>
          <a href="https://dltv.org/teams/team-liquid" class="table__body-row__cell width-65 width-m-65">
            <div class="cell__logo" data-theme-light="https://cdn.example/liquid.png"></div>
            <div class="cell__name">
              <div>Team Liquid</div>
              <div class="cell__name-text">Sweden</div>
            </div>
          </a>
          <div class="cell__text big">3 - 0</div>
        </div>
        <div class="table__body-row">
          <div class="cell__coloured">6</div>
          <a href="https://dltv.org/teams/betboom-team" class="table__body-row__cell width-65 width-m-65">
            <div class="cell__logo" data-theme-light="https://cdn.example/bb.png"></div>
            <div class="cell__name">
              <div>BetBoom Team</div>
              <div class="cell__name-text">Russia</div>
            </div>
          </a>
          <div class="cell__text big">3 - 2</div>
        </div>
      </div>
    </div>
    <div class="col-6">
      <div class="table__head">
        <div class="table__head-item width-20 width-m-20 text-center">R 1</div>
      </div>
      <div class="table-body">
        <div class="table__body-row">
          <a href="https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row__cell f-c width-20 width-m-20 align-center leaf-cell">
            <div class="cell__logo-md" data-theme-light="https://cdn.example/bb.png"></div>
            <div class="cell__text"><strong>2 - 1</strong></div>
          </a>
        </div>
        <div class="table__body-row">
          <a href="https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row__cell f-c width-20 width-m-20 align-center leaf-cell">
            <div class="cell__logo-md" data-theme-light="https://cdn.example/liquid.png"></div>
            <div class="cell__text"><strong>1 - 2</strong></div>
          </a>
        </div>
      </div>
    </div>
  </div>
</section>
<section class="playoffs">
  <div class="playoffs__box-row">
    <div class="playoffs__box-row__col">
      <div class="col__head">Upper Bracket R1 (bo3)</div>
      <div class="col__serie ">
        <div class="col__serie-connector before"><i></i></div>
        <a href="https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7">
          <div class="col__serie-date">
            <div class="col__serie-date__item">
              <div data-moment="MMM">2026-03-12 08:00:00</div>
              <div data-moment="DD">2026-03-12 08:00:00</div>
            </div>
          </div>
          <div class="col__serie-teams">
            <div class="col__serie-teams__item" data-playoff-team-id="9303484" data-playoff-connector="before">
              <div class="logo" data-theme-light="https://cdn.example/heroic.png"></div>
              <div class="name overflow-text-1">Heroic</div>
              <div class="score">0</div>
            </div>
            <div class="col__serie-teams__delimiter">VS</div>
            <div class="col__serie-teams__item" data-playoff-team-id="8255888" data-playoff-connector="after">
              <div class="logo" data-theme-light="https://cdn.example/bb.png"></div>
              <div class="name overflow-text-1">BetBoom Team</div>
              <div class="score">0</div>
            </div>
          </div>
        </a>
        <div class="col__serie-connector after"><i></i></div>
      </div>
    </div>
  </div>
  <div class="playoffs__box-row">
    <div class="playoffs__box-row__col">
      <div class="col__head">Grand Final (bo5)</div>
    </div>
  </div>
  <div class="playoffs__box-row">
    <div class="playoffs__box-row__col final final6">
      <div class="col__serie last">
        <div class="col__serie-connector before"><i></i></div>
        <a href="https://dltv.org/matches/425461/team-yandex-vs-team-liquid-pgl-wallachia-season-7">
          <div class="col__serie-date">
            <div class="col__serie-date__item">
              <div data-moment="MMM">2026-03-15 15:02:54</div>
              <div data-moment="DD">2026-03-15 15:02:54</div>
            </div>
          </div>
          <div class="col__serie-teams">
            <div class="col__serie-teams__item" data-playoff-team-id="7898" data-playoff-connector="before">
              <div class="logo" data-theme-light="https://cdn.example/yandex.png"></div>
              <div class="name overflow-text-1">Team Yandex</div>
              <div class="score text-red">3</div>
            </div>
            <div class="col__serie-teams__delimiter">VS</div>
            <div class="col__serie-teams__item" data-playoff-team-id="7" data-playoff-connector="after">
              <div class="logo" data-theme-light="https://cdn.example/liquid.png"></div>
              <div class="name overflow-text-1">Team Liquid</div>
              <div class="score">2</div>
            </div>
          </div>
        </a>
        <div class="col__serie-connector after"><i></i></div>
      </div>
      <div class="col__prize gold">
        <span>1st Place</span>
        <strong>$300,000</strong>
      </div>
      <div class="col__prize silver">
        <span>2nd Place</span>
        <strong>$175,000</strong>
      </div>
    </div>
  </div>
</section>
<section class="matches__scores">
  <div class="table__body">
    <a href="https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row">
      <div class="cell__logo" data-theme-light="https://cdn.example/heroic.png"></div>
      <div class="cell__name">Heroic</div>
      <span class="text-default" data-moment="HH:mm">2026-03-12 08:00:00</span>
      <div class="cell__name">BetBoom</div>
      <div class="cell__logo" data-theme-light="https://cdn.example/bb.png"></div>
    </a>
  </div>
  <div class="card__title mt-4">Finished matches</div>
  <div class="table__body">
    <a href="https://dltv.org/matches/425402/team-liquid-vs-betboom-team-pgl-wallachia-season-7" class="table__body-row">
      <div class="cell__logo" data-theme-light="https://cdn.example/liquid.png"></div>
      <div class="cell__name">Liquid</div>
      <span>2</span><span>-</span><span>1</span>
      <div class="cell__name">BetBoom</div>
      <div class="cell__logo" data-theme-light="https://cdn.example/bb.png"></div>
    </a>
  </div>
</section>
`;

describe('parseDltvFeaturedTournamentPage', () => {
  it('extracts group stage, playoffs, and match score panels', () => {
    const payload = parseDltvFeaturedTournamentPage(fixture, definition as never);

    expect(payload.groupStage.standings).toHaveLength(2);
    expect(payload.groupStage.standings[0]).toEqual(expect.objectContaining({
      rank: 1,
      teamName: 'Team Liquid',
      country: 'Sweden',
      record: '3 - 0',
    }));
    expect(payload.groupStage.format).toBe('swiss');
    expect(payload.groupStage.standings[0]?.rounds[0]).toEqual(expect.objectContaining({
      opponentName: 'BetBoom Team',
      score: '2 - 1',
    }));

    expect(payload.playoffs.rounds[0]).toEqual(expect.objectContaining({
      roundName: 'Upper Bracket R1 (bo3)',
    }));
    expect(payload.playoffs.rounds[0]?.matches[0]?.teams[1]?.name).toBe('BetBoom Team');
    expect(payload.playoffs.rounds[1]).toEqual(expect.objectContaining({
      roundName: 'Grand Final (bo5)',
    }));
    expect(payload.playoffs.rounds[1]?.matches[0]).toEqual(expect.objectContaining({
      href: 'https://dltv.org/matches/425461/team-yandex-vs-team-liquid-pgl-wallachia-season-7',
      startTime: '2026-03-15 15:02:54',
    }));
    expect(payload.playoffs.rounds[1]?.matches[0]?.teams[0]?.name).toBe('Team Yandex');
    expect(payload.playoffs.rounds[1]?.matches[0]?.teams[0]?.score).toBe('3');
    expect(payload.playoffs.rounds[1]?.matches[0]?.teams[1]?.name).toBe('Team Liquid');
    expect(payload.playoffs.rounds[1]?.matches[0]?.teams[1]?.score).toBe('2');

    expect(payload.matches.upcoming[0]).toEqual(expect.objectContaining({
      startTime: '2026-03-12 08:00:00',
    }));
    expect(payload.matches.finished[0]).toEqual(expect.objectContaining({
      score: '2-1',
    }));
  });
});
