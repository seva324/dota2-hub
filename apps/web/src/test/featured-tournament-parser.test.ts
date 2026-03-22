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
  <div class="playoffs__box-row__col">
    <div class="col__head">Upper Bracket R1 (bo3)</div>
    <div class="col__serie ">
      <a href="https://dltv.org/matches/425448/heroic-vs-betboom-team-pgl-wallachia-season-7">
        <div data-moment="MMM">2026-03-12 08:00:00</div>
        <div class="col__serie-teams">
          <div class="col__serie-teams__item">
            <div class="logo" data-theme-light="https://cdn.example/heroic.png"></div>
            <div class="name overflow-text-1">Heroic</div>
            <div class="score">0</div>
          </div>
          <div class="col__serie-teams__item">
            <div class="logo" data-theme-light="https://cdn.example/bb.png"></div>
            <div class="name overflow-text-1">BetBoom Team</div>
            <div class="score">0</div>
          </div>
        </div>
      </a>
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

    expect(payload.matches.upcoming[0]).toEqual(expect.objectContaining({
      startTime: '2026-03-12 08:00:00',
    }));
    expect(payload.matches.finished[0]).toEqual(expect.objectContaining({
      score: '2-1',
    }));
  });
});
