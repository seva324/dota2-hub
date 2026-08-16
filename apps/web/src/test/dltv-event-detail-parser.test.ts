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
          '<div class="score"><span class="text-default" data-moment="HH:mm">2026-08-07 15:00:00</span></div>',
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

describe('dltv-event-detail-parser 已结束/upcoming 切分', () => {
  it('无 "Finished matches" 标记时按行内容归类（比分行→finished）', () => {
    // 模拟生产环境抓到的 HTML：缺少 finished 切分标记，比分行混在表里
    const html = `<h1>X</h1>${participantsHtml()}
      <section class="matches__scores"><div class="card">
        <table class="matches__scores-table">
          ${matchRow('https://dltv.org/matches/427538/no-hoodwink-vs-zero-tenacity-epl-masters-1', 'NoHood', '/l1.png', '<div class="score"><span class="text-default" data-moment="HH:mm">2026-08-07 09:00:00</span></div>', 'Z10', '/r1.png')}
          ${matchRow('https://dltv.org/matches/427534/re-arise-vs-zero-tenacity-epl-masters-1', 'RE.Arise', '/l4.png', '<div class="score">0 - 2</div>', 'Z10', '/r2.png')}
        </table>
      </div></section>`;
    const payload = parseDltvEventDetailPage(html, 'x');
    expect(payload.matches.matches.map((m) => m.left)).toEqual(['No Hoodwink']);
    expect(payload.matches.finishedMatches.map((m) => m.left)).toEqual(['RE Arise']);
  });

  it('按 match URL 去重重复行（DLTV 重复渲染的表格）', () => {
    const row = matchRow('https://dltv.org/matches/427534/re-arise-vs-zero-tenacity-epl-masters-1', 'RE.Arise', '/l4.png', '<div class="score">0 - 2</div>', 'Z10', '/r2.png');
    const html = `<h1>X</h1>${participantsHtml()}
      <section class="matches__scores"><div class="card">
        <table class="matches__scores-table">${row}${row}</table>
      </div></section>`;
    const payload = parseDltvEventDetailPage(html, 'x');
    expect(payload.matches.finishedMatches.length).toBe(1);
  });
});

describe('dltv-event-detail-parser 中文表头积分榜（DLTV 中文版页面）', () => {
  function cnStandingRow(rank, team, country, record, advance) {
    return `
      <div class="table__body-row">
        <div class="table__body-row__cell" data-theme-dark-bgcolor="${advance ? '#163819' : '#1a1d24'}"><div class="cell__coloured">${rank}</div></div>
        <a href="https://dltv.org/teams/${team.toLowerCase()}" class="table__body-row__cell">
          <div class="cell__logo" data-theme-dark="/uploads/teams/small/x.png"></div>
          <div class="cell__name"><div>${team}</div><div class="cell__name-text">${country}</div></div>
        </a>
        <div class="table__body-row__cell"><div class="cell__text big">${record}</div></div>
      </div>`;
  }

  it('中文「团队/比赛」表头：战绩列正常提取（回归：EdgeOne 抓中文页时 record 为空）', () => {
    const html = `<h1>THE INTERNATIONAL 2026</h1>
      <section class="group__stage">
        <div class="table">
          <div class="table__head">
            <div class="table__head-item width-75 big-text">团队</div>
            <div class="table__head-item width-25 text-center">比赛</div>
          </div>
          <div class="table-body">
            ${cnStandingRow(1, 'BoomBoys', 'Russia', '2 - 0', true)}
            ${cnStandingRow(2, 'TEAM VISION', 'Russia', '2 - 0', true)}
            ${cnStandingRow(16, 'OG', 'Philippines', '0 - 2', false)}
          </div>
        </div>
      </section>`;
    const payload = parseDltvEventDetailPage(html, 'the-international-2026');
    expect(payload.groups.length).toBe(1);
    const rows = payload.groups[0].rows;
    expect(rows.map((r) => r.team)).toEqual(['BoomBoys', 'TEAM VISION', 'OG']);
    expect(rows.map((r) => r.record)).toEqual(['2 - 0', '2 - 0', '0 - 2']);
    expect(rows.map((r) => r.advance)).toEqual([true, true, false]);
  });
});

