/**
 * Dota2 比赛同步 API
 * 数据源: Liquipedia API (https://liquipedia.net/dota2/api.php)
 * 功能: 同步即将开始的比赛信息
 */

const LIQUIPEDIA_API = 'https://liquipedia.net/dota2/api.php';

// 中国战队关键词
const CN_TEAMS = ['xg', 'xtreme', 'yb', 'yakult', 'vg', 'vici', 'lgd', 'ar', 'azure', 'astral'];

/**
 * 从 Liquipedia API 获取比赛数据 (使用 gzip)
 */
async function fetchLiquipediaMatches() {
  const zlib = await import('zlib');

  return new Promise((resolve) => {
    const params = new URLSearchParams({
      action: 'parse',
      page: 'Liquipedia:Matches',
      format: 'json',
      prop: 'text'
    });

    const url = `${LIQUIPEDIA_API}?${params}`;
    console.log('[Liquipedia Sync] Fetching from:', url);

    // Use dynamic import for node builtins
    import('node:https').then(({ default: https }) => {
      const options = new URL(url);
      options.headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Encoding': 'gzip',
        'Accept': 'application/json'
      };

      const req = https.get(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);

          try {
            if (res.headers['content-encoding'] === 'gzip') {
              zlib.gunzip(buffer, (err, decompressed) => {
                if (err) {
                  resolve({ html: '', success: false, error: err.message });
                } else {
                  const text = decompressed.toString('utf-8');
                  const data = JSON.parse(text);
                  console.log('[Liquipedia Sync] API response received');

                  if (!data.parse || !data.parse.text) {
                    resolve({ html: '', success: false, error: 'Invalid API response' });
                    return;
                  }

                  resolve({ html: data.parse.text['*'], success: true });
                }
              });
            } else {
              const text = buffer.toString('utf-8');
              const data = JSON.parse(text);
              console.log('[Liquipedia Sync] API response received');

              if (!data.parse || !data.parse.text) {
                resolve({ html: '', success: false, error: 'Invalid API response' });
                return;
              }

              resolve({ html: data.parse.text['*'], success: true });
            }
          } catch (e) {
            resolve({ html: '', success: false, error: e.message });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ html: '', success: false, error: e.message });
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve({ html: '', success: false, error: 'Request timeout' });
      });
    }).catch(e => {
      resolve({ html: '', success: false, error: e.message });
    });
  });
}

/**
 * 识别战队信息
 */
function identifyTeam(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };

  const upperName = name.toUpperCase().trim();
  const lowerName = name.toLowerCase();

  if (upperName === 'XG' || lowerName.includes('xtreme')) {
    return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  }

  if (upperName === 'YB' || lowerName.includes('yakult') ||
      upperName === 'AR' || lowerName.includes('azure')) {
    return { id: 'yakult-brother', name_cn: 'YB', is_cn: true };
  }

  if (upperName === 'VG' || lowerName.includes('vici')) {
    return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  }

  return { id: 'unknown', name_cn: name, is_cn: false };
}

/**
 * 解析 Liquipedia HTML 获取比赛数据
 */
