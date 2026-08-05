import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  ensureDltvSeriesStatsCacheTable: vi.fn(),
  readDltvSeriesStatsCache: vi.fn(),
  writeDltvSeriesStatsCache: vi.fn(),
}));

vi.mock('../../../../lib/db.js', () => ({
  getDb: mocks.getDb,
}));

vi.mock('../../../../lib/server/dltv-series-stats-db-cache.js', () => ({
  ensureDltvSeriesStatsCacheTable: mocks.ensureDltvSeriesStatsCacheTable,
  readDltvSeriesStatsCache: mocks.readDltvSeriesStatsCache,
  writeDltvSeriesStatsCache: mocks.writeDltvSeriesStatsCache,
  freshDltvSeriesStatsIds: vi.fn().mockResolvedValue(new Set()),
}));

import { getDltvSeriesStats, normalizeSeriesStats } from '../../../../lib/server/dltv-series-stats.js';

function makeRawStats() {
  return {
    heroes: {
      13: { id: 13, title: 'Puck', image: '/uploads/heroes/puck.png' },
    },
    stats: {
      8151: [
        {
          maps_total: 19,
          wins_total: 12,
          win_rate: 63,
          first_blood_rate: 56,
          first_ten_rate: 72,
          win_first_blood_rate: 80,
          win_first_ten_rate: 77,
          avg_kills: 30.89,
          avg_deaths: 21.32,
          avg_assists: 75.32,
          avg_time: 2484,
        },
        { hero_id: 13, maps_total: 6, wins_total: 4, win_rate: 67, avg_kills: 7.83 },
      ],
    },
  };
}

function mockFetchResponse(raw: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => raw,
  } as Response;
}

describe('dltv series stats', () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.ensureDltvSeriesStatsCacheTable.mockReset();
    mocks.ensureDltvSeriesStatsCacheTable.mockResolvedValue(undefined);
    mocks.readDltvSeriesStatsCache.mockReset();
    mocks.readDltvSeriesStatsCache.mockResolvedValue(null);
    mocks.writeDltvSeriesStatsCache.mockReset();
    mocks.writeDltvSeriesStatsCache.mockResolvedValue(undefined);
  });

  it('normalizes stats into per-team overall + hero rows and keeps the heroes dict', () => {
    const stats = normalizeSeriesStats(makeRawStats());

    expect(stats).not.toBeNull();
    expect(stats?.heroes['13'].title).toBe('Puck');
    expect(stats?.teams['8151'].overall).toMatchObject({
      winRate: 63,
      fbRate: 56,
      f10Rate: 72,
      winFbRate: 80,
      winF10Rate: 77,
      avgKills: 30.89,
      avgDeaths: 21.32,
      avgAssists: 75.32,
      avgTime: 2484,
    });
    expect(stats?.teams['8151'].heroes).toHaveLength(1);
    expect(stats?.teams['8151'].heroes[0]).toMatchObject({ heroId: 13, winRate: 67, maps: 6, wins: 4 });
  });

  it('returns null for a malformed response without stats', () => {
    expect(normalizeSeriesStats({})).toBeNull();
    expect(normalizeSeriesStats({ heroes: {} })).toBeNull();
  });

  it('coerces string stats to numbers', () => {
    // 回归：DLTV 兄弟接口（series_item）会返回 "63.000" 这类数字串，防御性强转，避免前端 toFixed 崩溃。
    const stats = normalizeSeriesStats({
      heroes: {},
      stats: {
        8151: [{ win_rate: '63.000', avg_kills: '30.89', avg_deaths: '21.32', maps_total: '19' }],
      },
    });

    expect(stats?.teams['8151'].overall).toMatchObject({
      winRate: 63,
      avgKills: 30.89,
      avgDeaths: 21.32,
      maps: 19,
    });
    expect(typeof stats?.teams['8151'].overall.winRate).toBe('number');
  });

  it('cold-fetches, caches to memory and writes the Neon cache when a db exists', async () => {
    mocks.getDb.mockReturnValue({});
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRawStats()));

    const { stats, source } = await getDltvSeriesStats({ seriesId: 427409 }, { fetchImpl });

    expect(source).toBe('dltv');
    expect(stats?.teams['8151'].overall.winRate).toBe(63);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // 抓取的 URL 带 seriesId 与 date_range
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/v1/series/427409/lineups/teams?date_range=');
    expect(mocks.writeDltvSeriesStatsCache).toHaveBeenCalledWith({}, 427409, expect.any(Object));

    // 第二次走内存缓存，不再抓取
    const second = await getDltvSeriesStats({ seriesId: 427409 }, { fetchImpl });
    expect(second.source).toBe('cache');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves a fresh Neon cache payload without fetching', async () => {
    mocks.getDb.mockReturnValue({});
    mocks.readDltvSeriesStatsCache.mockResolvedValue({
      payload: { teams: { 8151: { overall: { winRate: 63 }, heroes: [] } }, heroes: {} },
      refreshedAt: Date.now(),
    });
    const fetchImpl = vi.fn();

    const { stats, source } = await getDltvSeriesStats({ seriesId: 427409 }, { fetchImpl });

    expect(source).toBe('cache');
    expect(stats?.teams['8151'].overall.winRate).toBe(63);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.writeDltvSeriesStatsCache).not.toHaveBeenCalled();
  });

  it('returns stats null without a database and without a fetch', async () => {
    mocks.getDb.mockReturnValue(null);
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRawStats()));

    const { stats } = await getDltvSeriesStats({ seriesId: 427409 }, { fetchImpl });

    expect(stats).not.toBeNull();
    expect(mocks.writeDltvSeriesStatsCache).not.toHaveBeenCalled();
  });
});
