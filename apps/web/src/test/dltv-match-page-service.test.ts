import { beforeEach, describe, expect, it, vi } from 'vitest';

const readDltvMatchesHotCache = vi.fn();
const writeDltvMatchesHotCache = vi.fn();

vi.mock('../../../../lib/server/dltv-matches-hot-cache.js', () => ({
  readDltvMatchesHotCache,
  writeDltvMatchesHotCache,
}));

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
    vi.clearAllMocks();
    readDltvMatchesHotCache.mockResolvedValue(null);
    writeDltvMatchesHotCache.mockResolvedValue(undefined);
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

  it('parses a full series from the with-slug URL and writes the hot cache', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeRealHtml()));
    const { series, source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(source).toBe('dltv');
    expect(series).not.toBeNull();
    expect(series?.radiantTeam?.name).toBe('OG');
    expect(series?.direTeam?.name).toBe('Nigma Galaxy');
    expect(series?.maps).toHaveLength(1);
    expect(series?.maps[0].available).toBe(true);
    expect(writeDltvMatchesHotCache).toHaveBeenCalledTimes(1);
  });

  it('returns null series when the no-slug URL returns a 404 shell without the marker', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    const fetchImpl = vi.fn().mockResolvedValue(mockFetchResponse(makeShellHtml(), 404));
    const { series } = await getDltvMatchPage({ seriesId: 427573 }, { fetchImpl });

    expect(series).toBeNull();
    expect(writeDltvMatchesHotCache).not.toHaveBeenCalled();
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

  it('serves a fresh hot-cache payload without fetching', async () => {
    const { getDltvMatchPage } = await import('../../../../lib/server/dltv-match-page-service.js');
    readDltvMatchesHotCache.mockResolvedValue({
      payload: { seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } },
      refreshedAt: Date.now(),
    });
    const fetchImpl = vi.fn();
    const { series, source } = await getDltvMatchPage({ seriesId: 427573, slug: 'og-vs-nigma' }, { fetchImpl });

    expect(series).toEqual({ seriesId: 427573, radiantTeam: { id: 1, name: 'OG' } });
    expect(source).toBe('cache');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writeDltvMatchesHotCache).not.toHaveBeenCalled();
  });
});
