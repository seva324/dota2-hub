/**
 * Primary Leagues API
 * Data: DLTV homepage "Primary leagues" carousel (https://dltv.org)
 */

import { parseDltvPrimaryLeagues } from '../lib/server/dltv-tournaments-parser.js';

const DLTV_HOME_URL = 'https://dltv.org';
const CACHE_CONTROL = 'public, max-age=180, s-maxage=180, stale-while-revalidate=300';

let memoryCache = null;
let memoryCacheAt = 0;
let refreshInFlight = null;
const CACHE_TTL_MS = 180_000;

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
          ...(attempt.type === 'jina' ? { 'X-Return-Format': 'html' } : {}),
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

  try {
    const tournaments = await refreshPrimaryLeagues(now);
    return res.status(200).json({ tournaments, source: 'dltv' });
  } catch (error) {
    console.error('[Primary Leagues API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(200).json({ tournaments: memoryCache || [], source: 'error' });
  }
}
