import { syncNewsToDb, translateNewsBackfill } from './news.js';
import { runSyncOpenDota } from '../lib/server/sync-opendota.js';
import { runSyncLiquipedia } from '../lib/server/sync-liquipedia.js';
import { neon } from '@neondatabase/serverless';
import { warmPlayerProfileCache } from '../lib/server/player-profile-cache.js';
import { warmTeamFlyoutCache } from '../lib/server/team-flyout-cache.js';
import { backfillDltvTeamLogos } from '../lib/server/dltv-team-logo-backfill.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;
let cronActionGateReady = false;
const inMemoryCronActionGate = new Map();

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

function pickNonNegativeInt(value, fallback) {
  const parsed = Number(pickParam(value, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.trunc(parsed);
}

function pickOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(pickParam(value, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.trunc(parsed);
}

function pickBoolean(value, fallback = false) {
  const normalized = pickParam(value, '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readHeader(req, key) {
  if (!req?.headers) return '';
  const direct = req.headers[key];
  if (direct !== undefined && direct !== null) return pickParam(direct, '').trim();
  const lower = req.headers[key.toLowerCase()];
  if (lower !== undefined && lower !== null) return pickParam(lower, '').trim();
  return '';
}

function isCronTokenAuthorized(req, query = {}, body = {}) {
  const expectedToken = pickParam(process.env.D2HUB_CRON_TOKEN || process.env.CRON_SECRET, '').trim();
  if (!expectedToken) return true;
  const headerToken = readHeader(req, 'x-cron-token');
  const authHeader = readHeader(req, 'authorization');
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const token = pickParam(
    headerToken || bearerToken || query.token || body.token,
    ''
  ).trim();
  return token === expectedToken;
}

async function ensureCronActionGateTable(db) {
  if (cronActionGateReady || !db || typeof db.query !== 'function') return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS cron_action_gate (
      action TEXT PRIMARY KEY,
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  cronActionGateReady = true;
}

function acquireInMemoryCronGate(action, minIntervalMin) {
  if (minIntervalMin <= 0) return { allowed: true };
  const now = Date.now();
  const key = String(action || '').trim().toLowerCase() || 'all';
  const last = inMemoryCronActionGate.get(key) || 0;
  if (now - last < minIntervalMin * 60 * 1000) {
    return {
      allowed: false,
      reason: `min_interval_${minIntervalMin}m`,
      lastStartedAt: new Date(last).toISOString(),
    };
  }
  inMemoryCronActionGate.set(key, now);
  return { allowed: true, lastStartedAt: new Date(now).toISOString() };
}

async function acquireCronActionGate(db, action, minIntervalMin) {
  if (minIntervalMin <= 0) return { allowed: true };
  if (!db || typeof db.query !== 'function') {
    return acquireInMemoryCronGate(action, minIntervalMin);
  }
  await ensureCronActionGateTable(db);
  const rows = await db.query(
    `
      INSERT INTO cron_action_gate (action, window_started_at, updated_at)
      VALUES ($1, NOW(), NOW())
      ON CONFLICT (action) DO UPDATE
      SET window_started_at = EXCLUDED.window_started_at,
          updated_at = NOW()
      WHERE cron_action_gate.window_started_at <= NOW() - ($2::INT * INTERVAL '1 minute')
      RETURNING window_started_at
    `,
    [action, minIntervalMin]
  );
  if (rows.length > 0) {
    return {
      allowed: true,
      lastStartedAt: rows[0]?.window_started_at
        ? new Date(rows[0].window_started_at).toISOString()
        : new Date().toISOString(),
    };
  }
  return { allowed: false, reason: `min_interval_${minIntervalMin}m` };
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
    playerConcurrency: pickPositiveInt(raw.playerConcurrency || raw.concurrency, 6),
    teamConcurrency: pickPositiveInt(raw.teamConcurrency || raw.concurrency, 6),
    teamOnly: pickBoolean(raw.teamOnly, true),
  };
}

function buildSyncNewsOptions(raw = {}) {
  const onlySource = pickParam(raw.onlySource, '').trim().toLowerCase();
  const options = {};

  if (['bo3', 'hawk', 'cyberscore', 'taverna'].includes(onlySource)) {
    options.onlySource = onlySource;
  }

  const recentDays = pickOptionalPositiveInt(raw.recentDays);
  if (recentDays !== undefined) {
    options.recentDays = recentDays;
  }

  const translateLimit = pickOptionalPositiveInt(raw.translateLimit);
  if (translateLimit !== undefined) {
    options.translateLimit = translateLimit;
  }

  const bo3TestUrl = pickParam(raw.bo3TestUrl, '').trim();
  if (bo3TestUrl) {
    options.bo3TestUrl = bo3TestUrl;
  }

  if (pickBoolean(raw.purgeBo3, false)) {
    options.purgeBo3 = true;
  }

  return options;
}

async function runAction(action, refreshOptions = buildRefreshOptions(), raw = {}) {
  const playerRefreshOptions = {
    mode: refreshOptions.mode,
    incremental: refreshOptions.incremental,
    recentDays: refreshOptions.recentDays,
    upcomingDays: refreshOptions.upcomingDays,
    matchLimit: refreshOptions.matchLimit,
    limit: refreshOptions.playerLimit,
    concurrency: refreshOptions.playerConcurrency,
    teamOnly: refreshOptions.teamOnly,
  };
  const teamRefreshOptions = {
    mode: refreshOptions.mode,
    incremental: refreshOptions.incremental,
    recentDays: refreshOptions.recentDays,
    upcomingDays: refreshOptions.upcomingDays,
    limit: refreshOptions.teamLimit,
    concurrency: refreshOptions.teamConcurrency,
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
  if (action === 'backfill-dltv-team-logos') {
    const db = getDb();
    if (!db) throw new Error('Database not available');
    return { action, result: await backfillDltvTeamLogos(db, { dryRun: Boolean(raw?.dryRun === true || raw?.dryRun === 'true') }) };
  }
  if (action === 'sync-news') {
    return { action, result: await syncNewsToDb(buildSyncNewsOptions(raw)) };
  }
  if (action === 'translate-news-backfill') {
    return {
      action,
      result: await translateNewsBackfill({
        recentDays: refreshOptions.recentDays,
        limit: refreshOptions.matchLimit,
      }),
    };
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const query = req.query || {};
    const body = typeof req.body === 'object' && req.body ? req.body : {};

    if (!isCronTokenAuthorized(req, query, body)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const action = pickParam(query.action || body.action, 'all').trim().toLowerCase();
    const force = pickBoolean(query.force || body.force, false);
    const defaultMinIntervalMin = pickNonNegativeInt(
      process.env.D2HUB_CRON_MIN_INTERVAL_MIN || process.env.CRON_MIN_INTERVAL_MIN,
      0
    );
    const minIntervalMin = pickNonNegativeInt(
      query.minIntervalMin || body.minIntervalMin,
      defaultMinIntervalMin
    );
    const gate = (!force && minIntervalMin > 0)
      ? await acquireCronActionGate(getDb(), action || 'all', minIntervalMin)
      : { allowed: true };
    if (!gate.allowed) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        action,
        reason: gate.reason || 'min_interval_guard',
        minIntervalMin,
        force,
      });
    }

    const refreshOptions = buildRefreshOptions({
      mode: query.mode || body.mode,
      recentDays: query.recentDays || body.recentDays,
      upcomingDays: query.upcomingDays || body.upcomingDays,
      matchLimit: query.matchLimit || body.matchLimit,
      playerLimit: query.playerLimit || body.playerLimit,
      teamLimit: query.teamLimit || body.teamLimit,
      concurrency: query.concurrency || body.concurrency,
      playerConcurrency: query.playerConcurrency || body.playerConcurrency,
      teamConcurrency: query.teamConcurrency || body.teamConcurrency,
      teamOnly: query.teamOnly || body.teamOnly,
    });
    const payload = await runAction(action || 'all', refreshOptions, {
      ...body,
      ...query,
    });
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'cron run failed',
    });
  }
}
