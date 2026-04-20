import { neon } from '@neondatabase/serverless';
import { explainLiveHeroMatching, getLiveHeroPayloads } from '../lib/server/live-hero-service.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const LIVE_HERO_CACHE_CONTROL = 'public, max-age=2, s-maxage=2, stale-while-revalidate=3';
const LIVE_HERO_NO_STORE_CACHE_CONTROL = 'no-store';
let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

function toPositiveInt(value, fallback, { min = 1, max = 3600 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized < min) return fallback;
  return Math.min(normalized, max);
}

function shouldBypassSharedCache(query) {
  return String(query?.refresh || '') === '1'
    || String(query?.debug || '') === '1'
    || String(query?.team_a || '').trim().length > 0
    || String(query?.team_b || '').trim().length > 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', shouldBypassSharedCache(req.query) ? LIVE_HERO_NO_STORE_CACHE_CONTROL : LIVE_HERO_CACHE_CONTROL);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();

  try {
    const options = {
      forceRefresh: String(req.query?.refresh || '') === '1',
      debug: String(req.query?.debug || '') === '1',
      maxAgeSeconds: toPositiveInt(req.query?.max_age, 180),
      teamA: String(req.query?.team_a || '').trim() || undefined,
      teamB: String(req.query?.team_b || '').trim() || undefined,
    };
    const liveMatches = await getLiveHeroPayloads(db, options);
    const live = liveMatches[0] || null;
    const debug = options.debug ? await explainLiveHeroMatching(db, options) : undefined;

    return res.status(200).json({
      live: live || null,
      liveMatches,
      ...(debug ? { debug } : {}),
      meta: {
        hasLive: liveMatches.length > 0,
        liveCount: liveMatches.length,
        generatedAt: new Date().toISOString(),
        source: live ? live.source || 'hawk.live' : 'hero_live_scores',
      },
    });
  } catch (error) {
    console.error('[Live Hero API] Error:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      live: null,
      liveMatches: [],
      debug: null,
      meta: {
        hasLive: false,
        liveCount: 0,
        generatedAt: new Date().toISOString(),
        source: 'hero_live_scores',
      },
    });
  }
}
