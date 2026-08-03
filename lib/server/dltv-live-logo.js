/**
 * DLTV live LOGO 索引 — 后台预载 + 同步查找。
 *
 * 供 live-hero 的 LOGO 回退：本地(curated/mirror) 匹配不到时，从 DLTV 排名索引
 * 拿该队的 LOGO。索引后台一次性加载（避免每请求抓 DLTV 触发反爬），6h TTL 刷新。
 * "保存本地"：索引缓存在进程内；持久化由 cron 的 backfillDltvTeamLogos 写入 DB teams.logo_url。
 */

import {
  fetchDltvRankingLogoIndex,
  findDltvRankingLogo,
} from './dltv-team-assets.js';

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;

let index = null;
let indexLoadedAt = 0;
let indexPromise = null;

function ensureIndex(fetchImpl) {
  if (index && Date.now() - indexLoadedAt < INDEX_TTL_MS) return;
  if (indexPromise) return;
  indexPromise = (async () => {
    try {
      const built = await fetchDltvRankingLogoIndex({ fetchImpl });
      if (built) {
        index = built;
        indexLoadedAt = Date.now();
      }
    } catch (error) {
      console.error('[dltv-live-logo] index load failed:', error instanceof Error ? error.message : String(error));
    } finally {
      indexPromise = null;
    }
  })();
}

/** 同步查找：返回该队 DLTV LOGO URL；未加载到索引/未命中返回 null。 */
export function resolveDltvLiveLogo(teamName, fetchImpl) {
  if (!teamName) return null;
  ensureIndex(fetchImpl);
  if (!index) return null;
  const found = findDltvRankingLogo(index, teamName);
  return found?.logoUrl || null;
}

/** 预热/测试用：强制立即加载索引。 */
export async function primeDltvLiveLogoIndex(options = {}) {
  const built = await fetchDltvRankingLogoIndex({ fetchImpl: options.fetchImpl });
  if (built) {
    index = built;
    indexLoadedAt = Date.now();
  }
  return index;
}

export function clearDltvLiveLogoIndexForTests() {
  index = null;
  indexLoadedAt = 0;
  indexPromise = null;
}
