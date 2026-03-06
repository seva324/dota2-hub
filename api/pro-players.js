import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (e) {
      console.error('[ProPlayers API] Failed to create client:', e.message);
      return null;
    }
  }
  return sql;
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pro_players (
      account_id BIGINT PRIMARY KEY,
      name VARCHAR(255),
      name_cn VARCHAR(255),
      team_id BIGINT,
      team_name VARCHAR(255),
      country_code VARCHAR(8),
      avatar_url TEXT,
      realname VARCHAR(255),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS name_cn VARCHAR(255)`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS team_id BIGINT`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS country_code VARCHAR(8)`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_year INTEGER`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_month INTEGER`);
}

async function sourceTablesExist(db) {
  const rows = await db.query(`
    SELECT
      to_regclass('public.matches') AS matches_table,
      to_regclass('public.match_details') AS match_details_table
  `);
  const row = rows[0] || {};
  return Boolean(row.matches_table && row.match_details_table);
}

async function syncProPlayersFromMatches(db) {
  const sourceReady = await sourceTablesExist(db);
  if (!sourceReady) {
    return { skipped: true, reason: 'source_tables_missing', discovered_count: 0, upserted_count: 0 };
  }

  const rows = await db.query(`
    WITH extracted AS (
      SELECT
        NULLIF(BTRIM(p->>'account_id'), '') AS account_id_text,
        NULLIF(BTRIM(COALESCE(p->>'name', p->>'personaname')), '') AS player_name,
        CASE
          WHEN (p->>'player_slot') ~ '^[0-9]+$' THEN (p->>'player_slot')::INT
          ELSE NULL
        END AS player_slot,
        m.radiant_team_id::TEXT AS radiant_team_id_raw,
        m.dire_team_id::TEXT AS dire_team_id_raw,
        rt.name::TEXT AS radiant_team_name_raw,
        dt.name::TEXT AS dire_team_name_raw,
        m.start_time
      FROM match_details md
      JOIN matches m ON m.match_id = md.match_id
      LEFT JOIN teams rt ON rt.team_id = m.radiant_team_id
      LEFT JOIN teams dt ON dt.team_id = m.dire_team_id
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(md.payload->'players') = 'array' THEN md.payload->'players'
          ELSE '[]'::jsonb
        END
      ) AS p
    ),
    normalized AS (
      SELECT
        account_id_text::BIGINT AS account_id,
        player_name AS name,
        CASE
          WHEN player_slot IS NULL THEN NULL
          WHEN player_slot < 128 AND radiant_team_id_raw ~ '^[0-9]+$' THEN radiant_team_id_raw::BIGINT
          WHEN player_slot >= 128 AND dire_team_id_raw ~ '^[0-9]+$' THEN dire_team_id_raw::BIGINT
          ELSE NULL
        END AS team_id,
        CASE
          WHEN player_slot IS NULL THEN NULL
          WHEN player_slot < 128 THEN NULLIF(BTRIM(radiant_team_name_raw), '')
          ELSE NULLIF(BTRIM(dire_team_name_raw), '')
        END AS team_name,
        start_time
      FROM extracted
      WHERE account_id_text ~ '^[0-9]+$'
        AND account_id_text::BIGINT > 0
    ),
    latest AS (
      SELECT DISTINCT ON (account_id)
        account_id,
        name,
        team_id,
        team_name
      FROM normalized
      ORDER BY account_id, COALESCE(start_time, 0) DESC
    ),
    upserted AS (
      INSERT INTO pro_players (account_id, name, team_id, team_name, updated_at)
      SELECT account_id, name, team_id, team_name, NOW()
      FROM latest
      ON CONFLICT (account_id) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), pro_players.name),
        team_id = COALESCE(EXCLUDED.team_id, pro_players.team_id),
        team_name = COALESCE(NULLIF(EXCLUDED.team_name, ''), pro_players.team_name),
        updated_at = NOW()
      WHERE
        COALESCE(NULLIF(EXCLUDED.name, ''), pro_players.name) IS DISTINCT FROM pro_players.name
        OR COALESCE(EXCLUDED.team_id, pro_players.team_id) IS DISTINCT FROM pro_players.team_id
        OR COALESCE(NULLIF(EXCLUDED.team_name, ''), pro_players.team_name) IS DISTINCT FROM pro_players.team_name
      RETURNING account_id
    )
    SELECT
      (SELECT COUNT(*)::INT FROM latest) AS discovered_count,
      COUNT(*)::INT AS upserted_count
    FROM upserted
  `);

  const summary = rows[0] || {};
  return {
    skipped: false,
    discovered_count: Number(summary.discovered_count || 0),
    upserted_count: Number(summary.upserted_count || 0)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'Database not available' });
  }

  try {
    await ensureTable(db);
    const syncStats = await syncProPlayersFromMatches(db);
    if (syncStats.skipped) {
      console.log(`[ProPlayers API] Skip match-derived sync: ${syncStats.reason}`);
    } else {
      console.log(
        `[ProPlayers API] Match-derived sync discovered=${syncStats.discovered_count}, upserted=${syncStats.upserted_count}`
      );
    }

    const rows = await db.query(`
      SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
      FROM pro_players
      ORDER BY updated_at DESC NULLS LAST, account_id ASC
    `);

    const payload = {};
    for (const row of rows) {
      payload[String(row.account_id)] = {
        name: row.name || null,
        name_cn: row.name_cn || null,
        team_id: row.team_id !== null && row.team_id !== undefined ? String(row.team_id) : null,
        team_name: row.team_name || null,
        country_code: row.country_code || null,
        avatar_url: row.avatar_url || null,
        realname: row.realname || null,
        birth_date: row.birth_date || null,
        birth_year: row.birth_year ?? null,
        birth_month: row.birth_month ?? null
      };
    }

    return res.status(200).json(payload);
  } catch (e) {
    console.error('[ProPlayers API] Error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
