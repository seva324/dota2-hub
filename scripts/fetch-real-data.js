#!/usr/bin/env node
/**
 * Fix OpenDota match data - resolve team IDs to names
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target league IDs
const TARGET_LEAGUE_IDS = [19269, 18988, 19099, 19130];

// League to tournament mapping
const LEAGUE_TO_TOURNAMENT = {
  19269: 'dreamleague-s28',
  18988: 'dreamleague-s27',
  19099: 'blast-slam-vi',
  19130: 'esl-challenger-china'
};

// Fetch team data from OpenDota
async function fetchTeam(teamId) {
  try {
    const response = await fetch(`https://api.opendota.com/api/teams/${teamId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
  } catch (e) {
    console.error(`Error fetching team ${teamId}:`, e.message);
    return null;
  }
}

// Fetch matches for a league
async function fetchLeagueMatches(leagueId) {
  try {
    const response = await fetch(`https://api.opendota.com/api/leagues/${leagueId}/matches`);
    if (!response.ok) return [];
    return await response.json();
  } catch (e) {
    console.error(`Error fetching league ${leagueId}:`, e.message);
    return [];
  }
}

// Known team IDs from the data we observed
const KNOWN_TEAMS = {
  // Correct mappings from OpenDota API
  9572001: { name: 'PARIVISION', tag: 'PARI', logo: 'https://cdn.steamusercontent.com/ugc/10501094611027794535/1569CC553CB72963C8EC4C3F807EE50DA925BDC2/' },
  8255888: { name: 'BetBoom Team', tag: 'BB', logo: 'https://cdn.steamusercontent.com/ugc/9995426432403529725/51E13136D4CCC8C7D8062861541A1D13B8ED87E0/' },
  8261500: { name: 'Xtreme Gaming', tag: 'XG', logo: 'https://cdn.steamusercontent.com/ugc/2402194226059610590/E3CF4B6C4B2CFB974A9B415141E4A37317AD4D80/' },
  8291895: { name: 'Tundra Esports', tag: 'Tundra', logo: 'https://cdn.steamusercontent.com/ugc/2031716132171967904/07B168B8063D9B22CDAD53AB421ECAF3D4B2E07E/' },
  2163: { name: 'Team Liquid', tag: 'Liquid', logo: 'https://cdn.steamcdn.com/apps/dota2/images/team_logos/2163.png' },
  9247354: { name: 'Team Spirit', tag: 'Spirit', logo: 'https://cdn.steamcdn.com/apps/dota2/images/team_logos/7119388.png' },
  9467224: { name: 'Gaimin Gladiators', tag: 'GG', logo: null },
  9338413: { name: 'MOUZ', tag: 'MOUZ', logo: 'https://cdn.steamusercontent.com/ugc/14936784213521439739/3EA33A8516BDE538B7963F044CD1B7AB4B0BB60D/' },
  2586976: { name: 'OG', tag: 'OG', logo: null },
  7119388: { name: 'Team Spirit', tag: 'Spirit', logo: 'https://cdn.steamcdn.com/apps/dota2/images/team_logos/7119388.png' },
  
  // Fixed mappings - corrections
  8254145: { name: 'Execration', tag: 'Exec', logo: null },  // was 9 Pandas
  36: { name: 'Natus Vincere', tag: 'NAVI', logo: 'https://cdn.steamcdn.com/apps/dota2/images/team_logos/460.png' },  // was Evil Geniuses
  9964962: { name: 'GamerLegion', tag: 'GL', logo: null },  // was BetBoom Team
  9351740: { name: 'Yakult Brothers', tag: 'YB', logo: null },  // was GamerLegion
  9823272: { name: 'Team Yandex', tag: 'Yandex', logo: null },  // was Heroic
  67: { name: 'paiN Gaming', tag: 'paiN', logo: null },  // was Natus Vincere
  
  // Additional teams from API
  9303484: { name: 'HEROIC', tag: 'HEROIC', logo: null },
  9885310: { name: 'Roar', tag: 'Roar', logo: null },
  9579337: { name: 'YB.Tearlaments', tag: 'YB', logo: null },
  10007878: { name: 'Team Refuser', tag: 'Refuser', logo: null },
  10008067: { name: 'Game Master', tag: 'GM', logo: null },
  9885928: { name: 'Thriving', tag: 'Thrive', logo: null },
  9885315: { name: 'Surge Gaming', tag: 'Surge', logo: null },
  9886289: { name: 'Cloud Rising', tag: 'Cloud', logo: null },
  9444076: { name: 'NGNB', tag: 'NGNB', logo: null },
  9894442: { name: 'Cloud Dawning', tag: 'Dawn', logo: null },
  10014579: { name: 'American Boy', tag: 'AmBoy', logo: null },
  9895695: { name: 'ToLight', tag: 'TL', logo: null },
  10014586: { name: 'NaiLong', tag: 'NL', logo: null },
  10014526: { name: 'RNG反诈先锋', tag: 'RNG', logo: null },
  10008012: { name: 'Jitsu', tag: 'Jitsu', logo: null },
  9895392: { name: 'Virtus.pro', tag: 'VP', logo: null },
  9255039: { name: '1w Team', tag: '1w', logo: null },
  7554697: { name: 'Nigma Galaxy', tag: 'Nigma', logo: null },
  9691969: { name: 'Team Nemesis', tag: 'Neme', logo: null },
  9872667: { name: 'Pipsqueak+4', tag: 'Pips', logo: null },
  9989179: { name: 'Amaru Gaming', tag: 'Amaru', logo: null },
  9640842: { name: 'Team Tidebound', tag: 'Tide', logo: null },
  9247798: { name: 'Passion UA', tag: 'Passion', logo: null },
  9758040: { name: 'Runa Team', tag: 'Runa', logo: null },
  8943835: { name: 'Aurora Gaming', tag: 'Aurora', logo: null },
};

async function main() {
  console.log('========================================');
  console.log('Fetching REAL data from OpenDota API');
  console.log('League IDs:', TARGET_LEAGUE_IDS);
  console.log('========================================\n');

  // Step 1: Collect all team IDs from matches
  const allTeamIds = new Set();
  let allMatches = [];

  for (const leagueId of TARGET_LEAGUE_IDS) {
    console.log(`Fetching league ${leagueId}...`);
    const matches = await fetchLeagueMatches(leagueId);
    console.log(`  Found ${matches.length} matches`);
    allMatches = allMatches.concat(matches);

    for (const match of matches) {
      if (match.radiant_team_id) allTeamIds.add(match.radiant_team_id);
      if (match.dire_team_id) allTeamIds.add(match.dire_team_id);
    }
  }

  console.log(`\nTotal unique team IDs: ${allTeamIds.size}`);
  console.log('Team IDs:', [...allTeamIds].join(', '));

  // Step 2: Fetch team info for unknown teams
  const teamInfo = { ...KNOWN_TEAMS };
  
  console.log('\nFetching team info...');
  for (const teamId of allTeamIds) {
    if (!teamInfo[teamId]) {
      console.log(`  Fetching team ${teamId}...`);
      const info = await fetchTeam(teamId);
      if (info && info.name) {
        teamInfo[teamId] = {
          name: info.name,
          tag: info.tag || info.name.substring(0, 3).toUpperCase(),
          logo: info.logo_url
        };
        console.log(`    -> ${info.name}`);
      }
      await new Promise(r => setTimeout(r, 100)); // Rate limiting
    }
  }

  // Step 3: Process matches with team names
  const processedMatches = allMatches.map(match => {
    const radiantTeam = teamInfo[match.radiant_team_id];
    const direTeam = teamInfo[match.dire_team_id];

    return {
      match_id: match.match_id.toString(),
      radiant_team_id: match.radiant_team_id?.toString(),
      dire_team_id: match.dire_team_id?.toString(),
      radiant_team_name: radiantTeam?.name || null,
      radiant_team_name_cn: radiantTeam?.tag || null,
      dire_team_name: direTeam?.name || null,
      dire_team_name_cn: direTeam?.tag || null,
      radiant_score: match.radiant_score,
      dire_score: match.dire_score,
      radiant_game_wins: match.radiant_win ? 1 : 0,
      dire_game_wins: match.radiant_win ? 0 : 1,
      start_time: match.start_time,
      duration: match.duration,
      leagueid: match.leagueid,
      series_id: match.series_id, // Store series_id from OpenDota
      series_type: match.series_type === 1 ? 'BO3' : match.series_type === 2 ? 'BO5' : 'BO1',
      status: 'finished',
      lobby_type: match.lobby_type,
      radiant_win: match.radiant_win
    };
  });

  console.log(`\nProcessed ${processedMatches.length} matches`);

  // Step 4: Create series by grouping matches
  // Fix: Properly group by series_id - normalize team pair regardless of radiant/dire
  const seriesByTournament = {};

  for (const leagueId of TARGET_LEAGUE_IDS) {
    const tournamentId = LEAGUE_TO_TOURNAMENT[leagueId];
    const leagueMatches = processedMatches.filter(m => m.leagueid === leagueId);

    if (leagueMatches.length === 0) continue;

    // Group by series_id if available, otherwise normalize team pair + day
    const seriesMap = {};
    leagueMatches.forEach(m => {
      let seriesKey;
      
      if (m.series_id) {
        // Use OpenDota's series_id directly
        seriesKey = `series_${m.series_id}`;
      } else {
        // Normalize team pair regardless of radiant/dire (sort team names alphabetically)
        const teamPair = [m.radiant_team_name, m.dire_team_name]
          .filter(Boolean)
          .sort()
          .join('_vs_');
        const dayKey = Math.floor(m.start_time / 86400);
        seriesKey = `normalized_${teamPair}_${dayKey}`;
      }
      
      if (!seriesMap[seriesKey]) {
        seriesMap[seriesKey] = [];
      }
      seriesMap[seriesKey].push(m);
    });

    const series = Object.entries(seriesMap).map(([key, matches]) => {
      matches.sort((a, b) => a.start_time - b.start_time);

      let radiantWins = 0;
      let direWins = 0;
      matches.forEach(m => {
        if (m.radiant_win) radiantWins++;
        else direWins++;
      });

      const radiantTeam = teamInfo[matches[0].radiant_team_id];
      const direTeam = teamInfo[matches[0].dire_team_id];

      return {
        series_id: `series_${tournamentId}_${key}`.replace(/\s+/g, '_'),
        series_type: matches[0].series_type || 'BO3',
        radiant_team_name: matches[0].radiant_team_name,
        dire_team_name: matches[0].dire_team_name,
        radiant_team_logo: radiantTeam?.logo || null,
        dire_team_logo: direTeam?.logo || null,
        games: matches.map(m => ({
          match_id: m.match_id,
          radiant_team_name: m.radiant_team_name,
          dire_team_name: m.dire_team_name,
          radiant_score: m.radiant_score,
          dire_score: m.dire_score,
          radiant_win: m.radiant_win,
          start_time: m.start_time,
          duration: m.duration
        })),
        radiant_wins: radiantWins,
        dire_wins: direWins,
        tournament_id: leagueId,
        tournament_name: tournamentId,
        stage: '',
        radiant_score: radiantWins,
        dire_score: direWins
      };
    });

    seriesByTournament[tournamentId] = series;
    console.log(`League ${leagueId} (${tournamentId}): ${series.length} series`);
  }

  // Step 5: Load existing tournaments.json to preserve tournament info
  const tournamentsPath = path.join(__dirname, '..', 'public', 'data', 'tournaments.json');
  let tournamentsData = { tournaments: [], seriesByTournament: {} };
  
  try {
    const existingData = JSON.parse(fs.readFileSync(tournamentsPath, 'utf-8'));
    tournamentsData.tournaments = existingData.tournaments || [];
  } catch (e) {
    console.log('No existing tournaments.json');
  }

  // Merge series data
  tournamentsData.seriesByTournament = seriesByTournament;

  // Fix cloudflare URL typo
  const tournamentsJson = JSON.stringify(tournamentsData, null, 2).replace(/cdn\.cloudflareflare\.com/g, 'cdn.cloudflare.com');
  
  // Write tournaments.json
  fs.writeFileSync(tournamentsPath, tournamentsJson);
  console.log(`\nWritten to ${tournamentsPath}`);

  // Write matches.json
  const matchesPath = path.join(__dirname, '..', 'public', 'data', 'matches.json');
  fs.writeFileSync(matchesPath, JSON.stringify(processedMatches, null, 2));
  console.log(`Written to ${matchesPath}`);

  // Summary
  console.log('\n========================================');
  console.log('Summary:');
  console.log(`- Total matches: ${processedMatches.length}`);
  console.log(`- Total series: ${Object.values(seriesByTournament).flat().length}`);
  console.log(`- Unique teams: ${Object.keys(teamInfo).length}`);
  console.log('========================================');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
