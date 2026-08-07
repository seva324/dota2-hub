import { describe, expect, it } from 'vitest';
import { parseDltvEventDetailPage } from '../../../../lib/server/dltv-event-detail-parser.js';

function participantsHtml() {
  const team = (slug, name, light, dark) => `
    <div class="event__participants-teams__team">
      <a href="https://dltv.org/teams/${slug}" class="title overflow-text-1">${name}</a>
      <div class="logo" data-theme-light="${light}" data-theme-dark="${dark}"></div>
    </div>`;
  return `
  <section class="event__participants">
    <div class="card"><div class="card__body"><div class="event__participants-teams">
      ${team('no-hoodwink', 'No Hoodwink', '/uploads/t1.png', '/uploads/t1d.png')}
      ${team('zero-tenacity', 'Zero Tenacity', '/uploads/t2.png', '/uploads/t2d.png')}
      ${team('power-rangers', 'Power Rangers', '/uploads/t3.png', '/uploads/t3d.png')}
      ${team('re-arise', 'RE Arise', '/uploads/t4.png', '/uploads/t4d.png')}
    </div></div></div>
  </section>`;
}

function matchRow(url, left, leftLogo, center, right, rightLogo) {
  return `
      <a href="${url}" class="table__body-row" data-match-popup="1">
        <div class="table__body-row__cell width-40  ">
          <div class="cell__logo" data-theme-light="${leftLogo}" data-theme-dark="${leftLogo}"></div>
          <div class="cell__name">${left}</div>
        </div>
        <div class="table__body-row__cell bordered width-20 align-center">
          <div class="cell__bold-gray">${center}</div>
        </div>
        <div class="table__body-row__cell width-40 align-right  ">
          <div class="cell__name">${right}</div>
          <div class="cell__logo" data-theme-light="${rightLogo}" data-theme-dark="${rightLogo}"></div>
        </div>
      </a>`;
}

function matchesHtml() {
  return `
  <section class="matches__scores">
    <div class="card">
      <div class="card__title">Upcoming matches</div>
      <table class="matches__scores-table">
        ${matchRow(
          'https://dltv.org/matches/427538/no-hoodwink-vs-zero-tenacity-epl-masters-1',
          'NoHood', '/l1.png',
          '<div class="score"><span class="text-default" data-moment="HH:mm">2026-08-07 09:00:00</span></div>',
          'Z10', '/r1.png',
        )}
        ${matchRow(
          'https://dltv.org/matches/427599/tbd-vs-tbd-epl-masters-1',
          'TBD', '/x.png',
          '<div class="score"><span class="text-default" data-moment="HH:mm">2026-08-09 09:00:00</span></div>',
          'TBD', '/x.png',
        )}
        ${matchRow(
          'https://dltv.org/matches/427521/power-rangers-vs-team-jenz-epl-masters-1',
          'PR', '/l3.png',
          '<div class="score">2 - 1</div>',
          'Jenz', '/r3.png',
        )}
      </table>
      <div class="card__title mt-4">Finished matches</div>
      <table class="matches__scores-table">
        ${matchRow(
          'https://dltv.org/matches/427534/re-arise-vs-zero-tenacity-epl-masters-1',
          'RE.Arise', '/l4.png',
          '<div class="score">0 - 2</div>',
          'Z10', '/r2.png',
        )}
      </table>
    </div>
  </section>`;
}

function playoffsHtml() {
  const teamItem = (name, slugSide, logo) => `
                  <div class="col__serie-teams__item" data-playoff-connector="${slugSide}">
                    <div class="logo" data-theme-light="${logo}" data-theme-dark="${logo}"></div>
                    <div class="name overflow-text-1">${name}</div>
                    <div class="score ">0</div>
                  </div>`;
  return `
  <section class="playoffs">
    <div class="card">
      <div class="card__title">Playoffs</div>
      <div class="card__body">
        <div class="playoffs__box">
          <div class="playoffs__box-row">
            <div class="playoffs__box-row__col">
              <div class="col__head">Upper Bracket R1 (bo3)</div>
              <div class="col__serie">
                <a href="https://dltv.org/matches/427538/no-hoodwink-vs-zero-tenacity-epl-masters-1" class="overflow">
                  <div class="col__serie-teams">
                    ${teamItem('NoHood', 'before', '/l1.png')}
                    <div class="col__serie-teams__delimiter">VS</div>
                    ${teamItem('Z10', 'after', '/r1.png')}
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function fullHtml() {
  return `<h1>EPL MASTERS 1</h1>
${participantsHtml()}
${playoffsHtml()}
${matchesHtml()}`;
}

describe('dltv-event-detail-parser 战队 slug 还原', () => {
  it('upcoming 比赛行：缩写 tag → 官方全名 + slug', () => {
    const payload = parseDltvEventDetailPage(fullHtml(), 'epl-masters-1');
    const [first] = payload.matches.matches;
    expect(first.left).toBe('No Hoodwink');
    expect(first.leftSlug).toBe('no-hoodwink');
    expect(first.right).toBe('Zero Tenacity');
    expect(first.rightSlug).toBe('zero-tenacity');
    // 未变更字段仍正常解析
    expect(first.url).toBe('https://dltv.org/matches/427538/no-hoodwink-vs-zero-tenacity-epl-masters-1');
    expect(first.center).toBe('2026-08-07 09:00:00');
    expect(first.isLive).toBe(false);
    expect(first.leftLogo).toBe('https://dltv.org/l1.png');
  });

  it('TBD / 未知战队：保留缩写、slug 为 null（无回归）', () => {
    const payload = parseDltvEventDetailPage(fullHtml(), 'epl-masters-1');
    const tbd = payload.matches.matches.find((m) => m.url.includes('tbd-vs-tbd'));
    expect(tbd.left).toBe('TBD');
    expect(tbd.leftSlug).toBeNull();
    expect(tbd.right).toBe('TBD');
    expect(tbd.rightSlug).toBeNull();
  });

  it('finished 比赛行同样还原全名 + slug', () => {
    const payload = parseDltvEventDetailPage(fullHtml(), 'epl-masters-1');
    const [first] = payload.matches.finishedMatches;
    expect(first.left).toBe('RE Arise');
    expect(first.leftSlug).toBe('re-arise');
    expect(first.right).toBe('Zero Tenacity');
    expect(first.rightSlug).toBe('zero-tenacity');
    expect(first.center).toBe('0 - 2');
  });

  it('bracket 队伍：从 playoff match URL 还原全名 + slug', () => {
    const payload = parseDltvEventDetailPage(fullHtml(), 'epl-masters-1');
    const [round] = payload.playoffRounds;
    const [match] = round.matches;
    expect(match.teams[0].name).toBe('No Hoodwink');
    expect(match.teams[0].slug).toBe('no-hoodwink');
    expect(match.teams[1].name).toBe('Zero Tenacity');
    expect(match.teams[1].slug).toBe('zero-tenacity');
  });
});
