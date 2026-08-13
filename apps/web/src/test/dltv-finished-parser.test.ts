import { describe, expect, it } from 'vitest';
import { parseDltvFinishedMatches } from '../../../../lib/server/dltv-matches-parser.js';

/**
 * 构造一个 finished match 块。
 * 新 DLTV results 页：同一赛事分组内只有第一场带 match__head-event 赛事头，
 * 后续场次省略该头（以及 /events/ 链接）。解析器必须向前继承赛事名/链接，
 * 否则这些场次被整体丢弃（表现为"某赛事只剩一场"）。
 */
function finishedBlock({
  seriesId,
  event,
  eventUrl,
  matchUrl,
  team1,
  team2,
  score1,
  score2,
  startTime = '2026-08-13 08:06:32',
}: {
  seriesId: string;
  event?: string;
  eventUrl?: string;
  matchUrl: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  startTime?: string;
}) {
  const head = event
    ? `<div class="match__head">
      <div class="match__head-event"><span>${event}</span></div>
      <div class="match__head-format red"><span>Round 1</span></div>
    </div>`
    : '';
  const eventLink = eventUrl ? `<a href="${eventUrl}"></a>` : '';
  return `
  <div class="match finished" data-matches-odd="${startTime}">
    <div class="match__body">
      <div class="match__body-details">
        <a href="${matchUrl}"></a>
        ${head}
        ${eventLink}
        <div class="match__body-details__team">
          <div class="team"><div class="team__title"><span>${team1}</span></div></div>
        </div>
        <div class="match__body-details__score">
          <div class="score"><strong class="text-red">${score1}</strong></div>
          <div class="score"><strong class="text-gray">${score2}</strong></div>
        </div>
        <div class="match__body-details__team">
          <div class="team"><div class="team__title"><span>${team2}</span></div></div>
        </div>
      </div>
    </div>
  </div>`;
}

describe('parseDltvFinishedMatches', () => {
  it('向前继承上一个块的赛事名与赛事链接（新版 results 省略分组后续场次的 head）', () => {
    const html = [
      finishedBlock({
        seriesId: '101',
        event: 'The International 2026',
        eventUrl: 'https://dltv.org/events/the-international-2026',
        matchUrl: 'https://dltv.org/matches/101/aurora-vs-gamerlegion-the-international-2026',
        team1: 'Aurora',
        team2: 'GamerLegion',
        score1: 2,
        score2: 0,
      }),
      // 第二场省略 head（同分组）
      finishedBlock({
        seriesId: '102',
        matchUrl: 'https://dltv.org/matches/102/team-liquid-vs-vici-gaming-the-international-2026',
        team1: 'Team Liquid',
        team2: 'Vici Gaming',
        score1: 2,
        score2: 0,
      }),
    ].join('\n');

    const results = parseDltvFinishedMatches(html);

    expect(results).toHaveLength(2);
    expect(results[1].tournament).toBe('The International 2026');
    expect(results[1].eventUrl).toBe('https://dltv.org/events/the-international-2026');
    expect(results[1].radiantName).toBe('Team Liquid');
    expect(results[1].direName).toBe('Vici Gaming');
  });

  it('分组切换时继承新的赛事名，不跨组串名', () => {
    const html = [
      finishedBlock({
        seriesId: '201',
        event: 'The International 2026',
        eventUrl: 'https://dltv.org/events/the-international-2026',
        matchUrl: 'https://dltv.org/matches/201/a-vs-b-the-international-2026',
        team1: 'A',
        team2: 'B',
        score1: 2,
        score2: 1,
      }),
      // 同一 TI 分组第二场（省略 head）
      finishedBlock({
        seriesId: '202',
        matchUrl: 'https://dltv.org/matches/202/c-vs-d-the-international-2026',
        team1: 'C',
        team2: 'D',
        score1: 2,
        score2: 0,
      }),
      // 新分组（EPL）第一场，带自己的 head
      finishedBlock({
        seriesId: '203',
        event: 'EPL Masters 1',
        eventUrl: 'https://dltv.org/events/epl-masters-1',
        matchUrl: 'https://dltv.org/matches/203/e-vs-f-epl-masters-1',
        team1: 'E',
        team2: 'F',
        score1: 1,
        score2: 2,
      }),
    ].join('\n');

    const results = parseDltvFinishedMatches(html);

    expect(results).toHaveLength(3);
    expect(results[1].tournament).toBe('The International 2026');
    expect(results[2].tournament).toBe('EPL Masters 1');
    expect(results[2].eventUrl).toBe('https://dltv.org/events/epl-masters-1');
  });

  it('第一个块缺 head 时照旧丢弃（无前序可继承）', () => {
    const html = finishedBlock({
      seriesId: '301',
      matchUrl: 'https://dltv.org/matches/301/g-vs-h-unknown',
      team1: 'G',
      team2: 'H',
      score1: 2,
      score2: 1,
    });

    expect(parseDltvFinishedMatches(html)).toHaveLength(0);
  });
});
