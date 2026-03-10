#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { runSyncOpenDota } from '../../lib/server/sync-opendota.js';
import { ensurePlayerProfileDerivedIndexes } from '../../lib/server/player-profile-cache.js';
import { sendTelegramMessage } from './telegram-util.mjs';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const OPENDOTA = 'https://api.opendota.com/api';
const OPENDOTA_API_KEY = process.env.OPENDOTA_API_KEY;
const db = neon(DATABASE_URL);

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
      continue;
    }
    result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
  }
  return result;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendJsonLine(filePath, value) {
  ensureDir(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const requestUrl = new URL(url);
  if (OPENDOTA_API_KEY && requestUrl.hostname === 'api.opendota.com') {
    requestUrl.searchParams.set('api_key', OPENDOTA_API_KEY);
  }
  const res = await fetch(requestUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function ensureDerivedTables() {
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
  await db.query(`CREATE INDEX IF NOT EXISTS idx_player_stats_hero_id ON player_stats(hero_id)`);
  await ensurePlayerProfileDerivedIndexes(db);
}

async function backfillMissingMatchDetails({ targetMatchIds = [], limit = 10, maxRounds = 3, delayMs = 1100 } = {}) {
  let totalInserted = 0;
  let totalFailed = 0;
  let rounds = 0;

  await db.query(`
    CREATE TABLE IF NOT EXISTS match_details (
      match_id BIGINT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const normalizedTargetMatchIds = Array.isArray(targetMatchIds)
    ? targetMatchIds.map((id) => Math.trunc(Number(id))).filter((id) => Number.isFinite(id))
    : [];

  if (normalizedTargetMatchIds.length === 0) {
    return { rounds, inserted: totalInserted, failed: totalFailed, scopedMatches: 0 };
  }

  while (rounds < maxRounds) {
    rounds += 1;
    const targets = await db.query(
      `SELECT m.match_id
       FROM matches m
       LEFT JOIN match_details d ON d.match_id = m.match_id
       WHERE d.match_id IS NULL
         AND m.match_id = ANY($1::bigint[])
       ORDER BY m.start_time DESC
       LIMIT $2`,
      [normalizedTargetMatchIds, limit]
    );
    if (!targets.length) break;

    for (const row of targets) {
      const matchId = Number(row.match_id);
      if (!Number.isFinite(matchId)) continue;
      try {
        const detail = await fetchJSON(`${OPENDOTA}/matches/${matchId}`);
        await db.query(
          `INSERT INTO match_details (match_id, payload, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (match_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
          [Math.trunc(matchId), JSON.stringify(detail)]
        );
        totalInserted += 1;
      } catch (error) {
        totalFailed += 1;
        console.error(`[opendota-pipeline] backfill match detail failed ${matchId}:`, error?.message || error);
      }
      await sleep(delayMs);
    }
  }

  return { rounds, inserted: totalInserted, failed: totalFailed, scopedMatches: normalizedTargetMatchIds.length };
}

async function upsertDerivedForRecentMatchDetails(sinceIso) {
  await ensureDerivedTables();
  const ids = await db.query(
    `SELECT match_id::BIGINT
     FROM match_details
     WHERE updated_at >= $1::timestamptz
     ORDER BY updated_at DESC, match_id DESC`,
    [sinceIso]
  );
  const matchIds = ids.map((row) => Number(row.match_id)).filter((n) => Number.isFinite(n));
  if (!matchIds.length) return { matches: 0, playerStatsRows: 0 };

  await db.query(
    `WITH selected_matches AS (
       SELECT unnest($1::bigint[]) AS match_id
     ),
     first_blood AS (
       SELECT
         md.match_id,
         COALESCE(NULLIF(BTRIM(COALESCE(p->>'personaname', p->>'name')), ''), NULL) AS first_blood_player,
         ROW_NUMBER() OVER (PARTITION BY md.match_id ORDER BY (p->>'player_slot')::INT ASC) AS rn
       FROM selected_matches sm
       JOIN match_details md ON md.match_id = sm.match_id
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players' ELSE '[]'::jsonb END
       ) p
       WHERE COALESCE(p->>'firstblood_claimed', '0') IN ('1', 'true', 'TRUE')
         AND COALESCE(p->>'player_slot', '') ~ '^[0-9]+$'
     )
     INSERT INTO match_summary (
       match_id, duration, start_time, league_id, league_name, radiant_win,
       radiant_team_id, radiant_team_name, radiant_score,
       dire_team_id, dire_team_name, dire_score,
       game_mode, patch, region, cluster, first_blood_time, first_blood_player,
       tower_status_radiant, tower_status_dire, barracks_status_radiant, barracks_status_dire
     )
     SELECT
       m.match_id,
       COALESCE((md.payload->>'duration')::INT, m.duration) AS duration,
       CASE WHEN COALESCE((md.payload->>'start_time')::BIGINT, m.start_time) IS NULL THEN NULL
            ELSE TO_TIMESTAMP(COALESCE((md.payload->>'start_time')::BIGINT, m.start_time)) END AS start_time,
       COALESCE(
         CASE WHEN COALESCE(md.payload->>'leagueid', md.payload->'league'->>'leagueid', '') ~ '^[0-9]+$'
              THEN COALESCE(md.payload->>'leagueid', md.payload->'league'->>'leagueid')::INT ELSE NULL END,
         t.league_id
       ) AS league_id,
       COALESCE(t.name, md.payload->'league'->>'name') AS league_name,
       COALESCE((md.payload->>'radiant_win')::BOOLEAN, m.radiant_win) AS radiant_win,
       CASE WHEN COALESCE(md.payload->>'radiant_team_id', m.radiant_team_id, '') ~ '^[0-9]+$'
            THEN COALESCE(md.payload->>'radiant_team_id', m.radiant_team_id)::BIGINT ELSE NULL END AS radiant_team_id,
       COALESCE(rt.name, md.payload->>'radiant_name', md.payload->'radiant_team'->>'name') AS radiant_team_name,
       COALESCE((md.payload->>'radiant_score')::INT, m.radiant_score) AS radiant_score,
       CASE WHEN COALESCE(md.payload->>'dire_team_id', m.dire_team_id, '') ~ '^[0-9]+$'
            THEN COALESCE(md.payload->>'dire_team_id', m.dire_team_id)::BIGINT ELSE NULL END AS dire_team_id,
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
       ELSE NULL END
     LEFT JOIN teams rt ON rt.team_id::TEXT = COALESCE(md.payload->>'radiant_team_id', m.radiant_team_id::TEXT)
     LEFT JOIN teams dt ON dt.team_id::TEXT = COALESCE(md.payload->>'dire_team_id', m.dire_team_id::TEXT)
     LEFT JOIN first_blood fb ON fb.match_id = m.match_id AND fb.rn = 1
     ON CONFLICT (match_id) DO UPDATE SET
       duration = EXCLUDED.duration,
       start_time = EXCLUDED.start_time,
       league_id = EXCLUDED.league_id,
       league_name = EXCLUDED.league_name,
       radiant_win = EXCLUDED.radiant_win,
       radiant_team_id = EXCLUDED.radiant_team_id,
       radiant_team_name = EXCLUDED.radiant_team_name,
       radiant_score = EXCLUDED.radiant_score,
       dire_team_id = EXCLUDED.dire_team_id,
       dire_team_name = EXCLUDED.dire_team_name,
       dire_score = EXCLUDED.dire_score,
       game_mode = EXCLUDED.game_mode,
       patch = EXCLUDED.patch,
       region = EXCLUDED.region,
       cluster = EXCLUDED.cluster,
       first_blood_time = EXCLUDED.first_blood_time,
       first_blood_player = EXCLUDED.first_blood_player,
       tower_status_radiant = EXCLUDED.tower_status_radiant,
       tower_status_dire = EXCLUDED.tower_status_dire,
       barracks_status_radiant = EXCLUDED.barracks_status_radiant,
       barracks_status_dire = EXCLUDED.barracks_status_dire`,
    [matchIds]
  );

  await db.query(`DELETE FROM player_stats WHERE match_id = ANY($1::bigint[])`, [matchIds]);

  const inserted = await db.query(
    `WITH selected_matches AS (
       SELECT unnest($1::bigint[]) AS match_id
     ),
     inserted_rows AS (
       INSERT INTO player_stats (
         match_id, player_slot, account_id, personaname, hero_id, hero_name,
         kills, deaths, assists, last_hits, denies, net_worth,
         gold_per_min, xp_per_min, hero_damage, tower_damage, hero_healing,
         stuns, level, item_0, item_1, item_2, item_3, item_4, item_5,
         backpack_0, backpack_1, backpack_2, lane_role, lane_efficiency_pct,
         obs_placed, sen_placed, rune_pickups, teamfight_participation
       )
       SELECT
         md.match_id,
         NULLIF(p->>'player_slot', '')::INT AS player_slot,
         CASE WHEN COALESCE(p->>'account_id', p->>'accountId', p->>'accountid', '') ~ '^[0-9]+$'
              THEN COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')::BIGINT ELSE NULL END AS account_id,
         COALESCE(NULLIF(BTRIM(COALESCE(p->>'personaname', p->>'name')), ''), NULL) AS personaname,
         NULLIF(p->>'hero_id', '')::INT AS hero_id,
         h.name AS hero_name,
         NULLIF(p->>'kills', '')::INT,
         NULLIF(p->>'deaths', '')::INT,
         NULLIF(p->>'assists', '')::INT,
         NULLIF(p->>'last_hits', '')::INT,
         NULLIF(p->>'denies', '')::INT,
         NULLIF(p->>'net_worth', '')::INT,
         NULLIF(p->>'gold_per_min', '')::INT,
         NULLIF(p->>'xp_per_min', '')::INT,
         NULLIF(p->>'hero_damage', '')::INT,
         NULLIF(p->>'tower_damage', '')::INT,
         NULLIF(p->>'hero_healing', '')::INT,
         NULLIF(p->>'stuns', '')::DOUBLE PRECISION,
         NULLIF(p->>'level', '')::INT,
         NULLIF(p->>'item_0', '')::INT,
         NULLIF(p->>'item_1', '')::INT,
         NULLIF(p->>'item_2', '')::INT,
         NULLIF(p->>'item_3', '')::INT,
         NULLIF(p->>'item_4', '')::INT,
         NULLIF(p->>'item_5', '')::INT,
         NULLIF(p->>'backpack_0', '')::INT,
         NULLIF(p->>'backpack_1', '')::INT,
         NULLIF(p->>'backpack_2', '')::INT,
         NULLIF(p->>'lane_role', '')::INT,
         CASE WHEN COALESCE(p->>'lane_efficiency_pct', '') = '' THEN NULL ELSE ROUND((p->>'lane_efficiency_pct')::NUMERIC)::INT END,
         COALESCE(NULLIF(p->>'obs_placed', '')::INT, NULLIF(p->>'observers_placed', '')::INT),
         COALESCE(NULLIF(p->>'sen_placed', '')::INT, NULLIF(p->>'sentries_placed', '')::INT),
         NULLIF(p->>'rune_pickups', '')::INT,
         NULLIF(p->>'teamfight_participation', '')::DOUBLE PRECISION
       FROM selected_matches sm
       JOIN match_details md ON md.match_id = sm.match_id
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players' ELSE '[]'::jsonb END
       ) p
       LEFT JOIN heroes h ON h.hero_id = NULLIF(p->>'hero_id', '')::INT
       WHERE COALESCE(p->>'player_slot', '') ~ '^[0-9]+$'
       RETURNING 1
     )
     SELECT count(*)::int AS inserted_count FROM inserted_rows`,
    [matchIds]
  );

  return { matches: matchIds.length, playerStatsRows: inserted[0]?.inserted_count || 0 };
}

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL or POSTGRES_URL is required');
  const args = parseArgs(process.argv.slice(2));
  const logPath = args.log || '/tmp/d2hub-opendota-pipeline.jsonl';
  const notify = args.notify !== '0';
  const backfillLimit = Number(args['backfill-limit'] || 10);
  const backfillRounds = Number(args['backfill-rounds'] || 3);
  const backfillDelayMs = Number(args['backfill-delay-ms'] || 1100);
  const startedAt = new Date().toISOString();

  if (notify) {
    await sendTelegramMessage([`🚀 d2hub sync-opendota pipeline`, `状态: 已启动`, `时间: ${startedAt}`].join('\n')).catch(() => {});
  }

  const sync = await runSyncOpenDota();
  const missing = await backfillMissingMatchDetails({
    targetMatchIds: sync?.newMatchIds || [],
    limit: backfillLimit,
    maxRounds: backfillRounds,
    delayMs: backfillDelayMs,
  });
  const derived = await upsertDerivedForRecentMatchDetails(startedAt);

  const record = { ts: startedAt, ok: true, sync, missingMatchDetails: missing, derived };
  appendJsonLine(logPath, record);

  if (notify) {
    await sendTelegramMessage([
      `🕐 d2hub sync-opendota pipeline`,
      `状态: ✅ 已完成`,
      `时间: ${startedAt}`,
      `matches: ${sync?.stats?.matches ?? 0}`,
      `series: ${sync?.stats?.series ?? 0}`,
      `missing match_details inserted/failed: ${missing.inserted}/${missing.failed}`,
      `derived matches/player_stats: ${derived.matches}/${derived.playerStatsRows}`,
    ].join('\n')).catch(() => {});
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  await sendTelegramMessage([
    `🕐 d2hub sync-opendota pipeline`,
    `状态: ❌ 失败`,
    `错误: ${error instanceof Error ? error.message : String(error)}`,
  ].join('\n')).catch(() => {});
  process.exit(1);
});
