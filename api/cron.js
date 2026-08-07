import { syncNewsToDb, translateNewsBackfill } from './news.js';
import { runSyncOpenDota } from '../lib/server/sync-opendota.js';
import { runSyncLiquipedia, upsertLiquipediaTournamentMetadata } from '../lib/server/sync-liquipedia.js';
import { getDb } from '../lib/db.js';
import { warmPlayerProfileCache } from '../lib/server/player-profile-cache.js';
import { warmTeamFlyoutCache } from '../lib/server/team-flyout-cache.js';
import { backfillDltvTeamLogos } from '../lib/server/dltv-team-logo-backfill.js';
import { warmDltvCaches } from '../lib/server/dltv-warm.js';
import { refreshEventDetailCache } from './event-detail.js';
import { refreshEventsCache } from './events.js';
import { refreshPrimaryLeaguesCache } from './primary-leagues.js';
import { warmTeamDetail } from './team-detail.js';
import { syncRankingsToDb } from '../lib/server/rankings-service.js';
import { persistLiveHeroSnapshots } from '../lib/server/live-hero-service.js';

let cronActionGateReady = false;
const inMemoryCronActionGate = new Map();

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

// warm-dltv 全流程硬性预算：EdgeOne 函数 maxDuration=60s，必须在平台杀掉函数前
// 返回 200；未完成部分由下一轮（10min 后）继续收敛。
const WARM_TOTAL_BUDGET_MS = 50_000;
// 单个赛事详情页预热上限（DLTV 抓页可能慢，不能让它独占剩余预算）。
const WARM_EVENT_FETCH_MS = 8_000;

