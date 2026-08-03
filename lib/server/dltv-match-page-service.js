/**
 * DLTV 比赛详情服务
 *
 * 抓取 dltv.org 的比赛详情页（series_item JSON 所在页面），带热缓存。
 * 复用列表页的 fetchText 策略：direct 优先，jina 回退，短超时。
 */

import { parseDltvSeriesItem } from './dltv-series-parser.js';
import { readDltvMatchesHotCache, writeDltvMatchesHotCache } from './dltv-matches-hot-cache.js';

const PAGE_FETCH_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 比赛详情页大（~1MB），10 分钟热缓存
// 整个 getDltvMatchPage 的有界总超时：direct(3s) 失败后给 jina(6s) 留执行窗口。
// 之前 direct 给 15s 但总超时 6s，jina 永远没机会执行 → EdgeOne 出口直连失败时必超时。
const MATCH_PAGE_TOTAL_TIMEOUT_MS = 12000;
// slug 重建后的第二次抓取单独限 4s，避免叠加超出总超时。
const SLUG_REBUILD_FETCH_TIMEOUT_MS = 4000;

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

export async function fetchMatchPageHtml(url, fetchImpl = fetch, timeoutMs = PAGE_FETCH_TIMEOUT_MS) {
  const attempts = [
    { url, type: 'direct', timeoutMs, headers: {} },
    {
      url: buildJinaUrl(url),
      type: 'jina',
      timeoutMs: timeoutMs + 3000,
      // jina 默认缓存页面快照，会拿到旧数据；X-No-Cache 强制实时抓取。
      headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true' },
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

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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

// 模块级内存缓存：Redis 未配置时 hot-cache 退化为 per-function 内存，
// 这里再叠一层，让同一函数实例内对同一 seriesId 的并发请求共享抓取结果。
const memoryCache = new Map();

// single-flight：同一 seriesId 在途抓取共享，防止热门系列并发全部重抓。
const inFlight = new Map();

/**
 * 抓取并解析一个系列赛的详情页，带内存写入。
 * 供 getDltvMatchPage 的冷路径复用；在途时由 single-flight 去重。
 */
async function fetchAndParseSeries({ seriesId, slug }, fetchImpl) {
  const url = buildDltvMatchPageUrl(seriesId, slug);
  if (!url) return { series: null, source: 'bad-url' };

  const { raw, sourceType } = await fetchMatchPageHtml(url, fetchImpl);
  let series = raw ? parseDltvSeriesItem(raw) : null;

  // 不带 slug 时 maps 为空：用 series_item 里的队/赛事 slug 重建 URL 再抓一次。
  if (series && !series.maps.some((map) => map.available)) {
    const rebuilt = buildSlugFromSeries(series);
    if (rebuilt && rebuilt !== slug) {
      const retryUrl = buildDltvMatchPageUrl(seriesId, rebuilt);
      const retry = await fetchMatchPageHtml(retryUrl, fetchImpl, SLUG_REBUILD_FETCH_TIMEOUT_MS);
      if (retry.raw) {
        const reparsed = parseDltvSeriesItem(retry.raw);
        if (reparsed) series = reparsed;
      }
    }
  }

  return { series, source: sourceType === 'direct' ? 'dltv' : sourceType };
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
 * 顺序：内存 TTL 缓存 → Redis/per-function hot-cache → 冷抓取（6s 有界总超时）。
 * stale（有数据但已过期）立即返回 + 后台刷新；抓取失败回退 stale。
 * @param {object} options
 * @param {string|number} options.seriesId DLTV 系列赛 ID
 * @param {string} [options.slug] 可选；不带 slug 时 maps 可能为空，由调用方决定是否回退
 * @returns {Promise<{ series: object|null, source: string }>}
 */
export async function getDltvMatchPage({ seriesId, slug }, options = {}) {
  const key = cacheKeyFor(seriesId);
  const now = Date.now();
  const memory = memoryCache.get(key);

  if (memory?.payload && isFresh(memory.refreshedAt, CACHE_TTL_MS)) {
    return { series: memory.payload, source: 'cache' };
  }

  const cached = await readDltvMatchesHotCache(key);
  const cachedAt = Number(cached?.refreshedAt || 0);

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL_MS)) {
    return { series: cached.payload, source: 'cache' };
  }

  const stalePayload = memory?.payload || cached?.payload;
  if (stalePayload) {
    void refreshStaleSeries(key, { seriesId, slug }, options.fetchImpl, now);
    return { series: stalePayload, source: 'stale' };
  }

  // 有界总超时：真冷启动抓取（12-31s）常超时。超时返回 source:'timeout'（而非 failed），
  // 让 API 层返回 200 + 可重试标记，前端自动重试。底层抓取不会被取消，
  // Promise.race 落败后仍在后台跑，成功后写入内存/热缓存，下一次重试直接命中。
  try {
    return await withTimeout(
      (async () => {
        if (inFlight.has(key)) return inFlight.get(key);
        const task = (async () => {
          const result = await fetchAndParseSeries({ seriesId, slug }, options.fetchImpl);
          if (result.series) {
            await writeDltvMatchesHotCache(key, { payload: result.series, refreshedAt: now });
            memoryCache.set(key, { payload: result.series, refreshedAt: now });
          }
          return result;
        })().finally(() => {
          inFlight.delete(key);
        });
        inFlight.set(key, task);
        return task;
      })(),
      MATCH_PAGE_TOTAL_TIMEOUT_MS,
      'match page cold fetch timed out',
    );
  } catch {
    return { series: null, source: 'timeout' };
  }
}

/** 后台刷新 stale 的详情页：成功后更新 hot-cache 与内存，失败静默保留旧数据。 */
async function refreshStaleSeries(key, args, fetchImpl, now) {
  try {
    const result = await fetchAndParseSeries(args, fetchImpl);
    if (result.series) {
      await writeDltvMatchesHotCache(key, { payload: result.series, refreshedAt: now });
      memoryCache.set(key, { payload: result.series, refreshedAt: now });
    }
  } catch (error) {
    console.error(`[dltv-match-page-service] stale refresh failed:`, error instanceof Error ? error.message : String(error));
  }
}

/* ------------------------------------------------------------------ */
/* 详情页预热：从快速的比赛列表结果里后台抓取，让用户点击时直接命中缓存 */
/* ------------------------------------------------------------------ */

// 同实例内同一 series 的预热间隔：避免每次首页加载都重抓一次，防 dltv 反爬/限流。
const PREWARM_MIN_INTERVAL_MS = 5 * 60 * 1000;
// 每次调用最多预热前几条，控制后台并发抓取规模。
const PREWARM_MAX = 3;
const prewarmAt = new Map();

/**
 * 后台预热一组比赛详情页。fire-and-forget：调用方不需要 await。
 * getDltvMatchPage 自带 single-flight + 内存/热缓存写入；即使 6s 有界超时落败，
 * Promise.race 也不会取消底层抓取，抓完仍会写缓存——所以预热失败只是"没提前热到"。
 * @param {Array<{ seriesId: string|number, slug?: string }>} entries
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {number} 实际触发的预热数量
 */
export function prewarmMatchPages(entries, options = {}) {
  const now = Date.now();
  let fired = 0;
  for (const entry of (entries || []).slice(0, PREWARM_MAX)) {
    const seriesId = entry?.seriesId;
    if (!seriesId) continue;
    const key = cacheKeyFor(seriesId);
    const last = prewarmAt.get(key) || 0;
    if (now - last < PREWARM_MIN_INTERVAL_MS) continue;
    prewarmAt.set(key, now);
    fired += 1;
    void getDltvMatchPage({ seriesId, slug: entry.slug }, { fetchImpl: options.fetchImpl }).catch(() => {});
  }
  return fired;
}
