/**
 * 战队/赛事排行 — Neon 持久化缓存 + 每 24h 刷新。
 *
 * 之前 team-ranking / ept-ranking 都是进程内内存缓存 + 冷启动实时抓 dltv.org，
 * 跨实例不共享、每次冷启动都回源。改为复用 dltv_cache JSONB KV 表存到 Neon，
 * handler 读 DB 优先；通过 cron 的 sync-ranking action 每 24h 刷新一次。
 */

import { getDb } from '../db.js';
import {
  readDltvCache,
  writeDltvCache,
  tryAcquireDltvCacheLock,
} from './dltv-neon-cache.js';
import { getDltvTeamRanking } from './dltv-ranking-service.js';

export const RANKING_STALE_MS = 24 * 60 * 60 * 1000;
export const RANKING_KEY_TEAM = 'team-ranking';
export const RANKING_KEY_EPT = 'ept-ranking';
export const RANKING_KINDS = [RANKING_KEY_TEAM, RANKING_KEY_EPT];

// ---- EPT（ESL Pro Tour）——从 api/ept-ranking.js 迁入 ----
export const FALLBACK_TEAMS = [
  { rank: 1, name: 'Tundra Esports', logo: 'https://s3.dltv.org/uploads/teams/small/UA0TkIDfiYKdehswu3gIMyqZWkzsf1xc.png', points: 14510 },
  { rank: 2, name: 'Team Yandex', logo: 'https://s3.dltv.org/uploads/teams/n6lR8FGHdGnrXE9IDxRI0EEFs6XbyY81.png.webp', points: 10400 },
  { rank: 3, name: 'Xtreme Gaming', logo: 'https://s3.dltv.org/uploads/teams/GchHJf4tIIk1qWBGeob5QKr1D88q4rH8.png.webp', points: 9560 },
  { rank: 4, name: 'Aurora', logo: 'https://s3.dltv.org/uploads/teams/small/2fxCLHnhSIGZE2EGlg1y9HI9X1dgxkZk.png', points: 8230 },
  { rank: 5, name: 'PARIVISION', logo: 'https://s3.dltv.org/uploads/teams/eT2duK11e7GzuuCAYFdxZrSX9CNfUMso.png.webp', points: 8210 },
  { rank: 6, name: 'Team Spirit', logo: null, points: 6000 },
  { rank: 7, name: 'Team Falcons', logo: null, points: 4325 },
  { rank: 8, name: 'Team Liquid', logo: null, points: 4125 },
  { rank: 9, name: 'MOUZ', logo: null, points: 2760 },
];

function parseEptHtml(html) {
  const teams = [];
  const rowMatches = html.match(/<a[^>]+class=["'][^"']*table__body-row[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];

  for (const segment of rowMatches) {
    if (teams.length >= 10) break;

    const rankMatch = segment.match(/cell__num[^>]*>\s*0*(\d+)/);
    if (!rankMatch) continue;
    const rank = Number.parseInt(rankMatch[1], 10);
    if (!rank || rank < 1 || rank > 20) continue;

    const logoMatch = segment.match(/data-theme-dark="([^"]+)"/);
    const logo = logoMatch ? logoMatch[1].trim() : null;

    const nameMatch = segment.match(/cell__name[^>]*>\s*([^<\n\r]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name) continue;

    const pointsMatch = segment.match(/cell__text[^>]*>\s*([\d\s]+)\s*pts/i);
    const points = pointsMatch ? Number.parseInt(pointsMatch[1].replace(/\s/g, ''), 10) : 0;

    teams.push({ rank, name, logo, points });
  }

  return teams.sort((left, right) => left.rank - right.rank);
}

async function fetchEptTeams() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://dltv.org/teams', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DotaHub/1.0; +https://dotahub.cn)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DLTV returned HTTP ${response.status}`);
    const html = await response.text();
    const teams = parseEptHtml(html);
    if (teams.length === 0) throw new Error('No teams parsed from DLTV HTML');
    return teams.slice(0, 10);
  } finally {
    clearTimeout(timeout);
  }
}

