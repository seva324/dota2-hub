import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDbMock = vi.fn();
const readDltvMatchPageCache = vi.fn();
const writeDltvMatchPageCache = vi.fn();
const ensureDltvMatchPageCacheTable = vi.fn();

vi.mock('../../../../lib/db.js', () => ({
  getDb: () => getDbMock(),
}));

vi.mock('../../../../lib/server/dltv-match-page-db-cache.js', () => ({
  ensureDltvMatchPageCacheTable,
  readDltvMatchPageCache,
  writeDltvMatchPageCache,
  freshDltvMatchPageSeriesIds: vi.fn().mockResolvedValue(new Set()),
}));

const fakeDb = {};
const SERIES_ITEM_MARKER = 'series_item = ';

/** 不带 slug 的 404 壳页：只有 series_item 作为函数参数名，没有 `series_item = ` 赋值标记。 */
function makeShellHtml() {
  return `<html><script>function render() { return series_item.bets.filter((b) => b.betting_platform_id == platform.id); }</script></html>`;
}

/** 真实详情页：内嵌 `series_item = {...}` JSON。 */
function makeRealHtml(overrides: { maps?: unknown[] } = {}) {
  const seriesItem = {
    id: 427573,
    first_team: { id: 1, title: 'OG', tag: 'OG', slug: 'og', image: '/img/og.png', image_dark: null },
    second_team: { id: 2, title: 'Nigma Galaxy', tag: 'NGX', slug: 'nigma-galaxy', image: '/img/ngx.png', image_dark: null },
    event: { id: 9, title: 'ESL One', slug: 'esl-one' },
    started_at: '2026-08-01T10:00:00.000Z',
    maps: overrides.maps ?? [
      {
        id: 1,
        steam_id: '1001',
        label: 'Game 1',
        radiant_team_id: 1,
        dire_team_id: 2,
        radiant_score: 1,
        dire_score: 0,
        winner: 'radiant',
        duration: 2400,
        map_results: [
          {
            team_id: 1,
            player: { id: 11, title: 'Yuragi', slug: 'yuragi' },
            hero: { id: 1, title: 'Anti-Mage' },
            level: 18,
            kills: 5,
            deaths: 2,
            assists: 3,
            last_hits: 300,
            denied_hits: 20,
            gpm: 600,
            xpm: 650,
            gold_total: 15000,
            gold_current: 2000,
          },
          {
            team_id: 2,
            player: { id: 21, title: 'Miracle-', slug: 'miracle' },
            hero: { id: 2, title: 'Invoker' },
            level: 16,
            kills: 2,
            deaths: 5,
            assists: 3,
            last_hits: 250,
            denied_hits: 15,
            gpm: 550,
            xpm: 580,
            gold_total: 12000,
            gold_current: 1500,
          },
        ],
      },
    ],
  };
  return `<html><body><script>window.series_item = ${JSON.stringify(seriesItem)};</script></body></html>`;
}

function mockFetchResponse(html: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  };
}

