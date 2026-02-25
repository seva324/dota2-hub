/**
 * OpenDota 数据同步 API
 * 功能：
 * 1. 同步比赛数据 (matches)
 * 2. 同步联赛/赛事数据 (tournaments)
 * 3. 构建 seriesByTournament 数据
 * 4. 更新 teams.json
 */

import { createClient } from 'redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REDIS_URL = process.env.REDIS_URL;

let redis;
async function getRedis() {
  if (!redis && REDIS_URL) {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  }
  return redis;
}

const OPENDOTA = 'https://api.opendota.com/api';

// League IDs 映射到赛事 ID
const LEAGUE_IDS = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'A' },
};

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

// 获取队伍 Logo
function getTeamLogo(teamName) {
  if (!teamName) return null;
  const name = teamName.toLowerCase();
  return TEAM_LOGOS[name] || null;
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
    if (!m.leagueid) continue;

    const leagueId = String(m.leagueid);
    const tournamentInfo = LEAGUE_IDS[leagueId];
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

  // 构建 tournaments 列表
  const tournaments = [];
  for (const [leagueId, info] of Object.entries(LEAGUE_IDS)) {
    if (seriesByTournament[info.id] && seriesByTournament[info.id].length > 0) {
      tournaments.push({
        id: info.id,
        name: info.name,
        name_cn: info.name_cn,
        tier: info.tier,
        location: 'Online',
        status: 'completed',
        leagueid: parseInt(leagueId)
      });
    }
  }

  // 保存到 Redis
  const newTournaments = { tournaments, seriesByTournament };
  await r.set('tournaments', JSON.stringify(newTournaments));

  console.log(`Synced ${tournaments.length} tournaments with series data`);

  return { tournaments, seriesByTournament };
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
  const rt = identify(m.radiant_name), dt = identify(m.dire_name);
  // Remove Chinese team filter - get ALL matches from tournaments
  // if (!rt.is_cn && !dt.is_cn && !td) return null;
  const now = Date.now() / 1000;
  const status = m.start_time < now - 3600 ? 'finished' : m.start_time < now ? 'live' : 'scheduled';
  const rw = m.radiant_win;

  // 获取队伍 logo
  const radiantTeamName = td && m.radiant ? td.name : (m.radiant_name || null);
  const direTeamName = td && !m.radiant ? td.name : (m.opposing_team_name || m.dire_name || null);
  const radiantLogo = getTeamLogo(radiantTeamName);
  const direLogo = getTeamLogo(direTeamName);

  if (td) {
    const isR = m.radiant;
    return {
      match_id: String(m.match_id), radiant_team_id: isR ? td.id : 'unknown',
      dire_team_id: isR ? 'unknown' : td.id,
      radiant_team_name: isR ? td.name : m.opposing_team_name,
      radiant_team_name_cn: isR ? td.name_cn : identify(m.opposing_team_name).name_cn,
      dire_team_name: isR ? m.opposing_team_name : td.name,
      dire_team_name_cn: isR ? identify(m.opposing_team_name).name_cn : td.name_cn,
      radiant_team_logo: isR ? radiantLogo : getTeamLogo(m.opposing_team_name),
      dire_team_logo: isR ? getTeamLogo(m.opposing_team_name) : direLogo,
      radiant_score: m.radiant_score || 0, dire_score: m.dire_score || 0,
      radiant_game_wins: rw ? 1 : 0, dire_game_wins: rw ? 0 : 1,
      start_time: m.start_time, duration: m.duration || 0, leagueid: m.leagueid,
      series_type: 'BO3', status, lobby_type: 7, radiant_win: rw ? 1 : 0,
    };
  }
  return {
    match_id: String(m.match_id), radiant_team_id: rt.id, dire_team_id: dt.id,
    radiant_team_name: m.radiant_name || null, radiant_team_name_cn: rt.name_cn,
    dire_team_name: m.dire_name || null, dire_team_name_cn: dt.name_cn,
    radiant_team_logo: radiantLogo,
    dire_team_logo: direLogo,
    radiant_score: m.radiant_score || 0, dire_score: m.dire_score || 0,
    radiant_game_wins: status === 'finished' ? (rw ? 1 : 0) : 0,
    dire_game_wins: status === 'finished' ? (rw ? 0 : 1) : 0,
    start_time: m.start_time, duration: m.duration || 0, leagueid: m.leagueid || null,
    series_type: 'BO3', status, lobby_type: m.lobby_type || 0, radiant_win: rw ? 1 : 0,
  };
}

/**
 * 从 Redis 中的比赛数据更新 teams.json
 */
