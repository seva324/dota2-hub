/**
 * Events API — DLTV /events 赛事目录
 *
 * 数据源：
 *   https://dltv.org/events          → "Ongoing & Upcoming Events"（events__card）
 *   https://dltv.org/events/finished → "Finished Events"（table 列表）
 *
 * 抓取：direct → jina（X-Return-Format: html）双源降级，服务端内存热缓存
 * （只写非空 payload，避免冷启动空数据污染缓存）。
 */

import { parseDltvEventsPageRaw } from '../lib/server/dltv-events-page-parser.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

const DLTV_EVENTS_URL = 'https://dltv.org/events';
const DLTV_FINISHED_URL = 'https://dltv.org/events/finished';
const CACHE_CONTROL = 'public, max-age=180, s-maxage=180, stale-while-revalidate=300';

let memoryCache = null;
let memoryCacheAt = 0;
const CACHE_TTL_MS = 180_000;
// stale 容忍上限：超过这个时间不再返回旧数据，直接同步重抓。
const STALE_MAX_AGE_MS = 15 * 60 * 1000;
// 冷启动同步抓取的硬上限：宁可返回空也不阻塞首屏。
const BUILD_TIMEOUT_MS = 15000;
// quick 模式（只抓 ongoing+upcoming 页）的上限：首屏最多等这么长。
const QUICK_BUILD_TIMEOUT_MS = 6000;
// single-flight：并发请求共享同一次在途抓取，防止 thundering herd。
let buildPayloadInFlight = null;
// quick 与 full 共享的 /events 页在途抓取，避免 quick 先发时 full 再重复抓一次。
let ongoingPageInFlight = null;
// finished 页在途抓取：quick 先行时后台补齐 finished，后台与 full 共享。
let finishedPageInFlight = null;

function isFresh(now) {
  return memoryCache && now - memoryCacheAt < CACHE_TTL_MS;
}

function isUsableStale(now) {
  return memoryCache && now - memoryCacheAt < STALE_MAX_AGE_MS;
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

async function fetchHtml(url, fetchImpl = fetch) {
  const attempts = [
    { url, type: 'direct', timeoutMs: 12000 },
    { url: `https://r.jina.ai/http://${url.replace(/^https?:\/\//i, '')}`, type: 'jina', timeoutMs: 18000 },
  ];

  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.timeoutMs);
    try {
      const res = await fetchImpl(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
          ...(attempt.type === 'jina' ? { 'X-Return-Format': 'html', 'X-No-Cache': 'true' } : {}),
        },
        signal: timeout.signal,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (String(text || '').trim().length >= 500) return { raw: text, sourceType: attempt.type };
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }

  return { raw: '', sourceType: 'failed' };
}

/** 抓取 /events 页（ongoing+upcoming），附带 6s 有界上限：首屏只等这一页。 */
function fetchOngoingHtml(fetchImpl) {
  return withTimeout(fetchHtml(DLTV_EVENTS_URL, fetchImpl), QUICK_BUILD_TIMEOUT_MS, 'ongoing page timed out');
}

/** 抓取 /events/finished 页，无上限：后台补齐，成功才写缓存。 */
function fetchFinishedHtml(fetchImpl) {
  return fetchHtml(DLTV_FINISHED_URL, fetchImpl);
}

function groupByStatus(entries) {
  const ongoing = [];
  const upcoming = [];
  const finished = [];
  for (const entry of entries || []) {
    const status = String(entry.status || '').toLowerCase();
    if (status === 'ongoing') ongoing.push(entry);
    else if (status === 'finished') finished.push(entry);
    else upcoming.push(entry);
  }
  const sortByStart = (a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0);
  ongoing.sort(sortByStart);
  upcoming.sort(sortByStart);
  finished.sort((a, b) => (Number(b.startTime) || 0) - (Number(a.startTime) || 0));
  return { ongoing, upcoming, finished };
}

