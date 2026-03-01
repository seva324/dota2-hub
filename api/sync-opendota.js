/**
 * OpenDota 数据同步 API
 * 功能：
 * 1. 同步比赛数据 (matches)
 * 2. 同步联赛/赛事数据 (tournaments)
 * 3. 构建 seriesByTournament 数据
 * 4. 更新 teams.json
 *
 * Storage: Dual-write to Redis and Neon PostgreSQL
 */

import { createClient } from 'redis';
import { neon } from '@neondatabase/serverless';

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let redis;
let sql = null;

async function getRedis() {
  if (!redis && REDIS_URL) {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

const OPENDOTA = 'https://api.opendota.com/api';

// League NAME 映射到赛事 ID (使用 league_name 因为 league_id 常为 null)
const LEAGUE_NAME_MAP = {
  'dream league season28': { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  'dreamleague season 28': { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  'dream league s28': { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  'dream league season27': { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  'dreamleague season 27': { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  'blast slam': { id: 'blast-slam', name: 'BLAST Slam', name_cn: 'BLAST 锦标赛', tier: 'S' },
  'esl one': { id: 'esl-one', name: 'ESL One', name_cn: 'ESL One', tier: 'S' },
  'pgl': { id: 'pgl', name: 'PGL', name_cn: 'PGL', tier: 'S' },
  'ultras dota pro league': { id: 'ultras-dpl', name: 'Ultras Dota Pro League', name_cn: '超级DPL', tier: 'A' },
  'destiny league': { id: 'destiny-league', name: 'Destiny League', name_cn: '命运联赛', tier: 'B' },
  'epl championship': { id: 'epl-championship', name: 'EPL Championship', name_cn: 'EPL 锦标赛', tier: 'A' },
  'snake trophy': { id: 'snake-trophy', name: 'Snake Trophy', name_cn: '蛇杯', tier: 'B' },
  'dota 2 space league': { id: 'space-league', name: 'Dota 2 Space League', name_cn: '太空联赛', tier: 'C' },
};

// Target leagues to sync
const TARGET_LEAGUES = [
  { league_id: 19269, id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  { league_id: 18988, id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  { league_id: 19099, id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  { league_id: 19130, id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'S' }
];

// Fallback: League IDs 映射 (用于有 league_id 的情况)
const LEAGUE_IDS = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'S' },
};

/**
 * 根据 league_name 查找赛事信息
 */
function findTournamentByLeagueName(leagueName) {
  if (!leagueName) return null;
  const normalized = leagueName.toLowerCase().trim().replace(/\s+/g, '');
  const trimmed = leagueName.toLowerCase().trim();

  // Try exact match (with spaces removed)
  if (LEAGUE_NAME_MAP[normalized]) {
    return LEAGUE_NAME_MAP[normalized];
  }
  // Try exact match with original spacing
  if (LEAGUE_NAME_MAP[trimmed]) {
    return LEAGUE_NAME_MAP[trimmed];
  }
  // Try partial match
  for (const [key, value] of Object.entries(LEAGUE_NAME_MAP)) {
    const keyNormalized = key.replace(/\s+/g, '');
    if (normalized.includes(keyNormalized) || keyNormalized.includes(normalized)) {
      return value;
    }
  }
  return null;
}

/**
 * 根据 league_id 查找赛事信息 (备用)
 */
function findTournamentByLeagueId(leagueId) {
  if (!leagueId) return null;
  return LEAGUE_IDS[leagueId] || null;
}

// 中国战队 ID 映射
const TEAMS = {
  'xtreme-gaming': { name: 'Xtreme Gaming', name_cn: 'XG', id: 8261502 },
  'yakult-brothers': { name: 'Yakult Brothers', name_cn: 'YB', id: 8255888 },
  'vici-gaming': { name: 'Vici Gaming', name_cn: 'VG', id: 7391077 },
};

// 已知战队 Logo URL 映射
const TEAM_LOGOS = {
  'xtreme gaming': 'https://cdn.steamusercontent.com/ugc/2497048774300606299/9E80D5D82C03B2C9EB89365E6E0A1B87C8E73F94/',
  'xg': 'https://cdn.steamusercontent.com/ugc/2497048774300606299/9E80D5D82C03B2C9EB89365E6E0A1B87C8E73F94/',
  'yakult brothers': 'https://liquipedia.net/commons/images/4/43/Yakult_Brothers_allmode.png',
  'yb': 'https://liquipedia.net/commons/images/4/43/Yakult_Brothers_allmode.png',
  'vici gaming': 'https://liquipedia.net/commons/images/6/6a/Vici_Gaming_2020_allmode.png',
  'vg': 'https://liquipedia.net/commons/images/6/6a/Vici_Gaming_2020_allmode.png',
  'team liquid': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/2163.png',
  'team spirit': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/2583775.png',
  'tundra esports': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/4972334.png',
  'og': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/174725042.png',
  'aurora gaming': 'https://cdn.steamusercontent.com/ugc/13052583756685508/22B0338D7E09FB2F021E5DB5BBEFFD170D5E5E1A/',
  'psg.lgd': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/8878.png',
  'lgd gaming': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/8878.png',
  'azure ray': 'https://liquipedia.net/commons/images/6/60/Azure_Ray_2023_allmode.png',
  'ar': 'https://liquipedia.net/commons/images/6/60/Azure_Ray_2023_allmode.png',
  'gaimin gladiators': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/956540635.png',
  'betera': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/5458640.png',
  'nigma galaxy': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/125006419.png',
  't1': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/4974022.png',
  'nouns': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/1013301416.png',
  'heroic': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/940393583.png',
  'gamerlegion': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/6376678.png',
  'spirit': 'https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/2583775.png',
};

// 获取队伍 Logo - 同步版本，只检查本地缓存
function getTeamLogo(teamName) {
  if (!teamName) return null;
  const name = teamName.toLowerCase();
  return TEAM_LOGOS[name] || null;
}

// 获取队伍 Logo - 异步版本，检查本地缓存 + 数据库
async function getTeamLogoFromDb(db, teamName) {
  if (!teamName) return null;
  const name = teamName.toLowerCase();

  // 先检查本地缓存
  if (TEAM_LOGOS[name]) return TEAM_LOGOS[name];

  // 如果数据库可用，从数据库获取
  if (db) {
    try {
      const [team] = await db`SELECT logo_url FROM teams WHERE LOWER(name) = ${name} OR LOWER(name_cn) = ${name} OR LOWER(tag) = ${name}`;
      if (team?.logo_url) {
        return team.logo_url;
      }
    } catch (e) {
      console.log(`[Teams] DB query failed: ${e.message}`);
    }
  }

  return null;
}

/**
 * 保存队伍到数据库（如果不存在则创建）
 */
async function saveTeamToDb(db, teamName, teamId = null) {
  if (!db || !teamName) return;

  // 检查队伍是否已存在
  const [existing] = await db`SELECT id FROM teams WHERE LOWER(name) = ${teamName.toLowerCase()}`;

  if (existing) return; // 已存在

  // 调用 OpenDota API 获取队伍信息
  try {
    const opendotaTeamsUrl = teamId
      ? `${OPENDOTA}/teams/${teamId}`
      : `${OPENDOTA}/teams?search=${encodeURIComponent(teamName)}`;
    const response = await fetch(opendotaTeamsUrl);
    if (!response.ok) return;

    const teamData = teamId ? [await response.json()] : await response.json();
    const team = teamData.find(t => t.name?.toLowerCase() === teamName.toLowerCase()) || teamData[0];

    if (team?.team_id) {
      // 识别中文名
      const nameCn = identify(teamName).name_cn;
      const isCn = identify(teamName).is_cn;

      await db`
        INSERT INTO teams (id, name, name_cn, tag, logo_url, region, is_cn_team, created_at, updated_at)
        VALUES (${String(team.team_id)}, ${team.name}, ${nameCn}, ${team.tag || ''}, ${team.logo_url || ''}, ${team.region || 'Unknown'}, ${isCn ? 1 : 0}, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
        ON CONFLICT (id) DO UPDATE SET
          logo_url = EXCLUDED.logo_url,
          name_cn = EXCLUDED.name_cn,
          updated_at = NOW()
      `;
      console.log(`[Teams] Added/Updated: ${team.name} (${team.team_id})`);
    }
  } catch (e) {
    console.log(`[Teams] Failed to fetch team ${teamName}: ${e.message}`);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * 从 OpenDota 获取联赛信息并同步 tournaments 数据
 */
async function syncTournaments(r, matchesData) {
  console.log('=== Syncing Tournaments ===');

  // 获取现有 tournaments 数据
  let existingTournaments = { tournaments: [], seriesByTournament: {} };
  try {
    const data = await r.get('tournaments');
    if (data) existingTournaments = JSON.parse(data);
  } catch (e) { console.log('No existing tournaments'); }

  // 从 matches 构建 seriesByTournament
  const seriesByTournament = {};
  const matchIds = Object.keys(matchesData);

  for (const matchId of matchIds) {
    const m = matchesData[matchId];

    // 优先使用 league_name 识别赛事 (因为 league_id 常为 null)
    let tournamentInfo = null;
    if (m.league_name) {
      tournamentInfo = findTournamentByLeagueName(m.league_name);
    }
    // 备用: 使用 league_id
    if (!tournamentInfo && m.leagueid) {
      tournamentInfo = findTournamentByLeagueId(m.leagueid);
    }
    if (!tournamentInfo) continue;

    const tournamentId = tournamentInfo.id;

    // 初始化赛事
    if (!seriesByTournament[tournamentId]) {
      seriesByTournament[tournamentId] = [];
    }

    // 按 series_id 分组 (基于相同对战组合)
    const seriesKey = `${m.radiant_team_name}_vs_${m.dire_team_name}_${m.series_type || 'BO3'}`;
    let series = seriesByTournament[tournamentId].find(s => s.series_id === seriesKey);

    if (!series) {
      series = {
        series_id: seriesKey,
        series_type: m.series_type || 'BO3',
        radiant_team_name: m.radiant_team_name,
        dire_team_name: m.dire_team_name,
        radiant_team_logo: m.radiant_team_logo || null,
        dire_team_logo: m.dire_team_logo || null,
        radiant_wins: 0,
        dire_wins: 0,
        games: []
      };
      seriesByTournament[tournamentId].push(series);
    }

    // 添加比赛到系列赛
    series.games.push({
      match_id: m.match_id,
      radiant_team_name: m.radiant_team_name,
      dire_team_name: m.dire_team_name,
      radiant_team_logo: m.radiant_team_logo || null,
      dire_team_logo: m.dire_team_logo || null,
      radiant_score: m.radiant_score || 0,
      dire_score: m.dire_score || 0,
      radiant_win: m.radiant_win,
      start_time: m.start_time,
      duration: m.duration
    });

    // 更新胜负统计
    if (m.radiant_win === 1) {
      series.radiant_wins++;
    } else {
      series.dire_wins++;
    }
  }

  // 构建 tournaments 列表 - 从 seriesByTournament 的 key 构建
  const tournaments = [];
  const addedTournamentIds = new Set();

  // 合并所有可能的 tournament info 来源
  const allTournamentInfo = { ...LEAGUE_NAME_MAP, ...LEAGUE_IDS };

  for (const tournamentId of Object.keys(seriesByTournament)) {
    if (addedTournamentIds.has(tournamentId)) continue;
    if (seriesByTournament[tournamentId].length === 0) continue;

    // 查找 tournament 信息
    let info = allTournamentInfo[tournamentId];
    if (!info) {
      // 尝试从 league_name_map 的值中查找
      for (const v of Object.values(LEAGUE_NAME_MAP)) {
        if (v.id === tournamentId) {
          info = v;
          break;
        }
      }
    }
    if (!info) {
      // 尝试从 league_ids 的值中查找
      for (const v of Object.values(LEAGUE_IDS)) {
        if (v.id === tournamentId) {
          info = v;
          break;
        }
      }
    }

    if (info) {
      tournaments.push({
        id: info.id,
        name: info.name,
        name_cn: info.name_cn,
        tier: info.tier,
        location: 'Online',
        status: 'completed'
      });
      addedTournamentIds.add(tournamentId);
    }
  }

  // 保存到 Redis
  const newTournaments = { tournaments, seriesByTournament };
  await r.set('tournaments', JSON.stringify(newTournaments));

  console.log(`Synced ${tournaments.length} tournaments with series data`);

  return { tournaments, seriesByTournament };
}

/**
 * Save match to Neon database
 */
async function saveMatchToDb(db, match) {
  if (!db) return;
  try {
    await db`
      INSERT INTO matches (
        match_id, series_id, radiant_team_id, radiant_team_name, radiant_team_name_cn,
        radiant_team_logo, dire_team_id, dire_team_name, dire_team_name_cn,
        dire_team_logo, radiant_score, dire_score, radiant_win, start_time,
        duration, league_id, series_type, status, raw_json, updated_at
      ) VALUES (
        ${parseInt(match.match_id)}, ${match.series_id || null}, ${match.radiant_team_id}, ${match.radiant_team_name},
        ${match.radiant_team_name_cn}, ${match.radiant_team_logo}, ${match.dire_team_id},
        ${match.dire_team_name}, ${match.dire_team_name_cn}, ${match.dire_team_logo},
        ${match.radiant_score || 0}, ${match.dire_score || 0}, ${match.radiant_win ? 1 : 0},
        ${match.start_time}, ${match.duration || 0}, ${match.league_id}, ${match.series_type || 'BO3'},
        ${match.status || 'finished'}, ${JSON.stringify(match)}, NOW()
      )
      ON CONFLICT (match_id) DO UPDATE SET
        radiant_score = EXCLUDED.radiant_score,
        dire_score = EXCLUDED.dire_score,
        radiant_win = EXCLUDED.radiant_win,
        series_id = EXCLUDED.series_id,
        updated_at = NOW()
    `;
  } catch (e) {
    console.error(`[DB] Failed to save match ${match.match_id}:`, e.message, e.stack);
  }
}

/**
 * Save tournament to Neon database
 */
async function saveTournamentToDb(db, tournament) {
  if (!db) return;
  try {
    await db`
      INSERT INTO tournaments (id, name, name_cn, tier, location, status, league_id, updated_at)
      VALUES (${tournament.id}, ${tournament.name}, ${tournament.name_cn},
        ${tournament.tier}, ${tournament.location}, ${tournament.status},
        ${tournament.leagueid}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        name_cn = EXCLUDED.name_cn,
        tier = EXCLUDED.tier,
        updated_at = NOW()
    `;
  } catch (e) {
    console.error(`[DB] Failed to save tournament ${tournament.id}:`, e.message);
  }
}

function identify(name) {
  if (!name) return { id: 'unknown', name_cn: name, is_cn: false };
  const u = name.toUpperCase(), l = name.toLowerCase();
  if (u === 'XG' || l.includes('xtreme')) return { id: 'xtreme-gaming', name_cn: 'XG', is_cn: true };
  if (u === 'YB' || l.includes('yakult') || u === 'AR' || l.includes('azure')) 
    return { id: 'yakult-brothers', name_cn: 'YB', is_cn: true };
  if (u === 'VG' || l.includes('vici')) return { id: 'vici-gaming', name_cn: 'VG', is_cn: true };
  return { id: 'unknown', name_cn: name, is_cn: false };
}

function convert(m, td = null) {
  // 直接使用 OpenDota 提供的原始战队名称，不做任何转换
  const now = Date.now() / 1000;
  const status = m.start_time < now - 3600 ? 'finished' : m.start_time < now ? 'live' : 'scheduled';
  const rw = m.radiant_win;

  // 获取战队名称 - 直接使用 OpenDota 提供的原始名称
  const radiantTeamName = td && m.radiant ? td.name : (m.radiant_name || null);
  const direTeamName = td && !m.radiant ? td.name : (m.opposing_team_name || m.dire_name || null);

  // 获取队伍 logo - 用英文名查找
  const radiantLogo = getTeamLogo(radiantTeamName);
  const direLogo = getTeamLogo(direTeamName);

  if (td) {
    const isR = m.radiant;
    return {
      match_id: String(m.match_id),
      series_id: m.series_id ? String(m.series_id) : null,
      radiant_team_id: isR ? td.id : 'unknown',
      dire_team_id: isR ? 'unknown' : td.id,
      // 直接使用 OpenDota 提供的名称
      radiant_team_name: isR ? td.name : (m.opposing_team_name || null),
      radiant_team_name_cn: null,
      dire_team_name: isR ? (m.opposing_team_name || null) : td.name,
      dire_team_name_cn: null,
      radiant_team_logo: isR ? radiantLogo : getTeamLogo(m.opposing_team_name),
      dire_team_logo: isR ? getTeamLogo(m.opposing_team_name) : direLogo,
      radiant_score: m.radiant_score || 0, dire_score: m.dire_score || 0,
      // radiant_win 表示 radiant 方是否获胜
      radiant_game_wins: rw ? 1 : 0, dire_game_wins: rw ? 0 : 1,
      start_time: m.start_time, duration: m.duration || 0, league_id: m.leagueid,
      series_type: m.series_type !== undefined ? String(m.series_type) : 'BO3',
      status, lobby_type: 7, radiant_win: rw ? 1 : 0,
    };
  }
  // 非 td 模式 - 直接使用 OpenDota 原始名称
  return {
    match_id: String(m.match_id),
    series_id: m.series_id ? String(m.series_id) : null,
    radiant_team_id: m.radiant_team_id || null,
    dire_team_id: m.dire_team_id || null,
    radiant_team_name: m.radiant_name || null,
    radiant_team_name_cn: null,
    dire_team_name: m.dire_name || null,
    dire_team_name_cn: null,
    radiant_team_logo: radiantLogo,
    dire_team_logo: direLogo,
    radiant_score: m.radiant_score || 0, dire_score: m.dire_score || 0,
    radiant_game_wins: status === 'finished' ? (rw ? 1 : 0) : 0,
    dire_game_wins: status === 'finished' ? (rw ? 0 : 1) : 0,
    start_time: m.start_time, duration: m.duration || 0, league_id: m.leagueid || null,
    series_type: m.series_type !== undefined ? String(m.series_type) : 'BO3',
    status, lobby_type: m.lobby_type || 0, radiant_win: rw ? 1 : 0,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (!REDIS_URL) {
      return res.status(500).json({ error: 'REDIS_URL not configured' });
    }

    const r = await getRedis();
    await r.ping();
    console.log('Redis connected!');

    // Get Neon DB
    const db = getDb();
    if (db) {
      console.log('[DB] Neon database connected');
    } else {
      console.log('[DB] DATABASE_URL not configured, skipping database write');
    }

    // 获取现有数据
    let existing = {};
    try {
      const data = await r.get('matches');
      if (data) existing = JSON.parse(data);
    } catch (e) { console.log('No existing'); }

    // 获取新数据 - only from target leagues to avoid timeout
    let cn = [];

    // Fetch matches from target leagues only (last 30 days to get series_id)
    const thirtyDaysAgo = Date.now() / 1000 - 30 * 24 * 60 * 60;
    for (const league of TARGET_LEAGUES) {
      try {
        const leagueMatches = await fetchJSON(`${OPENDOTA}/leagues/${league.league_id}/matches`);
        // Filter to last 30 days to get series_id
        const recentMatches = leagueMatches.filter(m => m.start_time > thirtyDaysAgo);
        for (const m of recentMatches) {
          const c = convert(m);
          if (c) cn.push(c);
        }
      } catch (e) {
        console.error(`Failed to fetch league ${league.league_id}:`, e.message);
      }
    }

    // 保存 matches 和队伍 - 强制保存到数据库不管是否已存在
    let saved = 0;
    let dbSaved = 0;
    const processedTeams = new Set();

    // 强制保存所有比赛到数据库
    for (const m of cn) {
      existing[m.match_id] = m;
      saved++;

      // 保存到 Neon 数据库
      if (db) {
        // 自动保存新队伍到数据库
        if (db) {
          // 保存 radiant team
          if (m.radiant_team_name && !processedTeams.has(m.radiant_team_name.toLowerCase())) {
            await saveTeamToDb(db, m.radiant_team_name, m.radiant_team_id);
            processedTeams.add(m.radiant_team_name.toLowerCase());
          }
          // 保存 dire team
          if (m.dire_team_name && !processedTeams.has(m.dire_team_name.toLowerCase())) {
            await saveTeamToDb(db, m.dire_team_name, m.dire_team_id);
            processedTeams.add(m.dire_team_name.toLowerCase());
          }

          await saveMatchToDb(db, m);
          dbSaved++;
        }
      }
    }
    await r.set('matches', JSON.stringify(existing));

    const list = Object.values(existing).sort((a,b) => b.start_time - a.start_time).slice(0, 500);
    await r.set('matches:list', JSON.stringify(list));

    // 同步 tournaments 数据
    const tournamentsResult = await syncTournaments(r, existing);

    // Save tournaments to Neon
    if (db) {
      for (const t of tournamentsResult.tournaments) {
        await saveTournamentToDb(db, t);
      }
    }

    return res.status(200).json({
      success: true,
      matches: { saved, total: Object.keys(existing).length, dbSaved },
      tournaments: { count: tournamentsResult.tournaments.length, seriesCount: Object.keys(tournamentsResult.seriesByTournament).length }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