describe('dltv-event-detail-parser 瑞士轮（TI2026 风格）', () => {
  /** 左侧积分榜站立行（排名/队伍/战绩）。 */
  function swissStandRow(rank, team, country, record, advance) {
    return `
      <div class="table__body-row">
        <div class="table__body-row__cell" data-theme-dark-bgcolor="${advance ? '#163819' : '#641717'}"><div class="cell__coloured">${rank}</div></div>
        <a href="https://dltv.org/teams/${team.toLowerCase()}" class="table__body-row__cell">
          <div class="cell__logo" data-theme-dark="/uploads/teams/small/${team}.png"></div>
          <div class="cell__name"><div>${team}</div><div class="cell__name-text">${country}</div></div>
        </a>
        <div class="table__body-row__cell"><div class="cell__text big">${record}</div></div>
      </div>`;
  }

  /** 右侧对阵表：R1~R2 表头 + 每行一个 leaf-cell（对手 logo + 比分）。 */
  function swissFixtureRow(matchUrl, opponent, opponentLogo, score) {
    return `
      <div class="table__body-row">
        <a href="${matchUrl}" class="table__body-row__cell f-c width-16 align-center leaf-cell" data-match-popup="427637">
          <div class="cell__logo-md" data-theme-light="${opponentLogo}" data-theme-dark="${opponentLogo}"></div>
          <div class="cell__text"><strong>${score}</strong></div>
        </a>
      </div>`;
  }

  function swissHtml() {
    return `
      <section class="group__stage">
        <div class="col-6">
          <div class="table">
            <div class="table__head">
              <div class="table__head-item width-75 big-text">Team</div>
              <div class="table__head-item width-25 text-center">Matches</div>
            </div>
            <div class="table-body">
              ${swissStandRow(1, 'BoomBoys', 'Russia', '2 - 0', true)}
              ${swissStandRow(16, 'OG', 'Philippines', '0 - 2', false)}
            </div>
          </div>
        </div>
        <div class="col-6">
          <div class="table">
            <div class="table__head">
              <div class="table__head-item width-16 text-center">R 1</div>
              <div class="table__head-item width-16 text-center">R 2</div>
            </div>
            <div class="table-body">
              ${swissFixtureRow('https://dltv.org/matches/427637/boomboys-vs-og-the-international-2026', 'OG', '/uploads/t.png', '2 - 0')}
              ${swissFixtureRow('https://dltv.org/matches/427638/team-vision-vs-team-resilience-the-international-2026', 'Nigma', '/uploads/t2.png', '0 - 2')}
            </div>
          </div>
        </div>
      </section>`;
  }

  it('识别瑞士轮 R1~R6 表头并暴露 rounds', () => {
    const payload = parseDltvEventDetailPage(swissHtml(), 'the-international-2026');
    expect(payload.groups.length).toBe(1);
    expect(payload.groups[0].rounds).toEqual(['R1', 'R2']);
    expect(payload.groups[0].rows.length).toBe(2);
    expect(payload.groups[0].rows[0].team).toBe('BoomBoys');
  });

  it('非瑞士轮（无 R 表头）时 rounds 为空', () => {
    const html = `<section class="group__stage">
      <div class="table">
        <div class="table__head"><div class="table__head-item width-75 big-text">团队</div></div>
        <div class="table-body">
          ${swissStandRow(1, 'BoomBoys', 'Russia', '2 - 0', true)}
        </div>
      </div>
    </section>`;
    const payload = parseDltvEventDetailPage(html, 'some-event');
    expect(payload.groups[0].rounds).toBeUndefined();
  });

  it('表头内多包一层（表头项 → span → 轮名）也能识别 rounds', () => {
    const html = `<section class="group__stage">
      <div class="col-6">
        <div class="table">
          <div class="table-body">
            ${swissStandRow(1, 'BoomBoys', 'Russia', '2 - 0', true)}
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="table">
          <div class="table__head">
            <div class="table__head-item width-16 text-center"><span>R 1</span></div>
            <div class="table__head-item width-16 text-center"><span>R 2</span></div>
          </div>
        </div>
      </div>
    </section>`;
    const payload = parseDltvEventDetailPage(html, 'ti26');
    expect(payload.groups[0].rounds).toEqual(['R1', 'R2']);
  });
});

