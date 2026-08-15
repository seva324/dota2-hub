/**
 * Neon (Postgres) 持久化缓存 — DLTV 战队 squad role 映射。
 *
 * live-detail 位置号依赖 DLTV 战队页 Active squad（选手 → 1~5 号位）。EdgeOne
 * 出口抓 dltv.org 战队页间歇失败（限速/空 body）→ 位置号时有时无。本地 cron
 * （warm-dltv-local）预热时把 squad 写入本表，EdgeOne 读这里稳定命中。
 * payload 存 [nick|realName(小写), roleKey] 数组（Map 的 entries）。
 */

let ensureTablePromise = null;

export async function ensureTeamSquadCacheTable(db) {
  if (!db) return;
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS team_squad_cache (
        team_slug TEXT PRIMARY KEY,
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

export async function readTeamSquadCache(db, teamSlug) {
  if (!db) return null;
  try {
    const rows = await db`
      SELECT payload, updated_at
      FROM team_squad_cache
      WHERE team_slug = ${String(teamSlug)}
    `;
    const row = rows?.[0];
    if (!row) return null;
    const updatedAt = row.updated_at instanceof Date
      ? row.updated_at.getTime()
      : new Date(String(row.updated_at)).getTime();
    return { payload: row.payload, refreshedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
  } catch (error) {
    console.error('[dltv-squad-cache] read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function writeTeamSquadCache(db, teamSlug, payload) {
  if (!db || !payload) return;
  try {
    await ensureTeamSquadCacheTable(db);
    await db`
      INSERT INTO team_squad_cache (team_slug, payload, updated_at)
      VALUES (${String(teamSlug)}, ${JSON.stringify(payload)}::jsonb, NOW())
      ON CONFLICT (team_slug) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `;
  } catch (error) {
    console.error('[dltv-squad-cache] write failed:', error instanceof Error ? error.message : String(error));
  }
}
