import {
  parseDltvLiveMatches,
  parseDltvFinishedMatches,
  parseDltvUpcomingMatchesWithLogos,
} from './dltv-matches-parser.js';
import { parseDltvUpcomingMatchesPage } from './dltv-upcoming.js';
import {
  readDltvMatchesHotCache,
  writeDltvMatchesHotCache,
  tryAcquireDltvMatchesRefreshLock,
} from './dltv-matches-hot-cache.js';

export const DLTV_MATCHES_URL = 'https://dltv.org/matches';
export const DLTV_RESULTS_URL = 'https://dltv.org/results';

const MATCHES_FETCH_TIMEOUT_MS = 12000;
const RESULTS_FETCH_TIMEOUT_MS = 12000;
// 冷启动(无任何缓存)时给抓取加硬上限,宁可返回空也绝不让用户等 20s+。
const COLD_MISS_TIMEOUT_MS = 8000;

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

async function fetchText(url, timeoutMs, fetchImpl = fetch) {
  const attempts = [
    { url, type: 'direct', timeoutMs, headers: {} },
    {
      url: buildJinaUrl(url),
      type: 'jina',
      timeoutMs: timeoutMs + 3000,
      // jina 默认返回 Markdown；用 HTML 格式让我们的 HTML 解析器直接可用。
      headers: { 'X-Return-Format': 'html' },
    },
  ];

  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.timeoutMs);
    try {
      const res = await fetchImpl(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
          ...attempt.headers,
        },
        signal: timeout.signal,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (String(text || '').trim().length >= 80) {
        return { raw: text, sourceType: attempt.type, sourceUrl: attempt.url };
      }
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }

  return { raw: '', sourceType: 'failed', sourceUrl: url };
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

/* ------------------------------------------------------------------ */
/* 原始抓取 + 解析（带 single-flight，live/upcoming 共享同一份 /matches 抓取） */
/* ------------------------------------------------------------------ */

let matchesPageInFlight = null;
let resultsPageInFlight = null;

async function fetchAndParseMatchesPage(fetchImpl = fetch) {
  if (matchesPageInFlight) return matchesPageInFlight;
  matchesPageInFlight = (async () => {
    const { raw } = await fetchText(DLTV_MATCHES_URL, MATCHES_FETCH_TIMEOUT_MS, fetchImpl);
    if (!raw) return { live: [], upcoming: [] };

    const now = Math.floor(Date.now() / 1000);
    const upcoming = parseDltvUpcomingMatchesWithLogos(
      raw,
      { now, maxStartTime: now + 7 * 24 * 60 * 60 },
      parseDltvUpcomingMatchesPage,
    );
    const live = parseDltvLiveMatches(raw);
    return { live, upcoming };
  })().finally(() => {
    matchesPageInFlight = null;
  });
  return matchesPageInFlight;
}

async function fetchAndParseResultsPage(fetchImpl = fetch) {
  if (resultsPageInFlight) return resultsPageInFlight;
  resultsPageInFlight = (async () => {
    const { raw } = await fetchText(DLTV_RESULTS_URL, RESULTS_FETCH_TIMEOUT_MS, fetchImpl);
    if (!raw) return [];
    return parseDltvFinishedMatches(raw);
  })().finally(() => {
    resultsPageInFlight = null;
  });
  return resultsPageInFlight;
}

/* ------------------------------------------------------------------ */
/* 热缓存入口                                                          */
/* ------------------------------------------------------------------ */

const CACHE_TTL = {
  live: 15_000,
  upcoming: 60_000,
  results: 120_000,
};

function isFresh(timestamp, ttlMs) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < ttlMs;
}

// single-flight：同一类型在途刷新共享同一次抓取，防止并发冷请求 thundering herd。
const inFlightRefresh = new Map();

