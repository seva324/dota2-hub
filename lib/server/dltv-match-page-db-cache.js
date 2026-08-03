/**
 * Neon (Postgres) 持久化缓存 — DLTV match 详情页。
 *
 * match-page payload 较大（~1MB），不放进 30MB Redis（会挤掉 live/列表数据），
 * 改存 Neon。预热 cron 定时写入，用户请求先读这里，避免直连 DLTV 触发反爬。
 * Neon 按 compute time 计费：读取只用单点 PK 查询；预热用批量新鲜度检查跳过未过期的。
 */

let ensureTablePromise = null;

export async function ensureDltvMatchPageCacheTable(db) {
  if (!db) return;
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS dltv_match_page_cache (
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

export async function readDltvMatchPageCache(db, seriesId) {
  if (!db) return null;
  try {
    const rows = await db`
      SELECT payload, updated_at
      FROM dltv_match_page_cache
      WHERE series_id = ${Number(seriesId)}
    `;
    const row = rows?.[0];
    if (!row) return null;
    const updatedAt = row.updated_at instanceof Date
      ? row.updated_at.getTime()
      : new Date(String(row.updated_at)).getTime();
    return { payload: row.payload, refreshedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
  } catch (error) {
    console.error('[dltv-match-page-db-cache] read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function writeDltvMatchPageCache(db, seriesId, payload) {
  if (!db || !payload) return;
  try {
    await ensureDltvMatchPageCacheTable(db);
    await db`
      INSERT INTO dltv_match_page_cache (series_id, payload, updated_at)
      VALUES (${Number(seriesId)}, ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (series_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  } catch (error) {
    console.error('[dltv-match-page-db-cache] write failed:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * 批量返回列表中"已新鲜"（updated_at 距今 < ttlMs）的 series_id 集合。
 * 预热用：一次查询跳过无需重抓的已完成比赛，省 DLTV 抓取 + Neon compute。
 */
export async function freshDltvMatchPageSeriesIds(db, seriesIds, ttlMs) {
  if (!db || !Array.isArray(seriesIds) || seriesIds.length === 0) return new Set();
  const ids = seriesIds.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return new Set();
  try {
    const rows = await db`
      SELECT series_id, updated_at
      FROM dltv_match_page_cache
      WHERE series_id = ANY(${ids})
    `;
    const cutoff = Date.now() - ttlMs;
    const fresh = new Set();
    for (const row of rows || []) {
      const updatedAt = row.updated_at instanceof Date
        ? row.updated_at.getTime()
        : new Date(String(row.updated_at)).getTime();
      if (Number.isFinite(updatedAt) && updatedAt >= cutoff) fresh.add(Number(row.series_id));
    }
    return fresh;
  } catch (error) {
    console.error('[dltv-match-page-db-cache] fresh batch failed:', error instanceof Error ? error.message : String(error));
    return new Set();
  }
}
