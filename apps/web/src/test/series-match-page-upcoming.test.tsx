import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiCache } from '@/lib/api-cache';
import { SeriesMatchPage } from '@/pages/SeriesMatchPage';
import type { MatchPagePayload } from '@/types/matchPage';

function makeUpcomingPayload(): MatchPagePayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    seriesId: 427409,
    eventName: 'Games of the Future 2026',
    bestOf: 'BO3',
    startTime: now + 3600,
    radiantWins: 0,
    direWins: 0,
    status: 0,
    stage: '3rd Place Match',
    eventFormat: 'Playoffs',
    event: {
      name: 'Games of the Future 2026',
      tag: 'GOTF 2026',
      eventSlug: 'games-of-the-future-2026',
      countryId: 47,
      country: { name: 'Kazakhstan', code: 'kz', emoji: '🇰🇿', flag: null },
      startDate: '2026-07-31T00:00:00.000Z',
      endDate: '2026-08-05T00:00:00.000Z',
      tier: 3,
      prizePool: 1000000,
      twitchLink: null,
      bracketsLink: null,
      image: null,
    },
    streams: [],
    source: 'cache',
    teams: {
      radiant: {
        id: 8151,
        name: 'Team Resilience',
        tag: 'Resilien',
        logo: null,
        logoDark: null,
        rank: 18,
        winRate: '63.000',
        fbRate: '56.000',
        f10Rate: '72.000',
        mapsTotal: 42,
        players: [
          {
            id: 11,
            steamId: '1001',
            name: 'Erika',
            image: null,
            rank: 1,
            role: 1,
            roleLabel: '一号位',
            winRate: '57.000',
            maps: 19,
            kda: '5.800',
            avgGpm: '772.320',
            avgXpm: '907.320',
            avgDmg: '29271.000',
            topHeroes: [],
          },
        ],
        stats: {
          overall: { maps: 19, wins: 12, winRate: 63, fbRate: 56, f10Rate: 72, winFbRate: 80, winF10Rate: 77, avgKills: 30.9, avgDeaths: 21.3, avgAssists: 75.3, avgTime: 2484 },
          heroes: [{ heroId: 13, heroTitle: 'Puck', heroImage: null, maps: 6, wins: 4, winRate: 67 }],
        },
      },
      dire: {
        id: 6454,
        name: 'Rune Eaters',
        tag: 'RE',
        logo: null,
        logoDark: null,
        rank: 26,
        winRate: '50.000',
        fbRate: '63.000',
        f10Rate: '42.000',
        mapsTotal: 324,
        players: [],
        stats: {
          overall: { maps: 52, wins: 25, winRate: 48, fbRate: 60, f10Rate: 40, winFbRate: 57, winF10Rate: 63, avgKills: 26.6, avgDeaths: 29.8, avgAssists: 61.6, avgTime: 2572 },
          heroes: [],
        },
      },
    },
    maps: [],
  };
}

describe('SeriesMatchPage upcoming view', () => {
  beforeEach(() => {
    __resetApiCache();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the upcoming view when maps are empty but the series is upcoming', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => makeUpcomingPayload(),
    } as Response);

    render(
      <SeriesMatchPage
        matchId="427409"
        slug="team-resilience-vs-rune-eaters-games-of-the-future-2026"
        onBack={() => {}}
      />,
    );

    expect((await screen.findAllByText('Team Resilience')).length).toBeGreaterThan(0);
    expect(screen.getByText('Erika')).toBeInTheDocument();
    expect(screen.getByText('一号位')).toBeInTheDocument();
    expect(screen.getByText('距开赛')).toBeInTheDocument();
    expect(screen.getAllByText('Rune Eaters').length).toBeGreaterThan(0);
    expect(screen.queryByText('该系列赛暂无比赛数据')).not.toBeInTheDocument();

    // 数据对比 + 签名英雄
    expect(screen.getByText('一血后胜率')).toBeInTheDocument();
    expect(screen.getByText('平均时长')).toBeInTheDocument();
    expect(screen.getByText('Puck')).toBeInTheDocument();

    // 数据对比：每项指标带 emoji 图标
    for (const e of ['📈', '⚔️', '💀', '🤝', '🩸', '🎯', '🛡️', '⚡', '⏱️']) {
      expect(screen.getByText(e)).toBeInTheDocument();
    }

    // 国家名
    expect(screen.getByText('Kazakhstan')).toBeInTheDocument();
    expect(screen.getByText('举办国家')).toBeInTheDocument();
  });

  it('links the event name and 赛程 button to the tournament detail page', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => makeUpcomingPayload(),
    } as Response);

    render(
      <SeriesMatchPage
        matchId="427409"
        slug="team-resilience-vs-rune-eaters-games-of-the-future-2026"
        onBack={() => {}}
      />,
    );

    await screen.findByText('赛事信息');
    const eventLink = screen.getByRole('link', { name: 'Games of the Future 2026' });
    expect(eventLink.getAttribute('href')).toBe('#/event/games-of-the-future-2026');
    const scheduleLink = screen.getByRole('link', { name: '赛程' });
    expect(scheduleLink.getAttribute('href')).toBe('#/event/games-of-the-future-2026');
    expect(scheduleLink.getAttribute('target')).not.toBe('_blank');
  });

  it('does not render the upcoming view when start time is in the past', async () => {
    // 回归：开赛时间已过的系列赛即使 status===0 且带阵容，也不应误判为预告视图。
    const payload = makeUpcomingPayload();
    payload.startTime = Math.floor(Date.now() / 1000) - 3600;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    render(
      <SeriesMatchPage
        matchId="427409"
        slug="team-resilience-vs-rune-eaters-games-of-the-future-2026"
        onBack={() => {}}
      />,
    );

    expect(await screen.findByText('该系列赛暂无比赛数据')).toBeInTheDocument();
    expect(screen.queryByText('距开赛')).not.toBeInTheDocument();
  });
});