/**
 * 事件图片统一走代理/镜像，避免浏览器直连 dltv.org 被反爬拦截。
 * 与 tournaments.js 的 normalizeLogo 一致：优先 manifest 镜像，其次 /api/asset-image 代理。
 */
function rebaseEventImageUrls(entry, req) {
  if (!entry) return entry;
  const image = getMirroredAssetUrl(entry.image || null, req);
  const locationFlagUrl = getMirroredAssetUrl(entry.locationFlagUrl || null, req);
  return {
    ...entry,
    image: image || entry.image || null,
    locationFlagUrl: locationFlagUrl || entry.locationFlagUrl || null,
  };
}

function rebasePayloadImages(payload, req) {
  return {
    ...payload,
    events: {
      ongoing: (payload.events.ongoing || []).map((entry) => rebaseEventImageUrls(entry, req)),
      upcoming: (payload.events.upcoming || []).map((entry) => rebaseEventImageUrls(entry, req)),
      finished: (payload.events.finished || []).map((entry) => rebaseEventImageUrls(entry, req)),
    },
  };
}

/**
 * 抓取 /events 页（ongoing+upcoming），解析后分组。
 * 快路径：单页、6s 有界上限、single-flight。
 */
async function buildOngoingUpcoming({ fetchImpl = fetch } = {}) {
  if (ongoingPageInFlight) return ongoingPageInFlight;
  ongoingPageInFlight = (async () => {
    const res = await fetchOngoingHtml(fetchImpl);
    const entries = res.raw ? parseDltvEventsPageRaw(res.raw, 'ongoing') : [];
    const grouped = groupByStatus(entries);
    return {
      ongoing: grouped.ongoing,
      upcoming: grouped.upcoming,
      source: res.sourceType,
    };
  })().finally(() => {
    ongoingPageInFlight = null;
  });
  return ongoingPageInFlight;
}

/**
 * 抓取 /events/finished 页，解析出 finished 列表。无上限。
 */
async function buildFinished({ fetchImpl = fetch } = {}) {
  if (finishedPageInFlight) return finishedPageInFlight;
  finishedPageInFlight = (async () => {
    const res = await fetchFinishedHtml(fetchImpl);
    const entries = res.raw ? parseDltvEventsPageRaw(res.raw, 'finished') : [];
    return {
      finished: entries,
      source: res.sourceType,
    };
  })().finally(() => {
    finishedPageInFlight = null;
  });
  return finishedPageInFlight;
}

