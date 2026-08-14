/**
 * Live match detail 服务：为 live detail 页提供 hawk.live series 完整详情。
 *
 * 数据流：CDN 15s 缓存挡高频轮询 → 回源时抓 hawk.live detail 页 → parseSeriesDetailPayload → 返回。
 * 全程不读不写 Neon（省 compute time）；seriesId → detail URL 优先用前端传的 champ/slug 构造，
 * 缺失时回退到抓 hawk.live 首页按 seriesId 匹配。
 */

import {
  buildHawkSeriesUrl,
  fetchHtml,
  parseHawkHomepageSeriesList,
  parseSeriesDetailPayload,
} from './hawk-live.js';
import { enrichLiveDetailPositions } from './live-detail-roles.js';

const HAWK_HOME_URL = 'https://hawk.live/';
const FETCH_TIMEOUT_MS = 8_000;

/** 同 seriesId 并发抓取去重：多个观看者同时轮询时只抓一次，避免放大 hawk.live 压力。 */
const inflightFetches = new Map();

/** seriesId → hawk detail URL。优先前端传的 champ/slug，缺失时抓首页按 seriesId 匹配。 */
export async function resolveHawkSeriesDetailUrl(seriesId, slug = null, champ = null) {
  if (!seriesId) return null;

  if (slug && champ) {
    return buildHawkSeriesUrl(champ, slug);
  }

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

export function getLiveDetail({ seriesId, slug = null, champ = null, forceRefresh = false } = {}) {
  const key = String(seriesId || '');
  if (!key) return Promise.resolve({ source: 'not_found' });

  const inFlight = inflightFetches.get(key);
  if (inFlight) return inFlight;

  const run = (async () => {
    try {
      return await fetchLiveDetail({ seriesId: key, slug, champ, forceRefresh });
    } finally {
      if (inflightFetches.get(key) === run) inflightFetches.delete(key);
    }
  })();

  inflightFetches.set(key, run);
  return run;
}

async function fetchLiveDetail({ seriesId, slug, champ }) {
  const url = await resolveHawkSeriesDetailUrl(seriesId, slug, champ);
  if (!url) {
    return { source: 'not_found', seriesId: String(seriesId) };
  }

  try {
    const html = await fetchHtml(url, fetch, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const payload = parseSeriesDetailPayload(html, { url });
    if (!payload) {
      return { source: 'timeout', seriesId: String(seriesId) };
    }
    // 用 DLTV 战队页 squad role 富化每个上场选手的 1~5 号位(best-effort,失败不影响主数据)。
    const enriched = await enrichLiveDetailPositions(payload).catch((error) => {
      console.error('[live-detail] role enrich failed:', error instanceof Error ? error.message : String(error));
      return payload;
    });
    return { ...enriched, cached: false, fetchedAt: new Date().toISOString() };
  } catch (error) {
    console.error('[live-detail] fetch failed:', error instanceof Error ? error.message : String(error));
    return { source: 'error', seriesId: String(seriesId) };
  }
}