describe('dltv-event-detail-parser 阶段比赛列表（TI2026 Elimination Round 风格）', () => {
  /** 比赛列表型阶段块的行：左队名 → 中心（时间/比分）→ 右队名，行链接到 /matches/。 */
  function stageMatchRow(url, left, leftLogo, center, right, rightLogo, live = false) {
    return `
      <a href="${url}" class="table__body-row" data-match-popup="1">
        <div class="table__body-row__cell width-36">
          <div class="cell__logo" data-theme-light="${leftLogo}" data-theme-dark="${leftLogo}"></div>
          <div class="cell__name">${left}</div>
        </div>
        <div class="table__body-row__cell width-4"></div>
        <div class="table__body-row__cell bordered width-20 align-center">
          <div class="cell__bold-gray">
            <div class="score">${center}</div>
            ${live ? '<div class="label label__danger">live</div>' : ''}
          </div>
        </div>
        <div class="table__body-row__cell width-4 align-right"></div>
        <div class="table__body-row__cell width-36 align-right">
          <div class="cell__name">${right}</div>
          <div class="cell__logo" data-theme-light="${rightLogo}" data-theme-dark="${rightLogo}"></div>
        </div>
      </a>`;
  }

  function stageHtml() {
    const stageParticipants = `
      <section class="event__participants">
        <div class="card"><div class="card__body"><div class="event__participants-teams">
          <div class="event__participants-teams__team">
            <a href="https://dltv.org/teams/lgd-gaming" class="title overflow-text-1">LGD Gaming</a>
            <div class="logo" data-theme-light="/l.png" data-theme-dark="/l.png"></div>
          </div>
          <div class="event__participants-teams__team">
            <a href="https://dltv.org/teams/team-yandex" class="title overflow-text-1">Team Yandex</a>
            <div class="logo" data-theme-light="/r.png" data-theme-dark="/r.png"></div>
          </div>
        </div></div></div>
      </section>`;
    return `<h1>THE INTERNATIONAL 2026</h1>
      ${stageParticipants}
      <section class="group__stage">
        <div class="card">
          <div class="card__title">Elimination Round</div>
          <div class="card__body">
            <div class="matches__scores">
              <div class="table">
                <div class="table__body">
                  ${stageMatchRow('https://dltv.org/matches/427683/lgd-gaming-vs-team-yandex-the-international-2026', 'LGD Gaming', '/l.png', '<span class="text-default" data-moment="HH:mm">2026-08-16 08:00:00</span>', 'Team Yandex', '/r.png')}
                  ${stageMatchRow('https://dltv.org/matches/427686/team-falcons-vs-vici-gaming-the-international-2026', 'Team Falcons', '/f.png', '<span>1</span><span>-</span><span>0</span>', 'Vici Gaming', '/v.png', true)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>`;
  }

  it('比赛列表型阶段块解析为 { name, matches } 组（阶段名取自 card__title）', () => {
    const payload = parseDltvEventDetailPage(stageHtml(), 'the-international-2026');
    const stage = payload.groups.find((g) => g.matches);
    expect(stage).toBeTruthy();
    expect(stage.name).toBe('Elimination Round');
    expect(stage.matches).toHaveLength(2);
    const [upcoming, live] = stage.matches;
    expect(upcoming.left).toBe('LGD Gaming');
    expect(upcoming.leftSlug).toBe('lgd-gaming');
    expect(upcoming.right).toBe('Team Yandex');
    expect(upcoming.rightSlug).toBe('team-yandex');
    expect(upcoming.center).toBe('2026-08-16 08:00:00');
    expect(upcoming.isLive).toBe(false);
    expect(upcoming.url).toBe('https://dltv.org/matches/427683/lgd-gaming-vs-team-yandex-the-international-2026');
    expect(live.center).toBe('1 - 0');
    expect(live.isLive).toBe(true);
    expect(live.leftLogo).toBe('https://dltv.org/f.png');
    expect(live.rightLogo).toBe('https://dltv.org/v.png');
  });

  it('阶段比赛列表组不参与瑞士轮 rounds 标记（rounds 仅作用于积分榜组）', () => {
    const payload = parseDltvEventDetailPage(stageHtml(), 'the-international-2026');
    const stage = payload.groups.find((g) => g.matches);
    expect(stage.rounds).toBeUndefined();
  });

  it('无比赛列表的积分榜赛事不受影响（保持原 groups 形态）', () => {
    const html = `<h1>X</h1>${participantsHtml()}
      <section class="group__stage">
        <div class="card"><div class="card__title">Group Stage</div><div class="card__body">
          <div class="table">
            <div class="table__head"><div class="table__head-item width-75 big-text">团队</div></div>
            <div class="table-body">
              <div class="table__body-row">
                <div class="table__body-row__cell" data-theme-dark-bgcolor="#163819"><div class="cell__coloured">1</div></div>
                <a href="https://dltv.org/teams/lgd-gaming" class="table__body-row__cell">
                  <div class="cell__logo" data-theme-dark="/uploads/l.png"></div>
                  <div class="cell__name"><div>LGD Gaming</div><div class="cell__name-text">China</div></div>
                </a>
                <div class="table__body-row__cell"><div class="cell__text big">2 - 0</div></div>
              </div>
            </div>
          </div>
        </div></div>
      </section>`;
    const payload = parseDltvEventDetailPage(html, 'x');
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0].name).toBe('团队');
    expect(payload.groups[0].rows).toHaveLength(1);
    expect(payload.groups[0].matches).toBeUndefined();
  });
});

describe('dltv-event-detail-parser 已结束比赛时间（data-event-matches-odd）', () => {
  it('提取已结束比赛的 time 字段（用于对阵结果按时间排序）', () => {
    const row = `
      <a href="https://dltv.org/matches/427635/team-falcons-vs-lgd-gaming-the-international-2026" class="table__body-row" data-event-matches-odd="2026-08-13 02:42:47" data-match-popup="1">
        <div class="table__body-row__cell width-40"><div class="cell__logo" data-theme-dark="/uploads/l.png"></div><div class="cell__name">Team Falcons</div></div>
        <div class="table__body-row__cell bordered width-20 align-center"><div class="cell__bold-gray"><div class="score">2 - 1</div></div></div>
        <div class="table__body-row__cell width-40 align-right"><div class="cell__name">LGD Gaming</div><div class="cell__logo" data-theme-dark="/uploads/r.png"></div></div>
      </a>`;
    const html = `<section class="matches__scores">
      <div class="card"><div class="card__title mt-4">Finished matches</div>
        <div class="matches__scores-table">${row}</div>
      </div>
    </section>`;
    const payload = parseDltvEventDetailPage(html, 'ti26');
    expect(payload.matches.finishedMatches).toHaveLength(1);
    expect(payload.matches.finishedMatches[0].time).toBe('2026-08-13 02:42:47');
  });
});