/** 全量抓取两页：写缓存的完整 payload。 */
async function buildFullPayload({ fetchImpl = fetch } = {}) {
  const [ongoingUpcoming, finished] = await Promise.all([
    buildOngoingUpcoming({ fetchImpl }),
    buildFinished({ fetchImpl }),
  ]);

  const all = [...ongoingUpcoming.ongoing, ...ongoingUpcoming.upcoming, ...finished.finished];
  if (all.length === 0) return null;

  return {
    events: {
      ongoing: ongoingUpcoming.ongoing,
      upcoming: ongoingUpcoming.upcoming,
      finished: finished.finished,
    },
    source: {
      ongoing: ongoingUpcoming.source,
      finished: finished.source,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** 只抓 ongoing+upcoming 的快速 payload（不写缓存）：首屏秒回。 */
async function buildQuickPayload({ fetchImpl = fetch } = {}) {
  const ongoingUpcoming = await buildOngoingUpcoming({ fetchImpl });
  return {
    events: {
      ongoing: ongoingUpcoming.ongoing,
      upcoming: ongoingUpcoming.upcoming,
      finished: [],
    },
    source: {
      ongoing: ongoingUpcoming.source,
      finished: null,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** 后台补齐 finished 并写缓存：quick 快速页已发出后 fire-and-forget。 */
async function refreshFinishedBackground({ ongoing = [], upcoming = [], ongoingSource = 'failed', fetchImpl = fetch } = {}) {
  try {
    const finished = await buildFinished({ fetchImpl });
    // 只有拿到非空 finished 才写缓存；空 finished 说明 finished 页抓取失败，
    // 不写缓存，让随后的全量请求走一次真正的冷构建。
    if (finished.finished.length === 0) return;
    memoryCache = {
      events: { ongoing, upcoming, finished: finished.finished },
      source: { ongoing: ongoingSource, finished: finished.source },
      fetchedAt: new Date().toISOString(),
    };
    memoryCacheAt = Date.now();
  } catch (error) {
    console.error('[Events API] background finished refresh failed:', error instanceof Error ? error.message : String(error));
  }
}

/** single-flight + 有界超时：并发共享一次抓取，超时抛错由调用方回退 stale/空。 */
function runBuildPayloadWithTimeout({ fetchImpl = fetch } = {}) {
  if (buildPayloadInFlight) return buildPayloadInFlight;
  buildPayloadInFlight = withTimeout(buildFullPayload({ fetchImpl }), BUILD_TIMEOUT_MS, 'events build timed out').finally(() => {
    buildPayloadInFlight = null;
  });
  return buildPayloadInFlight;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', CACHE_CONTROL);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forceRefresh = String(req.query?.refresh || '') === '1';
  const quick = String(req.query?.quick || '') === '1';
  const now = Date.now();

  if (!forceRefresh && isFresh(now)) {
    return res.status(200).json({ ...rebasePayloadImages(memoryCache, req), source: 'cache' });
  }

  // stale-while-revalidate：有旧数据（未超 stale 上限）立即返回 + 后台刷新。
  if (!forceRefresh && isUsableStale(now)) {
    void refreshBackground();
    return res.status(200).json({ ...rebasePayloadImages(memoryCache, req), source: 'stale' });
  }

  // 真冷启动（或 forceRefresh）：
  //  - quick 模式：只抓 ongoing+upcoming 页（6s 有界），finished 后台补齐，首屏先渲染两段。
  //  - 常规模式：全量两页，15s 硬上限。
  if (quick) {
    try {
      const quickPayload = await buildQuickPayload({ fetchImpl: req.fetchImpl });
      if (quickPayload.events.ongoing.length > 0 || quickPayload.events.upcoming.length > 0) {
        // 后台补齐 finished，并带上已抓到的 ongoing/upcoming 一起写缓存，避免重复抓 /events 页。
        void refreshFinishedBackground({
          ongoing: quickPayload.events.ongoing,
          upcoming: quickPayload.events.upcoming,
          ongoingSource: quickPayload.source.ongoing,
          fetchImpl: req.fetchImpl,
        });
        return res.status(200).json({ ...rebasePayloadImages(quickPayload, req), partial: true });
      }
    } catch (error) {
      console.error('[Events API] quick build failed:', error instanceof Error ? error.message : String(error));
    }
    if (memoryCache) {
      return res.status(200).json({ ...rebasePayloadImages(memoryCache, req), source: 'stale' });
    }
    return res.status(200).json({ events: { ongoing: [], upcoming: [], finished: [] }, source: 'failed' });
  }

  try {
    const payload = await runBuildPayloadWithTimeout({ fetchImpl: req.fetchImpl });
    if (payload) {
      memoryCache = payload;
      memoryCacheAt = now;
      return res.status(200).json(rebasePayloadImages(payload, req));
    }
  } catch (error) {
    console.error('[Events API] build failed:', error instanceof Error ? error.message : String(error));
  }

  if (memoryCache) {
    return res.status(200).json({ ...rebasePayloadImages(memoryCache, req), source: 'stale' });
  }
  return res.status(200).json({ events: { ongoing: [], upcoming: [], finished: [] }, source: 'failed' });
}

/** 后台刷新 events 缓存：成功写内存，失败静默保留旧数据。 */
async function refreshBackground() {
  try {
    const payload = await buildFullPayload();
    if (payload) {
      memoryCache = payload;
      memoryCacheAt = Date.now();
    }
  } catch (error) {
    console.error('[Events API] background refresh failed:', error instanceof Error ? error.message : String(error));
  }
}
