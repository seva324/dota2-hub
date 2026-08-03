/**
 * live-hero 热缓存 — Neon 后端（去 Redis）。
 *
 * 保留原导出签名（read/write/tryAcquire），live-hero-service 零改动。
 */

import { getDb } from '../db.js';
import {
  readDltvCache,
  writeDltvCache,
  tryAcquireDltvCacheLock,
  clearDltvCacheMemoryForTests as clearNeonMemory,
} from './dltv-neon-cache.js';

const LIVE_HERO_CACHE_KEY = 'live-hero';

export async function readLiveHeroHotCache() {
  return readDltvCache(getDb(), LIVE_HERO_CACHE_KEY);
}

export async function writeLiveHeroHotCache(entry) {
  return writeDltvCache(getDb(), LIVE_HERO_CACHE_KEY, entry);
}

export async function tryAcquireLiveHeroRefreshLock(ttlMs = 4000) {
  return tryAcquireDltvCacheLock(getDb(), LIVE_HERO_CACHE_KEY, ttlMs);
}

export function clearLiveHeroHotCacheMemoryForTests() {
  clearNeonMemory();
}
