/**
 * DLTV 比赛详情服务
 *
 * 抓取 dltv.org 的比赛详情页（series_item JSON 所在页面），带热缓存。
 * 复用列表页的 fetchText 策略：direct 优先，jina 回退，短超时。
 */

import { parseDltvSeriesItem } from './dltv-series-parser.js';
import { readDltvMatchesHotCache, writeDltvMatchesHotCache } from './dltv-matches-hot-cache.js';

const PAGE_FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 比赛详情页大（~1MB），10 分钟热缓存

/** 与 dltv-series-parser.extractSeriesItemJson 共用的页面内嵌 JSON 赋值标记 */
export const SERIES_ITEM_MARKER = 'series_item = ';

function buildJinaUrl(url) {
  return `https://r.jina.ai/http://${String(url).replace(/^https?:\/\//i, '')}`;
}

function buildTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

export async function fetchMatchPageHtml(url, fetchImpl = fetch) {
  const attempts = [
    { url, type: 'direct', timeoutMs: PAGE_FETCH_TIMEOUT_MS, headers: {} },
    {
      url: buildJinaUrl(url),
      type: 'jina',
      timeoutMs: PAGE_FETCH_TIMEOUT_MS + 3000,
      headers: { 'X-Return-Format': 'html' },
    },
  ];

  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.timeoutMs);
    try {
      const res = await fetchImpl(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
          ...attempt.headers,
        },
        signal: timeout.signal,
      });
      if (!res.ok && res.status !== 404) continue;
      const text = await res.text();
      // 详情页必须包含 series_item 赋值标记才算成功。
      // 注意：不带 slug 的 /matches/<seriesId> 会返回 404，但页面仍内嵌 series_item JSON，
      // 所以不能只看 res.ok；但 404 壳页的 JS 里也有 series_item 作为函数参数名（不带赋值号），
      // 必须要求 `series_item = ` 标记，否则会把壳页当成成功页，slug 重建回退永远不会执行。
      if (String(text || '').includes(SERIES_ITEM_MARKER)) {
        return { raw: text, sourceType: attempt.type, sourceUrl: attempt.url };
      }
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }

  return { raw: '', sourceType: 'failed', sourceUrl: url };
}

function isFresh(timestamp, ttlMs) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < ttlMs;
}

export function buildDltvMatchPageUrl(seriesId, slug) {
  const id = Number(seriesId);
  if (!Number.isFinite(id) || id <= 0) return null;
  if (slug) return `https://dltv.org/matches/${id}/${slug}`;
  return `https://dltv.org/matches/${id}`;
}

function cacheKeyFor(seriesId) {
  return `match-page:${String(seriesId)}`;
}

/**
 * 从 series_item 解析结果重建 DLTV 详情页 slug。
 * slug 格式：<first_team_slug>-vs-<second_team_slug>-<event_slug>。
 * 不带 slug 的 /matches/<seriesId> 能拿到 series_item 但 maps 为空，必须靠 slug 再抓一次。
 */
function buildSlugFromSeries(series) {
  if (!series) return undefined;
  const first = series.radiantTeam?.slug;
  const second = series.direTeam?.slug;
  const event = series.eventSlug;
  if (first && second && event) return `${first}-vs-${second}-${event}`;
  if (first && second) return `${first}-vs-${second}`;
  return undefined;
}

/**
 * 获取某个 DLTV 系列赛详情。
 * @param {object} options
 * @param {string|number} options.seriesId DLTV 系列赛 ID
 * @param {string} [options.slug] 可选；不带 slug 时 maps 可能为空，由调用方决定是否回退
 * @returns {Promise<{ series: object|null, source: string }>}
 */
export async function getDltvMatchPage({ seriesId, slug }, options = {}) {
  const key = cacheKeyFor(seriesId);
  const cached = await readDltvMatchesHotCache(key);
  const now = Date.now();
  const cachedAt = Number(cached?.refreshedAt || 0);

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL_MS)) {
    return { series: cached.payload, source: 'cache' };
  }

  const url = buildDltvMatchPageUrl(seriesId, slug);
  if (!url) return { series: null, source: 'bad-url' };

  const { raw, sourceType } = await fetchMatchPageHtml(url, options.fetchImpl);
  let series = raw ? parseDltvSeriesItem(raw) : null;

  // 不带 slug 时 maps 为空：用 series_item 里的队/赛事 slug 重建 URL 再抓一次。
  if (series && !series.maps.some((map) => map.available)) {
    const rebuilt = buildSlugFromSeries(series);
    if (rebuilt && rebuilt !== slug) {
      const retryUrl = buildDltvMatchPageUrl(seriesId, rebuilt);
      const retry = await fetchMatchPageHtml(retryUrl, options.fetchImpl);
      if (retry.raw) {
        const reparsed = parseDltvSeriesItem(retry.raw);
        if (reparsed) series = reparsed;
      }
    }
  }

  if (series) {
    await writeDltvMatchesHotCache(key, { payload: series, refreshedAt: now });
  }
  return { series, source: sourceType === 'direct' ? 'dltv' : sourceType };
}
