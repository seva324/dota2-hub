/**
 * DLTV 系列赛统计服务（/api/v1/series/{id}/lineups/teams）。
 *
 * 这是 DLTV 比赛页 Statistics 标签的数据源：每队一段"总体 + 按英雄"的统计行
 * （胜率、场均击杀/死亡/助攻、FB/F10 率、WIN WHEN FB/F10、均时长），另附 heroes 字典。
 * 读取顺序：内存 → Neon（6h）→ 冷抓取（5s 有界超时，best-effort，失败不影响主请求）。
 */

import { getDb } from '../db.js';
import {
  ensureDltvSeriesStatsCacheTable,
  readDltvSeriesStatsCache,
  writeDltvSeriesStatsCache,
} from './dltv-series-stats-db-cache.js';

const STATS_DATE_RANGE = 2; // DLTV date_range：2 = Last 3 Months（页面默认）
const FETCH_TIMEOUT_MS = 5000;
const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;
// 统计是历史聚合，变化慢；预热 cron 每小时刷，6h 窗口足够覆盖重复点击。
const DB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function buildStatsUrl(seriesId) {
  return `https://dltv.org/api/v1/series/${Number(seriesId)}/lineups/teams?date_range=${STATS_DATE_RANGE}`;
}

/** 数值统一强转：DLTV 统计接口一般是 number，但与其兄弟接口（series_item）会有字符串，防御性转 Number。 */
function toNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** DLTV 相对图片路径 → 绝对 https://dltv.org URL。hero.image 是相对路径，不转绝对会被镜像逻辑拼成站点上不存在的路径而 404。 */
function toAbsDltvUrl(path) {
  if (!path) return null;
  const trimmed = String(path).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://dltv.org${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function normalizeStatRow(row) {
  if (!row) return null;
  return {
    heroId: row.hero_id ?? null,
    maps: toNum(row.maps_total),
    wins: toNum(row.wins_total),
    winRate: toNum(row.win_rate),
    fbRate: toNum(row.first_blood_rate),
    f10Rate: toNum(row.first_ten_rate),
    winFbRate: toNum(row.win_first_blood_rate),
    winF10Rate: toNum(row.win_first_ten_rate),
    avgKills: toNum(row.avg_kills),
    avgDeaths: toNum(row.avg_deaths),
    avgAssists: toNum(row.avg_assists),
    avgTime: toNum(row.avg_time),
  };
}

/** 归一化接口响应：{ teams: { [teamId]: { overall, heroes } }, heroes: { [id]: heroMeta } } */
export function normalizeSeriesStats(raw) {
  if (!raw?.stats) return null;
  const teams = {};
  for (const [teamId, rows] of Object.entries(raw.stats)) {
    const [overall, ...heroRows] = Array.isArray(rows) ? rows : [];
    teams[teamId] = {
      overall: normalizeStatRow(overall),
      heroes: (heroRows || []).map(normalizeStatRow).filter((row) => row?.heroId),
    };
  }
  const heroes = {};
  for (const [heroId, hero] of Object.entries(raw.heroes || {})) {
    heroes[heroId] = { ...hero, image: toAbsDltvUrl(hero?.image) };
  }
  return { teams, heroes };
}

function isFresh(timestamp, ttlMs) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < ttlMs;
}

function withTimeout(promise, timeoutMs) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('series stats fetch timed out')), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fetchAndNormalizeStats(seriesId, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timed out')), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(buildStatsUrl(seriesId), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const raw = await res.json();
    return normalizeSeriesStats(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const memoryCache = new Map();
const inFlight = new Map();

/**
 * 获取某系列赛的统计。缓存优先，冷抓取 5s 有界超时。
 * @returns {Promise<{ stats: object|null, source: string }>}
 */
export async function getDltvSeriesStats({ seriesId }, options = {}) {
  const key = `series-stats:${Number(seriesId)}`;
  const now = Date.now();
  const forceRefresh = Boolean(options.forceRefresh);
  const memory = memoryCache.get(key);

  if (!forceRefresh && memory?.payload && isFresh(memory.refreshedAt, MEMORY_CACHE_TTL_MS)) {
    return { stats: memory.payload, source: 'cache' };
  }

  const db = getDb();
  if (!forceRefresh && db) {
    const dbCached = await readDltvSeriesStatsCache(db, seriesId);
    const cachedAt = Number(dbCached?.refreshedAt || 0);
    if (dbCached?.payload && isFresh(cachedAt, DB_CACHE_TTL_MS)) {
      memoryCache.set(key, { payload: dbCached.payload, refreshedAt: cachedAt });
      return { stats: dbCached.payload, source: 'cache' };
    }
  }

  try {
    const stats = await withTimeout((async () => {
      if (inFlight.has(key)) return inFlight.get(key);
      const task = (async () => {
        const result = await fetchAndNormalizeStats(seriesId, options.fetchImpl);
        if (result) {
          memoryCache.set(key, { payload: result, refreshedAt: now });
          const writableDb = db || getDb();
          if (writableDb) {
            await writeDltvSeriesStatsCache(writableDb, seriesId, result);
          }
        }
        return result;
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, task);
      return task;
    })(), FETCH_TIMEOUT_MS + 1000);

    if (!stats) return { stats: null, source: 'failed' };
    return { stats, source: 'dltv' };
  } catch {
    return { stats: null, source: 'timeout' };
  }
}

export { ensureDltvSeriesStatsCacheTable };
