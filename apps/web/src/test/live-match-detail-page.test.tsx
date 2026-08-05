import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiCache } from '@/lib/api-cache';
import { LiveMatchDetailPage } from '@/pages/LiveMatchDetailPage';
import type { LiveDetailPayload } from '@/types/liveDetail';

function makeLivePayload(): LiveDetailPayload {
  return {
    source: 'hawk.live',
    sourceUrl: 'https://hawk.live/dota-2/matches/league/series',
    seriesId: '98859',
    slug: 'team-resilience-vs-rune-eaters',
    championship: { id: 2365, name: 'Games of the Future 2026: Playoffs', slug: 'league' },
    bestOf: 3,
    startAt: '2026-08-05T08:00:00.000000Z',
    team1: { id: '1926', name: 'Team Resilience', logoUrl: null },
    team2: { id: '3465', name: 'Rune Eaters', logoUrl: null },
    team1Wins: 0,
    team2Wins: 0,
    currentMapNumber: 1,
    maps: [
      {
        matchId: '210027',
        number: 1,
        isTeam1Radiant: true,
        status: 'live',
        winner: null,
        team1Score: 3,
        team2Score: 1,
        gameTime: 720,
        team1NetWorthLead: 1200,
        team2NetWorthLead: null,
        buildingState: {
          radiant: { top: '11111', mid: '11111', bot: '11111', t4: '11' },
          dire: { top: '11111', mid: '11111', bot: '11111', t4: '11' },
        },
        picks: [
          { isRadiant: true, hero: { id: 98, name: 'Timbersaw', codeName: 'npc_dota_hero_shredder' }, player: { id: 1, name: 'niu', officialName: null } },
          { isRadiant: false, hero: { id: 9, name: 'Mirana', codeName: 'npc_dota_hero_mirana' }, player: { id: 2, name: 'Vevo', officialName: null } },
        ],
        states: [
          { id: '1', gameTime: 37, radiantScore: 0, direScore: 0, radiantNetWorthAdvantage: 0 },
          { id: '2', gameTime: 120, radiantScore: 3, direScore: 1, radiantNetWorthAdvantage: -67 },
        ],
        odds: [],
      },
    ],
    cached: false,
    fetchedAt: '2026-08-05T08:00:00.000Z',
  };
}

describe('LiveMatchDetailPage', () => {
  let fetchImpl: () => LiveDetailPayload = makeLivePayload;

  beforeEach(() => {
    fetchImpl = makeLivePayload;
    __resetApiCache();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => fetchImpl(),
    }) as Response));
  });

  it('renders series meta, live score and lineup from the detail payload', async () => {
    render(<LiveMatchDetailPage seriesId="98859" onBack={() => {}} />);

    expect(await screen.findByText('Team Resilience')).toBeTruthy();
    expect(screen.getByText('Rune Eaters')).toBeTruthy();
    expect(screen.getByText('Games of the Future 2026: Playoffs · BO3')).toBeTruthy();
    expect(screen.getByText('Series 0 : 0 · 12:00')).toBeTruthy();
    expect(screen.getByText('LIVE')).toBeTruthy();

    // 阵容 BP
    expect(await screen.findByText('niu')).toBeTruthy();
    expect(screen.getByText('Vevo')).toBeTruthy();

    // 经济曲线数据点渲染（至少存在图表区域）
    expect(screen.getByRole('img', { name: '净财富优势曲线' })).toBeTruthy();
    // 建筑状态地图
    expect(screen.getByRole('img', { name: '建筑状态地图' })).toBeTruthy();
  });

  it('switches maps when a map tab is clicked', async () => {
    const payload = makeLivePayload();
    payload.maps = [
      ...payload.maps,
      {
        matchId: '210028',
        number: 2,
        isTeam1Radiant: false,
        status: 'upcoming',
        winner: null,
        team1Score: null,
        team2Score: null,
        gameTime: null,
        team1NetWorthLead: null,
        team2NetWorthLead: null,
        buildingState: null,
        picks: [],
        states: [],
        odds: [],
      },
    ];
    fetchImpl = () => payload;

    render(<LiveMatchDetailPage seriesId="98859" onBack={() => {}} />);
    expect(await screen.findByText('Team Resilience')).toBeTruthy();

    const map2Tab = screen.getByRole('button', { name: 'Map 2' });
    fireEvent.click(map2Tab);

    expect(await screen.findByText('阵容 · Picks')).toBeTruthy();
    expect(screen.getByText('Map 2 · 选人')).toBeTruthy();
  });

  it('does not crash when the API returns a timeout payload without maps', async () => {
    // getLiveDetail 冷启动抓取超时返回 { source:'timeout', seriesId }，无 maps：应保留 loading 而非崩溃白屏
    fetchImpl = () => ({ source: 'timeout', seriesId: '98859' } as unknown as LiveDetailPayload);

    render(<LiveMatchDetailPage seriesId="98859" onBack={() => {}} />);

    expect(screen.getByText('正在加载直播详情…')).toBeTruthy();
  });
});
