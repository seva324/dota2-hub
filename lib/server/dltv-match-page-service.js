/**
 * DLTV 比赛详情服务
 *
 * 抓取 dltv.org 的比赛详情页（series_item JSON 所在页面），带热缓存。
 * 复用列表页的 fetchText 策略：direct 优先，jina 回退，短超时。
 */

import { parseDltvSeriesItem } from './dltv-series-parser.js';
import { getDb } from '../db.js';
import {
  ensureDltvMatchPageCacheTable,
  readDltvMatchPageCache,
  writeDltvMatchPageCache,
} from './dltv-match-page-db-cache.js';

const PAGE_FETCH_TIMEOUT_MS = 3000;
// 内存缓存 TTL：per-instance，1MB payload 不宜久留，短一点防内存膨胀。
const CACHE_TTL_MS = 10 * 60 * 1000;
// Neon 持久缓存 TTL：match 详情对已完成比赛基本不变，6h 足够覆盖重复点击，
// 让用户流量命中缓存、避免直连 DLTV 触发反爬。
const DB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// 整个 getDltvMatchPage 的有界总超时：direct(3s) 失败后给 jina 留执行窗口。
// 之前 direct 给 15s 但总超时 6s，jina 永远没机会执行 → EdgeOne 出口直连失败时必超时。
// jina 从 EdgeOne 出口实测 5-9s（dltv direct 被反爬拦截时），预算需覆盖。
// 冷抓 + slug 重建可能两段各 5-20s（大页面 jina 实测 14-20s）。总超时放宽到 32s：
// direct(3s)+jina(22s)=25s 留 7s 裕量给解析/slug 重建/大页面余量；前端无客户端超时，
// 串行等待可接受，成功后写入内存/Neon，后续点击立即命中。
const MATCH_PAGE_TOTAL_TIMEOUT_MS = 32000;
// slug 重建后的第二次抓取单独限 6s，避免叠加超出总超时。
const SLUG_REBUILD_FETCH_TIMEOUT_MS = 6000;

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

async function fetchAttempt(tryFetch, { timeoutMs, headers, type }) {
  const timeout = buildTimeoutSignal(timeoutMs);
  try {
    const res = await tryFetch({ signal: timeout.signal, headers });
    if (res.ok || res.status === 404) {
      const text = await res.text();
      if (String(text || '').includes(SERIES_ITEM_MARKER)) return { raw: text, sourceType: type };
    }
  } catch {
    // ignore; caller falls through to next attempt
  } finally {
    timeout.dispose();
  }
  return null;
}

export async function fetchMatchPageHtml(url, fetchImpl = fetch, timeoutMs = PAGE_FETCH_TIMEOUT_MS) {
  const commonHeaders = {
    'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
    Accept: 'text/html,application/xhtml+xml,text/plain',
  };
  // direct 优先（小页面 1-2s 即时），失败/无 marker 再走 jina。
  const direct = await fetchAttempt(
    (opts) => fetchImpl(url, { ...opts, headers: { ...commonHeaders, ...(opts.headers || {}) } }),
    { timeoutMs, headers: {}, type: 'direct' },
  );
  if (direct) return { ...direct, sourceUrl: url };

  // jina 回退：大页面（1.1-1.4MB）下载+读取实测 14-20s，且 jina 免费层会间歇限流。
  // 用较长时间窗 + 失败重试一次（间隔 3s），提高大页面/限流时成功概率。
  // 单个 jina 窗口 22s；配合外层 MATCH_PAGE_TOTAL_TIMEOUT_MS(32s) 覆盖 direct+两次 jina。
  const jinaUrl = buildJinaUrl(url);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
    const jina = await fetchAttempt(
      (opts) => fetchImpl(jinaUrl, { ...opts, headers: { ...commonHeaders, 'X-Return-Format': 'html', 'X-No-Cache': 'true' } }),
      { timeoutMs: 22000, headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true' }, type: 'jina' },
    );
    if (jina) return { ...jina, sourceUrl: jinaUrl };
  }

  return { raw: '', sourceType: 'failed', sourceUrl: url };
}

function isFresh(timestamp, ttlMs) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < ttlMs;
}

/**
 * 该系列赛是否已打完（终态）。
 * 未结束的系列（赛前/进行中）数据会变：maps 会从空变有、比分会更新，
 * 所以不允许进 Neon 6h 长缓存——否则比赛结束后 6h 内用户一直命中赛前空快照。
 * 判据：DLTV series_item 的 status=2（finished）或 ended_at 非空。
 */
