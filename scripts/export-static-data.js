import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'dota2.db');
const outputDir = path.join(__dirname, '..', 'public', 'data');

// 目标战队 (仅用于首页推荐)
const TARGET_TEAM_IDS = ['xtreme-gaming', 'yakult-brothers', 'vici-gaming'];
const placeholders = TARGET_TEAM_IDS.map(() => '?').join(',');

// 确保输出目录存在
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const db = new Database(dbPath);

// 系列赛类型映射
const SERIES_TYPE_MAP = {
  0: 'BO1',
  1: 'BO3', 
  2: 'BO5',
  3: 'BO2'
};

/**
 * 清洗和聚合系列赛数据
 * 规则：相同对手 + 相同赛事 + 24小时内 + 相同series_type → 合并为同一个series
 */
function aggregateSeries(matches) {
  // 按赛事和对手分组
  const groups = {};
  
  for (const match of matches) {
    // 标准化战队名（排序，确保A_vs_B和B_vs_A是同一个key）
    const teamA = match.radiant_team_name || '';
    const teamB = match.dire_team_name || '';
    const teamsKey = [teamA, teamB].sort().join('_vs_');
    
    // 赛事key
    const tournamentKey = match.tournament_id || match.tournament_name || 'unknown';
    
    // series_type
    const seriesType = match.series_type || 'BO3';
    
    // 时间窗口（按天分组，24小时内）
    const dayKey = Math.floor((match.start_time || 0) / 86400);
    
    // 组合key
    const groupKey = `${tournamentKey}_${teamsKey}_${seriesType}_${dayKey}`;
    
    if (!groups[groupKey]) {
      groups[groupKey] = {
        series_id: `cleaned_${groupKey}`,
        series_type: seriesType,
        radiant_team_name: teamA,
        dire_team_name: teamB,
        games: [],
        radiant_wins: 0,
        dire_wins: 0,
        tournament_id: match.tournament_id,
        tournament_name: match.tournament_name,
        stage: match.stage || ''
      };
    }
    
    // 记录这场谁赢了（按战队名，不按radiant/dire，因为每局会换边）
    const radiantWin = match.radiant_win !== undefined ? match.radiant_win : (match.radiant_score > match.dire_score);
    const winner = radiantWin ? teamA : teamB;
    
    if (winner === groups[groupKey].radiant_team_name) {
      groups[groupKey].radiant_wins++;
    } else {
      groups[groupKey].dire_wins++;
    }
    
    // 添加比赛详情
    groups[groupKey].games.push({
      match_id: match.match_id,
      radiant_team_name: match.radiant_team_name,
      dire_team_name: match.dire_team_name,
      radiant_score: match.radiant_score || 0,
      dire_score: match.dire_score || 0,
      radiant_win: radiantWin,
      start_time: match.start_time,
      duration: match.duration || 0
    });
  }
  
  // 转换为数组，按时间排序
  return Object.values(groups).map(series => ({
    ...series,
    radiant_score: series.radiant_wins,
    dire_score: series.dire_wins,
    games: series.games.sort((a, b) => a.start_time - b.start_time)
  })).sort((a, b) => {
    const timeA = a.games[0]?.start_time || 0;
    const timeB = b.games[0]?.start_time || 0;
    return timeB - timeA;
  });
}

// 导出比赛数据
const matches = db.prepare(`
  SELECT m.*, 
         COALESCE(m.tournament_name, t.name) as tournament_name, 
         COALESCE(m.tournament_name_cn, t.name_cn) as tournament_name_cn, 
         t.tier as tournament_tier,
         CASE 
           WHEN m.radiant_score > m.dire_score THEN 1 
           ELSE 0 
         END as radiant_win
  FROM matches m
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  ORDER BY m.start_time DESC
  LIMIT 200
`).all();

// 去重 matches
const matchesDeduped = [];
const matchSeen = new Set();
for (const m of matches) {
  const key = `${m.start_time}_${m.radiant_team_name}_${m.dire_team_name}`;
  if (!matchSeen.has(key)) {
    matchSeen.add(key);
    matchesDeduped.push(m);
  }
}

fs.writeFileSync(path.join(outputDir, 'matches.json'), JSON.stringify(matchesDeduped, null, 2));
console.log(`Exported ${matchesDeduped.length} matches (${matchesDeduped.length}/${matches.length} after dedup)`);

// 导出即将开始的比赛（带倒计时）- 只包含 XG/YB/VG
const now = Math.floor(Date.now() / 1000);
const upcomingMatches = db.prepare(`
  SELECT m.*, 
         COALESCE(m.tournament_name, t.name) as tournament_name, 
         COALESCE(m.tournament_name_cn, t.name_cn) as tournament_name_cn, 
         t.tier as tournament_tier
  FROM matches m
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  WHERE m.start_time > ? 
    AND (m.radiant_team_id IN (${placeholders}) OR m.dire_team_id IN (${placeholders}))
  ORDER BY m.start_time ASC
  LIMIT 10
`).all([now, ...TARGET_TEAM_IDS, ...TARGET_TEAM_IDS]);

