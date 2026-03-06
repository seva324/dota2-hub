import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const OPENDOTA = 'https://api.opendota.com/api';

function getDb() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL not configured');
  }
  return neon(DATABASE_URL);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBool(value) {
  return value === true || value === 1 || value === '1';
}

function convertSeriesType(seriesType) {
  if (seriesType === null || seriesType === undefined || seriesType === '') return 'BO3';
  const map = { 0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO2' };
  if (typeof seriesType === 'string') {
    const normalized = seriesType.toUpperCase().trim();
    if (normalized.startsWith('BO')) return normalized;
    const parsed = Number(normalized);
    return Number.isInteger(parsed) && map[parsed] ? map[parsed] : 'BO3';
  }
  return map[seriesType] || 'BO3';
}

function parseArgs(argv) {
  const options = {
    top: 60,
    days: 730,
    pageLimit: 10,
    pageSize: 500,
    phase: 'all',
    listDelayMs: 250,
    detailDelayMs: 1100,
    detailLimit: 0,
    output: '',
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg.startsWith('--top=')) options.top = Math.max(1, Number(arg.split('=')[1]) || options.top);
    else if (arg.startsWith('--days=')) options.days = Math.max(1, Number(arg.split('=')[1]) || options.days);
    else if (arg.startsWith('--page-limit=')) options.pageLimit = Math.max(1, Number(arg.split('=')[1]) || options.pageLimit);
    else if (arg.startsWith('--page-size=')) options.pageSize = Math.max(1, Math.min(500, Number(arg.split('=')[1]) || options.pageSize));
    else if (arg.startsWith('--phase=')) options.phase = String(arg.split('=')[1] || options.phase).toLowerCase();
    else if (arg.startsWith('--list-delay-ms=')) options.listDelayMs = Math.max(0, Number(arg.split('=')[1]) || options.listDelayMs);
    else if (arg.startsWith('--detail-delay-ms=')) options.detailDelayMs = Math.max(0, Number(arg.split('=')[1]) || options.detailDelayMs);
    else if (arg.startsWith('--detail-limit=')) options.detailLimit = Math.max(0, Number(arg.split('=')[1]) || options.detailLimit);
    else if (arg.startsWith('--output=')) options.output = String(arg.split('=')[1] || '').trim();
  }

  return options;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS match_details (
      match_id BIGINT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function selectHotPlayers(db, top) {
  const nowTs = Math.floor(Date.now() / 1000);
  const sinceTs = nowTs - 90 * 24 * 60 * 60;
  return db.query(
    `
      WITH appearances AS (
        SELECT
          NULLIF(BTRIM(COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')), '')::BIGINT AS account_id,
          COUNT(*)::INT AS appearances
        FROM matches m
        JOIN match_details md ON md.match_id = m.match_id
        LEFT JOIN series s ON s.series_id = m.series_id
        LEFT JOIN tournaments t ON t.league_id = s.league_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
            ELSE '[]'::jsonb
          END
        ) p
        WHERE m.start_time >= $1
          AND UPPER(COALESCE(t.tier, '')) = 'S'
          AND NULLIF(BTRIM(COALESCE(p->>'account_id', p->>'accountId', p->>'accountid')), '') ~ '^[0-9]+$'
        GROUP BY 1
      )
      SELECT a.account_id, a.appearances, pp.name, pp.team_name
      FROM appearances a
      JOIN pro_players pp ON pp.account_id = a.account_id
      ORDER BY a.appearances DESC, a.account_id ASC
      LIMIT $2
    `,
    [sinceTs, top]
  );
}

async function fetchPlayerMatches(accountId, options) {
  const cutoffTs = Math.floor(Date.now() / 1000) - options.days * 24 * 60 * 60;
  const matches = [];

  for (let page = 0; page < options.pageLimit; page += 1) {
    const offset = page * options.pageSize;
    const url = `${OPENDOTA}/players/${accountId}/matches?limit=${options.pageSize}&offset=${offset}&date=${options.days}`;
    const rows = await fetchJSON(url);
    if (!Array.isArray(rows) || rows.length === 0) break;

    let shouldStop = false;
    for (const row of rows) {
      const startTime = toInt(row.start_time) || 0;
      if (startTime < cutoffTs) {
        shouldStop = true;
        continue;
      }
      matches.push({
        match_id: toInt(row.match_id),
        start_time: startTime,
        duration: toInt(row.duration) || 0,
        radiant_win: toBool(row.radiant_win),
        lobby_type: toInt(row.lobby_type),
        game_mode: toInt(row.game_mode),
      });
    }

    if (shouldStop || rows.length < options.pageSize) break;
    if (options.listDelayMs > 0) await sleep(options.listDelayMs);
  }

  return matches.filter((row) => row.match_id);
}

async function upsertSkeletonMatches(db, matches) {
  let inserted = 0;
  for (const match of matches) {
    const result = await db.query(
      `
        INSERT INTO matches (
          match_id,
          radiant_win,
          start_time,
          duration,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (match_id) DO UPDATE SET
          start_time = COALESCE(matches.start_time, EXCLUDED.start_time),
          duration = CASE WHEN COALESCE(matches.duration, 0) = 0 THEN EXCLUDED.duration ELSE matches.duration END,
          radiant_win = COALESCE(matches.radiant_win, EXCLUDED.radiant_win),
          updated_at = NOW()
        RETURNING match_id
      `,
      [match.match_id, match.radiant_win, match.start_time, match.duration]
    );
    if (result.length > 0) inserted += 1;
  }
  return inserted;
}

async function selectPhase2Targets(db, matchIds, detailLimit) {
  const params = [matchIds];
  let sql = `
    SELECT m.match_id
    FROM matches m
    LEFT JOIN match_details d ON d.match_id = m.match_id
    WHERE m.match_id = ANY($1::bigint[])
      AND d.match_id IS NULL
    ORDER BY m.start_time DESC NULLS LAST, m.match_id DESC
  `;
  if (detailLimit > 0) {
    params.push(detailLimit);
    sql += ` LIMIT $2`;
  }
  return db.query(sql, params);
}

async function upsertTeamFromDetail(db, teamId, name) {
  const normalizedId = toInt(teamId);
  if (!normalizedId) return;
  await db.query(
    `
      INSERT INTO teams (team_id, name)
      VALUES ($1, $2)
      ON CONFLICT (team_id) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), teams.name)
    `,
    [String(normalizedId), name || null]
  );
}

async function saveDetailAndEnrichMatch(db, detail) {
  const matchId = toInt(detail?.match_id);
  if (!matchId) return false;

  await db.query(
    `
      INSERT INTO match_details (match_id, payload, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (match_id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = NOW()
    `,
    [matchId, JSON.stringify(detail)]
  );

  await upsertTeamFromDetail(db, detail.radiant_team_id, detail.radiant_name || null);
  await upsertTeamFromDetail(db, detail.dire_team_id, detail.dire_name || null);

  await db.query(
    `
      UPDATE matches
      SET
        series_id = COALESCE($2, series_id),
        radiant_team_id = COALESCE($3, radiant_team_id),
        dire_team_id = COALESCE($4, dire_team_id),
        radiant_score = COALESCE($5, radiant_score),
        dire_score = COALESCE($6, dire_score),
        radiant_win = COALESCE($7, radiant_win),
        start_time = COALESCE($8, start_time),
        duration = COALESCE($9, duration),
        updated_at = NOW()
      WHERE match_id = $1
    `,
    [
      matchId,
      detail.series_id ? String(detail.series_id) : null,
      detail.radiant_team_id ? String(detail.radiant_team_id) : null,
      detail.dire_team_id ? String(detail.dire_team_id) : null,
      toInt(detail.radiant_score),
      toInt(detail.dire_score),
      detail.radiant_win === undefined || detail.radiant_win === null ? null : toBool(detail.radiant_win),
      toInt(detail.start_time),
      toInt(detail.duration),
    ]
  );

  return true;
}

function uniqueMatchMap(playerMatchMap) {
  const map = new Map();
  for (const rows of playerMatchMap.values()) {
    for (const row of rows) {
      if (!map.has(row.match_id)) map.set(row.match_id, row);
    }
  }
  return map;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = getDb();
  await ensureTables(db);

  const players = await selectHotPlayers(db, options.top);
  const report = {
    options,
    hotPlayers: players.map((row) => ({
      account_id: Number(row.account_id),
      appearances: Number(row.appearances || 0),
      name: row.name || null,
      team_name: row.team_name || null,
    })),
    phase1: null,
    phase2: null,
  };

  const playerMatchMap = new Map();

  if (options.phase === '1' || options.phase === 'phase1' || options.phase === 'all') {
    for (const player of players) {
      const accountId = Number(player.account_id);
      const rows = await fetchPlayerMatches(accountId, options);
      playerMatchMap.set(accountId, rows);
      console.log(`[phase1] player=${accountId} ${player.name || ''} matches=${rows.length}`);
      if (options.listDelayMs > 0) await sleep(options.listDelayMs);
    }

    const uniqueMatches = Array.from(uniqueMatchMap(playerMatchMap).values()).sort((a, b) => b.start_time - a.start_time);
    let upserted = 0;
    if (options.apply) {
      upserted = await upsertSkeletonMatches(db, uniqueMatches);
    }

    report.phase1 = {
      playersScanned: players.length,
      uniqueMatches: uniqueMatches.length,
      upsertedMatches: upserted,
      perPlayer: Array.from(playerMatchMap.entries()).map(([accountId, rows]) => ({
        account_id: accountId,
        matches: rows.length,
      })),
    };
  }

  if (options.phase === '2' || options.phase === 'phase2' || options.phase === 'all') {
    let matchIds = [];
    if (playerMatchMap.size > 0) {
      matchIds = Array.from(uniqueMatchMap(playerMatchMap).keys());
    } else {
      const refreshedPlayers = await selectHotPlayers(db, options.top);
      const tempMap = new Map();
      for (const player of refreshedPlayers) {
        const rows = await fetchPlayerMatches(Number(player.account_id), options);
        tempMap.set(Number(player.account_id), rows);
        if (options.listDelayMs > 0) await sleep(options.listDelayMs);
      }
      matchIds = Array.from(uniqueMatchMap(tempMap).keys());
    }

    const targets = await selectPhase2Targets(db, matchIds, options.detailLimit);
    let inserted = 0;
    let failed = 0;

    for (const row of targets) {
      const matchId = Number(row.match_id);
      try {
        const detail = await fetchJSON(`${OPENDOTA}/matches/${matchId}`);
        if (options.apply) {
          await saveDetailAndEnrichMatch(db, detail);
        }
        inserted += 1;
        console.log(`[phase2] match=${matchId} ok (${inserted}/${targets.length})`);
      } catch (error) {
        failed += 1;
        console.error(`[phase2] match=${matchId} failed:`, error?.message || error);
      }
      if (options.detailDelayMs > 0) await sleep(options.detailDelayMs);
    }

    report.phase2 = {
      targets: targets.length,
      insertedDetails: inserted,
      failed,
    };
  }

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`[report] wrote ${outputPath}`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[backfill-hot-player-history] failed:', error?.message || error);
  process.exit(1);
});
