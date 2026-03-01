/**
 * Database Initialization API (Simplified)
 *
 * Creates tables and indexes in Neon database.
 * Run this once to set up the database.
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

    // Create matches table
    await db`
      CREATE TABLE IF NOT EXISTS matches (
        match_id BIGINT PRIMARY KEY,
        series_id VARCHAR(100),
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
    console.log('[Init DB] Created matches table');

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
    console.log('[Init DB] Created upcoming_matches table');

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
    console.log('[Init DB] Created tournaments table');

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
    console.log('[Init DB] Created tournament_series table');

    // Create teams table
    await db`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_cn VARCHAR(255),
        tag VARCHAR(50),
        logo_url VARCHAR(500),
        region VARCHAR(100),
        is_cn_team BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    console.log('[Init DB] Created teams table');

    // Create indexes
    await db`CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time DESC)`;
    await db`CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id)`;
    await db`CREATE INDEX IF NOT EXISTS idx_upcoming_start_time ON upcoming_matches(start_time)`;
    await db`CREATE INDEX IF NOT EXISTS idx_series_tournament ON tournament_series(tournament_id)`;
    console.log('[Init DB] Created indexes');

    return res.status(200).json({
      success: true,
      message: 'Database schema initialized successfully'
    });
  } catch (error) {
    console.error('[Init DB] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