// 获取所有未来比赛（不限战队）用于去重
const allUpcomingMatches = db.prepare(`
  SELECT m.*, 
         COALESCE(m.tournament_name, t.name) as tournament_name, 
         COALESCE(m.tournament_name_cn, t.name_cn) as tournament_name_cn, 
         t.tier as tournament_tier
  FROM matches m
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  WHERE m.start_time > ?
  ORDER BY m.start_time ASC
  LIMIT 20
`).all(now);

// 去重函数 - 优先保留有 tournament 信息的
function dedupMatches(matches) {
  const seen = new Map();
  const sorted = [...matches].sort((a, b) => {
    const aHasT = a.tournament_name ? 1 : 0;
    const bHasT = b.tournament_name ? 1 : 0;
    return bHasT - aHasT;
  });
  for (const m of sorted) {
    if (!m.start_time || !m.radiant_team_name || !m.dire_team_name) continue;
    const key = `${m.start_time}_${m.radiant_team_name}_${m.dire_team_name}`;
    if (!seen.has(key)) seen.set(key, m);
  }
  return Array.from(seen.values()).sort((a, b) => a.start_time - b.start_time);
}

// 合并去重后写入 upcoming.json
const dedupedUpcoming = dedupMatches([...allUpcomingMatches, ...upcomingMatches]);
fs.writeFileSync(path.join(outputDir, 'upcoming.json'), JSON.stringify(dedupedUpcoming, null, 2));
console.log(`Exported ${dedupedUpcoming.length} upcoming matches (deduped)`);

// 导出中国战队近期比赛
const cnMatches = db.prepare(`
  SELECT m.*, 
         COALESCE(m.tournament_name, t.name) as tournament_name, 
         COALESCE(m.tournament_name_cn, t.name_cn) as tournament_name_cn, 
         t.tier as tournament_tier
  FROM matches m
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  WHERE m.start_time < ?
    AND (m.radiant_team_id IN (${placeholders}) OR m.dire_team_id IN (${placeholders}))
  ORDER BY m.start_time DESC
  LIMIT 20
`).all([now, ...TARGET_TEAM_IDS, ...TARGET_TEAM_IDS]);

fs.writeFileSync(path.join(outputDir, 'cn-matches.json'), JSON.stringify(cnMatches, null, 2));
console.log(`Exported ${cnMatches.length} XG/YB/VG matches`);

// 导出赛事数据 - 按状态和日期排序：进行中 > 即将开始 > 已结束
const tournaments = db.prepare(`
  SELECT * FROM tournaments 
  ORDER BY 
    CASE status 
      WHEN 'ongoing' THEN 0 
      WHEN 'upcoming' THEN 1 
      WHEN 'completed' THEN 2 
      ELSE 3 
    END,
    start_date DESC
`).all();
console.log(`Exported ${tournaments.length} tournaments`);

// 按赛事分组并聚合系列赛
const seriesByTournament = {};
for (const t of tournaments) {
  const tid = t.id.toLowerCase();
  const tname = t.name.toLowerCase();
  const mainWord = tid.replace(/\d+$/, '').replace(/-.*$/, '').trim();
  
  // 获取该赛事的所有比赛
  const tournamentMatches = db.prepare(`
    SELECT m.*, 
           CASE 
             WHEN m.radiant_score > m.dire_score THEN 1 
             ELSE 0 
           END as radiant_win
    FROM matches m
    WHERE LOWER(m.tournament_id) LIKE ? 
       OR LOWER(m.tournament_id) LIKE ?
       OR LOWER(m.tournament_name) LIKE ?
       OR LOWER(m.tournament_name) LIKE ?
    ORDER BY m.start_time DESC
    LIMIT 50
  `).all(`%${tid}%`, `%${mainWord}%`, `%${tname}%`, `%${mainWord}%`);
  
  // 聚合为系列赛
  seriesByTournament[t.id] = aggregateSeries(tournamentMatches);
}

fs.writeFileSync(path.join(outputDir, 'tournaments.json'), JSON.stringify({
  tournaments,
  seriesByTournament
}, null, 2));
console.log(`Exported series data for ${Object.keys(seriesByTournament).length} tournaments`);

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
  upcoming: dedupedUpcoming,
  cnMatches,
  tournaments,
  seriesByTournament,
  news,
  lastUpdated: new Date().toISOString()
};

fs.writeFileSync(path.join(outputDir, 'home.json'), JSON.stringify(homeData, null, 2));
console.log('Exported home page data');

// 导出 BP 数据（带 match_id 的比赛）
try {
  const bpData = db.prepare(`
    SELECT bp.match_id, bp.picks_bans, bp.radiant_win,
           m.radiant_team_id, m.dire_team_id,
           m.radiant_team_name, m.radiant_team_name_cn,
           m.dire_team_name, m.dire_team_name_cn
    FROM bp_data bp
    JOIN matches m ON bp.match_id = m.match_id
    ORDER BY bp.updated_at DESC
  `).all();

  fs.writeFileSync(path.join(outputDir, 'bp-data.json'), JSON.stringify(bpData, null, 2));
  console.log(`Exported ${bpData.length} BP data items`);
} catch (e) {
  console.log('BP data table not found, skipping...');
}

console.log('Data export complete!');
db.close();