// ept 的内存兜底（无 DB 或刷新失败时使用），team-ranking 的兜底在 dltv-ranking-service 内部
let eptMemoryCache = null;
let eptMemoryCacheAt = 0;

function isStale(refreshedAt) {
  return !Number.isFinite(refreshedAt) || Date.now() - refreshedAt >= RANKING_STALE_MS;
}

async function fetchRanking(kind) {
  if (kind === RANKING_KEY_TEAM) {
    const result = await getDltvTeamRanking();
    return { teams: result.teams, source: result.source, refreshedAt: result.refreshedAt };
  }
  if (kind === RANKING_KEY_EPT) {
    const now = Date.now();
    let teams;
    let source = 'dltv';
    try {
      teams = await fetchEptTeams();
    } catch (error) {
      // dltv.org/teams 结构改版后解析已失效；降级为兜底数据并写入 DB，
      // 避免每次请求都重复抓取。真正的 EPT 抓取修复属独立任务。
      console.warn('[rankings-service] EPT scrape failed, caching fallback:', error instanceof Error ? error.message : String(error));
      teams = FALLBACK_TEAMS;
      source = 'fallback';
    }
    eptMemoryCache = teams;
    eptMemoryCacheAt = now;
    return { teams, source, refreshedAt: now };
  }
  throw new Error(`Unknown ranking kind: ${kind}`);
}

function memoryFallback(kind) {
  if (kind === RANKING_KEY_EPT && eptMemoryCache) {
    return { teams: eptMemoryCache, source: 'stale', refreshedAt: eptMemoryCacheAt };
  }
  return null;
}

/**
 * 读取排行：DB 优先（<24h 直接返回）；空/过期时抢锁刷新并写回 DB；
 * 抢锁失败或刷新失败时降级返回 stale DB / 内存 / 兜底数据。
 */
export async function getRanking(kind) {
  const db = getDb();
  const cached = await readDltvCache(db, kind);
  const cachedAt = cached?.refreshedAt || 0;

  if (cached?.payload && !isStale(cachedAt)) {
    return { teams: cached.payload, source: 'cache', refreshedAt: cachedAt };
  }

  if (await tryAcquireDltvCacheLock(db, kind, 120_000)) {
    try {
      const fetched = await fetchRanking(kind);
      if (fetched.teams.length > 0) {
        await writeDltvCache(db, kind, { payload: fetched.teams });
        return { teams: fetched.teams, source: fetched.source, refreshedAt: fetched.refreshedAt };
      }
    } catch (error) {
      console.error(`[rankings-service] refresh ${kind} failed:`, error instanceof Error ? error.message : String(error));
    }
  }

  if (cached?.payload) {
    return { teams: cached.payload, source: 'stale', refreshedAt: cachedAt };
  }
  const memory = memoryFallback(kind);
  if (memory) return memory;
  return { teams: kind === RANKING_KEY_EPT ? FALLBACK_TEAMS : [], source: 'fallback', refreshedAt: 0 };
}

/**
 * cron 刷新入口：遍历两种排行，仅当 DB 缺失或超过 24h 才真正抓取写库。
 * 每小时调用一次，靠 24h 过期门控 + 锁表避免频繁回源与并发写。
 */
export async function syncRankingsToDb() {
  const db = getDb();
  const results = [];

  for (const kind of RANKING_KINDS) {
    const cached = await readDltvCache(db, kind);
    const cachedAt = cached?.refreshedAt || 0;
    if (cached?.payload && !isStale(cachedAt)) {
      results.push({ kind, status: 'skipped', reason: 'fresh' });
      continue;
    }
    if (!(await tryAcquireDltvCacheLock(db, kind, 120_000))) {
      results.push({ kind, status: 'skipped', reason: 'locked' });
      continue;
    }
    try {
      const fetched = await fetchRanking(kind);
      if (fetched.teams.length === 0) {
        results.push({ kind, status: 'failed', reason: 'empty' });
        continue;
      }
      await writeDltvCache(db, kind, { payload: fetched.teams });
      results.push({ kind, status: 'updated', teams: fetched.teams.length });
    } catch (error) {
      results.push({ kind, status: 'failed', reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { results };
}