function isSeriesFinished(series) {
  if (!series) return false;
  return Number(series.status) === 2 || Boolean(series.endedAt);
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
 * 顺序：内存 TTL 缓存 → Neon 持久缓存（6h）→ 冷抓取（15s 有界总超时）。
 * match-page payload 较大（~1MB），不再进 30MB Redis（会挤掉 live/列表数据），
 * 改存 Neon；预热 cron 定时写入，用户流量命中缓存即不直连 DLTV。
 * stale（有数据但已过期）立即返回 + 后台刷新；抓取失败回退 stale。
 * @param {object} options
 * @param {string|number} options.seriesId DLTV 系列赛 ID
 * @param {string} [options.slug] 可选；不带 slug 时 maps 可能为空，由调用方决定是否回退
 * @param {boolean} [options.forceRefresh] 跳过所有缓存层直接抓取（预热 cron 用）
 * @returns {Promise<{ series: object|null, source: string }>}
 */
export async function getDltvMatchPage({ seriesId, slug }, options = {}) {
  const key = cacheKeyFor(seriesId);
  const now = Date.now();
  const forceRefresh = Boolean(options.forceRefresh);
  const memory = memoryCache.get(key);

  if (!forceRefresh && memory?.payload && isFresh(memory.refreshedAt, CACHE_TTL_MS)) {
    return { series: memory.payload, source: 'cache' };
  }

  const db = getDb();
  if (!forceRefresh && db) {
    const dbCached = await readDltvMatchPageCache(db, seriesId);
    const dbCachedAt = Number(dbCached?.refreshedAt || 0);
    // 只信任"已结束"的 Neon 快照：赛前/进行中快照（含历史遗留脏数据）当 miss，
    // 落冷抓拿到最新数据并覆盖，比赛结束后首个请求即可自动修复，无需人工刷缓存。
    if (dbCached?.payload && isSeriesFinished(dbCached.payload) && isFresh(dbCachedAt, DB_CACHE_TTL_MS)) {
      memoryCache.set(key, { payload: dbCached.payload, refreshedAt: dbCachedAt });
      return { series: dbCached.payload, source: 'cache' };
    }
    const stalePayload = memory?.payload || dbCached?.payload;
    if (stalePayload && isSeriesFinished(stalePayload)) {
      void refreshStaleSeries(key, { seriesId, slug }, options.fetchImpl, now, db);
      return { series: stalePayload, source: 'stale' };
    }
  } else if (!forceRefresh) {
    // 无 DB（本地/测试）：退回纯内存 stale 回退
    if (memory?.payload) {
      void refreshStaleSeries(key, { seriesId, slug }, options.fetchImpl, now, null);
      return { series: memory.payload, source: 'stale' };
    }
  }

  // 有界总超时：真冷启动抓取（12-31s）常超时。超时返回 source:'timeout'（而非 failed），
  // 让 API 层返回 200 + 可重试标记，前端自动重试。底层抓取不会被取消，
  // Promise.race 落败后仍在后台跑，成功后写入内存/Neon，下一次重试直接命中。
  try {
    return await withTimeout(
      (async () => {
        if (inFlight.has(key)) return inFlight.get(key);
        const task = (async () => {
          const result = await fetchAndParseSeries({ seriesId, slug }, options.fetchImpl);
          if (result.series) {
            memoryCache.set(key, { payload: result.series, refreshedAt: now });
            // 只有已结束的系列才写 Neon 6h 长缓存；赛前/进行中快照只进内存短缓存，
            // 比赛结束后下一次请求自动冷抓新数据，不会让用户看到赛前空快照。
            if (isSeriesFinished(result.series)) {
              const writableDb = db || getDb();
              if (writableDb) {
                await writeDltvMatchPageCache(writableDb, seriesId, result.series);
              }
            }
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

/** 后台刷新 stale 的详情页：成功后更新 Neon 与内存，失败静默保留旧数据。 */
async function refreshStaleSeries(key, args, fetchImpl, now, db) {
  try {
    const result = await fetchAndParseSeries(args, fetchImpl);
    if (result.series) {
      memoryCache.set(key, { payload: result.series, refreshedAt: now });
      // 与冷抓一致：只把已结束的系列写回 Neon，避免刷新期间赛前快照污染长缓存。
      if (isSeriesFinished(result.series)) {
        const writableDb = db || getDb();
        if (writableDb) {
          await writeDltvMatchPageCache(writableDb, args.seriesId, result.series);
        }
      }
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
const PREWARM_MAX = 12;
// 预热并发上限：避免一批同时打 dltv 触发反爬/限流，分批 3 个并行动作。
const PREWARM_CONCURRENCY = 3;
const prewarmAt = new Map();

/**
 * 后台预热一组比赛详情页。fire-and-forget：调用方不需要 await。
 * getDltvMatchPage 自带 single-flight + 内存/热缓存写入；即使有界超时落败，
 * Promise.race 也不会取消底层抓取，抓完仍会写缓存——所以预热失败只是"没提前热到"。
 * 按 PREWARM_CONCURRENCY 分批并行，避免并发打满 dltv。
 * @param {Array<{ seriesId: string|number, slug?: string }>} entries
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {number} 实际触发的预热数量
 */
export function prewarmMatchPages(entries, options = {}) {
  const now = Date.now();
  const jobs = [];
  for (const entry of (entries || []).slice(0, PREWARM_MAX)) {
    const seriesId = entry?.seriesId;
    if (!seriesId) continue;
    const key = cacheKeyFor(seriesId);
    const last = prewarmAt.get(key) || 0;
    if (now - last < PREWARM_MIN_INTERVAL_MS) continue;
    prewarmAt.set(key, now);
    jobs.push(() => getDltvMatchPage({ seriesId, slug: entry.slug }, { fetchImpl: options.fetchImpl }).catch(() => {}));
  }
  // 分批并行：每批最多 PREWARM_CONCURRENCY 个在途。
  let index = 0;
  const fireBatch = () => {
    const batch = jobs.slice(index, index + PREWARM_CONCURRENCY);
    index += PREWARM_CONCURRENCY;
    batch.forEach((fn) => void fn());
    if (index < jobs.length) setTimeout(fireBatch, 600);
  };
  if (jobs.length > 0) fireBatch();
  return jobs.length;
}
