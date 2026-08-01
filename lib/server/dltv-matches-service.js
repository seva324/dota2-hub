import {
  parseDltvLiveMatches,
  parseDltvFinishedMatches,
  parseDltvUpcomingMatchesWithLogos,
} from './dltv-matches-parser.js';
import { parseDltvUpcomingMatchesPage } from './dltv-upcoming.js';
import { readDltvMatchesHotCache, writeDltvMatchesHotCache } from './dltv-matches-hot-cache.js';

export const DLTV_MATCHES_URL = 'https://dltv.org/matches';
export const DLTV_RESULTS_URL = 'https://dltv.org/results';

const MATCHES_FETCH_TIMEOUT_MS = 12000;
const RESULTS_FETCH_TIMEOUT_MS = 12000;

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

/* ------------------------------------------------------------------ */
/* 原始抓取 + 解析                                                     */
/* ------------------------------------------------------------------ */

async function fetchAndParseMatchesPage(fetchImpl = fetch) {
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
}

async function fetchAndParseResultsPage(fetchImpl = fetch) {
  const { raw } = await fetchText(DLTV_RESULTS_URL, RESULTS_FETCH_TIMEOUT_MS, fetchImpl);
  if (!raw) return [];
  return parseDltvFinishedMatches(raw);
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

/**
 * 获取 live 比赛列表。优先读热缓存，冷启动时后台刷新。
 */
export async function getDltvLive(options = {}) {
  const cached = await readDltvMatchesHotCache('live');
  const now = Date.now();
  const cachedAt = Number(cached?.refreshedAt || 0);

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL.live)) {
    return { live: cached.payload, source: 'cache' };
  }

  // 冷启动或过期：刷新
  const payload = await refreshLive();
  if (payload.length > 0 || !cached?.payload) {
    return { live: payload, source: 'dltv' };
  }
  // 新抓取失败，返回 stale
  return { live: cached.payload, source: 'stale' };

  async function refreshLive() {
    try {
      const { live } = await fetchAndParseMatchesPage(options.fetchImpl);
      await writeDltvMatchesHotCache('live', { payload: live, refreshedAt: now });
      return live;
    } catch (error) {
      console.error('[dltv-matches-service] live refresh failed:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}

/**
 * 获取 upcoming 比赛列表。
 */
export async function getDltvUpcoming(options = {}) {
  const cached = await readDltvMatchesHotCache('upcoming');
  const now = Date.now();
  const cachedAt = Number(cached?.refreshedAt || 0);

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL.upcoming)) {
    return { upcoming: cached.payload, source: 'cache' };
  }

  const payload = await refreshUpcoming();
  if (payload.length > 0 || !cached?.payload) {
    return { upcoming: payload, source: 'dltv' };
  }
  return { upcoming: cached.payload, source: 'stale' };

  async function refreshUpcoming() {
    try {
      const { upcoming } = await fetchAndParseMatchesPage(options.fetchImpl);
      await writeDltvMatchesHotCache('upcoming', { payload: upcoming, refreshedAt: now });
      return upcoming;
    } catch (error) {
      console.error('[dltv-matches-service] upcoming refresh failed:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}

/**
 * 获取已结束比赛列表。
 */
export async function getDltvResults(options = {}) {
  const cached = await readDltvMatchesHotCache('results');
  const now = Date.now();
  const cachedAt = Number(cached?.refreshedAt || 0);

  if (cached?.payload && isFresh(cachedAt, CACHE_TTL.results)) {
    return { results: cached.payload, source: 'cache' };
  }

  const payload = await refreshResults();
  if (payload.length > 0 || !cached?.payload) {
    return { results: payload, source: 'dltv' };
  }
  return { results: cached.payload, source: 'stale' };

  async function refreshResults() {
    try {
      const results = await fetchAndParseResultsPage(options.fetchImpl);
      await writeDltvMatchesHotCache('results', { payload: results, refreshedAt: now });
      return results;
    } catch (error) {
      console.error('[dltv-matches-service] results refresh failed:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}
