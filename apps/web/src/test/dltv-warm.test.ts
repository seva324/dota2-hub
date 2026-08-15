import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.hoisted：vi.mock 工厂会提升到 import 之上，mocks 里的 fn 必须先初始化，否则 TDZ 报错。
const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  ensureDltvMatchPageCacheTable: vi.fn(),
  freshDltvMatchPageSeriesIds: vi.fn(),
  getDltvLive: vi.fn(),
  getDltvUpcoming: vi.fn(),
  getDltvResults: vi.fn(),
  getDltvMatchPage: vi.fn(),
  getDltvSeriesStats: vi.fn(),
  ensureDltvSeriesStatsCacheTable: vi.fn(),
  freshDltvSeriesStatsIds: vi.fn(),
}));

vi.mock('../../../../lib/db.js', () => ({
  getDb: mocks.getDb,
}));

vi.mock('../../../../lib/server/dltv-match-page-db-cache.js', () => ({
  ensureDltvMatchPageCacheTable: mocks.ensureDltvMatchPageCacheTable,
  freshDltvMatchPageSeriesIds: mocks.freshDltvMatchPageSeriesIds,
}));

vi.mock('../../../../lib/server/dltv-matches-service.js', () => ({
  getDltvLive: mocks.getDltvLive,
  getDltvUpcoming: mocks.getDltvUpcoming,
  getDltvResults: mocks.getDltvResults,
}));

vi.mock('../../../../lib/server/dltv-match-page-service.js', () => ({
  getDltvMatchPage: mocks.getDltvMatchPage,
}));

vi.mock('../../../../lib/server/dltv-series-stats.js', () => ({
  getDltvSeriesStats: mocks.getDltvSeriesStats,
}));

vi.mock('../../../../lib/server/dltv-series-stats-db-cache.js', () => ({
  ensureDltvSeriesStatsCacheTable: mocks.ensureDltvSeriesStatsCacheTable,
  freshDltvSeriesStatsIds: mocks.freshDltvSeriesStatsIds,
}));

import { warmDltvCaches } from '../../../../lib/server/dltv-warm.js';

