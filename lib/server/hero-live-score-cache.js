import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

export async function ensureHeroLiveScoresTable(db = getDb()) {
  if (!db) return null;
  await db.query(`
    CREATE TABLE IF NOT EXISTS hero_live_scores (
      series_key TEXT PRIMARY KEY,
      upcoming_series_id TEXT,
      upcoming_source TEXT,
      source_series_id TEXT,
      source_slug TEXT,
      league_name TEXT,
      team1_name TEXT,
      team2_name TEXT,
      status TEXT NOT NULL DEFAULT 'live',
      is_live BOOLEAN NOT NULL DEFAULT true,
      payload JSONB NOT NULL,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notified_start_at TIMESTAMPTZ,
      notified_end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_hero_live_scores_live ON hero_live_scores(is_live, last_seen_at DESC)`);
  return db;
}

export async function getCurrentHeroLiveScore(db = getDb(), maxAgeSeconds = 600) {
  const rows = await listRecentActiveHeroLiveScores(db, maxAgeSeconds, 1);
  return rows[0] || null;
}

export async function listRecentActiveHeroLiveScores(db = getDb(), maxAgeSeconds = 600, limit = 20) {
  if (!db) return [];
  await ensureHeroLiveScoresTable(db);
  const rows = await db.query(
    `SELECT *
     FROM hero_live_scores
     WHERE is_live = true
       AND last_seen_at >= NOW() - ($1::text || ' seconds')::interval
     ORDER BY last_seen_at DESC
     LIMIT $2`,
    [String(maxAgeSeconds), Math.max(1, Number(limit) || 20)]
  );
  return rows;
}

export async function upsertHeroLiveScore(snapshot, db = getDb()) {
  if (!db || !snapshot?.series_key) return null;
  await ensureHeroLiveScoresTable(db);
  const rows = await db.query(
    `INSERT INTO hero_live_scores (
      series_key, upcoming_series_id, upcoming_source, source_series_id, source_slug,
      league_name, team1_name, team2_name, status, is_live, payload, started_at,
      ended_at, last_seen_at, notified_start_at, notified_end_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,
      COALESCE($12::timestamptz, NOW()),$13::timestamptz,COALESCE($14::timestamptz, NOW()),$15::timestamptz,$16::timestamptz,NOW()
    )
    ON CONFLICT (series_key) DO UPDATE SET
      upcoming_series_id = EXCLUDED.upcoming_series_id,
      upcoming_source = EXCLUDED.upcoming_source,
      source_series_id = EXCLUDED.source_series_id,
      source_slug = EXCLUDED.source_slug,
      league_name = EXCLUDED.league_name,
      team1_name = EXCLUDED.team1_name,
      team2_name = EXCLUDED.team2_name,
      status = EXCLUDED.status,
      is_live = EXCLUDED.is_live,
      payload = EXCLUDED.payload,
      started_at = COALESCE(hero_live_scores.started_at, EXCLUDED.started_at),
      ended_at = EXCLUDED.ended_at,
      last_seen_at = EXCLUDED.last_seen_at,
      notified_start_at = COALESCE(hero_live_scores.notified_start_at, EXCLUDED.notified_start_at),
      notified_end_at = EXCLUDED.notified_end_at,
      updated_at = NOW()
    RETURNING *`,
    [
      snapshot.series_key,
      snapshot.upcoming_series_id || null,
      snapshot.upcoming_source || 'upcoming_series',
      snapshot.source_series_id || null,
      snapshot.source_slug || null,
      snapshot.league_name || null,
      snapshot.team1_name || null,
      snapshot.team2_name || null,
      snapshot.status || 'live',
      snapshot.is_live !== false,
      JSON.stringify(snapshot.payload || {}),
      snapshot.started_at || null,
      snapshot.ended_at || null,
      snapshot.last_seen_at || null,
      snapshot.notified_start_at || null,
      snapshot.notified_end_at || null,
    ]
  );
  return rows[0] || null;
}

export async function markHeroLiveScoreEnded(seriesKey, options = {}, db = getDb()) {
  if (!db || !seriesKey) return null;
  await ensureHeroLiveScoresTable(db);
  const rows = await db.query(
    `UPDATE hero_live_scores
     SET is_live = false,
         status = $2,
         ended_at = COALESCE($3::timestamptz, NOW()),
         last_seen_at = COALESCE($3::timestamptz, NOW()),
         notified_end_at = COALESCE(notified_end_at, $4::timestamptz),
         updated_at = NOW()
     WHERE series_key = $1
     RETURNING *`,
    [seriesKey, options.status || 'ended', options.ended_at || null, options.notified_end_at || null]
  );
  return rows[0] || null;
}

export async function listActiveHeroLiveScores(db = getDb()) {
  if (!db) return [];
  await ensureHeroLiveScoresTable(db);
  return db.query(`SELECT * FROM hero_live_scores WHERE is_live = true ORDER BY last_seen_at DESC`);
}
