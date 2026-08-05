/**
 * Event Detail API —— DLTV 赛事详情页（/events/<slug>）
 *
 * 数据流：
 *   冷启动/未命中 → 直抓 https://dltv.org/events/<slug>（direct + jina 双源降级）
 *   → 解析（lib/server/dltv-event-detail-parser.js）
 *   → 写内存热缓存 + Neon 持久缓存（lib/server/dltv-neon-cache.js，跨实例共享）
 *   → 返回 blocks（overview/about/groups/playoffs/matches/participants/prizePool）
 *
 * 缓存分层（与 /api/events 一致）：
 *   - 内存 2min 新鲜直接返回
 *   - stale-while-revalidate：旧数据立即返回 + 后台刷新
 *   - Neon 持久缓存兜底：跨实例冷启动免回源
 *   - single-flight：并发共享一次在途抓取
 */

import { getDb } from '../lib/db.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import { readDltvCache, writeDltvCache, tryAcquireDltvCacheLock } from '../lib/server/dltv-neon-cache.js';
import { parseDltvEventDetailPage } from '../lib/server/dltv-event-detail-parser.js';

const DLTV_EVENT_BASE = 'https://dltv.org/events/';
const CACHE_CONTROL = 'public, max-age=120, s-maxage=120, stale-while-revalidate=240';
const NEON_CACHE_PREFIX = 'dltv:event-detail:v2:';
const NEON_TTL_MS = 15 * 60 * 1000;
const NEON_STALE_MAX_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_MAX_AGE_MS = 15 * 60 * 1000;
const BUILD_TIMEOUT_MS = 15000;
const LOCK_TTL_MS = 10000;

const memoryCache = new Map();

function cacheKey(slug) {
  return `dltv:event-detail:${String(slug || '').trim().toLowerCase()}`;
}

