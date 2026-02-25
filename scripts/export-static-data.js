import initSqlJs from 'sql.js';
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

const SQL = await initSqlJs();
let db;
try {
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    console.log('Database not found, creating new one');
    db = new SQL.Database();
  }
} catch (e) {
  console.log('Error loading database, creating new one:', e.message);
  db = new SQL.Database();
}

// Helper function to run queries and get results
function runQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    console.log('Query error:', e.message);
    return [];
  }
}

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
    
    // series_type - OpenDota: 0=BO1, 1=BO3, 2=BO5, 3=BO2
    const seriesTypeMap = { 0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO2' };
    let seriesType = match.series_type;
    if (typeof seriesType === 'number' && seriesTypeMap[seriesType]) {
      seriesType = seriesTypeMap[seriesType];
    } else {
      seriesType = seriesType || 'BO3';
    }
    
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
    
    // 记录这场谁赢了 - 根据 radiant_win 判断，然后确定哪支战队获胜
    const matchRadiantTeam = match.radiant_team_name || '';
    const matchDireTeam = match.dire_team_name || '';
    const radiantWin = match.radiant_win !== undefined ? match.radiant_win : (match.radiant_score > match.dire_score);
    
    // 如果 radiant 赢了，radiant 队的战队获胜；否则 dire 队的战队获胜
    const winner = radiantWin ? matchRadiantTeam : matchDireTeam;

    // 系列赛中我们用 seriesTeamA 和 seriesTeamB 来标识两支战队（第一场的队伍）
    const seriesTeamA = groups[groupKey].radiant_team_name;
    const seriesTeamB = groups[groupKey].dire_team_name;
    
    // 判断获胜队伍是 seriesTeamA 还是 seriesTeamB
    // 注意：这里的 seriesTeamA/seriesTeamB 是第一场比赛时的队伍顺序，可能与后续比赛的 radiant/dire 不同
    // 所以我们需要直接比较获胜队伍的名字
    if (winner === seriesTeamA) {
      groups[groupKey].radiant_wins++;
    } else if (winner === seriesTeamB) {
      groups[groupKey].dire_wins++;
    } else {
      // 兜底逻辑：如果 winner 与 seriesTeamA/seriesTeamB 都不匹配，可能数据有问题，跳过
      console.warn(`Warning: winner "${winner}" doesn't match seriesTeamA "${seriesTeamA}" or seriesTeamB "${seriesTeamB}"`);
    }

    // Store the Chinese team names for the series
    if (!groups[groupKey].radiant_team_name_cn && match.radiant_team_name_cn) {
      groups[groupKey].radiant_team_name_cn = match.radiant_team_name_cn;
    }
    if (!groups[groupKey].dire_team_name_cn && match.dire_team_name_cn) {
      groups[groupKey].dire_team_name_cn = match.dire_team_name_cn;
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
    // 按最后一场比赛的时间倒序排列（最新完成的比赛显示在上面）
    const timeA = a.games[a.games.length - 1]?.start_time || 0;
    const timeB = b.games[b.games.length - 1]?.start_time || 0;
    return timeB - timeA;
  });
}

// 导出比赛数据
const matches = runQuery(`
  SELECT m.*,
         COALESCE(m.tournament_name, t.name) as tournament_name,
         COALESCE(m.tournament_name_cn, t.name_cn) as tournament_name_cn,
         t.tier as tournament_tier
  FROM matches m
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  ORDER BY m.start_time DESC
`);

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
const upcomingMatches = runQuery(`
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
`, [now, ...TARGET_TEAM_IDS, ...TARGET_TEAM_IDS]);

// 获取所有未来比赛（不限战队）用于去重
const allUpcomingMatches = runQuery(`
  SELECT m.*,
         COALESCE(m.tournament_name, t.name) as tournament_name,
         COALESCE(m.tournament_name_cn, t.name_cn) as tournament_name_cn,
         t.tier as tournament_tier
  FROM matches m
  LEFT JOIN tournaments t ON m.tournament_id = t.id
  WHERE m.start_time > ?
  ORDER BY m.start_time ASC
  LIMIT 20
`, [now]);

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
const cnMatches = runQuery(`
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
`, [now, ...TARGET_TEAM_IDS, ...TARGET_TEAM_IDS]);

fs.writeFileSync(path.join(outputDir, 'cn-matches.json'), JSON.stringify(cnMatches, null, 2));
console.log(`Exported ${cnMatches.length} XG/YB/VG matches`);

// 导出赛事数据 - 从 league_id 构建
const leagueIds = runQuery('SELECT DISTINCT league_id FROM matches WHERE league_id IS NOT NULL');

const tournamentInfo = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S', location: '线上', prize: '$1,000,000', status: 'completed', start_date: '2026-02-03', end_date: '2026-03-02' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S', location: '线上', prize: '$1,000,000', status: 'completed', start_date: '2025-11-10', end_date: '2025-12-08' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'S', location: '中国', prize: '$100,000', status: 'completed', start_date: '2026-01-27', end_date: '2026-02-02' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S', location: '线上', prize: '$1,000,000', status: 'completed', start_date: '2026-02-03', end_date: '2026-02-16' },
};

const leagueIdMap = {
  'dreamleague-s28': 19269,
  'dreamleague-s27': 18988,
  'esl-challenger-china': 19130,
  'blast-slam-vi': 19099,
};

const tournaments = leagueIds.map(l => {
  const info = tournamentInfo[l.league_id];
  if (!info) return null;
  return {
    ...info,
    prize_pool: info.prize
  };
}).filter(Boolean);

console.log(`Exported ${tournaments.length} tournaments`);

// 按赛事分组并聚合系列赛
const seriesByTournament = {};
for (const t of tournaments) {
  const leagueId = leagueIdMap[t.id];
  if (!leagueId) continue;
  
  const tournamentMatches = runQuery(`
    SELECT m.*
    FROM matches m
    WHERE m.league_id = ?
    ORDER BY m.start_time DESC
    LIMIT 100
  `, [leagueId]);
  
  seriesByTournament[t.id] = aggregateSeries(tournamentMatches);
}

fs.writeFileSync(path.join(outputDir, 'tournaments.json'), JSON.stringify({
  tournaments,
  seriesByTournament
}, null, 2));
console.log(`Exported series data for ${Object.keys(seriesByTournament).length} tournaments`);

// 导出战队数据
const teams = runQuery('SELECT * FROM teams');
fs.writeFileSync(path.join(outputDir, 'teams.json'), JSON.stringify(teams, null, 2));
console.log(`Exported ${teams.length} teams`);

// 导出新闻数据
const news = runQuery('SELECT * FROM news ORDER BY published_at DESC');
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
  const bpData = runQuery(`
    SELECT bp.match_id, bp.picks_bans, bp.radiant_win,
           m.radiant_team_id, m.dire_team_id,
           m.radiant_team_name, m.radiant_team_name_cn,
           m.dire_team_name, m.dire_team_name_cn
    FROM bp_data bp
    JOIN matches m ON bp.match_id = m.match_id
    ORDER BY bp.updated_at DESC
  `);

  fs.writeFileSync(path.join(outputDir, 'bp-data.json'), JSON.stringify(bpData, null, 2));
  console.log(`Exported ${bpData.length} BP data items`);
} catch (e) {
  console.log('BP data table not found, skipping...');
}

console.log('Data export complete!');
db.close();
