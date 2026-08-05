import { describe, expect, it } from 'vitest';
import { parseDltvSeriesItem } from '../../../../lib/server/dltv-series-parser.js';

/** 未开赛（upcoming）系列赛页面：maps 为空，赛前数据在 team/event/bets 等字段。 */
function makeUpcomingHtml() {
  const seriesItem = {
    id: 427409,
    status: 0,
    started_at: '2026-08-05T08:00:00.000Z',
    slug: 'team-resilience-vs-rune-eaters-games-of-the-future-2026',
    format_option_id: 3,
    format_option: { id: 237, title: '3rd Place Match' },
    event_format: { id: 6438, title: 'Playoffs' },
    event: {
      id: 6490,
      title: 'Games of the Future 2026',
      tag: 'GOTF 2026',
      slug: 'games-of-the-future-2026',
      country_id: 47,
      country: { id: 47, title: 'Kazakhstan', code: 'kz', emoji: '🇰🇿', image: '/assets/plugins/flag-icon/flags/4x3/kz.svg' },
      started_at: '2026-07-31T00:00:00.000Z',
      ended_at: '2026-08-05T00:00:00.000Z',
      tier: 3,
      usd_prize: 1000000,
      twitch_link: 'https://www.twitch.tv/gamesofuture_dota2',
      brackets_link: 'https://results.gofuture.games/events/games-of-the-future-2026/tournaments/moba-pc-dota-2-2026/bracket/',
      image: '/uploads/events/evt.png',
    },
    first_team: {
      id: 8151,
      title: 'Team Resilience',
      tag: 'Resilien',
      slug: 'team-resilience',
      image: '/uploads/teams/a.png',
      image_dark: null,
      rank: 18,
      win_rate: '63.000',
      fb_rate: '56.000',
      f10_rate: '72.000',
      maps_total: 42,
      players: [
        { id: 11, steam_id: '1001', title: 'Erika', slug: 'erika', image: '/uploads/players/e.png', rank: 1, role: 1, win_rate: '57.000', kda: '5.800', avg_gpm: '772.320', avg_xpm: '907.320', avg_dmg: '29271.000', kills_percent: '58.870', top_heroes: [{ hero: { id: 96, title: 'Magnus', slug: 'magnus', image: '/uploads/heroes/m.png' }, maps_total: 14, wins_total: 11, win_rate: '79%' }] },
        { id: 12, steam_id: '1002', title: 'EchozZ', slug: 'echozz', image: null, rank: 345, role: 2, win_rate: '50.000', kda: '8.570', top_heroes: [] },
        { id: 13, steam_id: '1003', title: 'niu', slug: 'niu', image: null, rank: 0, role: 3, win_rate: '50.000', kda: '5.730', top_heroes: [] },
        { id: 14, steam_id: '1004', title: 'planet', slug: 'planet', image: null, rank: 210, role: 4, win_rate: '50.000', kda: '5.740', top_heroes: [] },
        { id: 15, steam_id: '1005', title: 'zzq', slug: 'zzq', image: null, rank: 505, role: 5, win_rate: '50.000', kda: '2.660', top_heroes: [] },
      ],
    },
    second_team: {
      id: 6454,
      title: 'Rune Eaters',
      tag: 'RE',
      slug: 'rune-eaters',
      image: '/uploads/teams/b.png',
      image_dark: null,
      rank: 26,
      win_rate: '50.000',
      fb_rate: '63.000',
      f10_rate: '42.000',
      maps_total: 324,
      players: [],
    },
    streams: [
      { platform: 'twitch', url: 'https://www.twitch.tv/gamesofuture_dota2', channel_title: 'gamesofuture_dota2', is_live: 0 },
    ],
    // 赔率：本产品不展示，解析器不应暴露到输出里。
    bets: [{ id: 1, map: 0, first_team_odds: '2.200', second_team_odds: '1.580' }],
    maps: [],
    series_players: [],
  };
  return `<html><script>window.series_item = ${JSON.stringify(seriesItem)};</script></html>`;
}

describe('parseDltvSeriesItem upcoming pre-match', () => {
  it('parses status/stage/eventFormat and event info', () => {
    const series = parseDltvSeriesItem(makeUpcomingHtml());

    expect(series).not.toBeNull();
    expect(series?.status).toBe(0);
    expect(series?.stage).toBe('3rd Place Match');
    expect(series?.eventFormat).toBe('Playoffs');
    expect(series?.bestOf).toBe('BO3');
    expect(series?.maps).toHaveLength(0);

    expect(series?.event).toMatchObject({
      name: 'Games of the Future 2026',
      tag: 'GOTF 2026',
      countryId: 47,
      country: {
        name: 'Kazakhstan',
        code: 'kz',
        emoji: '🇰🇿',
        flag: 'https://dltv.org/assets/plugins/flag-icon/flags/4x3/kz.svg',
      },
      tier: 3,
      prizePool: 1000000,
      twitchLink: 'https://www.twitch.tv/gamesofuture_dota2',
      bracketsLink: 'https://results.gofuture.games/events/games-of-the-future-2026/tournaments/moba-pc-dota-2-2026/bracket/',
    });
    expect(series?.event?.image).toBe('https://dltv.org/uploads/events/evt.png');
  });

  it('parses team stats and sorted lineups with roles', () => {
    const series = parseDltvSeriesItem(makeUpcomingHtml());
    const team = series?.radiantTeam;

    expect(team?.rank).toBe(18);
    expect(team?.winRate).toBe('63.000');
    expect(team?.fbRate).toBe('56.000');
    expect(team?.f10Rate).toBe('72.000');
    expect(team?.mapsTotal).toBe(42);

    // 阵容按位置 1-5 排序，roleLabel 正确映射。
    expect(team?.players.map((p) => p.name)).toEqual(['Erika', 'EchozZ', 'niu', 'planet', 'zzq']);
    expect(team?.players.map((p) => p.roleLabel)).toEqual(['Core', 'Mid', 'Offlane', 'Support', 'Full Support']);

    const carry = team?.players[0];
    expect(carry?.rank).toBe(1);
    expect(carry?.kda).toBe('5.800');
    expect(carry?.avgGpm).toBe('772.320');
    expect(carry?.avgXpm).toBe('907.320');
    expect(carry?.avgDmg).toBe('29271.000');
    expect(carry?.topHeroes).toHaveLength(1);
    expect(carry?.topHeroes[0]).toMatchObject({ heroTitle: 'Magnus', heroSlug: 'magnus', maps: 14, wins: 11, winRate: '79%' });

    // 空阵容队伍保持 players: []。
    expect(series?.direTeam?.players).toEqual([]);
  });

  it('parses streams and never exposes bets/odds', () => {
    const series = parseDltvSeriesItem(makeUpcomingHtml());

    expect(series?.streams).toHaveLength(1);
    expect(series?.streams[0]).toMatchObject({
      platform: 'twitch',
      url: 'https://www.twitch.tv/gamesofuture_dota2',
      channelTitle: 'gamesofuture_dota2',
      isLive: false,
    });

    expect(series).not.toHaveProperty('odds');
    expect(series).not.toHaveProperty('bets');
  });
});
