import { syncNewsToDb } from './news.js';
import { runSyncOpenDota } from '../lib/server/sync-opendota.js';
import { runSyncLiquipedia } from '../lib/server/sync-liquipedia.js';
import { neon } from '@neondatabase/serverless';
import { warmPlayerProfileCache } from '../lib/server/player-profile-cache.js';
import { warmTeamFlyoutCache } from '../lib/server/team-flyout-cache.js';

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

function pickPositiveInt(value, fallback) {
  const parsed = Number(pickParam(value, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function buildRefreshOptions(raw = {}) {
  const mode = String(pickParam(raw.mode, '')).trim().toLowerCase() === 'incremental' ? 'incremental' : 'full';
  return {
    mode,
    incremental: mode === 'incremental',
    recentDays: pickPositiveInt(raw.recentDays, 7),
    upcomingDays: pickPositiveInt(raw.upcomingDays, 3),
    matchLimit: pickPositiveInt(raw.matchLimit, 180),
    playerLimit: pickPositiveInt(raw.playerLimit, null),
    teamLimit: pickPositiveInt(raw.teamLimit, null),
  };
}

async function runAction(action, refreshOptions = buildRefreshOptions()) {
  const playerRefreshOptions = {
    mode: refreshOptions.mode,
    incremental: refreshOptions.incremental,
    recentDays: refreshOptions.recentDays,
    upcomingDays: refreshOptions.upcomingDays,
    matchLimit: refreshOptions.matchLimit,
    limit: refreshOptions.playerLimit,
  };
  const teamRefreshOptions = {
    mode: refreshOptions.mode,
    incremental: refreshOptions.incremental,
    recentDays: refreshOptions.recentDays,
    upcomingDays: refreshOptions.upcomingDays,
    limit: refreshOptions.teamLimit,
  };

  if (action === 'refresh-player-profiles' || action === 'refresh-player-profiles-incremental') {
    const db = getDb();
    if (!db) throw new Error('Database not available');
    const options = action.endsWith('-incremental')
      ? { ...playerRefreshOptions, mode: 'incremental', incremental: true }
      : playerRefreshOptions;
    return { action, result: await warmPlayerProfileCache(db, options) };
  }
  if (action === 'refresh-derived-data' || action === 'refresh-derived-data-incremental') {
    const db = getDb();
    if (!db) throw new Error('Database not available');
    const options = action.endsWith('-incremental')
      ? { mode: 'incremental', incremental: true, recentDays: refreshOptions.recentDays, upcomingDays: refreshOptions.upcomingDays }
      : { mode: refreshOptions.mode, incremental: refreshOptions.incremental, recentDays: refreshOptions.recentDays, upcomingDays: refreshOptions.upcomingDays };
    const [playerProfiles, teamFlyouts] = await Promise.all([
      warmPlayerProfileCache(db, { ...playerRefreshOptions, ...options }),
      warmTeamFlyoutCache(db, { ...teamRefreshOptions, ...options }),
    ]);
    return { action, result: { mode: options.mode, playerProfiles, teamFlyouts } };
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
    const playerProfiles = db ? await warmPlayerProfileCache(db) : { skipped: true, reason: 'db_unavailable' };
    const teamFlyouts = db ? await warmTeamFlyoutCache(db) : { skipped: true, reason: 'db_unavailable' };
    return {
      action,
      result: {
        opendota,
        liquipedia,
        news,
        playerProfiles,
        teamFlyouts,
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
    const refreshOptions = buildRefreshOptions({
      mode: query.mode || body.mode,
      recentDays: query.recentDays || body.recentDays,
      upcomingDays: query.upcomingDays || body.upcomingDays,
      matchLimit: query.matchLimit || body.matchLimit,
      playerLimit: query.playerLimit || body.playerLimit,
      teamLimit: query.teamLimit || body.teamLimit,
    });
    const payload = await runAction(action || 'all', refreshOptions);
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'cron run failed',
    });
  }
}