function parseLiquipediaMatches(html) {
  const matches = [];
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysLater = now + (30 * 24 * 60 * 60);

  if (!html) {
    console.log('[Liquipedia Sync] No HTML to parse');
    return matches;
  }

  console.log('[Liquipedia Sync] HTML length:', html.length);

  // Split by match-info div (Liquipedia uses this class)
  const parts = html.split('<div class="match-info">');

  console.log('[Liquipedia Sync] Found', parts.length - 1, 'potential match sections');

  for (let i = 1; i < parts.length; i++) {
    try {
      const part = parts[i];

      const endIdx = part.indexOf('<div class="match-info-tournament">');
      if (endIdx === -1) continue;

      const matchHtml = part.substring(0, endIdx);

      // Extract timestamp
      const tsMatch = matchHtml.match(/data-timestamp="(\d+)"/);
      if (!tsMatch) continue;
      const matchTime = parseInt(tsMatch[1]);

      // Only future matches within 30 days
      if (matchTime < now || matchTime > thirtyDaysLater) continue;

      // Extract teams
      const opponentRegex = /<div class="match-info-header-opponent[^"]*">/g;
      const opponentDivs = matchHtml.split(opponentRegex);

      let team1 = 'TBD';
      let team2 = 'TBD';

      if (opponentDivs.length >= 2) {
        const t1Match = opponentDivs[1].match(/title="([^"]+)"/);
        if (t1Match) team1 = t1Match[1].trim();
      }

      if (opponentDivs.length >= 3) {
        const t2Match = opponentDivs[2].match(/title="([^"]+)"/);
        if (t2Match) team2 = t2Match[1].trim();
      }

      // Skip if teams are TBD
      if (team1 === 'TBD' || team2 === 'TBD') continue;

      // Get team info
      const team1Info = identifyTeam(team1);
      const team2Info = identifyTeam(team2);

      // Extract tournament
      let tournament = '';
      const tourneyMatch = part.substring(endIdx).match(/<div class="match-info-tournament"[^>]*>[^<]*<a[^>]*>([^<]+)/);
      if (tourneyMatch) tournament = tourneyMatch[1].trim();

      matches.push({
        id: `liquipedia_${matchTime}_${team1Info.id}_${team2Info.id}`,
        team1,
        team2,
        start_time: matchTime,
        tournament_name: tournament || 'Dota 2',
        team1Info,
        team2Info,
        status: 'upcoming',
        source: 'liquipedia.net',
      });

    } catch (e) {
      // Skip individual parse errors
    }
  }

  console.log('[Liquipedia Sync] Parsed', matches.length, 'upcoming matches');

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
    // Use team info from Liquipedia if available, otherwise detect
    const radiantInfo = m.team1Info || { name_cn: isChineseTeam(m.team1) ? m.team1 : undefined, is_cn: isChineseTeam(m.team1) };
    const direInfo = m.team2Info || { name_cn: isChineseTeam(m.team2) ? m.team2 : undefined, is_cn: isChineseTeam(m.team2) };

    return {
      id: m.id,
      match_id: parseInt(m.id.replace(/\D/g, '')) || Math.floor(Math.random() * 1000000),
      radiant_team_name: m.team1,
      radiant_team_name_cn: radiantInfo.is_cn ? (radiantInfo.name_cn || m.team1) : undefined,
      dire_team_name: m.team2,
      dire_team_name_cn: direInfo.is_cn ? (direInfo.name_cn || m.team2) : undefined,
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
    console.log('[Liquipedia Sync] Redis connected');
  } catch (redisError) {
    console.error('[Liquipedia Sync] Redis connection failed:', redisError.message);
    return res.status(503).json({
      error: 'Storage service unavailable',
      message: 'Failed to connect to Redis: ' + redisError.message
    });
  }

  try {
    console.log('[Liquipedia Sync] Starting...');

    // 获取现有 upcoming 数据
    let existingUpcoming = [];
    try {
      const data = await redisClient.get('upcoming');
      existingUpcoming = data ? JSON.parse(data) : [];
      console.log(`[Liquipedia Sync] Existing matches: ${existingUpcoming.length}`);
    } catch (kvError) {
      console.error('[Liquipedia Sync] Redis get failed:', kvError.message);
      existingUpcoming = [];
    }

    // 从 Liquipedia API 获取数据
    console.log('[Liquipedia Sync] Fetching from Liquipedia API...');
    const result = await fetchLiquipediaMatches();

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch from Liquipedia API');
    }

    // 解析比赛数据
    console.log('[Liquipedia Sync] Parsing matches...');
    const parsedMatches = parseLiquipediaMatches(result.html);
    console.log(`[Liquipedia Sync] Parsed ${parsedMatches.length} matches`);

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
      console.log(`[Liquipedia Sync] Saved ${upcomingMatches.length} upcoming matches`);
    } catch (kvError) {
      console.error('[Liquipedia Sync] Redis set failed:', kvError.message);
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
      console.log('[Liquipedia Sync] XG matches found:');
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
    console.error('[Liquipedia Sync] Error:', error);
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
        console.error('[Liquipedia Sync] Redis disconnect error:', disconnectError.message);
      }
    }
  }
}
