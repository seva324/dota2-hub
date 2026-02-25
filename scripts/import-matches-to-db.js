import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');

// Load or create database
let db;
const SQL = await initSqlJs();
if (fs.existsSync(dbPath)) {
  db = new SQL.Database(fs.readFileSync(dbPath));
} else {
  db = new SQL.Database();
}

// Create tables if not exist
db.exec(`CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, 
  name TEXT NOT NULL, 
  name_cn TEXT, 
  tag TEXT, 
  logo_url TEXT, 
  region TEXT, 
  is_cn_team INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS tournaments (
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
)`);

db.exec(`CREATE TABLE IF NOT EXISTS matches (
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
)`);

// Read matches from JSON
const matches = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'matches.json'), 'utf-8'));
console.log(`Loading ${matches.length} matches from JSON...`);

// Insert matches
let inserted = 0;
let errors = 0;
for (const m of matches) {
  try {
    db.run(`INSERT INTO matches (match_id, radiant_team_id, dire_team_id, radiant_team_name, radiant_team_name_cn, dire_team_name, dire_team_name_cn, radiant_team_logo, dire_team_logo, radiant_score, dire_score, radiant_game_wins, dire_game_wins, start_time, duration, tournament_id, series_id, series_type, status, lobby_type, radiant_win)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.match_id || null,
        m.radiant_team_id || null,
        m.dire_team_id || null,
        m.radiant_team_name || null,
        m.radiant_team_name_cn || null,
        m.dire_team_name || null,
        m.dire_team_name_cn || null,
        m.radiant_team_logo || null,
        m.dire_team_logo || null,
        m.radiant_score || 0,
        m.dire_score || 0,
        m.radiant_game_wins || 0,
        m.dire_game_wins || 0,
        m.start_time || 0,
        m.duration || 0,
        m.leagueid || null,
        m.series_id || null,
        m.series_type || null,
        m.status || 'finished',
        m.lobby_type || 0,
        m.radiant_win != undefined ? (m.radiant_win ? 1 : 0) : 0
      ]
    );
    inserted++;
  } catch (e) {
    errors++;
    if (errors <= 3) console.log('Error:', e.message);
  }
}
console.log(`Inserted ${inserted} matches, ${errors} errors`);

// Save database
fs.writeFileSync(dbPath, db.export());
console.log('Database saved!');
