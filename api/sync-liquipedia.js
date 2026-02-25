/**
 * Dota2 比赛同步 API
 * 数据源: https://dltv.org/matches
 * 只保留更新 upcoming 比赛功能
 */

const DLTV_URL = 'https://dltv.org/matches';

// 中国战队关键词
const CN_TEAMS = ['xg', 'xtreme', 'yb', 'yakult', 'vg', 'vici', 'lgd', 'ar', 'azure', 'astral'];

/**
 * 从 dltv.org 获取比赛数据
 */
async function fetchDLTVMatches() {
  try {
    const response = await fetch(DLTV_URL, {
      signal: AbortSignal.timeout(15000), // 15秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return { html, success: true };
  } catch (error) {
    console.error(`[DLTV Sync] Fetch error:`, error.message);
    return { html: '', success: false, error: error.message };
  }
}

/**
 * 解析 dltv.org HTML 页面
 * 提取今日和明日赛程
 */
function parseDLTVMatches(html) {
  const matches = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // 匹配赛程表格中的比赛
  // 格式: 时间 赛事 对阵
  // 例如: "10:00 EPL Championship 2 NAVI Junior vs DOGSENT"

  // 匹配时间 HH:MM 格式
  const timePattern = /(\d{1,2}:\d{2})/g;

  // 匹配队伍 vs 队伍
  const matchPattern = /([A-Za-z0-9]+(?:\s*[A-Za-z0-9\.\-']+)*)\s+(?:vs\.?)\s+([A-Za-z0-9]+(?:\s*[A-Za-z0-9\.\-']+)*)/gi;

  // 匹配赛事名称 (在时间和对阵之间)
  const tournamentPattern = /(\d{1,2}:\d{2})\s*([A-Za-z0-9][A-Za-z0-9\s\.&\-']*?)\s+([A-Z][a-zA-Z0-9]+(?:\s*[A-Za-z0-9]+)*)\s+vs\.?\s+([A-Z][a-zA-Z0-9]+(?:\s*[A-Za-z0-9]+)*)/gi;

  let matchId = 1;

  // 解析今日赛程
  const todaySection = html.match(/今日赛程[\s\S]*?(?=明日赛程|$)/i);
  if (todaySection) {
    const todayMatches = parseScheduleSection(todaySection[0], currentYear, currentMonth, currentDay, 'today');
    matches.push(...todayMatches);
  }

  // 解析明日赛程
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowSection = html.match(/明日赛程[\s\S]*?$/i);
  if (tomorrowSection) {
    const tomorrowMatches = parseScheduleSection(tomorrowSection[0], tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate(), 'tomorrow');
    matches.push(...tomorrowMatches);
  }

  return matches;
}

/**
 * 解析赛程 section
 */
function parseScheduleSection(section, year, month, day, dayType) {
  const matches = [];
  let matchId = 1;

  // 匹配 "时间 赛事 队伍 vs 队伍" 格式
  // 例如: "10:30 DreamLeague Season 28 BetBoom Team vs Xtreme Gaming"

  // 先提取所有时间
  const timeMatches = [...section.matchAll(/(\d{1,2}:\d{2})/g)];

  // 提取所有比赛对阵
  const teamMatches = [...section.matchAll(/([A-Za-z][a-zA-Z0-9]*(?:\s+[A-Za-z0-9]+)*)\s+vs\.?\s+([A-Za-z][a-zA-Z0-9]*(?:\s+[A-Za-z0-9]+)*)/g)];

  // 尝试匹配完整格式: 时间 + 赛事 + 对阵
  const fullPattern = /(\d{1,2}:\d{2})\s+([A-Za-z][A-Za-z0-9\s\.&\-']*(?:Season|Trophy|League|Championship|Major|Minor)[\s&A-Za-z0-9\-']*)\s+([A-Za-z][a-zA-Z0-9]*(?:\s+[A-Za-z0-9]+)*)\s+vs\.?\s+([A-Za-z][a-zA-Z0-9]*(?:\s+[A-Za-z0-9]+)*)/gi;

  let fullMatch;
  while ((fullMatch = fullPattern.exec(section)) !== null) {
    const time = fullMatch[1];
    const tournament = fullMatch[2].trim();
    const team1 = fullMatch[3].trim();
    const team2 = fullMatch[4].trim();

    // 转换为时间戳 (GMT时区)
    const [hours, minutes] = time.split(':').map(Number);
    const matchDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

    // 只保留未来的比赛
    if (matchDate.getTime() > Date.now()) {
      matches.push({
        id: `dltv_${year}${month}${day}_${matchId++}`,
        team1: team1,
        team2: team2,
        start_time: Math.floor(matchDate.getTime() / 1000),
        tournament_name: tournament,
        status: 'upcoming',
        source: 'dltv.org',
      });
    }
  }

  // 如果完整匹配失败，尝试简单匹配
  if (matches.length === 0) {
    for (const teamMatch of teamMatches) {
      const team1 = teamMatch[1].trim();
      const team2 = teamMatch[2].trim();

      // 查找这个对阵附近的时间
      const teamPos = teamMatch.index;
      const timeBefore = section.substring(Math.max(0, teamPos - 20), teamPos).match(/(\d{1,2}:\d{2})/);

      if (timeBefore) {
        const [hours, minutes] = timeBefore[1].split(':').map(Number);
        const matchDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));

        if (matchDate.getTime() > Date.now()) {
          matches.push({
            id: `dltv_${year}${month}${day}_${matchId++}`,
            team1: team1,
            team2: team2,
            start_time: Math.floor(matchDate.getTime() / 1000),
            tournament_name: 'Dota 2',
            status: 'upcoming',
            source: 'dltv.org',
          });
        }
      }
    }
  }

  return matches;
}

/**
 * 检查是否为中国战队
 */
function isChineseTeam(teamName) {
  if (!teamName) return false;
  const name = teamName.toLowerCase();
  return CN_TEAMS.some(cn => name.includes(cn));
}

/**
 * 转换为应用所需的格式
 */
function convertToAppFormat(matches) {
  return matches.map(m => {
    const radiantIsCN = isChineseTeam(m.team1);
    const direIsCN = isChineseTeam(m.team2);

    return {
      id: m.id,
      match_id: parseInt(m.id.replace(/\D/g, '')) || Math.floor(Math.random() * 1000000),
      radiant_team_name: m.team1,
      radiant_team_name_cn: radiantIsCN ? m.team1 : undefined,
      dire_team_name: m.team2,
      dire_team_name_cn: direIsCN ? m.team2 : undefined,
      start_time: m.start_time,
      series_type: 'BO3',
      tournament_name: m.tournament_name || 'Dota 2 Pro League',
      tournament_name_cn: m.tournament_name,
    };
  });
}

export default async function handler(req, res) {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Redis client
  let redisClient;
  const REDIS_URL = process.env.REDIS_URL;

  if (!REDIS_URL) {
    return res.status(503).json({
      error: 'Storage service unavailable',
      message: 'REDIS_URL environment variable is not configured.'
    });
  }

  try {
    const redis = await import('redis');
    redisClient = redis.createClient({ url: REDIS_URL });
    await redisClient.connect();
    console.log('[DLTV Sync] Redis connected');
  } catch (redisError) {
    console.error('[DLTV Sync] Redis connection failed:', redisError.message);
    return res.status(503).json({
      error: 'Storage service unavailable',
      message: 'Failed to connect to Redis: ' + redisError.message
    });
  }

  try {
    console.log('[DLTV Sync] Starting...');

    // 获取现有 upcoming 数据
    let existingUpcoming = [];
    try {
      const data = await redisClient.get('upcoming');
      existingUpcoming = data ? JSON.parse(data) : [];
      console.log(`[DLTV Sync] Existing matches: ${existingUpcoming.length}`);
    } catch (kvError) {
      console.error('[DLTV Sync] Redis get failed:', kvError.message);
      existingUpcoming = [];
    }

    // 从 dltv.org 获取数据
    console.log('[DLTV Sync] Fetching from dltv.org...');
    const result = await fetchDLTVMatches();

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch from dltv.org');
    }

    // 解析比赛数据
    console.log('[DLTV Sync] Parsing matches...');
    const parsedMatches = parseDLTVMatches(result.html);
    console.log(`[DLTV Sync] Parsed ${parsedMatches.length} matches`);

    // 转换为应用格式
    const appMatches = convertToAppFormat(parsedMatches);

    // 与现有数据合并
    const allMatches = [...existingUpcoming];

    for (const match of appMatches) {
      const isDuplicate = allMatches.some(
        existing =>
          existing.radiant_team_name === match.radiant_team_name &&
          existing.dire_team_name === match.dire_team_name &&
          Math.abs(existing.start_time - match.start_time) < 3600 // 1小时内视为同一场
      );

      if (!isDuplicate) {
        allMatches.push(match);
      }
    }

    // 按时间排序，只保留 upcoming 状态
    const upcomingMatches = allMatches
      .filter(m => m.start_time > Date.now() / 1000)
      .sort((a, b) => a.start_time - b.start_time)
      .slice(0, 50);

    // 保存到 Redis
    try {
      await redisClient.set('upcoming', JSON.stringify(upcomingMatches));
      console.log(`[DLTV Sync] Saved ${upcomingMatches.length} upcoming matches`);
    } catch (kvError) {
      console.error('[DLTV Sync] Redis set failed:', kvError.message);
      return res.status(500).json({
        error: 'Failed to save data',
        message: 'Could not save to Redis: ' + kvError.message
      });
    }

    // 打印 XG 比赛
    const xgMatches = upcomingMatches.filter(m =>
      m.radiant_team_name?.toLowerCase().includes('xg') ||
      m.dire_team_name?.toLowerCase().includes('xg') ||
      m.radiant_team_name?.toLowerCase().includes('xtreme') ||
      m.dire_team_name?.toLowerCase().includes('xtreme')
    );

    if (xgMatches.length > 0) {
      console.log('[DLTV Sync] XG matches found:');
      xgMatches.forEach(m => {
        const time = new Date(m.start_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(`  - ${m.radiant_team_name} vs ${m.dire_team_name} @ ${time}`);
      });
    }

    return res.status(200).json({
      success: true,
      count: upcomingMatches.length,
      xgMatches: xgMatches.length,
      message: `Synced ${upcomingMatches.length} upcoming matches`
    });

  } catch (error) {
    console.error('[DLTV Sync] Error:', error);
    return res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
}
