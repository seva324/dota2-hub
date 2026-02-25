import initSqlJs from 'sql.js';
import fs from 'fs';

const SQL = await initSqlJs();
const db = new SQL.Database();

// Create teams table
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_cn TEXT,
    tag TEXT,
    logo_url TEXT,
    region TEXT,
    is_cn_team INTEGER DEFAULT 0
  );
`);

// Create tournaments table
db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_cn TEXT,
    tier TEXT,
    start_date INTEGER,
    end_date INTEGER,
    status TEXT,
    prize_pool TEXT,
    location TEXT,
    format TEXT,
    logo_url TEXT
  );
`);

// Create matches table
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT UNIQUE,
    radiant_team_id TEXT,
    dire_team_id TEXT,
    radiant_team_name TEXT,
    radiant_team_name_cn TEXT,
    dire_team_name TEXT,
    dire_team_name_cn TEXT,
    radiant_team_logo TEXT,
    dire_team_logo TEXT,
    radiant_score INTEGER DEFAULT 0,
    dire_score INTEGER DEFAULT 0,
    radiant_game_wins INTEGER DEFAULT 0,
    dire_game_wins INTEGER DEFAULT 0,
    start_time INTEGER,
    duration INTEGER DEFAULT 0,
    series_type TEXT,
    league_id INTEGER,
    tournament_id TEXT,
    tournament_name TEXT,
    tournament_name_cn TEXT,
    status TEXT DEFAULT 'upcoming',
    lobby_type INTEGER DEFAULT 0,
    radiant_win INTEGER,
    series_id INTEGER
  );
`);

// Save database
fs.writeFileSync('data/dota2.db', db.export());
console.log('Database with all tables created!');
