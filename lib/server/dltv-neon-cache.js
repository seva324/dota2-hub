/**
 * Neon (Postgres) 统一缓存 — 取代 Redis 热缓存。
 *
 * Redis 在生产不可达（降级成 per-instance 内存，跨实例丢失 → 冷启动直连 DLTV 反爬）。
 * 改用 Neon 共享缓存：列表/live/match-page 都存这里，预热 cron 定时写入。
 * 无 db（本地/测试）时降级 per-instance 内存 Map。
 */

let ensureTablePromise = null;

export async function ensureDltvCacheTable(db) {
  if (!db) return;
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS dltv_cache (
        cache_key TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS dltv_cache_lock (
        cache_key TEXT PRIMARY KEY,
        acquired_at TIMESTAMP DEFAULT NOW()
      )
    `);
  })().catch((error) => {
    ensureTablePromise = null;
    throw error;
  });
  return ensureTablePromise;
}

const memoryCache = new Map();
const memoryLocks = new Map();

function cloneEntry(entry) {
  return entry ? JSON.parse(JSON.stringify(entry)) : null;
}

function parseTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function readDltvCache(db, key) {
  if (!db) return cloneEntry(memoryCache.get(String(key)) || null);
  try {
    const rows = await db`
      SELECT payload, updated_at
      FROM dltv_cache
      WHERE cache_key = ${String(key)}
    `;
    const row = rows?.[0];
    if (!row) return null;
    return { payload: row.payload, refreshedAt: parseTimestamp(row.updated_at) };
  } catch (error) {
    console.error('[dltv-neon-cache] read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function writeDltvCache(db, key, entry) {
  if (!entry) return;
  const normalized = String(key);
  if (!db) {
    memoryCache.set(normalized, cloneEntry(entry));
    return;
  }
  try {
    await ensureDltvCacheTable(db);
    await db`
      INSERT INTO dltv_cache (cache_key, payload, updated_at)
      VALUES (${normalized}, ${JSON.stringify(entry.payload)}::jsonb, NOW())
      ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  } catch (error) {
    console.error('[dltv-neon-cache] write failed:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Neon 原子锁：INSERT ... ON CONFLICT，仅当旧锁过期时更新并返回行 → 抢锁成功。
 * 用于跨实例的刷新单飞，避免多实例对同一缓存并发抓取 DLTV。
 */
export async function tryAcquireDltvCacheLock(db, key, ttlMs = 4000) {
  const normalized = String(key);
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  if (!db) {
    const now = Date.now();
    const expiresAt = memoryLocks.get(normalized) || 0;
    if (expiresAt > now) return false;
    memoryLocks.set(normalized, now + ttlMs);
    return true;
  }
  try {
    await ensureDltvCacheTable(db);
    const rows = await db`
      INSERT INTO dltv_cache_lock (cache_key, acquired_at)
      VALUES (${normalized}, NOW())
      ON CONFLICT (cache_key) DO UPDATE SET acquired_at = NOW()
      WHERE dltv_cache_lock.acquired_at < NOW() - make_interval(secs => ${ttlSec})
      RETURNING cache_key
    `;
    return Boolean(rows?.length);
  } catch (error) {
    console.error('[dltv-neon-cache] lock failed:', error instanceof Error ? error.message : String(error));
    // 锁失败时放行（降级为不锁，让内存 single-flight 兜底）
    return true;
  }
}

export function clearDltvCacheMemoryForTests() {
  memoryCache.clear();
  memoryLocks.clear();
}
