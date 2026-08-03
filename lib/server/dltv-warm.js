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
import { inspectDltvRedis } from './dltv-matches-hot-cache.js';
import {
  ensureDltvMatchPageCacheTable,
  freshDltvMatchPageSeriesIds,
} from './dltv-match-page-db-cache.js';

const WARM_CONCURRENCY = 4;
const COMPLETED_FRESH_MS = 6 * 60 * 60 * 1000;
// EdgeOne 函数 maxDuration=60s：match-page 预热是 best-effort，超预算就停，
// 已完成的会被 fresh-skip 跳过，下一轮（10min 后）接着热，几轮后收敛。
const WARM_TIME_BUDGET_MS = 30_000;

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

export async function warmDltvCaches(options = {}) {
  const db = getDb();

  const [live, upcoming, results] = await Promise.all([
    getDltvLive({ forceRefresh: true, fetchImpl: options.fetchImpl }),
    getDltvUpcoming({ forceRefresh: true, fetchImpl: options.fetchImpl }),
    getDltvResults({ forceRefresh: true, fetchImpl: options.fetchImpl }),
  ]);

  const resultsList = Array.isArray(results?.results) ? results.results : [];
  const entries = resultsList
    .map((row) => ({
      seriesId: row.seriesId,
      slug: extractSlugFromMatchUrl(row.matchUrl),
    }))
    .filter((e) => Number.isFinite(Number(e.seriesId)) && e.slug);

  let warmed = 0;
  let skippedFresh = 0;
  let budgetHit = false;
  if (db && entries.length > 0) {
    await ensureDltvMatchPageCacheTable(db);
    const freshIds = await freshDltvMatchPageSeriesIds(db, entries.map((e) => e.seriesId), COMPLETED_FRESH_MS);
    const toWarm = entries.filter((e) => !freshIds.has(Number(e.seriesId)));
    skippedFresh = entries.length - toWarm.length;

    const startedAt = Date.now();
    const resultsArr = await mapWithConcurrency(toWarm, WARM_CONCURRENCY, async (entry) => {
      if (Date.now() - startedAt > WARM_TIME_BUDGET_MS) {
        budgetHit = true;
        return null;
      }
      const result = await getDltvMatchPage(
        { seriesId: entry.seriesId, slug: entry.slug },
        { forceRefresh: true, fetchImpl: options.fetchImpl },
      );
      return result.series ? entry.seriesId : null;
    });
    warmed = resultsArr.length;
  }

  return {
    lists: {
      live: live?.live?.length || 0,
      upcoming: upcoming?.upcoming?.length || 0,
      results: resultsList.length,
    },
    matchPages: {
      total: entries.length,
      skippedFresh,
      warmed,
      budgetHit,
    },
    dbAvailable: Boolean(db),
    redis: await inspectDltvRedis(),
  };
}
