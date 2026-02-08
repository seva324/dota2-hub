import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保数据目录存在
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'dota2.db');
const db = new Database(dbPath);

// 启用 WAL 模式以提高性能
db.pragma('journal_mode = WAL');

// 创建战队表
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_cn TEXT,
    tag TEXT,
    logo_url TEXT,
    region TEXT,
    is_cn_team BOOLEAN DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

// 创建赛事表
db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_cn TEXT,
    tier TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT,
    prize_pool TEXT,
    location TEXT,
    format TEXT,
    logo_url TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// 创建比赛表
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER UNIQUE,
    radiant_team_id TEXT,
    dire_team_id TEXT,
    radiant_team_name TEXT,
    radiant_team_name_cn TEXT,
    dire_team_name TEXT,
    dire_team_name_cn TEXT,
    radiant_score INTEGER DEFAULT 0,
    dire_score INTEGER DEFAULT 0,
    radiant_game_wins INTEGER DEFAULT 0,
    dire_game_wins INTEGER DEFAULT 0,
    start_time INTEGER,
    duration INTEGER DEFAULT 0,
    series_type TEXT,
    league_id INTEGER,
    tournament_id TEXT,
    status TEXT DEFAULT 'upcoming',
    lobby_type INTEGER DEFAULT 0,
    game_mode INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// 创建新闻表
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    source TEXT,
    url TEXT,
    published_at INTEGER,
    keywords TEXT,
    category TEXT,
    image TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// 插入目标战队数据
const targetTeams = [
  { id: 'xtreme-gaming', name: 'Xtreme Gaming', name_cn: 'XG', tag: 'XG', is_cn_team: 1, region: 'CN' },
  { id: 'yakult-brother', name: 'Yakult Brothers', name_cn: 'YB', tag: 'YB', is_cn_team: 1, region: 'CN' },
  { id: 'vici-gaming', name: 'Vici Gaming', name_cn: 'VG', tag: 'VG', is_cn_team: 1, region: 'CN' }
];

const insertTeam = db.prepare(`
  INSERT OR REPLACE INTO teams (id, name, name_cn, tag, is_cn_team, region, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, unixepoch())
`);

for (const team of targetTeams) {
  insertTeam.run(team.id, team.name, team.name_cn, team.tag, team.is_cn_team, team.region);
}

console.log('Database initialized successfully!');
console.log(`Database path: ${dbPath}`);

db.close();
