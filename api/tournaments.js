/**
 * 获取赛事数据 API
 * 数据源: Neon PostgreSQL (primary), Local JSON (fallback)
 */

import fs from 'fs';
import path from 'path';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// League ID to Tournament ID 映射
const LEAGUE_IDS = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'S' }
};

// Neon SQL client singleton
let sql = null;

function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[Tournaments API] Failed to create Neon client:', error.message);
      return null;
    }
  }
  return sql;
}

// Load teams data for logo matching
function getTeams() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'teams.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local teams:', error);
    return [];
  }
}

// Create a map of team names to logo URLs
function createTeamLogoMap(teams) {
  const logoMap = new Map();
  teams.forEach(team => {
    logoMap.set(team.name.toLowerCase(), team.logo_url);
    if (team.name_cn) {
      logoMap.set(team.name_cn.toLowerCase(), team.logo_url);
    }
    if (team.tag) {
      logoMap.set(team.tag.toLowerCase(), team.logo_url);
    }
  });
  return logoMap;
}

// Find logo URL for a team name with fuzzy matching
function findTeamLogo(logoMap, teamName) {
  if (!teamName) return null;

  const normalizedName = teamName.toLowerCase().trim();

  // Exact match first
  if (logoMap.has(normalizedName)) {
    return logoMap.get(normalizedName);
  }

  // Fuzzy match
  for (const [key, logoUrl] of logoMap.entries()) {
    if (key.length <= 2) continue;
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return logoUrl;
    }
  }

  return null;
}

// Add logos to series data
function addLogosToSeries(series, logoMap) {
  return series.map(s => ({
    ...s,
    radiant_team_logo: s.radiant_team_logo || findTeamLogo(logoMap, s.radiant_team_name),
    dire_team_logo: s.dire_team_logo || findTeamLogo(logoMap, s.dire_team_name)
  }));
}

// Fallback to local JSON file
function getLocalTournaments() {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', 'tournaments.json');
    const data = fs.readFileSync(localPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading local tournaments:', error);
    return { tournaments: [], seriesByTournament: {} };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = getDb();

  // Helper to process tournaments data with logos
  function processTournaments(tournamentsData) {
    if (!tournamentsData) return null;
    const teams = getTeams();
    const logoMap = createTeamLogoMap(teams);

    const seriesByTournament = {};
    for (const [tournamentId, series] of Object.entries(tournamentsData.seriesByTournament || {})) {
      seriesByTournament[tournamentId] = addLogosToSeries(series, logoMap);
    }

    return {
      ...tournamentsData,
      seriesByTournament
    };
  }

  // Try to read from Neon first
  if (db) {
    try {
      // Get all tournaments
      const tournaments = await db`SELECT * FROM tournaments`;
      console.log('[Tournaments API] Found tournaments:', tournaments.length);

      // Get matches
      const matches = await db`
        SELECT match_id, series_id, radiant_team_id, radiant_team_name, radiant_team_name_cn,
               radiant_team_logo, dire_team_id, dire_team_name, dire_team_name_cn,
               dire_team_logo, radiant_score, dire_score, radiant_win, start_time,
               duration, league_id, series_type
        FROM matches
        ORDER BY start_time DESC
        LIMIT 500
      `;
      console.log('[Tournaments API] Found matches:', matches.length, 'with series_id:', matches.filter(m => m.series_id).length);

      // Get teams for logo lookup
      const teams = await db`SELECT * FROM teams`;

      // Build series from matches - 使用 series_id 分组
      const seriesByTournament = {};

      // 按 series_id 分组
      const seriesGroups = {};
      for (const m of matches) {
        // Use LEAGUE_IDS mapping to find tournament id
        const leagueId = m.league_id;
        const tournament = LEAGUE_IDS[leagueId];
        const tid = tournament?.id || 'unknown';

        // 使用 series_id 作为分组键 (OpenDota提供的)，如果为null则跳过
        if (!m.series_id) continue;
        const seriesId = String(m.series_id);
        const groupKey = `${tid}_${seriesId}`;

        if (!seriesGroups[groupKey]) {
          seriesGroups[groupKey] = {
            tournament_id: tid,
            series_id: seriesId,
            // 直接使用 OpenDota 提供的战队名称
            radiant_team_name: m.radiant_team_name,
            dire_team_name: m.dire_team_name,
            radiant_team_logo: m.radiant_team_logo,
            dire_team_logo: m.dire_team_logo,
            series_type: m.series_type || 'BO3',
            games: []
          };
        }
        seriesGroups[groupKey].games.push({
          match_id: String(m.match_id),
          radiant_team_name: m.radiant_team_name,
          dire_team_name: m.dire_team_name,
          radiant_team_logo: m.radiant_team_logo,
          dire_team_logo: m.dire_team_logo,
          radiant_score: m.radiant_score,
          dire_score: m.dire_score,
          // radiant_win: 1 表示 radiant 方获胜，0 表示 dire 方获胜
          radiant_win: m.radiant_win ? 1 : 0,
          start_time: m.start_time,
          duration: m.duration
        });
      }

      // Initialize seriesByTournament for all tournaments
      for (const t of tournaments) {
        seriesByTournament[t.id] = [];
      }

      // Convert to series format - 正确计算胜负
      for (const [key, group] of Object.entries(seriesGroups)) {
        const tid = group.tournament_id;
        if (!seriesByTournament[tid]) {
          seriesByTournament[tid] = [];
        }

        // 计算每个战队的胜场数
        // radiant_win = 1 表示 radiant 战队获胜
        // radiant_win = 0 表示 dire 战队获胜
        const teamWins = {};

        for (const g of group.games) {
          const radiant = g.radiant_team_name;
          const dire = g.dire_team_name;

          if (!teamWins[radiant]) teamWins[radiant] = 0;
          if (!teamWins[dire]) teamWins[dire] = 0;

          if (g.radiant_win === 1) {
            teamWins[radiant]++;
          } else {
            teamWins[dire]++;
          }
        }

        // 确定 radiant 和 dire 的胜场
        const radiantWins = teamWins[group.radiant_team_name] || 0;
        const direWins = teamWins[group.dire_team_name] || 0;

        seriesByTournament[tid].push({
          series_id: String(group.series_id),
          series_type: group.series_type || (group.games.length >= 5 ? 'BO5' : group.games.length >= 3 ? 'BO3' : 'BO1'),
          radiant_team_name: group.radiant_team_name,
          dire_team_name: group.dire_team_name,
          radiant_team_logo: group.radiant_team_logo,
          dire_team_logo: group.dire_team_logo,
          radiant_score: radiantWins,
          dire_score: direWins,
          radiant_wins: radiantWins,
          dire_wins: direWins,
          games: group.games.sort((a, b) => a.start_time - b.start_time)
        });
      }

      const result = {
        tournaments: tournaments.map(t => ({
          id: t.id,
          name: t.name,
          name_cn: t.name_cn,
          tier: t.tier,
          location: t.location,
          status: t.status,
          start_date: t.start_date,
          end_date: t.end_date,
          prize_pool: t.prize_pool
        })),
        seriesByTournament
      };

      const processed = processTournaments(result);
      return res.status(200).json(processed);
    } catch (error) {
      console.error('[Tournaments API] Neon error:', error.message);
    }
  }

  // Fallback to local JSON
  try {
    const localData = getLocalTournaments();
    const processed = processTournaments(localData);
    return res.status(200).json(processed);
  } catch (error) {
    console.error('[Tournaments API] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
