#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const OPENDOTA = 'https://api.opendota.com/api';
const TOURNAMENT_NAME = 'FISSURE Universe Episode 8';

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL/POSTGRES_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

async function main() {
  const targets = await sql.query(`
    SELECT m.match_id
    FROM tournaments t
    JOIN series s ON s.league_id = t.league_id
    JOIN matches m ON m.series_id = s.series_id
    LEFT JOIN match_details d ON d.match_id = m.match_id
    WHERE t.name = '${TOURNAMENT_NAME}' AND d.match_id IS NULL
    ORDER BY m.start_time DESC
  `);

  console.log(`[Backfill] tournament="${TOURNAMENT_NAME}" missing=${targets.length}`);
  if (!targets.length) {
    console.log('[Backfill] nothing to do');
    return;
  }

  let inserted = 0;
  let failed = 0;

  for (const row of targets) {
    const matchId = Number(row.match_id);
    if (!Number.isFinite(matchId)) continue;
    try {
      const detail = await fetchJSON(`${OPENDOTA}/matches/${Math.trunc(matchId)}`);
      await sql`
        INSERT INTO match_details (match_id, payload, updated_at)
        VALUES (${Math.trunc(matchId)}, ${JSON.stringify(detail)}::jsonb, NOW())
        ON CONFLICT (match_id) DO NOTHING
      `;
      inserted += 1;
      console.log(`[Backfill] inserted ${matchId}`);
    } catch (e) {
      failed += 1;
      console.log(`[Backfill] failed ${matchId}: ${e.message}`);
    }
    await sleep(900);
  }

  const verify = await sql.query(`
    SELECT t.league_id, t.name,
           COUNT(*)::int AS total_matches,
           COUNT(d.match_id)::int AS details_present,
           (COUNT(*) - COUNT(d.match_id))::int AS details_missing
    FROM tournaments t
    JOIN series s ON s.league_id = t.league_id
    JOIN matches m ON m.series_id = s.series_id
    LEFT JOIN match_details d ON d.match_id = m.match_id
    WHERE t.name = '${TOURNAMENT_NAME}'
    GROUP BY t.league_id, t.name
  `);

  console.log('[Backfill] summary', { inserted, failed, verify: verify[0] || null });
}

main().catch((e) => {
  console.error('[Backfill] fatal:', e.message);
  process.exit(1);
});
