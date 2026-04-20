import { createClient } from 'redis';

const LIVE_HERO_CACHE_KEY = 'dota2hub:live-hero:hot-cache:v1';
const LIVE_HERO_LOCK_KEY = 'dota2hub:live-hero:refresh-lock:v1';
const LIVE_HERO_CACHE_TTL_SEC = 300;

let redisClientPromise = null;
let memoryCacheEntry = null;
let memoryLockExpiresAt = 0;

async function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const client = createClient({ url: redisUrl });
      client.on('error', (error) => {
        console.error('[live-hero-hot-cache] Redis error:', error instanceof Error ? error.message : String(error));
      });
      await client.connect();
      return client;
    })().catch((error) => {
      redisClientPromise = null;
      console.error('[live-hero-hot-cache] Redis connect failed:', error instanceof Error ? error.message : String(error));
      return null;
    });
  }
  return redisClientPromise;
}

function cloneEntry(entry) {
  return entry ? JSON.parse(JSON.stringify(entry)) : null;
}

export async function readLiveHeroHotCache() {
  const client = await getRedisClient();
  if (client) {
    const raw = await client.get(LIVE_HERO_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }
  return cloneEntry(memoryCacheEntry);
}

export async function writeLiveHeroHotCache(entry) {
  if (!entry) return;
  const client = await getRedisClient();
  if (client) {
    await client.set(LIVE_HERO_CACHE_KEY, JSON.stringify(entry), {
      EX: LIVE_HERO_CACHE_TTL_SEC,
    });
    return;
  }
  memoryCacheEntry = cloneEntry(entry);
}

export async function tryAcquireLiveHeroRefreshLock(ttlMs = 4000) {
  const client = await getRedisClient();
  if (client) {
    const result = await client.set(LIVE_HERO_LOCK_KEY, String(Date.now()), {
      NX: true,
      PX: Math.max(1000, Math.trunc(ttlMs)),
    });
    return result === 'OK';
  }

  const now = Date.now();
  if (memoryLockExpiresAt > now) return false;
  memoryLockExpiresAt = now + Math.max(1000, Math.trunc(ttlMs));
  return true;
}

export function clearLiveHeroHotCacheMemoryForTests() {
  memoryCacheEntry = null;
  memoryLockExpiresAt = 0;
}
