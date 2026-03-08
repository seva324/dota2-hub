#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getDb() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL or POSTGRES_URL is required');
  }
  return neon(DATABASE_URL);
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS match_summary (
      match_id BIGINT PRIMARY KEY,
      duration INT,
      start_time TIMESTAMP,
      league_id INT,
      league_name VARCHAR(255),
      radiant_win BOOLEAN,
      radiant_team_id BIGINT,
      radiant_team_name VARCHAR(255),
      radiant_score INT,
      dire_team_id BIGINT,
      dire_team_name VARCHAR(255),
      dire_score INT,
      game_mode INT,
      patch INT,
      region INT,
      cluster INT,
      first_blood_time INT,
      first_blood_player VARCHAR(255),
      tower_status_radiant INT,
      tower_status_dire INT,
      barracks_status_radiant INT,
      barracks_status_dire INT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS player_stats (
      id BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL,
      player_slot INT NOT NULL,
      account_id BIGINT,
      personaname VARCHAR(255),
      hero_id INT,
      hero_name VARCHAR(50),
      kills INT,
      deaths INT,
      assists INT,
      last_hits INT,
      denies INT,
      net_worth INT,
      gold_per_min INT,
      xp_per_min INT,
      hero_damage INT,
      tower_damage INT,
      hero_healing INT,
      stuns DOUBLE PRECISION,
      level INT,
      item_0 INT,
      item_1 INT,
      item_2 INT,
      item_3 INT,
      item_4 INT,
      item_5 INT,
      backpack_0 INT,
      backpack_1 INT,
      backpack_2 INT,
      lane_role INT,
      lane_efficiency_pct INT,
      obs_placed INT,
      sen_placed INT,
      rune_pickups INT,
      teamfight_participation DOUBLE PRECISION
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_match_summary_start_time ON match_summary(start_time DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_match_summary_league_id ON match_summary(league_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_match_summary_radiant_team_id ON match_summary(radiant_team_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_match_summary_dire_team_id ON match_summary(dire_team_id)`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_player_stats_match_slot ON player_stats(match_id, player_slot)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_player_stats_match_id ON player_stats(match_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_player_stats_account_id ON player_stats(account_id)`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_player_stats_account_match_nonnull
    ON player_stats(account_id, match_id)
    WHERE account_id IS NOT NULL
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_player_stats_match_slot_profile_cover
    ON player_stats(match_id, player_slot)
    INCLUDE (account_id, personaname, hero_id)
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_player_stats_hero_id ON player_stats(hero_id)`);
}

async function backfillMatchSummary(db) {
  await db.query(`TRUNCATE TABLE match_summary`);
  const batchSize = 2000;
  let lastMatchId = 0;
  let inserted = 0;

  while (true) {
    const batch = await db.query(`
      WITH selected_matches AS (
        SELECT m.match_id
        FROM matches m
        JOIN match_details md ON md.match_id = m.match_id
        WHERE m.match_id > $1
        ORDER BY m.match_id ASC
        LIMIT $2
      ),
      first_blood AS (
        SELECT
          md.match_id,
          COALESCE(NULLIF(BTRIM(COALESCE(p->>'personaname', p->>'name')), ''), NULL) AS first_blood_player,
          ROW_NUMBER() OVER (PARTITION BY md.match_id ORDER BY (p->>'player_slot')::INT ASC) AS rn
        FROM selected_matches sm
        JOIN match_details md ON md.match_id = sm.match_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
            ELSE '[]'::jsonb
          END
        ) p
        WHERE COALESCE(p->>'firstblood_claimed', '0') IN ('1', 'true', 'TRUE')
          AND COALESCE(p->>'player_slot', '') ~ '^[0-9]+$'
      ),
      inserted_rows AS (
        INSERT INTO match_summary (
          match_id,
          duration,
          start_time,
          league_id,
          league_name,
          radiant_win,
          radiant_team_id,
          radiant_team_name,
          radiant_score,
          dire_team_id,
          dire_team_name,
          dire_score,
          game_mode,
          patch,
          region,
          cluster,
          first_blood_time,
          first_blood_player,
          tower_status_radiant,
          tower_status_dire,
          barracks_status_radiant,
          barracks_status_dire
        )
        SELECT
          m.match_id,
          COALESCE((md.payload->>'duration')::INT, m.duration) AS duration,
          CASE
            WHEN COALESCE((md.payload->>'start_time')::BIGINT, m.start_time) IS NULL THEN NULL
            ELSE TO_TIMESTAMP(COALESCE((md.payload->>'start_time')::BIGINT, m.start_time))
          END AS start_time,
          COALESCE(
            CASE
              WHEN COALESCE(md.payload->>'leagueid', md.payload->'league'->>'leagueid', '') ~ '^[0-9]+$'
                THEN COALESCE(md.payload->>'leagueid', md.payload->'league'->>'leagueid')::INT
              ELSE NULL
            END,
            t.league_id
          ) AS league_id,
          COALESCE(t.name, md.payload->'league'->>'name') AS league_name,
          COALESCE((md.payload->>'radiant_win')::BOOLEAN, m.radiant_win) AS radiant_win,
          CASE WHEN COALESCE(md.payload->>'radiant_team_id', m.radiant_team_id, '') ~ '^[0-9]+$'
            THEN COALESCE(md.payload->>'radiant_team_id', m.radiant_team_id)::BIGINT
            ELSE NULL
          END AS radiant_team_id,
          COALESCE(rt.name, md.payload->>'radiant_name', md.payload->'radiant_team'->>'name') AS radiant_team_name,
          COALESCE((md.payload->>'radiant_score')::INT, m.radiant_score) AS radiant_score,
          CASE WHEN COALESCE(md.payload->>'dire_team_id', m.dire_team_id, '') ~ '^[0-9]+$'
            THEN COALESCE(md.payload->>'dire_team_id', m.dire_team_id)::BIGINT
            ELSE NULL
          END AS dire_team_id,
          COALESCE(dt.name, md.payload->>'dire_name', md.payload->'dire_team'->>'name') AS dire_team_name,
          COALESCE((md.payload->>'dire_score')::INT, m.dire_score) AS dire_score,
          NULLIF(md.payload->>'game_mode', '')::INT AS game_mode,
          NULLIF(md.payload->>'patch', '')::INT AS patch,
          NULLIF(md.payload->>'region', '')::INT AS region,
          NULLIF(md.payload->>'cluster', '')::INT AS cluster,
          NULLIF(md.payload->>'first_blood_time', '')::INT AS first_blood_time,
          fb.first_blood_player,
          NULLIF(md.payload->>'tower_status_radiant', '')::INT AS tower_status_radiant,
          NULLIF(md.payload->>'tower_status_dire', '')::INT AS tower_status_dire,
          NULLIF(md.payload->>'barracks_status_radiant', '')::INT AS barracks_status_radiant,
          NULLIF(md.payload->>'barracks_status_dire', '')::INT AS barracks_status_dire
        FROM selected_matches sm
        JOIN matches m ON m.match_id = sm.match_id
        JOIN match_details md ON md.match_id = m.match_id
        LEFT JOIN tournaments t ON t.league_id = CASE
          WHEN COALESCE(md.payload->>'leagueid', md.payload->'league'->>'leagueid', '') ~ '^[0-9]+$'
            THEN COALESCE(md.payload->>'leagueid', md.payload->'league'->>'leagueid')::INT
          ELSE NULL
        END
        LEFT JOIN teams rt ON rt.team_id = COALESCE(md.payload->>'radiant_team_id', m.radiant_team_id)
        LEFT JOIN teams dt ON dt.team_id = COALESCE(md.payload->>'dire_team_id', m.dire_team_id)
        LEFT JOIN first_blood fb ON fb.match_id = m.match_id AND fb.rn = 1
        RETURNING match_id
      )
      SELECT COUNT(*)::INT AS inserted_count, MAX(match_id)::BIGINT AS last_match_id
      FROM inserted_rows
    `, [lastMatchId, batchSize]);

    const insertedCount = Number(batch[0]?.inserted_count || 0);
    if (!insertedCount) break;
    inserted += insertedCount;
    lastMatchId = Number(batch[0]?.last_match_id || lastMatchId);
  }

  return inserted;
}

async function backfillPlayerStats(db) {
  await db.query(`TRUNCATE TABLE player_stats RESTART IDENTITY`);
  const batchSize = 1000;
  let lastMatchId = 0;
  let inserted = 0;

  while (true) {
    const batch = await db.query(`
      WITH selected_matches AS (
        SELECT md.match_id
        FROM match_details md
        WHERE md.match_id > $1
        ORDER BY md.match_id ASC
        LIMIT $2
      ),
      inserted_rows AS (
        INSERT INTO player_stats (
          match_id,
          player_slot,
          account_id,
          personaname,
          hero_id,
          hero_name,
          kills,
          deaths,
          assists,
          last_hits,
          denies,
          net_worth,
          gold_per_min,
          xp_per_min,
          hero_damage,
          tower_damage,
          hero_healing,
          stuns,
          level,
          item_0,
          item_1,
          item_2,
          item_3,
          item_4,
          item_5,
          backpack_0,
          backpack_1,
          backpack_2,
          lane_role,
          lane_efficiency_pct,
          obs_placed,
          sen_placed,
          rune_pickups,
          teamfight_participation
        )
        SELECT
          md.match_id,
          NULLIF(p->>'player_slot', '')::INT AS player_slot,
          CASE
            WHEN COALESCE(p->>'account_id', p->>'accountId', p->>'accountid', '') ~ '^[0-9]+$'
              THEN COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')::BIGINT
            ELSE NULL
          END AS account_id,
          COALESCE(NULLIF(BTRIM(COALESCE(p->>'personaname', p->>'name')), ''), NULL) AS personaname,
          NULLIF(p->>'hero_id', '')::INT AS hero_id,
          h.name AS hero_name,
          NULLIF(p->>'kills', '')::INT AS kills,
          NULLIF(p->>'deaths', '')::INT AS deaths,
          NULLIF(p->>'assists', '')::INT AS assists,
          NULLIF(p->>'last_hits', '')::INT AS last_hits,
          NULLIF(p->>'denies', '')::INT AS denies,
          NULLIF(p->>'net_worth', '')::INT AS net_worth,
          NULLIF(p->>'gold_per_min', '')::INT AS gold_per_min,
          NULLIF(p->>'xp_per_min', '')::INT AS xp_per_min,
          NULLIF(p->>'hero_damage', '')::INT AS hero_damage,
          NULLIF(p->>'tower_damage', '')::INT AS tower_damage,
          NULLIF(p->>'hero_healing', '')::INT AS hero_healing,
          NULLIF(p->>'stuns', '')::DOUBLE PRECISION AS stuns,
          NULLIF(p->>'level', '')::INT AS level,
          NULLIF(p->>'item_0', '')::INT AS item_0,
          NULLIF(p->>'item_1', '')::INT AS item_1,
          NULLIF(p->>'item_2', '')::INT AS item_2,
          NULLIF(p->>'item_3', '')::INT AS item_3,
          NULLIF(p->>'item_4', '')::INT AS item_4,
          NULLIF(p->>'item_5', '')::INT AS item_5,
          NULLIF(p->>'backpack_0', '')::INT AS backpack_0,
          NULLIF(p->>'backpack_1', '')::INT AS backpack_1,
          NULLIF(p->>'backpack_2', '')::INT AS backpack_2,
          NULLIF(p->>'lane_role', '')::INT AS lane_role,
          CASE
            WHEN COALESCE(p->>'lane_efficiency_pct', '') = '' THEN NULL
            ELSE ROUND((p->>'lane_efficiency_pct')::NUMERIC)::INT
          END AS lane_efficiency_pct,
          COALESCE(NULLIF(p->>'obs_placed', '')::INT, NULLIF(p->>'observers_placed', '')::INT) AS obs_placed,
          COALESCE(NULLIF(p->>'sen_placed', '')::INT, NULLIF(p->>'sentries_placed', '')::INT) AS sen_placed,
          NULLIF(p->>'rune_pickups', '')::INT AS rune_pickups,
          NULLIF(p->>'teamfight_participation', '')::DOUBLE PRECISION AS teamfight_participation
        FROM selected_matches sm
        JOIN match_details md ON md.match_id = sm.match_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
            ELSE '[]'::jsonb
          END
        ) p
        LEFT JOIN heroes h ON h.hero_id = NULLIF(p->>'hero_id', '')::INT
        WHERE COALESCE(p->>'player_slot', '') ~ '^[0-9]+$'
        RETURNING match_id
      )
      SELECT COUNT(*)::INT AS inserted_count, MAX(match_id)::BIGINT AS last_match_id
      FROM inserted_rows
    `, [lastMatchId, batchSize]);

    const insertedCount = Number(batch[0]?.inserted_count || 0);
    if (!insertedCount) break;
    inserted += insertedCount;
    lastMatchId = Number(batch[0]?.last_match_id || lastMatchId);
  }

  return inserted;
}

async function main() {
  const db = getDb();
  await ensureTables(db);
  const matchSummaryRows = await backfillMatchSummary(db);
  const playerStatsRows = await backfillPlayerStats(db);
  const [summaryCount, playerCount] = await Promise.all([
    db.query(`select count(*)::int as c from match_summary`),
    db.query(`select count(*)::int as c from player_stats`),
  ]);
  console.log(JSON.stringify({
    ok: true,
    matchSummaryInserted: matchSummaryRows,
    playerStatsInserted: playerStatsRows,
    matchSummaryCount: summaryCount[0]?.c ?? 0,
    playerStatsCount: playerCount[0]?.c ?? 0,
  }, null, 2));
}

main().catch((error) => {
  console.error('[backfill-match-summary-player-stats] failed:', error?.stack || error?.message || error);
  process.exit(1);
});
