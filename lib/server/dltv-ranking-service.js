import { parseDltvRanking } from './dltv-ranking-parser.js';

export const DLTV_RANKING_URL = 'https://dltv.org/ranking';

const FETCH_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 排名一天一变，10 分钟足够新
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 抓取失败时容忍的 stale 上限

const memoryCache = {
  payload: null,
  refreshedAt: 0,
};

// single-flight：同一进程内并发冷请求共享同一次抓取。
let inFlight = null;

function refreshRanking(fetchImpl) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { raw, sourceType } = await fetchText(DLTV_RANKING_URL, FETCH_TIMEOUT_MS, fetchImpl);
    const teams = raw ? parseDltvRanking(raw) : [];
    return { teams, sourceType };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

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
      // jina 默认缓存页面快照，会拿到旧数据；X-No-Cache 强制实时抓取。
      headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true' },
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
        return { raw: text, sourceType: attempt.type };
      }
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }

  return { raw: '', sourceType: 'failed' };
}

function isFresh(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < CACHE_TTL_MS;
}

function isUsableStale(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < CACHE_MAX_AGE_MS;
}

/**
 * 获取 DLTV 战队排名。优先返回内存热缓存，冷启动/过期时后台刷新；
 * 刷新失败但缓存未超 stale 上限时返回旧数据。并发冷请求由 single-flight 共享同一次抓取。
 */
export async function getDltvTeamRanking(options = {}) {
  const now = Date.now();

  if (memoryCache.payload && isFresh(memoryCache.refreshedAt)) {
    return { teams: memoryCache.payload, source: 'cache', refreshedAt: memoryCache.refreshedAt };
  }

  const refreshedAt = now;
  try {
    const { teams, sourceType } = await refreshRanking(options.fetchImpl);
    if (teams.length > 0) {
      memoryCache.payload = teams;
      memoryCache.refreshedAt = refreshedAt;
      return { teams, source: sourceType, refreshedAt };
    }
  } catch (error) {
    console.error('[dltv-ranking-service] refresh failed:', error instanceof Error ? error.message : String(error));
  }

  if (memoryCache.payload && isUsableStale(memoryCache.refreshedAt)) {
    return { teams: memoryCache.payload, source: 'stale', refreshedAt: memoryCache.refreshedAt };
  }
  return { teams: [], source: 'failed', refreshedAt };
}

export function clearDltvRankingMemoryCacheForTests() {
  memoryCache.payload = null;
  memoryCache.refreshedAt = 0;
}
