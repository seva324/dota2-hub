import { neon } from '@neondatabase/serverless';
import { getPlayerProfilePayload } from '../lib/server/player-profile-cache.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[PlayerProfile API] Failed to create client:', error.message);
      return null;
    }
  }
  return sql;
}

function parseAccountId(rawAccountId) {
  const parsed = Number(rawAccountId);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function toBool(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return value === true || value === 1;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  const accountId = parseAccountId(req.query.account_id ?? req.query.accountId);
  if (!accountId) {
    return res.status(400).json({ error: 'Invalid account_id' });
  }

  try {
    const result = await getPlayerProfilePayload(db, accountId, {
      forceRefresh: toBool(req.query.refresh),
      preferFast: toBool(req.query.fast),
      maxAgeHours: 24,
    });

    if (!result?.payload) {
      return res.status(404).json({ error: 'Player profile not found' });
    }

    const source = result.source || 'unknown';
    if (source === 'seed' || source === 'cache-partial' || source === 'stale') {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    }

    res.setHeader('X-Player-Profile-Cache', source);
    return res.status(200).json(result.payload);
  } catch (error) {
    console.error('[PlayerProfile API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
