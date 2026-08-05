/**
 * Primary Leagues API
 * Data: DLTV homepage "Primary leagues" carousel (https://dltv.org)
 */

import { parseDltvPrimaryLeagues } from '../lib/server/dltv-tournaments-parser.js';
import { getDb } from '../lib/db.js';
import { readDltvCache, writeDltvCache } from '../lib/server/dltv-neon-cache.js';

const DLTV_HOME_URL = 'https://dltv.org';
const CACHE_CONTROL = 'public, max-age=180, s-maxage=180, stale-while-revalidate=300';

// Neon 持久缓存：跨实例共享，冷启动（无内存缓存）时不必直抓 dltv.org。
const NEON_CACHE_KEY = 'dltv:primary-leagues:full';
// 新鲜窗口：carousel 变化慢，15min 内直接复用。
const NEON_TTL_MS = 15 * 60 * 1000;
// stale 兜底上限：超过 6h 不再直接返回旧 carousel，走一次同步抓取（失败仍有内存兜底）。
const NEON_STALE_MAX_MS = 6 * 60 * 60 * 1000;

let memoryCache = null;
let memoryCacheAt = 0;
let refreshInFlight = null;
const CACHE_TTL_MS = 180_000;

/** 读 Neon 持久缓存（仅 db 可用时）。 */
async function readNeonPrimaryLeagues() {
  const db = getDb();
  if (!db) return null;
  try {
    const entry = await readDltvCache(db, NEON_CACHE_KEY);
    if (!entry?.payload) return null;
    return { payload: entry.payload, refreshedAt: entry.refreshedAt };
  } catch (error) {
    console.error('[Primary Leagues API] neon cache read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** 写 Neon 持久缓存（fire-and-forget；writeDltvCache 内部吞错，db 缺失时静默跳过）。 */
function persistNeonPrimaryLeagues(payload) {
  const db = getDb();
  if (!db || !payload) return;
  writeDltvCache(db, NEON_CACHE_KEY, { payload });
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

async function fetchHomeHtml(fetchImpl = fetch) {
  const attempts = [
    { url: DLTV_HOME_URL, type: 'direct', timeoutMs: 12000 },
    { url: `https://r.jina.ai/http://${DLTV_HOME_URL.replace(/^https?:\/\//i, '')}`, type: 'jina', timeoutMs: 15000 },
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
      if (String(text || '').trim().length >= 80) return { raw: text, type: attempt.type };
    } catch {
      // continue to next source
    } finally {
      timeout.dispose();
    }
  }
  return { raw: '', type: 'failed' };
}

async function refreshPrimaryLeagues(now) {
  const { raw } = await fetchHomeHtml();
  if (!raw) throw new Error('Home HTML fetch failed');

  const tournaments = parseDltvPrimaryLeagues(raw);
  if (tournaments.length === 0) throw new Error('No tournaments parsed');

  memoryCache = tournaments;
  memoryCacheAt = now;
  persistNeonPrimaryLeagues({ tournaments, fetchedAt: new Date().toISOString() });
  return tournaments;
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

  if (memoryCache && !forceRefresh) {
    const cacheFresh = now - memoryCacheAt < CACHE_TTL_MS;
    // stale-while-revalidate：有缓存先返回(可能过期)，过期时后台刷新
    if (!cacheFresh && !refreshInFlight) {
      refreshInFlight = refreshPrimaryLeagues(now)
        .catch((error) => {
          console.error('[Primary Leagues API] Background refresh failed:', error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          refreshInFlight = null;
        });
    }
    return res.status(200).json({ tournaments: memoryCache, source: cacheFresh ? 'cache' : 'stale' });
  }

  // Neon 持久缓存兜底：跨实例共享，EdgeOne 冷启动（内存空）时不必直抓 dltv.org。
  if (!forceRefresh && memoryCache == null) {
    const neonEntry = await readNeonPrimaryLeagues();
    if (neonEntry?.payload) {
      const age = now - neonEntry.refreshedAt;
      memoryCache = neonEntry.payload.tournaments;
      memoryCacheAt = neonEntry.refreshedAt;
      if (age < NEON_TTL_MS) {
        return res.status(200).json({ tournaments: memoryCache, source: 'cache' });
      }
      if (age < NEON_STALE_MAX_MS) {
        // 后台刷新（fire-and-forget），成功会写回 Neon。
        if (!refreshInFlight) {
          refreshInFlight = refreshPrimaryLeagues(now)
            .catch((error) => {
              console.error('[Primary Leagues API] Background refresh failed:', error instanceof Error ? error.message : String(error));
            })
            .finally(() => {
              refreshInFlight = null;
            });
        }
        return res.status(200).json({ tournaments: memoryCache, source: 'stale' });
      }
      // 超过 stale 上限：继续走同步抓取；失败时下面 catch 仍有 memoryCache 兜底。
    }
  }

  try {
    const tournaments = await refreshPrimaryLeagues(now);
    return res.status(200).json({ tournaments, source: 'dltv' });
  } catch (error) {
    console.error('[Primary Leagues API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(200).json({ tournaments: memoryCache || [], source: 'error' });
  }
}

/** 供 cron 预热：抓首页解析 primary leagues 并写入 Neon（无内存缓存，只落库，跨实例共享）。 */
export async function refreshPrimaryLeaguesCache({ fetchImpl = fetch } = {}) {
  const { raw } = await fetchHomeHtml(fetchImpl);
  if (!raw) return { ok: false, count: 0 };
  const tournaments = parseDltvPrimaryLeagues(raw);
  if (tournaments.length === 0) return { ok: false, count: 0 };
  persistNeonPrimaryLeagues({ tournaments, fetchedAt: new Date().toISOString() });
  return { ok: true, count: tournaments.length };
}
