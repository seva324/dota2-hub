/**
 * Database Initialization API (New Schema)
 *
 * Creates tables: teams, tournaments, series, matches, upcoming_series
 *
 * Usage: POST /api/init-db
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  try {
    const db = neon(DATABASE_URL);
    console.log('[Init DB] Starting database initialization...');

    // Drop existing tables (clean slate)
    console.log('[Init DB] Dropping existing tables...');
    await db`DROP TABLE IF EXISTS matches CASCADE`;
    await db`DROP TABLE IF EXISTS series CASCADE`;
    await db`DROP TABLE IF EXISTS upcoming_series CASCADE`;
    await db`DROP TABLE IF EXISTS tournaments CASCADE`;
    await db`DROP TABLE IF EXISTS teams CASCADE`;

    // Create teams table
    await db`
      CREATE TABLE teams (
        team_id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_cn VARCHAR(255),
        tag VARCHAR(10),
        logo_url VARCHAR(500),
        region VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('[Init DB] Created teams table');

    // Create tournaments table
    await db`
      CREATE TABLE tournaments (
        league_id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_cn VARCHAR(255),
        tier VARCHAR(5),
        location VARCHAR(100),
        status VARCHAR(20),
        start_time INTEGER,
        end_time INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('[Init DB] Created tournaments table');

    // Create series table
    await db`
      CREATE TABLE series (
        series_id VARCHAR(100) PRIMARY KEY,
        league_id INTEGER,
        radiant_team_id VARCHAR(50),
        dire_team_id VARCHAR(50),
        radiant_wins INTEGER DEFAULT 0,
        dire_wins INTEGER DEFAULT 0,
        series_type VARCHAR(10),
        status VARCHAR(20),
        start_time INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (league_id) REFERENCES tournaments(league_id),
        FOREIGN KEY (radiant_team_id) REFERENCES teams(team_id),
        FOREIGN KEY (dire_team_id) REFERENCES teams(team_id)
      )
    `;
    console.log('[Init DB] Created series table');

    // Create matches table
    await db`
      CREATE TABLE matches (
        match_id BIGINT PRIMARY KEY,
        series_id VARCHAR(100),
        radiant_team_id VARCHAR(50),
        dire_team_id VARCHAR(50),
        radiant_score INTEGER DEFAULT 0,
        dire_score INTEGER DEFAULT 0,
        radiant_win BOOLEAN,
        start_time INTEGER,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (series_id) REFERENCES series(series_id),
        FOREIGN KEY (radiant_team_id) REFERENCES teams(team_id),
        FOREIGN KEY (dire_team_id) REFERENCES teams(team_id)
      )
    `;
    console.log('[Init DB] Created matches table');

    // Create upcoming_series table
    await db`
      CREATE TABLE upcoming_series (
        id VARCHAR(100) PRIMARY KEY,
        series_id VARCHAR(100),
        league_id INTEGER,
        radiant_team_id VARCHAR(50),
        dire_team_id VARCHAR(50),
        start_time INTEGER,
        series_type VARCHAR(10),
        status VARCHAR(20) DEFAULT 'upcoming',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (league_id) REFERENCES tournaments(league_id),
        FOREIGN KEY (radiant_team_id) REFERENCES teams(team_id),
        FOREIGN KEY (dire_team_id) REFERENCES teams(team_id)
      )
    `;
    console.log('[Init DB] Created upcoming_series table');

    // Create indexes (use IF NOT EXISTS to handle existing indexes)
    await db`CREATE INDEX IF NOT EXISTS idx_series_league ON series(league_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_matches_series ON matches(series_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time DESC)`;
    await db`CREATE INDEX IF NOT EXISTS idx_upcoming_start_time ON upcoming_series(start_time)`;
    await db`CREATE INDEX IF NOT EXISTS idx_upcoming_league ON upcoming_series(league_id)`;
    console.log('[Init DB] Created indexes');

    return res.status(200).json({
      success: true,
      message: 'Database schema initialized successfully',
      tables: ['teams', 'tournaments', 'series', 'matches', 'upcoming_series']
    });
  } catch (error) {
    console.error('[Init DB] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