async function updateTeamsJson(r) {
  console.log('=== Updating Teams JSON ===');

  const teamsJsonPath = path.join(__dirname, '..', 'public', 'data', 'teams.json');

  // 加载现有 teams.json
  let existingTeams = [];
  try {
    const data = fs.readFileSync(teamsJsonPath, 'utf-8');
    existingTeams = JSON.parse(data);
  } catch (e) {
    console.log('No existing teams.json, starting fresh');
  }

  // 从 Redis 获取 matches
  let matchesData = {};
  try {
    const data = await r.get('matches');
    if (data) matchesData = JSON.parse(data);
  } catch (e) {
    console.log('No matches data');
    return;
  }

  // 提取唯一战队
  const teamMap = new Map();
  for (const [, m] of Object.entries(matchesData)) {
    // radiant team
    if (m.radiant_team_name && m.radiant_team_name !== 'unknown') {
      const key = m.radiant_team_name.toLowerCase();
      if (!teamMap.has(key)) {
        teamMap.set(key, {
          name: m.radiant_team_name,
          name_cn: m.radiant_team_name_cn || m.radiant_team_name.substring(0, 3).toUpperCase(),
          logo_url: m.radiant_team_logo || null
        });
      }
    }
    // dire team
    if (m.dire_team_name && m.dire_team_name !== 'unknown') {
      const key = m.dire_team_name.toLowerCase();
      if (!teamMap.has(key)) {
        teamMap.set(key, {
          name: m.dire_team_name,
          name_cn: m.dire_team_name_cn || m.dire_team_name.substring(0, 3).toUpperCase(),
          logo_url: m.dire_team_logo || null
        });
      }
    }
  }

  // 合并到现有 teams
  let added = 0, updated = 0;
  for (const [key, team] of teamMap) {
    const existing = existingTeams.find(t => t.name?.toLowerCase() === key);
    if (existing) {
      // 更新现有战队
      if (!existing.logo_url && team.logo_url) {
        existing.logo_url = team.logo_url;
        updated++;
      }
    } else {
      // 添加新战队
      existingTeams.push({
        id: key,
        name: team.name,
        name_cn: team.name_cn,
        tag: team.name_cn,
        logo_url: team.logo_url,
        region: 'Unknown',
        is_cn_team: 0,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      });
      added++;
    }
  }

  // 保存
  fs.writeFileSync(teamsJsonPath, JSON.stringify(existingTeams, null, 2));
  console.log(`Updated teams.json: ${added} added, ${updated} updated, total ${existingTeams.length}`);
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

    // 获取现有数据
    let existing = {};
    try {
      const data = await r.get('matches');
      if (data) existing = JSON.parse(data);
    } catch (e) { console.log('No existing'); }

    // 获取新数据
    let cn = [];
    const pro = await fetchJSON(`${OPENDOTA}/proMatches?limit=30`);
    for (const m of pro) { const c = convert(m); if (c) cn.push(c); }

    for (const [, td] of Object.entries(TEAMS)) {
      const tm = await fetchJSON(`${OPENDOTA}/teams/${td.id}/matches`);
      for (const m of tm) { const c = convert(m, td); if (c) cn.push(c); }
    }

    // Fetch ALL historical matches from specified leagues (complete history, not filtered)
    const leagueIds = Object.keys(LEAGUE_IDS).map(id => parseInt(id));
    for (const leagueId of leagueIds) {
      try {
        console.log(`Fetching all matches for league ${leagueId}...`);
        const leagueMatches = await fetchJSON(`${OPENDOTA}/leagues/${leagueId}/matches`);
        console.log(`League ${leagueId}: found ${leagueMatches.length} matches`);
        for (const m of leagueMatches) {
          const c = convert(m);
          if (c) cn.push(c);
        }
      } catch (e) {
        console.error(`Failed to fetch league ${leagueId}:`, e.message);
      }
    }

    // 保存 matches
    let saved = 0;
    for (const m of cn) {
      if (!existing[m.match_id]) { existing[m.match_id] = m; saved++; }
    }
    await r.set('matches', JSON.stringify(existing));

    const list = Object.values(existing).sort((a,b) => b.start_time - a.start_time).slice(0, 500);
    await r.set('matches:list', JSON.stringify(list));

    // 同步 tournaments 数据
    const tournamentsResult = await syncTournaments(r, existing);

    // 更新 teams.json
    await updateTeamsJson(r);

    return res.status(200).json({
      success: true,
      matches: { saved, total: Object.keys(existing).length },
      tournaments: { count: tournamentsResult.tournaments.length, seriesCount: Object.keys(tournamentsResult.seriesByTournament).length }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
