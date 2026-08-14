/**
 * DLTV 预热编排（cron `warm-dltv` 用）。
 *
 * 把 DLTV 抓取从"用户请求路径"收敛到定时任务：
 * 1. forceRefresh 三份列表（live/upcoming/results）→ 写 Redis hot-cache；
 * 2. 预热已完成比赛的 match-page（results 带 match_url → slug → 完整数据）→ 写 Neon；
 *    已完成数据不变，Neon 内 6h 新鲜的跳过，省 DLTV 抓取 + Neon compute。
 * 并发受限（WARM_CONCURRENCY），避免突发抓取触发 dltv 反爬。
 */

import { getDb } from '../db.js';
import { getDltvLive, getDltvUpcoming, getDltvResults } from './dltv-matches-service.js';
import { getDltvMatchPage } from './dltv-match-page-service.js';
import {
  ensureDltvMatchPageCacheTable,
  freshDltvMatchPageSeriesIds,
} from './dltv-match-page-db-cache.js';
import { getDltvSeriesStats } from './dltv-series-stats.js';
import {
  ensureDltvSeriesStatsCacheTable,
  freshDltvSeriesStatsIds,
} from './dltv-series-stats-db-cache.js';

const WARM_CONCURRENCY = 4;
const COMPLETED_FRESH_MS = 6 * 60 * 60 * 1000;
// upcoming 临近开赛会变（阵容/倒计时/状态），用更短的新鲜窗口；预热约每小时一轮，
// 30min 内重抓一次，配合后端短缓存让倒计时尽量新。
const UPCOMING_FRESH_MS = 30 * 60 * 1000;
// 统计是历史聚合，变化慢，6h 新鲜窗口足够。
const STATS_FRESH_MS = 6 * 60 * 60 * 1000;
// stats 接口单次有 5s 超时，每轮最多热前 N 个，防止挤占 match-page 的预算；
// 下一轮继续补热，收敛只是慢一些。
const STATS_MAX_PER_ROUND = 20;
// EdgeOne 函数 maxDuration=60s：match-page 预热是 best-effort，超预算就停，
// 已完成的会被 fresh-skip 跳过，下一轮（10min 后）接着热，几轮后收敛。
const WARM_TIME_BUDGET_MS = 30_000;
// 整个 warm 流程的硬性 deadline（从本函数开始计时）：平台会在 60s 杀掉函数，
// 必须先返回响应；未在预算内完成的部分由下一轮继续收敛。
const WARM_HARD_DEADLINE_MS = 50_000;
// 单个 match-page 预热的单页硬性上限：用户冷抓需要 32s 预算（大页面 jina 14-20s），
// 但 warm-dltv 整个函数只有 60s 生命线。若 4 并发各拿 32s，会整轮拖到 60s+ → EdgeOne 503
// → 本轮任何页面都写不进 Neon（正是近期 503 的来源）。收紧到 10s：慢页跳过本轮的
// 前台等待（底层抓取不被取消，完成后仍会写缓存），预算内多跑几页，避免 cron 超时。
const PER_PAGE_WARM_MS = 10_000;