describe('dltv match page service', () => {
  beforeEach(() => {
    // resetModules: 每次测试重载模块，清空模块级 memoryCache / inFlight single-flight 状态。
    vi.resetModules();
    getDbMock.mockReset();
    getDbMock.mockReturnValue(fakeDb);
    readDltvMatchPageCache.mockReset();
    writeDltvMatchPageCache.mockReset();
    ensureDltvMatchPageCacheTable.mockReset();
    ensureDltvMatchPageCacheTable.mockResolvedValue(undefined);
    readDltvMatchPageCache.mockResolvedValue(null);
    writeDltvMatchPageCache.mockResolvedValue(undefined);
  });

  it('accepts a real detail page containing the series_item = marker', async () => {
    const { fetchMatchPageHtml } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));
    const result = await fetchMatchPageHtml('https://dltv.org/matches/427573/og-vs-nigma', fetchImpl);

    expect(result.raw).toContain(SERIES_ITEM_MARKER);
    expect(result.sourceType).toBe('direct');
  });

  it('treats a no-slug 404 shell as failed even though it mentions series_item', async () => {
    // 关键回归：壳页里的 series_item 只是函数参数名，没有赋值标记，不能误判为成功。
    const { fetchMatchPageHtml } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeShellHtml(), 404));
    const result = await fetchMatchPageHtml('https://dltv.org/matches/427573', fetchImpl);

    expect(result.raw).toBe('');
    expect(result.sourceType).toBe('failed');
  });

  it('parses a full series from the with-slug URL and writes the Neon cache', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));
    const { series, source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(source).toBe('dltv');
    expect(series).not.toBeNull();
    expect(series?.radiantTeam?.name).toBe('OG');
    expect(series?.direTeam?.name).toBe('Nigma Galaxy');
    expect(series?.maps).toHaveLength(1);
    expect(series?.maps[0].available).toBe(true);
    expect(writeDltvMatchPageCache).toHaveBeenCalledTimes(1);
    expect(writeDltvMatchPageCache).toHaveBeenCalledWith(fakeDb, 427573, expect.any(Object));
  });

  it('returns null series when the no-slug URL returns a 404 shell without the marker', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeShellHtml(), 404));
    const { series } = await getDltvMatchPage({ seriesId: 427573 }, { fetchImpl });

    expect(series).toBeNull();
    expect(writeDltvMatchPageCache).not.toHaveBeenCalled();
  });

  it('rebuilds the slug and re-fetches when the marker page has no map data', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    const emptyMapsHtml = makeRealHtml({ maps: [] });
    const fullHtml = makeRealHtml();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockFetchResponse(emptyMapsHtml))
      .mockResolvedValueOnce(mockFetchResponse(fullHtml));

    const { series } = await getDltvMatchPage({ seriesId: 427573 }, { fetchImpl });

    expect(series).not.toBeNull();
    expect(series?.maps.some((map) => map.available)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // 第二次必须命中重建的 slug URL：<first>-vs-<second>-<event>
    const secondUrl = String(fetchImpl.mock.calls[1][0]);
    expect(secondUrl).toContain('/matches/427573/og-vs-nigma-galaxy-esl-one');
  });

  it('serves a fresh Neon cache payload without fetching', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    readDltvMatchPageCache.mockResolvedValue({
      payload: { seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } },
      refreshedAt: Date.now(),
    });
    const fetchImpl = vi.fn();
    const { series, source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(series).toEqual({ seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } });
    expect(source).toBe('cache');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writeDltvMatchPageCache).not.toHaveBeenCalled();
  });

  it('serves a fresh in-memory payload on a second call without re-fetching', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    readDltvMatchPageCache.mockResolvedValue(null);
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));

    const first = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });
    const second = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(first.source).toBe('dltv');
    expect(second.source).toBe('cache');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('shares a single fetch across concurrent cold requests (single-flight)', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));

    const [a, b] = await Promise.all([
      getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl }),
      getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl }),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a.series).not.toBeNull();
    expect(b.series).not.toBeNull();
    expect(a.source).toBe('dltv');
    expect(writeDltvMatchPageCache).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh skips both cache layers and fetches fresh', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    // 即使 Neon 有新鲜缓存，forceRefresh 也要绕过它直接抓取（预热 cron 用）。
    readDltvMatchPageCache.mockResolvedValue({
      payload: { seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } },
      refreshedAt: Date.now(),
    });
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));

    const { source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl, forceRefresh: true });

    expect(source).toBe('dltv');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(writeDltvMatchPageCache).toHaveBeenCalledTimes(1);
  });

  it('returns stale payload immediately while a background refresh rewrites the Neon cache', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    readDltvMatchPageCache.mockResolvedValue({
      payload: { seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } },
      refreshedAt: Date.now() - 7 * 60 * 60 * 1000, // 过期 > DB_CACHE_TTL_MS (6h)
    });
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));

    const { series, source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(source).toBe('stale');
    expect(series).toEqual({ seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } });
    // 后台刷新已发起抓取
    expect(fetchImpl).toHaveBeenCalled();
    await vi.waitFor(() => expect(writeDltvMatchPageCache).toHaveBeenCalled());
  });

  it('bounds a hung cold fetch to 15s and reports source timeout (retryable)', async () => {
    vi.useFakeTimers();
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    readDltvMatchPageCache.mockResolvedValue(null);
    const neverResolving = (async () => new Promise(() => {})) as unknown as typeof fetch;

    const promise = getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl: neverResolving });
    await vi.advanceTimersByTimeAsync(15000);

    const result = await promise;
    expect(result).toEqual({ series: null, source: 'timeout' });
    expect(writeDltvMatchPageCache).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('falls back to stale when a background refresh fails', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    readDltvMatchPageCache.mockResolvedValue({
      payload: { seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } },
      refreshedAt: Date.now() - 7 * 60 * 60 * 1000,
    });
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    const { series, source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(source).toBe('stale');
    expect(series).toEqual({ seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } });
    // 等后台刷新 settle，确认旧数据未被覆盖
    await new Promise((r) => setTimeout(r, 0));
    expect(writeDltvMatchPageCache).not.toHaveBeenCalled();
  });

  it('prewarmMatchPages fires a background fetch for unseen series and dedupes repeats', async () => {
    const { prewarmMatchPages } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));

    // 预热两次相同 series：第一次触发，第二次受 5min 间隔去重。
    prewarmMatchPages([{ seriesId: '427573', slug: 'og-vs-nigma' }], { fetchImpl });
    prewarmMatchPages([{ seriesId: '427573', slug: 'og-vs-nigma' }], { fetchImpl });

    // 底层抓取是后台 fire-and-forget，给它一个 tick 完成。
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
