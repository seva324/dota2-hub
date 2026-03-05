/**
 * Migration Script: Redis to Neon PostgreSQL
 *
 * This script migrates existing data from Redis to Neon database.
 * Run this once to populate the new database.
 *
 * Usage:
 *   node scripts/migrate-to-neon.js
 *
 * Environment:
 *   DATABASE_URL - Neon connection string (required)
 *   REDIS_URL - Redis connection string (required)
 */

import { createClient } from 'redis';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

if (!DATABASE_URL || !REDIS_URL) {
  console.error('Error: DATABASE_URL and REDIS_URL environment variables are required');
  console.log('Usage: DATABASE_URL=... REDIS_URL=... node scripts/migrate-to-neon.js');
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const redis = createClient({ url: REDIS_URL });

async function migrateMatches() {
  console.log('\n=== Migrating Matches ===');

  const matchesData = await redis.get('matches');
  if (!matchesData) {
    console.log('No matches found in Redis');
    return 0;
  }

  const matches = JSON.parse(matchesData);
  const matchArray = Object.values(matches);

  let migrated = 0;
  for (const m of matchArray) {
    try {
      await sql`
        INSERT INTO matches (
          match_id, radiant_team_id, radiant_team_name, radiant_team_name_cn,
          radiant_team_logo, dire_team_id, dire_team_name, dire_team_name_cn,
          dire_team_logo, radiant_score, dire_score, radiant_win, start_time,
          duration, league_id, series_type, status, raw_json, updated_at
        ) VALUES (
          ${m.match_id}, ${m.radiant_team_id}, ${m.radiant_team_name},
          ${m.radiant_team_name_cn}, ${m.radiant_team_logo}, ${m.dire_team_id},
          ${m.dire_team_name}, ${m.dire_team_name_cn}, ${m.dire_team_logo},
          ${m.radiant_score}, ${m.dire_score}, ${m.radiant_win}, ${m.start_time},
          ${m.duration}, ${m.league_id}, ${m.series_type}, ${m.status},
          ${JSON.stringify(m)}, NOW()
        )
        ON CONFLICT (match_id) DO UPDATE SET
          radiant_score = EXCLUDED.radiant_score,
          dire_score = EXCLUDED.dire_score,
          radiant_win = EXCLUDED.radiant_win,
          updated_at = NOW()
      `;
      migrated++;
    } catch (e) {
      console.error(`Failed to migrate match ${m.match_id}:`, e.message);
    }
  }

  console.log(`Migrated ${migrated} matches`);
  return migrated;
}

async function migrateTournaments() {
  console.log('\n=== Migrating Tournaments ===');

  const tournamentsData = await redis.get('tournaments');
  if (!tournamentsData) {
    console.log('No tournaments found in Redis');
    return 0;
  }

  const data = JSON.parse(tournamentsData);
  const { tournaments } = data;

  let tournamentCount = 0;
  // Migrate tournaments
  for (const t of tournaments || []) {
    try {
      await sql`
        INSERT INTO tournaments (id, name, name_cn, tier, location, status, league_id, updated_at)
        VALUES (${t.id}, ${t.name}, ${t.name_cn}, ${t.tier}, ${t.location}, ${t.status}, ${t.leagueid}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          name_cn = EXCLUDED.name_cn,
          tier = EXCLUDED.tier,
          updated_at = NOW()
      `;
      tournamentCount++;
    } catch (e) {
      console.error(`Failed to migrate tournament ${t.id}:`, e.message);
    }
  }

  console.log(`Migrated ${tournamentCount} tournaments`);
  return { tournamentCount };
}

async function migrateUpcoming() {
  console.log('\n=== Migrating Upcoming ===');

  const upcomingData = await redis.get('upcoming');
  if (!upcomingData) {
    console.log('No upcoming matches found in Redis');
    return 0;
  }

  const upcoming = JSON.parse(upcomingData);
  let migrated = 0;

  for (const m of upcoming) {
    try {
      await sql`
        INSERT INTO upcoming_matches (
          id, match_id, radiant_team_name, radiant_team_name_cn,
          dire_team_name, dire_team_name_cn, start_time, series_type,
          tournament_name, tournament_name_cn, status, source, updated_at
        ) VALUES (
          ${m.id}, ${m.match_id}, ${m.radiant_team_name}, ${m.radiant_team_name_cn},
          ${m.dire_team_name}, ${m.dire_team_name_cn}, ${m.start_time}, ${m.series_type},
          ${m.tournament_name}, ${m.tournament_name_cn}, ${m.status || 'upcoming'},
          ${m.source}, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          start_time = EXCLUDED.start_time,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;
      migrated++;
    } catch (e) {
      console.error(`Failed to migrate upcoming ${m.id}:`, e.message);
    }
  }

  console.log(`Migrated ${migrated} upcoming matches`);
  return migrated;
}

async function main() {
  console.log('=== Redis to Neon Migration ===');
  console.log(`Database: ${DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown'}`);

  try {
    // Connect to Redis
    await redis.connect();
    console.log('Connected to Redis');

    // Test database connection
    await sql`SELECT 1`;
    console.log('Connected to Neon');

    // Run migrations
    const matchesCount = await migrateMatches();
    const { tournamentCount } = await migrateTournaments();
    const upcomingCount = await migrateUpcoming();

    console.log('\n=== Migration Complete ===');
    console.log(`Matches: ${matchesCount}`);
    console.log(`Tournaments: ${tournamentCount}`);
    console.log(`Upcoming: ${upcomingCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

main();