function rebaseImages(payload) {
  if (!payload) return payload;
  const rebase = (logo) => {
    if (!logo) return null;
    return getMirroredAssetUrl(logo) || logo;
  };
  return {
    ...payload,
    heroImage: rebase(payload.heroImage),
    groups: (payload.groups || []).map((g) => ({
      ...g,
      rows: (g.rows || []).map((row) => ({ ...row, logo: rebase(row.logo) })),
    })),
    playoffRounds: (payload.playoffRounds || []).map((r) => ({
      ...r,
      matches: (r.matches || []).map((m) => ({
        ...m,
        teams: (m.teams || []).map((t) => ({ ...t, logo: rebase(t.logo) })),
      })),
    })),
    matches: {
      matches: (payload.matches?.matches || []).map((m) => ({
        ...m, leftLogo: rebase(m.leftLogo), rightLogo: rebase(m.rightLogo),
      })),
      finishedMatches: (payload.matches?.finishedMatches || []).map((m) => ({
        ...m, leftLogo: rebase(m.leftLogo), rightLogo: rebase(m.rightLogo),
      })),
    },
    participants: (payload.participants || []).map((p) => ({ ...p, logo: rebase(p.logo) })),
  };
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

async function buildDetail(slug, fetchImpl = fetch) {
  const res = await fetchHtml(`${DLTV_EVENT_BASE}${slug}`, fetchImpl);
  const payload = res.raw ? parseDltvEventDetailPage(res.raw, slug) : null;
  if (!payload) return { payload: null, sourceType: res.sourceType };
  return { payload, sourceType: res.sourceType };
}

/** 内存新鲜命中 */
function getFresh(slug) {
  const cached = memoryCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  if (cached && cached.expiresAt <= Date.now()) memoryCache.delete(slug);
  return null;
}

/** 内存 stale（未超 stale 上限） */
function getUsableStale(slug) {
  const cached = memoryCache.get(slug);
  if (cached && Date.now() - cached.at < STALE_MAX_AGE_MS) return cached.payload;
  return null;
}

function persistNeon(payload) {
  const db = getDb();
  if (!db || !payload) return;
  writeDltvCache(db, cacheKey(payload.slug), { payload });
}

async function readNeon(slug) {
  const db = getDb();
  if (!db) return null;
  try {
    const entry = await readDltvCache(db, cacheKey(slug));
    if (!entry?.payload) return null;
    return { payload: entry.payload, refreshedAt: entry.refreshedAt };
  } catch (error) {
    console.error('[Event Detail] neon cache read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', CACHE_CONTROL);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const slug = String(req.query?.slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!slug) {
    return res.status(400).json({ error: 'slug is required' });
  }

  const forceRefresh = String(req.query?.refresh || '') === '1';
  const now = Date.now();

  if (!forceRefresh) {
    const fresh = getFresh(slug);
    if (fresh) {
      return res.status(200).json({ ...rebaseImages(fresh), source: 'cache' });
    }

    const stale = getUsableStale(slug);
    if (stale) {
      void refreshBackground(slug, req.fetchImpl);
      return res.status(200).json({ ...rebaseImages(stale), source: 'stale' });
    }
  }

  // Neon 持久缓存兜底：跨实例冷启动免回源。
  if (!forceRefresh && !getFresh(slug)) {
    const neonEntry = await readNeon(slug);
    if (neonEntry?.payload) {
      const age = now - neonEntry.refreshedAt;
      memoryCache.set(slug, { payload: neonEntry.payload, at: neonEntry.refreshedAt, expiresAt: neonEntry.refreshedAt + CACHE_TTL_MS });
      if (age < NEON_TTL_MS) {
        return res.status(200).json({ ...rebaseImages(neonEntry.payload), source: 'cache' });
      }
      if (age < NEON_STALE_MAX_MS) {
        void refreshBackground(slug, req.fetchImpl);
        return res.status(200).json({ ...rebaseImages(neonEntry.payload), source: 'stale' });
      }
    }
  }

  try {
    const { payload, sourceType } = await buildDetail(slug, req.fetchImpl);
    if (payload) {
      memoryCache.set(slug, { payload, at: now, expiresAt: now + CACHE_TTL_MS });
      persistNeon(payload);
      return res.status(200).json({ ...rebaseImages(payload), source: sourceType });
    }
  } catch (error) {
    console.error('[Event Detail] build failed:', error instanceof Error ? error.message : String(error));
  }

  const stale = getUsableStale(slug);
  if (stale) {
    return res.status(200).json({ ...rebaseImages(stale), source: 'stale' });
  }
  return res.status(200).json({ slug, source: 'failed', empty: true });
}

/** 后台刷新：成功写内存 + Neon。 */
async function refreshBackground(slug, fetchImpl) {
  try {
    const { payload } = await buildDetail(slug, fetchImpl);
    if (payload) {
      const now = Date.now();
      memoryCache.set(slug, { payload, at: now, expiresAt: now + CACHE_TTL_MS });
      persistNeon(payload);
    }
  } catch (error) {
    console.error('[Event Detail] background refresh failed:', error instanceof Error ? error.message : String(error));
  }
}

/** 供 cron 预热：force 直抓 + 写 Neon + 内存，带 Neon 跨实例锁防并发。 */
export async function refreshEventDetailCache({ slug, fetchImpl = fetch } = {}) {
  const normalizedSlug = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedSlug) return { ok: false, reason: 'missing slug' };
  const db = getDb();
  const acquired = db ? await tryAcquireDltvCacheLock(db, cacheKey(normalizedSlug), LOCK_TTL_MS) : true;
  if (!acquired) return { ok: false, reason: 'locked' };
  try {
    const { payload } = await buildDetail(normalizedSlug, fetchImpl);
    if (payload) {
      const now = Date.now();
      memoryCache.set(normalizedSlug, { payload, at: now, expiresAt: now + CACHE_TTL_MS });
      persistNeon(payload);
      return { ok: true, source: 'fetched' };
    }
    return { ok: false, reason: 'parse failed' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
