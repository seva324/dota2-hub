/**
 * Liquipedia Data Sync API
 * Fetches upcoming matches from Liquipedia and saves to Neon
 */

import { neon } from '@neondatabase/serverless';

const LIQUIPEDIA_API = 'https://liquipedia.net/dota2/api.php';
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// 中国战队关键词
const CN_TEAMS = ['xg', 'xtreme', 'yb', 'yakult', 'vg', 'vici', 'lgd', 'ar', 'azure', 'astral'];

/**
 * 从 Liquipedia API 获取比赛数据
 */
async function fetchLiquipediaMatches() {
  try {
    const params = new URLSearchParams({
      action: 'parse',
      page: 'Liquipedia:Matches',
      format: 'json',
      prop: 'text'
    });

    const url = `${LIQUIPEDIA_API}?${params}`;
    console.log('[Liquipedia Sync] Fetching from:', url);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    console.log('[Liquipedia Sync] Response status:', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.log('[Liquipedia Sync] Error response:', text.substring(0, 200));
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    console.log('[Liquipedia Sync] Response length:', text.length);

    const data = JSON.parse(text);
    console.log('[Liquipedia Sync] API response received');

    if (!data.parse || !data.parse.text) {
      throw new Error('Invalid API response');
    }

    return { html: data.parse.text['*'], success: true };
  } catch (error) {
    console.error('[Liquipedia Sync] Fetch error:', error.message);
    return { html: '', success: false, error: error.message };
  }
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

  // Split by match-info div
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
      const tourneySection = part.substring(endIdx);

      // Try multiple patterns
      const tourneyMatch = tourneySection.match(/<div class="match-info-tournament"[^>]*>[^<]*(?:<a[^>]*>)?([^<]+)/);
      if (tourneyMatch) {
        tournament = tourneyMatch[1].trim();
      }

      // Pattern 2: Try data-tournament attribute
      if (!tournament) {
        const dataTourneyMatch = part.match(/data-tournament="([^"]+)"/);
        if (dataTourneyMatch) tournament = dataTourneyMatch[1].trim();
      }

      if (!tournament) {
        console.log(`[Liquipedia Sync] Warning: Could not extract tournament for ${team1} vs ${team2}`);
      }

      matches.push({
        id: `liquipedia_${matchTime}_${team1Info.id}_${team2Info.id}`,
        team1,
        team2,
        start_time: matchTime,
        tournament_name: tournament || null,
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

/**
 * Save upcoming match to Neon database
 */
async function saveUpcomingToDb(db, match) {
  if (!db) return;
  try {
    await db`
      INSERT INTO upcoming_matches (
        id, match_id, radiant_team_name, radiant_team_name_cn,
        dire_team_name, dire_team_name_cn, start_time, series_type,
        tournament_name, tournament_name_cn, status, source, updated_at
      ) VALUES (
        ${match.id}, ${match.match_id}, ${match.radiant_team_name},
        ${match.radiant_team_name_cn}, ${match.dire_team_name},
        ${match.dire_team_name_cn}, ${match.start_time}, ${match.series_type},
        ${match.tournament_name}, ${match.tournament_name_cn}, 'upcoming',
        ${match.source || 'liquipedia.net'}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        start_time = EXCLUDED.start_time,
        tournament_name = EXCLUDED.tournament_name,
        tournament_name_cn = EXCLUDED.tournament_name_cn,
        status = 'upcoming',
        updated_at = NOW()
    `;
  } catch (e) {
    console.error(`[DB] Failed to save upcoming ${match.id}:`, e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Neon DB
  let db = null;
  if (DATABASE_URL) {
    try {
      db = neon(DATABASE_URL);
      await db`SELECT 1`;
      console.log('[Liquipedia Sync] Neon DB connected');
    } catch (dbError) {
      console.error('[Liquipedia Sync] Neon DB connection failed:', dbError.message);
      return res.status(503).json({
        error: 'Database unavailable',
        message: 'Failed to connect to Neon: ' + dbError.message
      });
    }
  } else {
    return res.status(503).json({
      error: 'Database not configured',
      message: 'DATABASE_URL environment variable is not set'
    });
  }

  try {
    console.log('[Liquipedia Sync] Starting...');

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

    // Save to Neon
    let dbSaved = 0;
    for (const match of appMatches) {
      await saveUpcomingToDb(db, match);
      dbSaved++;
    }
    console.log(`[Liquipedia Sync] Saved ${dbSaved} upcoming matches to Neon`);

    // 打印 XG 比赛
    const xgMatches = appMatches.filter(m =>
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
      count: appMatches.length,
      xgMatches: xgMatches.length,
      message: `Synced ${appMatches.length} upcoming matches`
    });

  } catch (error) {
    console.error('[Liquipedia Sync] Error:', error);
    return res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
}