/** Promise.race 限时：超时 reject，调用方自行兜底（平台会回收残留的抓取）。 */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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

  if (['bo3', 'hawk', 'cyberscore', 'taverna', 'dota2'].includes(onlySource)) {
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
    const requestedPhase = pickParam(raw.phase, '').trim().toLowerCase();
    const phase = ['full', 'metadata', 'upcoming', 'fast'].includes(requestedPhase)
      ? requestedPhase
      : 'fast';
    return {
      action,
      result: await runSyncLiquipedia({
        phase,
        seedUrls: raw.url || raw.urls,
      }),
    };
  }
  if (action === 'sync-liquipedia-metadata') {
    return {
      action,
      result: await runSyncLiquipedia({
        phase: 'metadata',
        seedUrls: raw.url || raw.urls,
      }),
    };
  }
  if (action === 'sync-liquipedia-upcoming') {
    return { action, result: await runSyncLiquipedia({ phase: 'upcoming' }) };
  }
  if (action === 'upsert-liquipedia-tournament') {
    return {
      action,
      result: await upsertLiquipediaTournamentMetadata({
        url: raw.url || raw.sourceUrl,
        sourceUrl: raw.sourceUrl || raw.url,
        title: raw.title,
        tier: raw.tier,
        location: raw.location,
        startTime: raw.startTime,
        endTime: raw.endTime,
        prizePool: raw.prizePool,
        prizePoolUsd: raw.prizePoolUsd,
        image: raw.image,
        locationFlagUrl: raw.locationFlagUrl,
        eventSlug: raw.eventSlug,
        parentSlug: raw.parentSlug,
        eventGroupSlug: raw.eventGroupSlug,
      }),
    };
  }
  if (action === 'backfill-dltv-team-logos') {
    const db = getDb();
    if (!db) throw new Error('Database not available');
    return { action, result: await backfillDltvTeamLogos(db, { dryRun: Boolean(raw?.dryRun === true || raw?.dryRun === 'true') }) };
  }
  if (action === 'warm-dltv') {
    // 定时预热：列表 → hot-cache，match-page → Neon。把 DLTV 抓取从用户
    // 请求路径收敛到 cron，避免突发抓取触发反爬。min interval 由调度/调用方控制。
    // 整个流程共享同一个硬性 deadline：match-page 优先，赛事目录/详情等增强
    // 数据各有限时，保证在平台杀掉函数前返回 200；剩余工作下一轮继续收敛。
    const deadline = Date.now() + WARM_TOTAL_BUDGET_MS;
    const remainingMs = () => Math.max(0, deadline - Date.now());
    const result = await warmDltvCaches({ fetchImpl: undefined, deadline });
    // 顺带预热 tournaments 目录 + 首页 tournaments carousel 到 Neon：
    // 各自限时，超预算直接跳，失败不影响 match-page。
    let events = { skipped: true };
    let primaryLeagues = { skipped: true };
    if (remainingMs() > 10_000) {
      try {
        events = await withTimeout(refreshEventsCache(), Math.min(remainingMs() - 2_000, 12_000));
      } catch (error) {
        console.error('[cron] warm events failed:', error instanceof Error ? error.message : String(error));
        events = { ok: false };
      }
    } else {
      events = { skipped: true, reason: 'deadline' };
    }
    if (remainingMs() > 6_000) {
      try {
        primaryLeagues = await withTimeout(refreshPrimaryLeaguesCache(), Math.min(remainingMs() - 2_000, 8_000));
      } catch (error) {
        console.error('[cron] warm primary leagues failed:', error instanceof Error ? error.message : String(error));
        primaryLeagues = { ok: false };
      }
    } else {
      primaryLeagues = { skipped: true, reason: 'deadline' };
    }
    // 顺带预热赛事详情页：从 events 目录取 ongoing/upcoming 的 slug，逐个写 Neon。
    // best-effort，失败不影响主流程；Neon 锁防多实例并发抓同 slug。
    let eventDetails = { warmed: 0, failed: 0 };
    try {
      const warmSlugs = (events.warmUrls || [])
        .map((url) => String(url || '').match(/\/events\/([^/?#]+)/)?.[1])
        .filter(Boolean);
      let warmed = 0;
      let failed = 0;
      for (const slug of warmSlugs) {
        if (remainingMs() < WARM_EVENT_FETCH_MS + 2_000) break;
        try {
          const detailResult = await withTimeout(refreshEventDetailCache({ slug }), WARM_EVENT_FETCH_MS);
          if (detailResult.ok) warmed += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      eventDetails = { warmed, failed };
    } catch (error) {
      console.error('[cron] warm event details failed:', error instanceof Error ? error.message : String(error));
      eventDetails = { warmed: 0, failed: 0, error: true };
    }
    // 顺带预热热门战队详情页到 Neon：用户点战队页免直连 DLTV。
    // best-effort，失败不影响主流程；Neon 锁防多实例并发抓同队。
    const POPULAR_TEAMS = [
      { slug: 'team-falcons', name: 'Team Falcons', tag: 'Falcons' },
      { slug: 'team-liquid', name: 'Team Liquid', tag: 'Liquid' },
      { slug: 'team-spirit', name: 'Team Spirit', tag: 'TS' },
      { slug: 'og', name: 'OG', tag: 'OG' },
      { slug: '1win-team', name: '1win Team', tag: '1win' },
      { slug: 'betboom-team', name: 'BetBoom Team', tag: 'BetBoom' },
      { slug: 'xtreme-gaming', name: 'Xtreme Gaming', tag: 'XG' },
      { slug: 'parivision', name: 'PARIVISION', tag: 'PARIVISION' },
    ];
    let teamDetails = { warmed: 0, failed: 0, skipped: 0 };
    try {
      let warmed = 0;
      let failed = 0;
      let skipped = 0;
      for (const team of POPULAR_TEAMS) {
        if (remainingMs() < WARM_EVENT_FETCH_MS + 2_000) {
          skipped += POPULAR_TEAMS.length - warmed - failed - skipped;
          break;
        }
        try {
          const teamResult = await withTimeout(warmTeamDetail(team), WARM_EVENT_FETCH_MS);
          if (teamResult.ok) warmed += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
      teamDetails = { warmed, failed, skipped };
    } catch (error) {
      console.error('[cron] warm team details failed:', error instanceof Error ? error.message : String(error));
      teamDetails = { warmed: 0, failed: 0, error: true };
    }
    return { action, result: { ...result, events, primaryLeagues, eventDetails, teamDetails } };
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
  if (action === 'sync-ranking') {
    // 战队/赛事排行持久化到 Neon；内部按 24h 过期门控，过期才真正抓取 dltv。
    return { action, result: await syncRankingsToDb() };
  }
  if (action === 'persist-live-hero') {
    // 低频持久化（~5min 调度）：抓 hawk → upsert hero_live_scores（含开始/结束 notify）。
    // 高频 live-hero 请求路径已去 Neon（CDN + 回源抓页），此 action 只维护监控快照。
    const db = getDb();
    if (!db) throw new Error('Database not available');
    return { action, result: await persistLiveHeroSnapshots(db) };
  }
  if (action === 'all') {
    const opendota = await runSyncOpenDota();
    const liquipedia = await runSyncLiquipedia();
    const news = await syncNewsToDb();
    const rankings = await syncRankingsToDb();
    const db = getDb();
    const playerProfiles = db ? await warmPlayerProfileCache(db) : { skipped: true, reason: 'db_unavailable' };
    const teamFlyouts = db ? await warmTeamFlyoutCache(db) : { skipped: true, reason: 'db_unavailable' };
    return {
      action,
      result: {
        opendota,
        liquipedia,
        news,
        rankings,
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
