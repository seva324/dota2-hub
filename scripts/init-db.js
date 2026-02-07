const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
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

  CREATE INDEX IF NOT EXISTS idx_teams_cn ON teams(is_cn_team);
  CREATE INDEX IF NOT EXISTS idx_teams_region ON teams(region);
`);

// 创建赛事表
db.exec(`
  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_cn TEXT,
    tier TEXT,  -- T1, T2, etc.
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'upcoming',  -- upcoming, ongoing, finished
    prize_pool TEXT,
    location TEXT,
    image_url TEXT,
    liquipedia_url TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
  CREATE INDEX IF NOT EXISTS idx_tournaments_tier ON tournaments(tier);
  CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(start_date);
`);

// 创建比赛表
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    match_id INTEGER UNIQUE,
    tournament_id TEXT,
    radiant_team_id TEXT,
    dire_team_id TEXT,
    radiant_score INTEGER DEFAULT 0,
    dire_score INTEGER DEFAULT 0,
    radiant_game_wins INTEGER DEFAULT 0,
    dire_game_wins INTEGER DEFAULT 0,
    start_time INTEGER,
    duration INTEGER,
    series_type TEXT,  -- BO1, BO3, BO5
    status TEXT DEFAULT 'scheduled',  -- scheduled, live, finished
    league_id INTEGER,
    game_mode INTEGER,
    lobby_type INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (radiant_team_id) REFERENCES teams(id),
    FOREIGN KEY (dire_team_id) REFERENCES teams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
  CREATE INDEX IF NOT EXISTS idx_matches_time ON matches(start_time);
  CREATE INDEX IF NOT EXISTS idx_matches_radiant ON matches(radiant_team_id);
  CREATE INDEX IF NOT EXISTS idx_matches_dire ON matches(dire_team_id);
`);

// 创建比赛详情表（每局小分）
db.exec(`
  CREATE TABLE IF NOT EXISTS match_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER,
    game_number INTEGER,
    radiant_score INTEGER,
    dire_score INTEGER,
    duration INTEGER,
    radiant_heroes TEXT,  -- JSON array of hero IDs
    dire_heroes TEXT,     -- JSON array of hero IDs
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (match_id) REFERENCES matches(id)
  );

  CREATE INDEX IF NOT EXISTS idx_match_games_match ON match_games(match_id);
`);

// 创建新闻表
db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    title_cn TEXT,
    summary TEXT,
    content TEXT,
    source TEXT,
    source_name TEXT,
    url TEXT,
    image_url TEXT,
    published_at INTEGER,
    fetched_at INTEGER DEFAULT (unixepoch()),
    keywords TEXT,  -- JSON array
    category TEXT,  -- transfer, announcement, patch, community
    is_cn_news BOOLEAN DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);
  CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at);
  CREATE INDEX IF NOT EXISTS idx_news_source ON news(source);
`);

// 创建社区热点表
db.exec(`
  CREATE TABLE IF NOT EXISTS community_hot (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,  -- x, reddit, nga, weibo
    platform_name TEXT,
    content TEXT,
    summary TEXT,
    keywords TEXT,  -- JSON array
    url TEXT,
    author TEXT,
    author_avatar TEXT,
    hot_score INTEGER DEFAULT 0,
    engagement_count INTEGER DEFAULT 0,
    published_at INTEGER,
    fetched_at INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_community_platform ON community_hot(platform);
  CREATE INDEX IF NOT EXISTS idx_community_hot ON community_hot(hot_score);
  CREATE INDEX IF NOT EXISTS idx_community_fetched ON community_hot(fetched_at);
`);

// 创建选手表
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    account_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    name_cn TEXT,
    avatar_url TEXT,
    team_id TEXT,
    position INTEGER,  -- 1-5
    country TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );

  CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
`);

// 插入中国重点战队（只关注 XG, YB, VG）
db.exec(`
  INSERT OR IGNORE INTO teams (id, name, name_cn, tag, region, is_cn_team) VALUES
  ('xtreme-gaming', 'Xtreme Gaming', 'XG', 'XG', 'China', 1),
  ('yakult-brother', 'Yakult Brother', 'YB', 'YB', 'China', 1),
  ('azure-ray', 'Azure Ray', 'AR', 'AR', 'China', 1),
  ('vici-gaming', 'Vici Gaming', 'VG', 'VG', 'China', 1),
  ('nouns', 'Nouns', 'Nouns', 'Nouns', 'NA', 0),
  ('falcons', 'Team Falcons', 'Falcons', 'Falcons', 'MENA', 0),
  ('liquid', 'Team Liquid', 'Liquid', 'Liquid', 'Europe', 0),
  ('gg', 'Gaimin Gladiators', 'GG', 'GG', 'Europe', 0),
  ('bb', 'BetBoom Team', 'BB', 'BB', 'Eastern Europe', 0),
  ('spirit', 'Team Spirit', 'Spirit', 'TS', 'Eastern Europe', 0);
`);

console.log('Database initialized successfully!');
console.log('Database path:', dbPath);

db.close();
