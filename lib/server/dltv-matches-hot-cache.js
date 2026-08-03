import { createClient } from 'redis';

const DLTV_CACHE_PREFIX = 'dota2hub:dltv-matches:hot-cache:v1';
const DLTV_LOCK_PREFIX = 'dota2hub:dltv-matches:refresh-lock:v1';
// Redis 键 TTL 需覆盖预热 cron 间隔（10min）+ 容错余量：太短会提前过期，
// 冷实例 Redis 未命中 → 用户流量触发 DLTV 抓取。
const DLTV_CACHE_TTL_SEC = 900;

let redisClientPromise = null;
const memoryCache = new Map();
const memoryLocks = new Map();
// Redis 不可达时冷却 10s，避免每个请求都白等 connectTimeout。
let redisDisabledUntil = 0;

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  if (Date.now() < redisDisabledUntil) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({
        url: redisUrl,
        socket: {
          // connect 有界：Redis 挂掉时快速失败降级内存缓存，不拖死 API。
          connectTimeout: 3000,
          reconnectStrategy: false,
        },
      });
      client.on('error', (error) => {
        console.error('[dltv-matches-hot-cache] Redis error:', error instanceof Error ? error.message : String(error));
      });
      await client.connect();
      return client;
    })().catch((error) => {
      redisClientPromise = null;
      redisDisabledUntil = Date.now() + 10_000;
      console.error('[dltv-matches-hot-cache] Redis connect failed:', error instanceof Error ? error.message : String(error));
      return null;
    });
  }
  return redisClientPromise;
}

function cloneEntry(entry) {
  return entry ? JSON.parse(JSON.stringify(entry)) : null;
}

function cacheKey(key) {
  return `${DLTV_CACHE_PREFIX}:${String(key)}`;
}

function lockKey(key) {
  return `${DLTV_LOCK_PREFIX}:${String(key)}`;
}

export async function readDltvMatchesHotCache(key) {
  const client = await getRedisClient();
  if (client) {
    const raw = await client.get(cacheKey(key));
    if (!raw) return null;
    return JSON.parse(raw);
  }
  return cloneEntry(memoryCache.get(String(key)) || null);
}

export async function writeDltvMatchesHotCache(key, entry) {
  if (!entry) return;
  const client = await getRedisClient();
  const normalized = String(key);
  if (client) {
    await client.set(cacheKey(normalized), JSON.stringify(entry), {
      EX: DLTV_CACHE_TTL_SEC,
    });
    return;
  }
  memoryCache.set(normalized, cloneEntry(entry));
}

export async function tryAcquireDltvMatchesRefreshLock(key, ttlMs = 4000) {
  const client = await getRedisClient();
  const normalized = String(key);
  if (client) {
    const result = await client.set(lockKey(normalized), String(Date.now()), {
      NX: true,
      PX: Math.max(1000, Math.trunc(ttlMs)),
    });
    return result === 'OK';
  }

  const now = Date.now();
  const expiresAt = memoryLocks.get(normalized) || 0;
  if (expiresAt > now) return false;
  memoryLocks.set(normalized, now + Math.max(1000, Math.trunc(ttlMs)));
  return true;
}

export function clearDltvMatchesHotCacheMemoryForTests() {
  memoryCache.clear();
  memoryLocks.clear();
}