describe('dltv warm cron', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.getDb.mockReturnValue({});
    mocks.ensureDltvMatchPageCacheTable.mockReset();
    mocks.ensureDltvMatchPageCacheTable.mockResolvedValue(undefined);
    mocks.freshDltvMatchPageSeriesIds.mockReset();
    mocks.freshDltvMatchPageSeriesIds.mockResolvedValue(new Set());
    mocks.getDltvLive.mockReset();
    mocks.getDltvUpcoming.mockReset();
    mocks.getDltvResults.mockReset();
    mocks.getDltvMatchPage.mockReset();
    mocks.getDltvSeriesStats.mockReset();
    mocks.getDltvSeriesStats.mockResolvedValue({ stats: { teams: {} }, source: 'dltv' });
    mocks.ensureDltvSeriesStatsCacheTable.mockReset();
    mocks.ensureDltvSeriesStatsCacheTable.mockResolvedValue(undefined);
    mocks.freshDltvSeriesStatsIds.mockReset();
    mocks.freshDltvSeriesStatsIds.mockResolvedValue(new Set());
  });

  it('warms upcoming match pages alongside completed results', async () => {
    mocks.getDltvLive.mockResolvedValue({ live: [] });
    mocks.getDltvUpcoming.mockResolvedValue({
      upcoming: [
        { seriesId: 427409, matchUrl: 'https://dltv.org/matches/427409/team-resilience-vs-rune-eaters-games-of-the-future-2026' },
      ],
    });
    mocks.getDltvResults.mockResolvedValue({
      results: [
        { seriesId: 427573, matchUrl: 'https://dltv.org/matches/427573/og-vs-nigma-esl-one' },
      ],
    });
    mocks.freshDltvMatchPageSeriesIds.mockResolvedValue(new Set());
    mocks.getDltvMatchPage.mockResolvedValue({ series: { seriesId: 427409 }, source: 'dltv' });

    const result = await warmDltvCaches();

    expect(result.upcomingMatchPages.total).toBe(1);
    expect(result.upcomingMatchPages.warmed).toBe(1);
    expect(result.matchPages.total).toBe(1);
    expect(result.matchPages.warmed).toBe(1);

    // 完成的 6h 新鲜、upcoming 每轮强制全热（ttlMs=0，赛前列表动态变化不能 skip）。
    const ttlCalls = mocks.freshDltvMatchPageSeriesIds.mock.calls.map((c) => c[2]);
    expect(ttlCalls).toContain(6 * 60 * 60 * 1000);
    expect(ttlCalls).toContain(0);

    // 两个 seriesId 都被预热，slug 从 matchUrl 正确提取。
    const warmedIds = mocks.getDltvMatchPage.mock.calls.map((c) => c[0].seriesId);
    expect(warmedIds).toContain(427409);
    expect(warmedIds).toContain(427573);
    const upcomingCall = mocks.getDltvMatchPage.mock.calls.find((c) => c[0].seriesId === 427409);
    expect(upcomingCall?.[0].slug).toBe('team-resilience-vs-rune-eaters-games-of-the-future-2026');

    // stats 也一起预热（results + upcoming 合并，6h 新鲜窗口）。
    expect(result.seriesStats.total).toBe(2);
    expect(result.seriesStats.warmed).toBe(2);
    const statsWarmedIds = mocks.getDltvSeriesStats.mock.calls.map((c) => c[0].seriesId);
    expect(statsWarmedIds).toContain(427409);
    expect(statsWarmedIds).toContain(427573);
    expect(mocks.freshDltvSeriesStatsIds.mock.calls[0][2]).toBe(6 * 60 * 60 * 1000);
  });

  it('skips series stats that are fresh', async () => {
    mocks.getDltvLive.mockResolvedValue({ live: [] });
    mocks.getDltvUpcoming.mockResolvedValue({
      upcoming: [
        { seriesId: 427409, matchUrl: 'https://dltv.org/matches/427409/x-vs-y' },
      ],
    });
    mocks.getDltvResults.mockResolvedValue({ results: [] });
    mocks.freshDltvSeriesStatsIds.mockResolvedValue(new Set([427409]));

    const result = await warmDltvCaches();

    expect(result.seriesStats.skippedFresh).toBe(1);
    expect(result.seriesStats.warmed).toBe(0);
    expect(mocks.getDltvSeriesStats).not.toHaveBeenCalled();
  });

  it('re-warms upcoming entries every round even when fresh (list changes dynamically)', async () => {
    // upcoming 列表动态变化（新比赛随时加入），fresh-skip 会漏掉新增项 →
    // 每轮强制全热（ttlMs=0），即使 Neon 里已有快照也重抓。
    mocks.getDltvLive.mockResolvedValue({ live: [] });
    mocks.getDltvUpcoming.mockResolvedValue({
      upcoming: [
        { seriesId: 427409, matchUrl: 'https://dltv.org/matches/427409/x-vs-y' },
      ],
    });
    mocks.getDltvResults.mockResolvedValue({ results: [] });
    // ttlMs=0（upcoming 强制全热）时不做 fresh-skip；results 的 6h 窗口仍按 fresh 跳过。
    mocks.freshDltvMatchPageSeriesIds.mockImplementation(async (_db, _ids, ttlMs) => (ttlMs === 0 ? new Set() : new Set([427409])));
    mocks.getDltvMatchPage.mockResolvedValue({ series: { seriesId: 427409 }, source: 'dltv' });

    const result = await warmDltvCaches();

    expect(result.upcomingMatchPages.skippedFresh).toBe(0);
    expect(result.upcomingMatchPages.warmed).toBe(1);
    expect(mocks.getDltvMatchPage).toHaveBeenCalledTimes(1);
  });

  it('reports zero totals without a database', async () => {
    mocks.getDb.mockReturnValue(null);
    mocks.getDltvLive.mockResolvedValue({ live: [] });
    mocks.getDltvUpcoming.mockResolvedValue({
      upcoming: [{ seriesId: 1, matchUrl: 'https://dltv.org/matches/1/x-vs-y' }],
    });
    mocks.getDltvResults.mockResolvedValue({ results: [] });

    const result = await warmDltvCaches();

    expect(result.dbAvailable).toBe(false);
    expect(result.upcomingMatchPages.warmed).toBe(0);
    expect(mocks.getDltvMatchPage).not.toHaveBeenCalled();
  });

  it('stops warming when the hard deadline has passed', async () => {
    mocks.getDltvLive.mockResolvedValue({ live: [] });
    mocks.getDltvUpcoming.mockResolvedValue({
      upcoming: [{ seriesId: 427409, matchUrl: 'https://dltv.org/matches/427409/x-vs-y' }],
    });
    mocks.getDltvResults.mockResolvedValue({
      results: [{ seriesId: 427573, matchUrl: 'https://dltv.org/matches/427573/og-vs-nigma' }],
    });
    mocks.getDltvMatchPage.mockResolvedValue({ series: { seriesId: 427409 }, source: 'dltv' });

    // deadline 已过期：match-page / stats 全部跳过（列表抓取仍完成），
    // 保证函数能在平台 60s 上限内返回响应。
    const result = await warmDltvCaches({ deadline: Date.now() - 1_000 });

    expect(result.matchPages.warmed).toBe(0);
    expect(result.matchPages.budgetHit).toBe(true);
    expect(result.upcomingMatchPages.warmed).toBe(0);
    expect(result.upcomingMatchPages.budgetHit).toBe(true);
    expect(result.seriesStats.warmed).toBe(0);
    expect(mocks.getDltvMatchPage).not.toHaveBeenCalled();
    expect(mocks.getDltvSeriesStats).not.toHaveBeenCalled();
  });
});
