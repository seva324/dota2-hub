/**
 * Database connection module for Neon PostgreSQL
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

/**
 * Get Neon SQL client (singleton)
 * @returns {import('@neondatabase/serverless').NeonDbClient} Neon database client
 */
export function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

/**
 * Check if database is available
 * @returns {Promise<boolean>}
 */
export async function isDbAvailable() {
  try {
    const db = getDb();
    if (!db) return false;
    await db`SELECT 1`;
    return true;
  } catch (error) {
    console.error('[DB] Connection failed:', error.message);
    return false;
  }
}

/**
 * Initialize database schema (tables, indexes)
 * Should be called once on startup
 */
export async function initializeSchema() {
  const db = getDb();
  if (!db) {
    console.log('[DB] No DATABASE_URL, skipping schema initialization');
    return;
  }

  console.log('[DB] Initializing schema...');

  // Create matches table
  await db`
    CREATE TABLE IF NOT EXISTS matches (
      match_id BIGINT PRIMARY KEY,
      radiant_team_id VARCHAR(50),
      radiant_team_name VARCHAR(255),
      radiant_team_name_cn VARCHAR(255),
      radiant_team_logo VARCHAR(500),
      dire_team_id VARCHAR(50),
      dire_team_name VARCHAR(255),
      dire_team_name_cn VARCHAR(255),
      dire_team_logo VARCHAR(500),
      radiant_score INTEGER DEFAULT 0,
      dire_score INTEGER DEFAULT 0,
      radiant_win BOOLEAN,
      start_time INTEGER,
      duration INTEGER,
      league_id INTEGER,
      series_type VARCHAR(10),
      status VARCHAR(20),
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create upcoming_matches table
  await db`
    CREATE TABLE IF NOT EXISTS upcoming_matches (
      id VARCHAR(100) PRIMARY KEY,
      match_id BIGINT,
      radiant_team_name VARCHAR(255),
      radiant_team_name_cn VARCHAR(255),
      dire_team_name VARCHAR(255),
      dire_team_name_cn VARCHAR(255),
      start_time INTEGER,
      series_type VARCHAR(10),
      tournament_name VARCHAR(255),
      tournament_name_cn VARCHAR(255),
      status VARCHAR(20) DEFAULT 'upcoming',
      source VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create tournaments table
  await db`
    CREATE TABLE IF NOT EXISTS tournaments (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255),
      name_cn VARCHAR(255),
      tier VARCHAR(5),
      location VARCHAR(100),
      status VARCHAR(20),
      league_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create tournament_series table
  await db`
    CREATE TABLE IF NOT EXISTS tournament_series (
      id SERIAL PRIMARY KEY,
      series_id VARCHAR(100) NOT NULL,
      tournament_id VARCHAR(50),
      radiant_team_name VARCHAR(255),
      dire_team_name VARCHAR(255),
      radiant_team_logo VARCHAR(500),
      dire_team_logo VARCHAR(500),
      radiant_wins INTEGER DEFAULT 0,
      dire_wins INTEGER DEFAULT 0,
      series_type VARCHAR(10),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(tournament_id, series_id)
    )
  `;

  // Create series_games table
  await db`
    CREATE TABLE IF NOT EXISTS series_games (
      id SERIAL PRIMARY KEY,
      series_id INTEGER REFERENCES tournament_series(id) ON DELETE CASCADE,
      match_id BIGINT REFERENCES matches(match_id) ON DELETE CASCADE,
      radiant_team_name VARCHAR(255),
      dire_team_name VARCHAR(255),
      radiant_score INTEGER,
      dire_score INTEGER,
      radiant_win BOOLEAN,
      start_time INTEGER,
      duration INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create indexes
  await db`CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`;
  await db`CREATE INDEX IF NOT EXISTS idx_upcoming_start_time ON upcoming_matches(start_time)`;
  await db`CREATE INDEX IF NOT EXISTS idx_upcoming_status ON upcoming_matches(status)`;
  await db`CREATE INDEX IF NOT EXISTS idx_series_tournament ON tournament_series(tournament_id)`;

  console.log('[DB] Schema initialized successfully');
}
