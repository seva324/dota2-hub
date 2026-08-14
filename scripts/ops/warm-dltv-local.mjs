#!/usr/bin/env node
/**
 * 本地 DLTV 预热（MacBook tmux cron 用，替代 EdgeOne 上成功率极低的远程 warm）。
 *
 * 背景：EdgeOne 出口直连 dltv 常被反爬/限速（HTTP 200 但 body 一字节不返回，
 * 3s 超时）；r.jina.ai 从 EdgeOne 出口网络层不可达（fetch failed ~260ms）。
 * 本机直连两者均正常（direct ~13.6s / jina-cache 1-2s / jina 冷抓 ~7s），
 * 所以在本机抓取并直接写生产 Neon，用户流量命中 Neon 缓存即秒开。
 *
 * 用法：node --env-file=.env.local scripts/ops/warm-dltv-local.mjs [--budget-ms=300000]
 * 输出 JSON：{ ok, elapsedMs, lists, matchPages, upcomingMatchPages, seriesStats }
 */

import { warmDltvCaches } from '../../lib/server/dltv-warm.js';

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const eq = raw.indexOf('=');
    if (eq === -1) {
      result[raw.slice(2)] = true;
      continue;
    }
    result[raw.slice(2, eq)] = raw.slice(eq + 1);
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
// 本地无平台 60s 上限：默认给 5 分钟预算，一轮热完所有非 fresh 页。
const budgetMs = Number(args['budget-ms'] || 5 * 60 * 1000);
const startedAt = Date.now();

try {
  const result = await warmDltvCaches({
    deadline: startedAt + budgetMs,
    timeBudgetMs: budgetMs,
  });
  const summarize = (block) => ({
    total: block.total,
    skippedFresh: block.skippedFresh,
    warmed: block.warmed,
    budgetHit: block.budgetHit,
  });
  console.log(
    JSON.stringify({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      lists: result.lists,
      matchPages: {
        ...summarize(result.matchPages),
        details: (result.matchPages.details || []).map((d) => ({
          seriesId: d.seriesId,
          ok: d.ok,
          source: d.source,
          error: d.error || null,
          attempts: (d.attempts || []).map((a) => ({ t: a.t, s: a.s, ms: a.ms, e: a.e || null })),
        })),
      },
      upcomingMatchPages: {
        ...summarize(result.upcomingMatchPages),
        details: (result.upcomingMatchPages.details || []).map((d) => ({
          seriesId: d.seriesId,
          ok: d.ok,
          source: d.source,
          error: d.error || null,
        })),
      },
      seriesStats: summarize(result.seriesStats),
      dbAvailable: result.dbAvailable,
    }),
  );
  process.exit(0);
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exit(1);
}
