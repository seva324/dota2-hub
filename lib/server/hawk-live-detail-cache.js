/**
 * Neon (Postgres) 持久化缓存 — hawk.live series detail 完整解析结果。
 *
 * live detail 页每次轮询命中该缓存；缓存过期（~20s）后重新抓取 hawk.live。
 * 按 series_id 独立存储，payload 含比分/净财富/建筑/BP/经济曲线。
 */

let ensureTablePromise = null;

export async function ensureHawkLiveDetailCacheTable(db) {
  if (!db) return;
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS hawk_live_detail_cache (
        series_id BIGINT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  })().catch((error) => {
    ensureTablePromise = null;
    throw error;
  });
  return ensureTablePromise;
}

export async function readHawkLiveDetailCache(db, seriesId) {
  if (!db) return null;
  try {
    const rows = await db`
      SELECT payload, updated_at
      FROM hawk_live_detail_cache
      WHERE series_id = ${Number(seriesId)}
    `;
    const row = rows?.[0];
    if (!row) return null;
    const updatedAt = row.updated_at instanceof Date
      ? row.updated_at.getTime()
      : new Date(String(row.updated_at)).getTime();
    return { payload: row.payload, refreshedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
  } catch (error) {
    console.error('[hawk-live-detail-cache] read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function writeHawkLiveDetailCache(db, seriesId, payload) {
  if (!db || !payload) return;
  try {
    await ensureHawkLiveDetailCacheTable(db);
    await db`
      INSERT INTO hawk_live_detail_cache (series_id, payload, updated_at)
      VALUES (${Number(seriesId)}, ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (series_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  } catch (error) {
    console.error('[hawk-live-detail-cache] write failed:', error instanceof Error ? error.message : String(error));
  }
}
