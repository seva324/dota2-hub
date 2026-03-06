import { syncNewsToDb } from './news.js';
import { runSyncOpenDota } from '../lib/server/sync-opendota.js';
import { runSyncLiquipedia } from '../lib/server/sync-liquipedia.js';
import { neon } from '@neondatabase/serverless';
import { warmPlayerProfileCache } from '../lib/server/player-profile-cache.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[cron] Failed to create db client:', error.message);
      return null;
    }
  }
  return sql;
}

function pickParam(value, fallback = '') {
  if (Array.isArray(value)) return String(value[0] || fallback);
  if (value === undefined || value === null) return fallback;
  return String(value);
}

async function runAction(action) {
  if (action === 'refresh-player-profiles') {
    const db = getDb();
    if (!db) throw new Error('Database not available');
    return { action, result: await warmPlayerProfileCache(db, { limit: 60 }) };
  }
  if (action === 'sync-opendota') {
    return { action, result: await runSyncOpenDota() };
  }
  if (action === 'sync-liquipedia') {
    return { action, result: await runSyncLiquipedia() };
  }
  if (action === 'sync-news') {
    return { action, result: await syncNewsToDb() };
  }
  if (action === 'all') {
    const opendota = await runSyncOpenDota();
    const liquipedia = await runSyncLiquipedia();
    const news = await syncNewsToDb();
    const db = getDb();
    const playerProfiles = db ? await warmPlayerProfileCache(db, { limit: 60 }) : { skipped: true, reason: 'db_unavailable' };
    return {
      action,
      result: {
        opendota,
        liquipedia,
        news,
        playerProfiles,
      },
    };
  }
  throw new Error(`Unsupported action: ${action}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const query = req.query || {};
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const action = pickParam(query.action || body.action, 'all').trim().toLowerCase();
    const payload = await runAction(action || 'all');
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'cron run failed',
    });
  }
}
