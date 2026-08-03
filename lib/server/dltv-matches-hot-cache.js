/**
 * DLTV 列表/live 热缓存 — Neon 后端（去 Redis）。
 *
 * Redis 在生产不可达 → 改存 Neon 共享缓存，预热 cron 定时写入。
 * 保留原导出签名（read/write/tryAcquire），dltv-matches-service 与 dltv-warm 零改动。
 */

import { getDb } from '../db.js';
import {
  readDltvCache,
  writeDltvCache,
  tryAcquireDltvCacheLock,
  clearDltvCacheMemoryForTests as clearNeonMemory,
} from './dltv-neon-cache.js';

export async function readDltvMatchesHotCache(key) {
  return readDltvCache(getDb(), key);
}

export async function writeDltvMatchesHotCache(key, entry) {
  return writeDltvCache(getDb(), key, entry);
}

export async function tryAcquireDltvMatchesRefreshLock(key, ttlMs = 4000) {
  return tryAcquireDltvCacheLock(getDb(), key, ttlMs);
}

export function clearDltvMatchesHotCacheMemoryForTests() {
  clearNeonMemory();
}
