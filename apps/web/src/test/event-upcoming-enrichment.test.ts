import { describe, expect, it, vi } from 'vitest';
import {
  enrichUpcomingWithEventMatches,
  parseEventPageUpcomingRows,
  seriesIdFromMatchUrl,
} from '../../../../lib/server/event-upcoming-enrichment.js';

function matchRow(url, left, center) {
  return `
    <a href="${url}" class="table__body-row" data-match-popup="1">
      <div class="table__body-row__cell width-40">
        <div class="cell__logo" data-theme-light="/l.png" data-theme-dark="/l.png"></div>
        <div class="cell__name">${left}</div>
      </div>
      <div class="table__body-row__cell bordered width-20 align-center">
        <div class="cell__bold-gray"><div class="score"><span class="text-default" data-moment="HH:mm">${center}</span></div></div>
      </div>
      <div class="table__body-row__cell width-40 align-right">
        <div class="cell__name">RIGHT</div>
        <div class="cell__logo" data-theme-light="/r.png" data-theme-dark="/r.png"></div>
      </div>
    </a>`;
}

function eventPageFixture(rows) {
  return `<h1>THE INTERNATIONAL 2026</h1>
  <section class="matches__scores">
    <div class="card"><div class="card__title">Upcoming matches</div>
      <table class="matches__scores-table">${rows.join('')}</table>
    </div>
  </section>`;
}

const NOW = Math.floor(Date.parse('2026-08-14T00:00:00Z') / 1000);

describe('parseEventPageUpcomingRows', () => {
  it('parses future upcoming matches: 提取 seriesId + UTC 时间戳 + 排序', () => {
    const html = eventPageFixture([
      matchRow('https://dltv.org/matches/427651/boomboys-vs-team-vision-ti2026', 'BoomBoys', '2026-08-14 05:00:00'),
      matchRow('https://dltv.org/matches/427647/team-spirit-vs-aurora-ti2026', 'Team Spirit', '2026-08-14 02:00:00'),
      // 已开始/过去的比赛应被过滤
      matchRow('https://dltv.org/matches/427600/old-vs-match-ti2026', 'Old', '2026-08-13 10:00:00'),
    ]);

    const rows = parseEventPageUpcomingRows(html, 'the-international-2026', { now: NOW, maxStartTime: NOW + 7 * 24 * 60 * 60 });

    expect(rows).toHaveLength(2);
    expect(rows[0].seriesId).toBe('427647');
    expect(rows[0].radiantName).toBe('Team Spirit');
    expect(rows[0].direName).toBe('RIGHT');
    expect(rows[0].matchUrl).toContain('/matches/427647/');
    expect(rows[0].tournament).toBe('THE INTERNATIONAL 2026');
    expect(rows[0].eventUrl).toBe('https://dltv.org/events/the-international-2026');
    expect(rows[0].timestamp).toBe(parseInt(String(Date.parse('2026-08-14T02:00:00Z') / 1000), 10));
    expect(rows[1].seriesId).toBe('427651');
  });
});

describe('enrichUpcomingWithEventMatches', () => {
  it('按 seriesId 去重并入赛事页 upcoming（base 4 + 赛事页 8 → 8 场）', async () => {
    const base = [
      { seriesId: '427647', matchUrl: 'https://dltv.org/matches/427647/a', tournament: 'The International 2026', eventUrl: 'https://dltv.org/events/the-international-2026', timestamp: NOW + 7200 },
      { seriesId: '427648', matchUrl: 'https://dltv.org/matches/427648/b', tournament: 'The International 2026', eventUrl: 'https://dltv.org/events/the-international-2026', timestamp: NOW + 7200 },
    ];
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => eventPageFixture([
        matchRow('https://dltv.org/matches/427647/team-spirit-vs-aurora-ti2026', 'Team Spirit', '2026-08-14 02:00:00'),
        matchRow('https://dltv.org/matches/427648/yandex-vs-liquid-ti2026', 'Team Yandex', '2026-08-14 02:00:00'),
        matchRow('https://dltv.org/matches/427651/boomboys-vs-team-vision-ti2026', 'BoomBoys', '2026-08-14 05:00:00'),
        matchRow('https://dltv.org/matches/427652/iron-wing-vs-falcons-ti2026', 'Iron Wing', '2026-08-14 05:00:00'),
      ]),
    }));

    const merged = await enrichUpcomingWithEventMatches(base, { fetchImpl, now: NOW });

    expect(merged).toHaveLength(4);
    const seriesIds = merged.map((r) => r.seriesId).sort();
    expect(seriesIds).toEqual(['427647', '427648', '427651', '427652']);
    // 保留 base 行的原始字段，新增行带赛事页解析字段
    expect(merged.find((r) => r.seriesId === '427647').matchUrl).toBe('https://dltv.org/matches/427647/a');
    expect(merged.find((r) => r.seriesId === '427651').radiantName).toBe('BoomBoys');
  });

  it('抓取失败时回退 base 数据，不抛错', async () => {
    const base = [{ seriesId: '1', eventUrl: 'https://dltv.org/events/ti', timestamp: NOW + 3600 }];
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const merged = await enrichUpcomingWithEventMatches(base, { fetchImpl, now: NOW });
    expect(merged).toEqual(base);
  });
});

describe('seriesIdFromMatchUrl', () => {
  it('从 DLTV match URL 提取 seriesId', () => {
    expect(seriesIdFromMatchUrl('https://dltv.org/matches/427651/boomboys-vs-team-vision')).toBe('427651');
    expect(seriesIdFromMatchUrl(null)).toBeNull();
    expect(seriesIdFromMatchUrl('https://example.com/x')).toBeNull();
  });
});
