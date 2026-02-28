/**
 * Tournament Aggregation Cron API
 *
 * This endpoint rebuilds tournament data from matches in Neon.
 * Should be called after sync-opendota completes.
 *
 * Can be triggered via:
 * - Vercel cron (scheduled after sync-opendota)
 * - Manual trigger (POST /api/aggregate-tournaments)
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// League ID mappings
const LEAGUE_IDS = {
  19269: { id: 'dreamleague-s28', name: 'DreamLeague Season 28', name_cn: '梦联赛 S28', tier: 'S' },
  18988: { id: 'dreamleague-s27', name: 'DreamLeague Season 27', name_cn: '梦联赛 S27', tier: 'S' },
  19099: { id: 'blast-slam-vi', name: 'BLAST Slam VI', name_cn: 'BLAST 锦标赛 VI', tier: 'S' },
  19130: { id: 'esl-challenger-china', name: 'ESL Challenger China', name_cn: 'ESL 挑战者杯 中国', tier: 'A' },
};

// Known team logos
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

function getTeamLogo(teamName) {
  if (!teamName) return null;
  const name = teamName.toLowerCase();
  return TEAM_LOGOS[name] || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  try {
    const db = neon(DATABASE_URL);
    console.log('[Aggregate Tournaments] Neon connected');

    // Get matches from Neon
    const matches = await db`
      SELECT match_id, radiant_team_name, dire_team_name, radiant_team_logo,
             dire_team_logo, radiant_score, dire_score, radiant_win,
             start_time, duration, league_id, series_type
      FROM matches
      WHERE league_id IS NOT NULL
    `;

    if (matches.length === 0) {
      console.log('[Aggregate Tournaments] No matches found');
      return res.status(200).json({
        success: true,
        message: 'No matches to aggregate',
        tournaments: 0,
        seriesCount: 0
      });
    }

    console.log(`[Aggregate Tournaments] Processing ${matches.length} matches`);

    // Build tournament series data from matches
    const seriesByTournament = {};
    const tournaments = [];

    for (const m of matches) {
      if (!m.league_id) continue;

      const leagueId = String(m.league_id);
      const tournamentInfo = LEAGUE_IDS[leagueId];
      if (!tournamentInfo) continue;

      const tournamentId = tournamentInfo.id;

      // Initialize tournament
      if (!seriesByTournament[tournamentId]) {
        seriesByTournament[tournamentId] = [];
      }

      // Create series key based on teams
      const seriesKey = `${m.radiant_team_name}_vs_${m.dire_team_name}_${m.series_type || 'BO3'}`;
      let series = seriesByTournament[tournamentId].find(s => s.series_id === seriesKey);

      if (!series) {
        series = {
          series_id: seriesKey,
          series_type: m.series_type || 'BO3',
          radiant_team_name: m.radiant_team_name,
          dire_team_name: m.dire_team_name,
          radiant_team_logo: m.radiant_team_logo || getTeamLogo(m.radiant_team_name),
          dire_team_logo: m.dire_team_logo || getTeamLogo(m.dire_team_name),
          radiant_wins: 0,
          dire_wins: 0,
          games: []
        };
        seriesByTournament[tournamentId].push(series);
      }

      // Add game to series
      series.games.push({
        match_id: m.match_id,
        radiant_team_name: m.radiant_team_name,
        dire_team_name: m.dire_team_name,
        radiant_team_logo: m.radiant_team_logo || getTeamLogo(m.radiant_team_name),
        dire_team_logo: m.dire_team_logo || getTeamLogo(m.dire_team_name),
        radiant_score: m.radiant_score || 0,
        dire_score: m.dire_score || 0,
        radiant_win: m.radiant_win,
        start_time: m.start_time,
        duration: m.duration
      });

      // Update win counts
      if (m.radiant_win === 1) {
        series.radiant_wins++;
      } else {
        series.dire_wins++;
      }
    }

    // Build tournaments list
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

    // Save tournaments to Neon
    for (const t of tournaments) {
      try {
        await db`
          INSERT INTO tournaments (id, name, name_cn, tier, location, status, league_id, updated_at)
          VALUES (${t.id}, ${t.name}, ${t.name_cn}, ${t.tier}, ${t.location}, ${t.status}, ${t.leagueid}, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            name_cn = EXCLUDED.name_cn,
            tier = EXCLUDED.tier,
            updated_at = NOW()
        `;
      } catch (e) {
        console.error(`[Aggregate] Failed to save tournament ${t.id}:`, e.message);
      }
    }

    // Save series to Neon
    let seriesSaved = 0;
    for (const [tournamentId, seriesList] of Object.entries(seriesByTournament)) {
      for (const s of seriesList) {
        try {
          await db`
            INSERT INTO tournament_series (
              tournament_id, series_id, series_type, radiant_team_name, dire_team_name,
              radiant_team_logo, dire_team_logo, radiant_wins, dire_wins
            ) VALUES (
              ${tournamentId}, ${s.series_id}, ${s.series_type}, ${s.radiant_team_name},
              ${s.dire_team_name}, ${s.radiant_team_logo}, ${s.dire_team_logo},
              ${s.radiant_wins}, ${s.dire_wins}
            )
            ON CONFLICT (series_id) DO UPDATE SET
              radiant_wins = EXCLUDED.radiant_wins,
              dire_wins = EXCLUDED.dire_wins
          `;
          seriesSaved++;
        } catch (e) {
          console.error(`[Aggregate] Failed to save series:`, e.message);
        }
      }
    }

    console.log(`[Aggregate Tournaments] Saved ${tournaments.length} tournaments with ${seriesSaved} series`);

    return res.status(200).json({
      success: true,
      message: `Aggregated ${tournaments.length} tournaments`,
      tournaments: tournaments.length,
      seriesCount: seriesSaved,
      tournamentData: {
        tournaments: tournaments.map(t => ({ id: t.id, name: t.name, name_cn: t.name_cn })),
        seriesByTournament: Object.keys(seriesByTournament).map(tid => ({
          tournamentId: tid,
          seriesCount: seriesByTournament[tid].length
        }))
      }
    });

  } catch (e) {
    console.error('[Aggregate Tournaments] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
