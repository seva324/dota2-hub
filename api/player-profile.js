import { neon } from '@neondatabase/serverless';
import {
  calculateDynamicAge,
  normalizeLogo,
  summarizePlayerMatches,
} from '../lib/player-profile.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[PlayerProfile API] Failed to create client:', error.message);
      return null;
    }
  }
  return sql;
}

async function ensureTables(db) {
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
      birth_date DATE,
      birth_year INTEGER,
      birth_month INTEGER,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_date DATE`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_year INTEGER`);
  await db.query(`ALTER TABLE pro_players ADD COLUMN IF NOT EXISTS birth_month INTEGER`);
}

function parseAccountId(rawAccountId) {
  const parsed = Number(rawAccountId);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

async function fetchHeroMap(db) {
  const rows = await db`
    SELECT hero_id, name, name_cn, img
    FROM heroes
    ORDER BY hero_id ASC
  `;
  const heroMap = {};
  for (const row of rows) {
    heroMap[String(row.hero_id)] = {
      hero_id: Number(row.hero_id),
      name: row.name || null,
      name_cn: row.name_cn || null,
      img_url: row.img
        ? `https://steamcdn-a.akamaihd.net/apps/dota2/images/heroes/${row.img}_lg.png`
        : null,
    };
  }
  return heroMap;
}

function enrichHeroStat(stat, heroMap) {
  const hero = heroMap[String(stat.hero_id)] || null;
  return {
    ...stat,
    hero_name: hero?.name || null,
    hero_name_cn: hero?.name_cn || null,
    hero_img: hero?.img_url || null,
  };
}

async function fetchNextMatch(db, teamId) {
  if (!teamId) return null;
  const nowTs = Math.floor(Date.now() / 1000);
  const rows = await db`
    SELECT us.id, us.league_id, us.start_time, us.series_type, us.radiant_team_id, us.dire_team_id,
           rt.name AS radiant_name, rt.logo_url AS radiant_logo,
           dt.name AS dire_name, dt.logo_url AS dire_logo,
           t.name AS tournament_name
    FROM upcoming_series us
    LEFT JOIN teams rt ON rt.team_id = us.radiant_team_id
    LEFT JOIN teams dt ON dt.team_id = us.dire_team_id
    LEFT JOIN tournaments t ON t.league_id = us.league_id
    WHERE us.start_time >= ${nowTs}
      AND (us.radiant_team_id = ${String(teamId)} OR us.dire_team_id = ${String(teamId)})
    ORDER BY us.start_time ASC
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const onRadiant = String(row.radiant_team_id || '') === String(teamId);
  return {
    id: row.id ? String(row.id) : null,
    start_time: Number(row.start_time || 0),
    series_type: row.series_type || 'BO3',
    tournament_name: row.tournament_name || null,
    selected_team: {
      team_id: onRadiant ? (row.radiant_team_id ? String(row.radiant_team_id) : null) : (row.dire_team_id ? String(row.dire_team_id) : null),
      name: onRadiant ? row.radiant_name || null : row.dire_name || null,
      logo_url: normalizeLogo(onRadiant ? row.radiant_logo : row.dire_logo),
    },
    opponent: {
      team_id: onRadiant ? (row.dire_team_id ? String(row.dire_team_id) : null) : (row.radiant_team_id ? String(row.radiant_team_id) : null),
      name: onRadiant ? row.dire_name || null : row.radiant_name || null,
      logo_url: normalizeLogo(onRadiant ? row.dire_logo : row.radiant_logo),
    },
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

  const accountId = parseAccountId(req.query.account_id ?? req.query.accountId);
  if (!accountId) {
    return res.status(400).json({ error: 'Invalid account_id' });
  }

  try {
    await ensureTables(db);

    const [playerRows, matchRows, heroMap] = await Promise.all([
      db`
        SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
        FROM pro_players
        WHERE account_id = ${accountId}
        LIMIT 1
      `,
      db.query(
        `
          SELECT
            m.match_id,
            m.start_time,
            m.series_type,
            m.radiant_team_id,
            m.dire_team_id,
            m.radiant_team_name,
            m.dire_team_name,
            m.radiant_team_logo,
            m.dire_team_logo,
            m.radiant_score,
            m.dire_score,
            m.radiant_win,
            m.league_id,
            t.name AS tournament_name,
            md.payload
          FROM matches m
          JOIN match_details md ON md.match_id = m.match_id
          LEFT JOIN tournaments t ON t.league_id = m.league_id
          WHERE m.start_time >= $1
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(md.payload->'players') p
              WHERE NULLIF(p->>'account_id', '') IS NOT NULL
                AND (p->>'account_id')::BIGINT = $2
            )
          ORDER BY m.start_time DESC
          LIMIT 120
        `,
        [Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60, accountId]
      ),
      fetchHeroMap(db),
    ]);

    const player = playerRows[0] || null;

    const summary = summarizePlayerMatches(matchRows, accountId, {
      windowDays: 90,
      recentLimit: 15,
    });

    const detectedTeamId = player?.team_id
      ? String(player.team_id)
      : summary.recentMatches[0]?.selected_team?.team_id || null;
    const nextMatch = await fetchNextMatch(db, detectedTeamId);

    const age = calculateDynamicAge({
      birthDate: player?.birth_date || null,
      birthYear: player?.birth_year ?? null,
      birthMonth: player?.birth_month ?? null,
    });

    return res.status(200).json({
      account_id: String(accountId),
      player: {
        name: player?.name || null,
        name_cn: player?.name_cn || null,
        realname: player?.realname || null,
        team_id: player?.team_id !== null && player?.team_id !== undefined ? String(player.team_id) : detectedTeamId,
        team_name: player?.team_name || summary.recentMatches[0]?.selected_team?.name || null,
        country_code: player?.country_code || null,
        avatar_url: normalizeLogo(player?.avatar_url || null),
        birth_date: player?.birth_date || null,
        birth_year: player?.birth_year ?? null,
        birth_month: player?.birth_month ?? null,
        age,
      },
      stats: {
        wins: summary.wins,
        losses: summary.losses,
        decided_matches: summary.decidedMatches,
        win_rate: summary.winRate,
      },
      signature_hero: summary.signatureHero ? enrichHeroStat(summary.signatureHero, heroMap) : null,
      most_played_heroes: summary.mostPlayedHeroes.map((hero) => enrichHeroStat(hero, heroMap)),
      recent_matches: summary.recentMatches.map((match) => ({
        ...match,
        team_hero_ids: match.team_hero_ids || [],
      })),
      next_match: nextMatch,
    });
  } catch (error) {
    console.error('[PlayerProfile API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
