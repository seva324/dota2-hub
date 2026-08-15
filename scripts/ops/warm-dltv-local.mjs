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
import { getDltvLive, getDltvUpcoming, getDltvResults } from '../../lib/server/dltv-matches-service.js';
import { getSquadRoleMap } from '../../lib/server/live-detail-roles.js';

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

  // 预热 DLTV 战队 squad（live-detail 位置号数据源）：EdgeOne 出口抓战队页
  // 间歇失败，本机抓取后写 Neon，EdgeOne 读 Neon 稳定命中。
  // 只热 live+upcoming 队伍（位置号只对这两类页面有意义）；单并发 + 间隔，
  // 避免连抓触发 dltv 对本机 IP 的限速（35 连发会把本机也限了）。
  let squadWarmed = 0;
  let squadFailed = 0;
  try {
    const [liveL, upL] = await Promise.all([
      getDltvLive({ forceRefresh: false }),
      getDltvUpcoming({ forceRefresh: false }),
    ]);
    const teamNames = new Set();
    for (const rows of [liveL?.live, upL?.upcoming]) {
      for (const m of rows || []) {
        if (m?.radiantName) teamNames.add(String(m.radiantName));
        if (m?.direName) teamNames.add(String(m.direName));
      }
    }
    for (const name of teamNames) {
      try {
        const map = await getSquadRoleMap(name);
        if (map && map.size > 0) squadWarmed += 1;
        else squadFailed += 1;
      } catch {
        squadFailed += 1;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (error) {
    console.warn(`[warm-dltv-local] squad warm failed: ${error instanceof Error ? error.message : String(error)}`);
  }
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
      squad: { teams: squadWarmed + squadFailed, warmed: squadWarmed, failed: squadFailed },
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
