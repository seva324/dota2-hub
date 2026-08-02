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
// single-flight：并发请求共享同一次在途抓取，防止 thundering herd。
let buildPayloadInFlight = null;

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
          ...(attempt.type === 'jina' ? { 'X-Return-Format': 'html' } : {}),
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

async function buildPayload() {
  const [ongoingRes, finishedRes] = await Promise.all([
    fetchHtml(DLTV_EVENTS_URL),
    fetchHtml(DLTV_FINISHED_URL),
  ]);

  const ongoingUpcoming = ongoingRes.raw ? parseDltvEventsPageRaw(ongoingRes.raw, 'ongoing') : [];
  const finished = finishedRes.raw ? parseDltvEventsPageRaw(finishedRes.raw, 'finished') : [];

  if (ongoingUpcoming.length === 0 && finished.length === 0) {
    return null;
  }

  return {
    events: groupByStatus([...ongoingUpcoming, ...finished]),
    source: {
      ongoing: ongoingRes.sourceType,
      finished: finishedRes.sourceType,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** single-flight + 有界超时：并发共享一次抓取，超时抛错由调用方回退 stale/空。 */
function runBuildPayloadWithTimeout() {
  if (buildPayloadInFlight) return buildPayloadInFlight;
  buildPayloadInFlight = withTimeout(buildPayload(), BUILD_TIMEOUT_MS, 'events build timed out').finally(() => {
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
  const now = Date.now();

  if (!forceRefresh && isFresh(now)) {
    return res.status(200).json({ ...rebasePayloadImages(memoryCache, req), source: 'cache' });
  }

  // stale-while-revalidate：有旧数据（未超 stale 上限）立即返回 + 后台刷新。
  if (!forceRefresh && isUsableStale(now)) {
    void refreshBackground();
    return res.status(200).json({ ...rebasePayloadImages(memoryCache, req), source: 'stale' });
  }

  // 真冷启动（或 forceRefresh）：同步抓取，8s 硬上限。
  try {
    const payload = await runBuildPayloadWithTimeout();
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
    const payload = await buildPayload();
    if (payload) {
      memoryCache = payload;
      memoryCacheAt = Date.now();
    }
  } catch (error) {
    console.error('[Events API] background refresh failed:', error instanceof Error ? error.message : String(error));
  }
}
