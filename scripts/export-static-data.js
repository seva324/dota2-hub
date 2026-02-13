import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const outputDir = path.join(__dirname, '..', 'public', 'data');

// 目标战队
const TARGET_TEAM_IDS = ['xtreme-gaming', 'yakult-brother', 'vici-gaming'];
const placeholders = TARGET_TEAM_IDS.map(() => '?').join(',');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const db = new Database(dbPath);

// 导出比赛数据
const matches = db.prepare(`
  SELECT m.*, 
         rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
         dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
         t.name as tournament_name, t.name_cn as tournament_name_cn, t.tier as tournament_tier
  FROM matches m
  LEFT JOIN teams rt ON m.radiant_team_id = rt.id
  LEFT JOIN teams dt ON m.dire_team_id = dt.id
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  ORDER BY m.start_time DESC
  LIMIT 100
`).all();

fs.writeFileSync(path.join(outputDir, 'matches.json'), JSON.stringify(matches, null, 2));
console.log(`Exported ${matches.length} matches`);

// 导出即将开始的比赛（带倒计时）- 只包含 XG/YB/VG
const now = Math.floor(Date.now() / 1000);
const upcomingMatches = db.prepare(`
  SELECT m.*, 
         rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
         dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
         t.name as tournament_name, t.name_cn as tournament_name_cn, t.tier as tournament_tier
  FROM matches m
  LEFT JOIN teams rt ON m.radiant_team_id = rt.id
  LEFT JOIN teams dt ON m.dire_team_id = dt.id
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  WHERE m.start_time > ? 
    AND (m.radiant_team_id IN (${placeholders}) OR m.dire_team_id IN (${placeholders}))
  ORDER BY m.start_time ASC
  LIMIT 10
`).all([now, ...TARGET_TEAM_IDS, ...TARGET_TEAM_IDS]);

fs.writeFileSync(path.join(outputDir, 'upcoming.json'), JSON.stringify(upcomingMatches, null, 2));
console.log(`Exported ${upcomingMatches.length} upcoming XG/YB/VG matches`);

// 导出中国战队近期比赛
const cnMatches = db.prepare(`
  SELECT m.*, 
         rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn, rt.logo_url as radiant_logo,
         dt.name as dire_team_name, dt.name_cn as dire_team_name_cn, dt.logo_url as dire_logo,
         t.name as tournament_name, t.name_cn as tournament_name_cn, t.tier as tournament_tier
  FROM matches m
  LEFT JOIN teams rt ON m.radiant_team_id = rt.id
  LEFT JOIN teams dt ON m.dire_team_id = dt.id
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  WHERE m.start_time < ?
    AND (m.radiant_team_id IN (${placeholders}) OR m.dire_team_id IN (${placeholders}))
  ORDER BY m.start_time DESC
  LIMIT 20
`).all([now, ...TARGET_TEAM_IDS, ...TARGET_TEAM_IDS]);

fs.writeFileSync(path.join(outputDir, 'cn-matches.json'), JSON.stringify(cnMatches, null, 2));
console.log(`Exported ${cnMatches.length} XG/YB/VG matches`);

// 导出赛事数据
const tournaments = db.prepare('SELECT * FROM tournaments ORDER BY start_date DESC').all();
fs.writeFileSync(path.join(outputDir, 'tournaments.json'), JSON.stringify(tournaments, null, 2));
console.log(`Exported ${tournaments.length} tournaments`);

// 导出战队数据
const teams = db.prepare('SELECT * FROM teams').all();
fs.writeFileSync(path.join(outputDir, 'teams.json'), JSON.stringify(teams, null, 2));
console.log(`Exported ${teams.length} teams`);

// 导出新闻数据
const news = db.prepare('SELECT * FROM news ORDER BY published_at DESC').all();
fs.writeFileSync(path.join(outputDir, 'news.json'), JSON.stringify(news, null, 2));
console.log(`Exported ${news.length} news items`);

// 导出首页数据（合并所有数据）
const homeData = {
  upcoming: upcomingMatches,
  cnMatches,
  tournaments,
  news,
  lastUpdated: new Date().toISOString()
};

fs.writeFileSync(path.join(outputDir, 'home.json'), JSON.stringify(homeData, null, 2));
console.log('Exported home page data');

// 导出 BP 数据（带 match_id 的比赛）
const bpData = db.prepare(`
  SELECT bp.match_id, bp.picks_bans, bp.radiant_win,
         m.radiant_team_id, m.dire_team_id,
         rt.name as radiant_team_name, rt.name_cn as radiant_team_name_cn,
         dt.name as dire_team_name, dt.name_cn as dire_team_name_cn
  FROM bp_data bp
  JOIN matches m ON bp.match_id = m.match_id
  LEFT JOIN teams rt ON m.radiant_team_id = rt.id
  LEFT JOIN teams dt ON m.dire_team_id = dt.id
  ORDER BY bp.updated_at DESC
`).all();

fs.writeFileSync(path.join(outputDir, 'bp-data.json'), JSON.stringify(bpData, null, 2));
console.log(`Exported ${bpData.length} BP data items`);

console.log('Data export complete!');
db.close();
