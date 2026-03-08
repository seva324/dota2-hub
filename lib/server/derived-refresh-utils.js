let ensureDerivedRefreshIndexesPromise = null;

export function parsePositiveInt(value, fallback, { min = 1, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized < min) return fallback;
  return Math.min(normalized, max);
}

export async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(24, Math.trunc(Number(concurrency || 1))));
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, list.length || 1) }, () => run()));
}

export async function ensureDerivedRefreshIndexes(db) {
  if (!ensureDerivedRefreshIndexesPromise) {
    ensureDerivedRefreshIndexesPromise = (async () => {
      const statements = [
        'CREATE INDEX IF NOT EXISTS idx_matches_radiant_team_start_time ON matches(radiant_team_id, start_time DESC)',
        'CREATE INDEX IF NOT EXISTS idx_matches_dire_team_start_time ON matches(dire_team_id, start_time DESC)',
        'CREATE INDEX IF NOT EXISTS idx_upcoming_series_radiant_team_start_time ON upcoming_series(radiant_team_id, start_time ASC)',
        'CREATE INDEX IF NOT EXISTS idx_upcoming_series_dire_team_start_time ON upcoming_series(dire_team_id, start_time ASC)',
        'CREATE INDEX IF NOT EXISTS idx_pro_players_team_id ON pro_players(team_id)',
      ];

      for (const sql of statements) {
        await db.query(sql);
      }
    })().catch((error) => {
      ensureDerivedRefreshIndexesPromise = null;
      throw error;
    });
  }

  await ensureDerivedRefreshIndexesPromise;
}
