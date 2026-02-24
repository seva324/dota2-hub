/**
 * Script to resolve team IDs to names and update matches.json
 */

const fs = require('fs');
const https = require('https');

// Team ID to name mapping (cached after first fetch)
const teamCache = {};

// Known team IDs from the target leagues
const KNOWN_TEAM_IDS = {
  8261502: { name: 'Xtreme Gaming', tag: 'XG' },
  8255888: { name: 'Yakult Brothers', tag: 'YB' },
  7391077: { name: 'Vici Gaming', tag: 'VG' },
  7391981: { name: 'MOUZ', tag: 'MOUZ' },
  7055376: { name: 'Tundra Esports', tag: 'Tundra' },
  8597616: { name: 'BetBoom Team', tag: 'BB' },
  8943835: { name: 'Aurora Gaming', tag: 'Aurora' },
  7119388: { name: 'Team Spirit', tag: 'Spirit' },
  8521839: { name: 'paiN Gaming', tag: 'paiN' },
  1082686: { name: 'PARIVISION', tag: 'PARI' },
  2163: { name: 'Team Liquid', tag: 'Liquid' },
  460: { name: 'Natus Vincere', tag: 'NAVI' },
  8261500: { name: 'Xtreme Gaming', tag: 'XG' },
  8291895: { name: 'Tundra Esports', tag: 'Tundra' },
  9467224: { name: 'BetBoom Team', tag: 'BB' },
  9338413: { name: 'PARIVISION', tag: 'PARI' },
  9572001: { name: 'paiN Gaming', tag: 'paiN' },
  9247354: { name: 'Aurora Gaming', tag: 'Aurora' },
  2586976: { name: 'Team Falcons', tag: 'Falcons' },
  9351740: { name: 'Gaimin Gladiators', tag: 'GG' },
  67: { name: 'Evil Geniuses', tag: 'EG' },
  36: { name: 'OG', tag: 'OG' },
  9964962: { name: 'Team Secret', tag: 'Secret' },
  9823272: { name: 'GamerLegion', tag: 'GL' },
  8254145: { name: 'Nigma Galaxy', tag: 'Nigma' },
};

// Target league IDs
const TARGET_LEAGUE_IDS = [19269, 18988, 19099, 19130];

// League to tournament mapping
const LEAGUE_TO_TOURNAMENT = {
  19269: 'dreamleague-s28',
  18988: 'dreamleague-s27',
  19099: 'blast-slam-vi',
  19130: 'esl-challenger-china'
};

function fetchTeam(teamId) {
  return new Promise((resolve) => {
    if (teamCache[teamId]) {
      resolve(teamCache[teamId]);
      return;
    }
    
    // Check known teams first
    if (KNOWN_TEAM_IDS[teamId]) {
      teamCache[teamId] = KNOWN_TEAM_IDS[teamId];
      resolve(KNOWN_TEAM_IDS[teamId]);
      return;
    }
    
    // Fetch from API
    const url = `https://api.opendota.com/api/teams/${teamId}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const team = JSON.parse(data);
          if (team.team_id) {
            const teamInfo = { name: team.name, tag: team.tag };
            teamCache[teamId] = teamInfo;
            resolve(teamInfo);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function fetchLeagueMatches(leagueId) {
  return new Promise((resolve) => {
    const url = `https://api.opendota.com/api/leagues/${leagueId}/matches`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error(`Error parsing league ${leagueId}:`, e.message);
          resolve([]);
        }
      });
    }).on('error', (e) => {
      console.error(`Error fetching league ${leagueId}:`, e.message);
      resolve([]);
    });
  });
}

