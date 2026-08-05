/**
 * Live match detail 服务：为 live detail 页提供 hawk.live series 完整详情。
 *
 * 数据流：Neon 缓存（~20s 新鲜）→ 过期则抓 hawk.live detail 页 → parseSeriesDetailPayload → 写缓存。
 * seriesId → detail URL 的定位优先用 hero_live_scores（live-hero 链路已持久化 slug），
 * 找不到时回退到抓 hawk.live 首页按 seriesId 匹配。
 */

import {
  buildHawkSeriesUrl,
  fetchHtml,
  parseHawkHomepageSeriesList,
  parseSeriesDetailPayload,
} from './hawk-live.js';
import { findHeroLiveScoreBySourceSeriesId } from './hero-live-score-cache.js';
import {
  ensureHawkLiveDetailCacheTable,
  readHawkLiveDetailCache,
  writeHawkLiveDetailCache,
} from './hawk-live-detail-cache.js';

const HAWK_HOME_URL = 'https://hawk.live/';
const DETAIL_TTL_MS = 20_000;
const FETCH_TIMEOUT_MS = 8_000;

/** 同 seriesId 并发抓取去重：多个观看者同时轮询时只抓一次，避免放大 hawk.live 压力。 */
const inflightFetches = new Map();

function safeJsonParse(value, fallback = null) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return fallback;
  }
}

/** 从 hero_live_scores 的 payload 里拿 (championshipSlug, seriesSlug) 定位 detail URL。 */
function discoverUrlFromLiveScore(row) {
  const payload = safeJsonParse(row?.payload, null);
  const championshipSlug = payload?.sourceChampionshipSlug || null;
  const seriesSlug = payload?.sourceSeriesSlug || row?.source_slug || null;
  if (!championshipSlug || !seriesSlug) return null;
  return buildHawkSeriesUrl(championshipSlug, seriesSlug);
}

/** seriesId → hawk detail URL。优先 hero_live_scores，回退首页解析。 */
export async function resolveHawkSeriesDetailUrl(db, seriesId) {
  if (!seriesId) return null;

  const row = await findHeroLiveScoreBySourceSeriesId(db, seriesId);
  const fromScore = row ? discoverUrlFromLiveScore(row) : null;
  if (fromScore) return fromScore;

  try {
    const html = await fetchHtml(HAWK_HOME_URL, fetch, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const rows = parseHawkHomepageSeriesList(html);
    const hit = rows.find((row) => String(row.id) === String(seriesId));
    return hit?.url || null;
  } catch (error) {
    console.error('[live-detail] homepage fallback failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function getLiveDetail(db, { seriesId, forceRefresh = false } = {}) {
  const key = String(seriesId || '');
  if (!key) return Promise.resolve({ source: 'not_found' });

  const inFlight = inflightFetches.get(key);
  if (inFlight) return inFlight;

  const run = (async () => {
    try {
      return await fetchLiveDetail(db, { seriesId: key, forceRefresh });
    } finally {
      if (inflightFetches.get(key) === run) inflightFetches.delete(key);
    }
  })();

  inflightFetches.set(key, run);
  return run;
}

async function fetchLiveDetail(db, { seriesId, forceRefresh }) {
  if (db) {
    try {
      await ensureHawkLiveDetailCacheTable(db);
    } catch (error) {
      console.error('[live-detail] ensure cache table failed:', error instanceof Error ? error.message : String(error));
    }
  }

  if (!forceRefresh) {
    const cached = await readHawkLiveDetailCache(db, seriesId);
    if (cached?.payload && Date.now() - cached.refreshedAt < DETAIL_TTL_MS) {
      return { ...cached.payload, cached: true };
    }
  }

  const url = await resolveHawkSeriesDetailUrl(db, seriesId);
  if (!url) {
    return { source: 'not_found', seriesId: String(seriesId) };
  }

  try {
    const html = await fetchHtml(url, fetch, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const payload = parseSeriesDetailPayload(html, { url });
    if (!payload) {
      return { source: 'timeout', seriesId: String(seriesId) };
    }
    await writeHawkLiveDetailCache(db, seriesId, payload);
    return { ...payload, cached: false, fetchedAt: new Date().toISOString() };
  } catch (error) {
    console.error('[live-detail] fetch failed:', error instanceof Error ? error.message : String(error));
    return { source: 'error', seriesId: String(seriesId) };
  }
}
