/**
 * Dota2 比赛同步 API
 * 数据源: https://dltv.org/api/v1/events (新API)
 * 只保留更新 upcoming 比赛功能
 */

const DLTV_API_URL = 'https://dltv.org/api/v1/events';

// 中国战队关键词
const CN_TEAMS = ['xg', 'xtreme', 'yb', 'yakult', 'vg', 'vici', 'lgd', 'ar', 'azure', 'astral'];

/**
 * 从 dltv.org API 获取比赛数据
 */
async function fetchDLTVMatches() {
  try {
    const response = await fetch(DLTV_API_URL, {
      signal: AbortSignal.timeout(15000), // 15秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[DLTV Sync] API response received, type:', typeof data);
    console.log('[DLTV Sync] API response keys:', data && typeof data === 'object' ? Object.keys(data) : 'not an object');

    return { data, success: true };
  } catch (error) {
    console.error(`[DLTV Sync] Fetch error:`, error.message);
    return { data: null, success: false, error: error.message };
  }
}

/**
 * 解析 dltv.org API 响应
 * 返回格式: [{ events: [...], ... }]
 */
function parseDLTVMatches(apiData) {
  const matches = [];

  if (!apiData) {
    console.log('[DLTV Sync] No API data to parse');
    return matches;
  }

  // API 可能返回多种格式，尝试找到 events 数组
  let events = [];

  if (Array.isArray(apiData)) {
    events = apiData;
  } else if (apiData.events && Array.isArray(apiData.events)) {
    events = apiData.events;
  } else if (apiData.data && Array.isArray(apiData.data)) {
    events = apiData.data;
  } else {
    // 尝试在对象中找到数组
    for (const key of Object.keys(apiData)) {
      if (Array.isArray(apiData[key])) {
        console.log(`[DLTV Sync] Found array in key: ${key}`);
        events = apiData[key];
        break;
      }
    }
  }

  console.log(`[DLTV Sync] Processing ${events.length} events`);

  const now = Date.now() / 1000;

  for (const event of events) {
    try {
      // 解析比赛数据 - 尝试多种字段名
      const team1 = event.team1?.name || event.home_team?.name || event.radiant?.name || event.left_team?.name || '';
      const team2 = event.team2?.name || event.away_team?.name || event.dire?.name || event.right_team?.name || '';

      // 解析开始时间 - 尝试多种字段名
      let startTime = event.start_time || event.startTime || event.begin_at || event.start_at || event.timestamp || 0;
      if (typeof startTime === 'string') {
        startTime = Math.floor(new Date(startTime).getTime() / 1000);
      }

      // 赛事名称
      const tournament = event.tournament?.name || event.event?.name || event.league?.name || event.tournament_name || 'Dota 2';

      // 只保留未来的比赛
      if (startTime > now && team1 && team2) {
        matches.push({
          id: event.id?.toString() || `dltv_${startTime}_${Math.random().toString(36).substr(2, 9)}`,
          team1,
          team2,
          start_time: startTime,
          tournament_name: tournament,
          status: 'upcoming',
          source: 'dltv.org',
        });
      }
    } catch (e) {
      console.log('[DLTV Sync] Error parsing event:', e.message);
    }
  }

  console.log(`[DLTV Sync] Parsed ${matches.length} upcoming matches`);

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

    // 从 dltv.org API 获取数据
    console.log('[DLTV Sync] Fetching from dltv.org API...');
    const result = await fetchDLTVMatches();

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch from dltv.org API');
    }

    // 解析比赛数据
    console.log('[DLTV Sync] Parsing matches...');
    const parsedMatches = parseDLTVMatches(result.data);
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
  } finally {
    // 确保 Redis 连接关闭
    if (redisClient) {
      try {
        await redisClient.disconnect();
      } catch (disconnectError) {
        console.error('[DLTV Sync] Redis disconnect error:', disconnectError.message);
      }
    }
  }
}