function refreshWithLock(cacheType, refreshFn) {
  if (inFlightRefresh.has(cacheType)) return inFlightRefresh.get(cacheType);
  const task = (async () => {
    const acquired = await tryAcquireDltvMatchesRefreshLock(cacheType, 8000);
    if (!acquired) return false;
    try {
      const fresh = await refreshFn();
      return fresh;
    } catch (error) {
      console.error(`[dltv-matches-service] ${cacheType} refresh failed:`, error instanceof Error ? error.message : String(error));
      return false;
    }
  })().finally(() => {
    inFlightRefresh.delete(cacheType);
  });
  inFlightRefresh.set(cacheType, task);
  return task;
}

// 冷启动无缓存时：给抓取加 8s 硬上限，宁可超时返回空也不阻塞首屏 20s+。
// 失败/超时返回 null，让上层按“无数据”处理。
async function refreshAndCache(cacheType, refreshFn, writeKey, now) {
  const refresh = () => refreshWithLock(cacheType, async () => {
    const payload = await refreshFn();
    if (Array.isArray(payload) && payload.length > 0) {
      await writeDltvMatchesHotCache(writeKey, { payload, refreshedAt: now });
    }
    return payload;
  });

  try {
    const result = await withTimeout(refresh(), COLD_MISS_TIMEOUT_MS, `${cacheType} cold refresh timed out`);
    if (Array.isArray(result)) return result;
    return null;
  } catch {
    return null;
  }
}

/**
 * 获取 live 比赛列表。stale-while-revalidate：有缓存(无论是否过期)先返回,
 * 过期时后台刷新;真冷启动才同步抓取(8s 上限)。
 */
export async function getDltvLive(options = {}) {
  const cached = await readDltvMatchesHotCache('live');
  const cachedAt = Number(cached?.refreshedAt || 0);
  const now = Date.now();

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL.live)) {
    return { live: cached.payload, source: 'cache' };
  }

  if (cached?.payload) {
    // stale：立即返回旧数据，后台刷新
    void refreshAndCache('live', () => fetchAndParseMatchesPage(options.fetchImpl).then((r) => r.live), 'live', now);
    return { live: cached.payload, source: 'stale' };
  }

  const payload = await refreshAndCache('live', () => fetchAndParseMatchesPage(options.fetchImpl).then((r) => r.live), 'live', now);
  if (payload?.length) return { live: payload, source: 'dltv' };
  return { live: [], source: 'failed' };
}

/**
 * 获取 upcoming 比赛列表。同上。
 */
export async function getDltvUpcoming(options = {}) {
  const cached = await readDltvMatchesHotCache('upcoming');
  const cachedAt = Number(cached?.refreshedAt || 0);
  const now = Date.now();

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL.upcoming)) {
    return { upcoming: cached.payload, source: 'cache' };
  }

  if (cached?.payload) {
    void refreshAndCache('upcoming', () => fetchAndParseMatchesPage(options.fetchImpl).then((r) => r.upcoming), 'upcoming', now);
    return { upcoming: cached.payload, source: 'stale' };
  }

  const payload = await refreshAndCache('upcoming', () => fetchAndParseMatchesPage(options.fetchImpl).then((r) => r.upcoming), 'upcoming', now);
  if (payload?.length) return { upcoming: payload, source: 'dltv' };
  return { upcoming: [], source: 'failed' };
}

/**
 * 获取已结束比赛列表。同上。
 */
export async function getDltvResults(options = {}) {
  const cached = await readDltvMatchesHotCache('results');
  const cachedAt = Number(cached?.refreshedAt || 0);
  const now = Date.now();

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL.results)) {
    return { results: cached.payload, source: 'cache' };
  }

  if (cached?.payload) {
    void refreshAndCache('results', () => fetchAndParseResultsPage(options.fetchImpl), 'results', now);
    return { results: cached.payload, source: 'stale' };
  }

  const payload = await refreshAndCache('results', () => fetchAndParseResultsPage(options.fetchImpl), 'results', now);
  if (payload?.length) return { results: payload, source: 'dltv' };
  return { results: [], source: 'failed' };
}