async function main() {
  console.log('Fetching matches from OpenDota for target leagues...\n');
  
  let allMatches = [];
  
  for (const leagueId of TARGET_LEAGUE_IDS) {
    console.log(`Fetching league ${leagueId}...`);
    const matches = await fetchLeagueMatches(leagueId);
    console.log(`  Found ${matches.length} matches`);
    allMatches = allMatches.concat(matches);
  }
  
  console.log(`\nTotal matches: ${allMatches.length}`);
  
  // Get unique team IDs
  const teamIds = new Set();
  allMatches.forEach(m => {
    if (m.radiant_team_id) teamIds.add(m.radiant_team_id);
    if (m.dire_team_id) teamIds.add(m.dire_team_id);
  });
  
  console.log(`Unique teams: ${teamIds.size}`);
  
  // Resolve team IDs to names
  console.log('\nResolving team IDs...');
  const teamIdToName = { ...KNOWN_TEAM_IDS };
  
  for (const teamId of teamIds) {
    if (!teamIdToName[teamId]) {
      const team = await fetchTeam(teamId);
      if (team) {
        teamIdToName[teamId] = team;
        console.log(`  ${teamId} -> ${team.name}`);
      }
      await new Promise(r => setTimeout(r, 100)); // Rate limit
    }
  }
  
  // Update matches with team names
  console.log('\nUpdating matches with team names...');
  const updatedMatches = allMatches.map(m => ({
    ...m,
    radiant_team_name: teamIdToName[m.radiant_team_id]?.name || null,
    dire_team_name: teamIdToName[m.dire_team_id]?.name || null,
    radiant_team_name_cn: null,
    dire_team_name_cn: null,
    radiant_team_logo: null,
    dire_team_logo: null,
  }));
  
  // Write matches.json
  const matchesPath = './public/data/matches.json';
  fs.writeFileSync(matchesPath, JSON.stringify(updatedMatches, null, 2));
  console.log(`Written ${updatedMatches.length} matches to ${matchesPath}`);
  
  // Create series from matches
  console.log('\nCreating series...');
  const seriesByTournament = {};
  
  for (const leagueId of TARGET_LEAGUE_IDS) {
    const tournamentId = LEAGUE_TO_TOURNAMENT[leagueId];
    const leagueMatches = updatedMatches.filter(m => m.leagueid === leagueId);
    
    if (leagueMatches.length === 0) continue;
    
    // Group by team pair
    const teamPairs = {};
    leagueMatches.forEach(m => {
      const teams = [m.radiant_team_name, m.dire_team_name].sort();
      const key = teams.join('_vs_');
      if (!teamPairs[key]) {
        teamPairs[key] = [];
      }
      teamPairs[key].push(m);
    });
    
    // Create series
    const series = Object.values(teamPairs).map(groupMatches => {
      groupMatches.sort((a, b) => a.start_time - b.start_time);
      
      let radiantWins = 0;
      let direWins = 0;
      groupMatches.forEach(m => {
        if (m.radiant_win) radiantWins++;
        else direWins++;
      });
      
      return {
        series_id: `series_${tournamentId}_${groupMatches[0].radiant_team_name}_vs_${groupMatches[0].dire_team_name}`.replace(/\s+/g, '_'),
        series_type: 'BO3',
        radiant_team_name: groupMatches[0].radiant_team_name,
        dire_team_name: groupMatches[0].dire_team_name,
        radiant_team_logo: null,
        dire_team_logo: null,
        games: groupMatches.map(m => ({
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
        tournament_name: null,
        stage: '',
        radiant_score: radiantWins,
        dire_score: direWins
      };
    });
    
    seriesByTournament[tournamentId] = series;
    console.log(`  ${tournamentId}: ${series.length} series`);
  }
  
  // Read existing tournaments.json
  let tournamentsData = { tournaments: [], seriesByTournament: {} };
  try {
    tournamentsData = JSON.parse(fs.readFileSync('./public/data/tournaments.json', 'utf-8'));
  } catch (e) {
    console.log('No existing tournaments.json found');
  }
  
  // Merge series data
  tournamentsData.seriesByTournament = seriesByTournament;
  
  // Write tournaments.json
  const tournamentsPath = './public/data/tournaments.json';
  fs.writeFileSync(tournamentsPath, JSON.stringify(tournamentsData, null, 2));
  console.log(`Written tournaments to ${tournamentsPath}`);
  
  console.log('\nDone!');
}

main().catch(console.error);