/** Promise.race 限时：给单个页面收紧预算，避免慢页拖垮整个 warm cron。 */
function withTimeout(promise, ms) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`page warm timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** 从 DLTV matchUrl（/matches/<seriesId>/<slug>）提取详情页 slug。 */
export function extractSlugFromMatchUrl(matchUrl) {
  if (!matchUrl) return undefined;
  const match = String(matchUrl).match(/\/matches\/\d+\/([^/?#]+)/i);
  return match?.[1] || undefined;
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.max(0, Math.min(concurrency, items.length)) }, async () => {
    while (index < items.length) {
      const i = index;
      index += 1;
      try {
        results[i] = await fn(items[i]);
      } catch (error) {
        results[i] = null;
        console.error('[dltv-warm] item failed:', error instanceof Error ? error.message : String(error));
      }
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

/**
 * 预热一批 match-page 到 Neon。已新鲜（updated_at 距今 < ttlMs）的跳过；
 * 与调用方共享 startedAt 时间预算，预算耗尽即停，剩余交给下一轮。
 */
async function warmEntries({ db, entries, ttlMs, startedAt, deadline, fetchImpl }) {
  let skippedFresh = 0;
  let budgetHit = false;
  const warmed = [];
  if (!db || entries.length === 0) return { warmed, skippedFresh, budgetHit };

  await ensureDltvMatchPageCacheTable(db);
  const freshIds = await freshDltvMatchPageSeriesIds(db, entries.map((e) => e.seriesId), ttlMs);
  const toWarm = entries.filter((e) => !freshIds.has(Number(e.seriesId)));
  skippedFresh = entries.length - toWarm.length;

  await mapWithConcurrency(toWarm, WARM_CONCURRENCY, async (entry) => {
    if (Date.now() > deadline || Date.now() - startedAt > WARM_TIME_BUDGET_MS) {
      budgetHit = true;
      return null;
    }
    // 单页限时：超时视为本轮未热到（返回空），不再阻塞并行的其它页面；底层抓取
    // 由 getDltvMatchPage 内部继续，完成后仍会写内存/Neon（best-effort 收敛）。
    const result = await withTimeout(
      getDltvMatchPage({ seriesId: entry.seriesId, slug: entry.slug }, { forceRefresh: true, fetchImpl }),
      PER_PAGE_WARM_MS,
    ).catch(() => null);
    if (result?.series) warmed.push(entry.seriesId);
    return result?.series ? entry.seriesId : null;
  });

  return { warmed, skippedFresh, budgetHit };
}

/**
 * 预热一批系列赛统计到 Neon（/api/v1/series/{id}/lineups/teams）。
 * 与 match-page 共享 startedAt 时间预算；stats 只按 seriesId 预热，不需要 slug。
 */
async function warmStatsEntries({ db, entries, ttlMs, startedAt, deadline, fetchImpl }) {
  let skippedFresh = 0;
  let budgetHit = false;
  const warmed = [];
  if (!db || entries.length === 0) return { warmed, skippedFresh, budgetHit };

  await ensureDltvSeriesStatsCacheTable(db);
  const freshIds = await freshDltvSeriesStatsIds(db, entries.map((e) => e.seriesId), ttlMs);
  const toWarm = entries.filter((e) => !freshIds.has(Number(e.seriesId)));
  skippedFresh = entries.length - toWarm.length;

  await mapWithConcurrency(toWarm, WARM_CONCURRENCY, async (entry) => {
    if (Date.now() > deadline || Date.now() - startedAt > WARM_TIME_BUDGET_MS) {
      budgetHit = true;
      return null;
    }
    const result = await getDltvSeriesStats({ seriesId: entry.seriesId }, { forceRefresh: true, fetchImpl });
    if (result?.stats) warmed.push(entry.seriesId);
    return result?.stats ? entry.seriesId : null;
  });

  return { warmed, skippedFresh, budgetHit };
}

export async function warmDltvCaches(options = {}) {
  const db = getDb();
  const deadline = Number.isFinite(options.deadline)
    ? options.deadline
    : Date.now() + WARM_HARD_DEADLINE_MS;

  const [live, upcoming, results] = await Promise.all([
    getDltvLive({ forceRefresh: true, fetchImpl: options.fetchImpl }),
    getDltvUpcoming({ forceRefresh: true, fetchImpl: options.fetchImpl }),
    getDltvResults({ forceRefresh: true, fetchImpl: options.fetchImpl }),
  ]);

  const toEntries = (rows) =>
    (rows || [])
      .map((row) => ({
        seriesId: row.seriesId,
        slug: extractSlugFromMatchUrl(row.matchUrl),
      }))
      .filter((e) => Number.isFinite(Number(e.seriesId)) && e.slug);

  const resultsEntries = toEntries(results?.results);
  const upcomingEntries = toEntries(upcoming?.upcoming);

  const startedAt = Date.now();
  // match-page 是详情页核心数据，优先热（先已完成 6h、再 upcoming 30min）。
  const completed = await warmEntries({
    db,
    entries: resultsEntries,
    ttlMs: COMPLETED_FRESH_MS,
    startedAt,
    deadline,
    fetchImpl: options.fetchImpl,
  });
  const upcomingWarm = await warmEntries({
    db,
    entries: upcomingEntries,
    ttlMs: UPCOMING_FRESH_MS,
    startedAt,
    deadline,
    fetchImpl: options.fetchImpl,
  });
  // 统计是增强数据，放最后 + 每轮限量，避免撑爆预算饿死 match-page。
  const statsWarm = await warmStatsEntries({
    db,
    entries: [...resultsEntries, ...upcomingEntries].slice(0, STATS_MAX_PER_ROUND),
    ttlMs: STATS_FRESH_MS,
    startedAt,
    deadline,
    fetchImpl: options.fetchImpl,
  });

  return {
    lists: {
      live: live?.live?.length || 0,
      upcoming: upcoming?.upcoming?.length || 0,
      results: resultsEntries.length,
    },
    seriesStats: {
      total: resultsEntries.length + upcomingEntries.length,
      skippedFresh: statsWarm.skippedFresh,
      warmed: statsWarm.warmed.length,
      budgetHit: statsWarm.budgetHit,
    },
    matchPages: {
      total: resultsEntries.length,
      skippedFresh: completed.skippedFresh,
      warmed: completed.warmed.length,
      budgetHit: completed.budgetHit,
    },
    upcomingMatchPages: {
      total: upcomingEntries.length,
      skippedFresh: upcomingWarm.skippedFresh,
      warmed: upcomingWarm.warmed.length,
      budgetHit: upcomingWarm.budgetHit,
    },
    dbAvailable: Boolean(db),
  };
}
