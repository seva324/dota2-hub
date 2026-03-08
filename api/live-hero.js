import { neon } from '@neondatabase/serverless';
import { ensureHeroLiveScoresTable } from '../lib/server/hero-live-score-cache.js';
import { explainLiveHeroMatching, getLiveHeroPayload, getLiveHeroPayloads } from '../lib/server/live-hero-service.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available', live: null });
  }

  try {
    await ensureHeroLiveScoresTable(db);
    const options = {
      forceRefresh: String(req.query?.refresh || '') === '1',
      debug: String(req.query?.debug || '') === '1',
      maxAgeSeconds: toPositiveInt(req.query?.max_age, 180),
      teamA: String(req.query?.team_a || '').trim() || undefined,
      teamB: String(req.query?.team_b || '').trim() || undefined,
    };
    const liveMatches = await getLiveHeroPayloads(db, options);
    const live = liveMatches[0] || await getLiveHeroPayload(db, options);
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
