import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LEAGUE_IDS = [19269, 18988, 19099, 19130];
const OPENDOTA_API_BASE = 'https://api.opendota.com/api';

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return await response.json();
        } catch (err) {
            console.error(`Fetch error (attempt ${i + 1}/${retries}): ${err.message}`);
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        }
    }
}

async function fetchLeagueMatches(leagueId) {
    console.log(`Fetching matches for league ${leagueId}...`);
    const url = `${OPENDOTA_API_BASE}/leagues/${leagueId}/matches`;
    const matches = await fetchWithRetry(url);
    console.log(`  Found ${matches.length} matches`);
    return matches;
}

async function syncHistoricalMatches() {
    console.log('Starting historical match sync...');
    console.log('League IDs:', LEAGUE_IDS);
    
    const allMatches = [];
    
    for (const leagueId of LEAGUE_IDS) {
        const matches = await fetchLeagueMatches(leagueId);
        allMatches.push(...matches);
    }
    
    console.log(`Total matches fetched: ${allMatches.length}`);
    
    // Deduplicate by match_id
    const uniqueMatches = new Map();
    allMatches.forEach(m => uniqueMatches.set(m.match_id, m));
    const dedupedMatches = Array.from(uniqueMatches.values());
    
    console.log(`Unique matches: ${dedupedMatches.length}`);
    
    // Convert to the format used by the app
    const convert = (m) => {
        const now = Date.now() / 1000;
        const status = m.start_time < now - 3600 ? 'finished' : m.start_time < now ? 'live' : 'scheduled';
        const rw = m.radiant_win;
        
        return {
            match_id: String(m.match_id),
            radiant_team_id: m.radiant?.team_id || 'unknown',
            dire_team_id: m.dire?.team_id || 'unknown',
            radiant_team_name: m.radiant?.name || null,
            radiant_team_name_cn: m.radiant?.name || null,
            dire_team_name: m.dire?.name || null,
            dire_team_name_cn: m.dire?.name || null,
            radiant_score: m.radiant_score || 0,
            dire_score: m.dire_score || 0,
            radiant_game_wins: status === 'finished' ? (rw ? 1 : 0) : 0,
            dire_game_wins: status === 'finished' ? (rw ? 0 : 1) : 0,
            start_time: m.start_time,
            duration: m.duration || 0,
            leagueid: m.leagueid,
            series_type: 'BO3',
            status,
            lobby_type: m.lobby_type || 0,
            radiant_win: rw ? 1 : 0,
        };
    };
    
    const convertedMatches = dedupedMatches.map(convert);
    
    // Load existing matches if any
    const publicDataPath = path.join(__dirname, '..', 'public', 'data', 'matches.json');
    let existingMatches = [];
    
    if (fs.existsSync(publicDataPath)) {
        try {
            const content = fs.readFileSync(publicDataPath, 'utf-8');
            existingMatches = JSON.parse(content);
            console.log(`Existing matches: ${existingMatches.length}`);
        } catch (err) {
            console.error('Error reading existing matches:', err.message);
        }
    }
    
    // Merge with existing matches
    const existingById = new Map(existingMatches.map(m => [m.match_id, m]));
    convertedMatches.forEach(m => existingById.set(m.match_id, m));
    const mergedMatches = Array.from(existingById.values());
    
    // Sort by start_time descending
    mergedMatches.sort((a, b) => b.start_time - a.start_time);
    
    console.log(`Merged total matches: ${mergedMatches.length}`);
    
    // Write to file
    fs.writeFileSync(publicDataPath, JSON.stringify(mergedMatches, null, 2));
    console.log(`Saved to ${publicDataPath}`);
    
    return mergedMatches.length;
}

syncHistoricalMatches()
    .then(count => {
        console.log(`Done! Synced ${count} matches`);
        process.exit(0);
    })
    .catch(err => {
        console.error('Sync failed:', err);
        process.exit(1);
    });
