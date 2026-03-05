/**
 * Sync Upcoming Series from Liquipedia
 * Fetches upcoming matches from Liquipedia:Matches page
 * - Games with starttime > now and starttime < now + 7 days
 *
 * Usage: POST /api/sync-liquipedia
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

let sql = null;

const OPENDOTA = 'https://api.opendota.com/api';

// Target leagues - empty means get all
const TARGET_LEAGUE_KEYWORDS = [];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetch team by name from OpenDota
 */
async function saveTeamFromOpenDota(db, teamName) {
  if (!db || !teamName) return null;

  try {
    const existing = await db`SELECT team_id FROM teams WHERE LOWER(name) = ${teamName.toLowerCase()}`;
    if (existing.length > 0) return existing[0].team_id;

    const teams = await fetchJSON(`${OPENDOTA}/teams?search=${encodeURIComponent(teamName)}`);
    const team = teams.find(t => t.name?.toLowerCase() === teamName.toLowerCase());

    if (team?.team_id) {
      await db`
        INSERT INTO teams (team_id, name, tag, logo_url, region, created_at, updated_at)
        VALUES (${String(team.team_id)}, ${team.name}, ${team.tag || null}, ${team.logo_url || null}, ${team.region || null}, NOW(), NOW())
        ON CONFLICT (team_id) DO UPDATE SET
          name = EXCLUDED.name,
          tag = EXCLUDED.tag,
          logo_url = EXCLUDED.logo_url,
          region = COALESCE(EXCLUDED.region, teams.region),
          updated_at = NOW()
      `;
      return String(team.team_id);
    }
  } catch (e) {
    console.log(`[Liquipedia] Failed to fetch team ${teamName}: ${e.message}`);
  }
  return null;
}

/**
 * Save upcoming series to database
 */
async function saveUpcomingSeries(db, series) {
  if (!db || !series?.id) return;

  try {
    await db`
      INSERT INTO upcoming_series (id, series_id, league_id, radiant_team_id, dire_team_id, start_time, series_type, status, created_at, updated_at)
      VALUES (${series.id}, ${series.series_id}, ${series.league_id}, ${series.radiant_team_id}, ${series.dire_team_id}, ${series.start_time}, ${series.series_type || 'BO3'}, ${series.status || 'upcoming'}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        radiant_team_id = EXCLUDED.radiant_team_id,
        dire_team_id = EXCLUDED.dire_team_id,
        start_time = EXCLUDED.start_time,
        series_type = EXCLUDED.series_type,
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
  } catch (e) {
    console.log(`[Liquipedia] Failed to save ${series.id}: ${e.message}`);
  }
}

function normalizeTeamName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildTeamLookupFromDb(targetTeams) {
  const lookup = new Map();
  for (const team of targetTeams || []) {
    const aliases = [team.name, team.tag];
    for (const alias of aliases) {
      const normalized = normalizeTeamName(alias);
      if (!normalized) continue;
      lookup.set(normalized, team);
    }
  }
  return lookup;
}

/**
 * Match a Liquipedia team name against teams.region-backed target teams.
 */
function matchTargetTeam(teamName, teamLookup) {
  const normalized = normalizeTeamName(teamName);
  if (!normalized) return null;
  return teamLookup.get(normalized) || null;
}

/**
 * Fetch upcoming matches from Liquipedia:Matches
 */
async function fetchLiquipediaUpcoming(targetTeams) {
  const url = 'https://liquipedia.net/dota2/api.php?action=parse&page=Liquipedia:Matches&format=json&prop=text';

  const res = await fetch(url, {
    headers: {
      'Accept-Encoding': 'gzip',
      'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const text = await res.text();
  const data = JSON.parse(text);
  const html = data?.parse?.text?.['*'] || '';

  // Debug info to return
  const debug = { responseLength: html.length };

  if (html.length < 1000) {
    console.log('[Liquipedia] Empty or too short response');
    return { upcoming: [], debug };
  }

  // Debug: check what match patterns exist
  const matchCount = (html.match(/class="[^"]*match[^"]*"/g) || []).length;
  debug.matchPatterns = matchCount;

  const now = Math.floor(Date.now() / 1000);
  const weekLater = now + 7 * 24 * 60 * 60;

  const upcoming = [];
  const teamLookup = buildTeamLookupFromDb(targetTeams);

  // Split HTML by match blocks - check for different patterns
  let matchBlocks = html.split(/<div class="match-info">/);
  if (matchBlocks.length <= 1) {
    // Try alternative pattern
    matchBlocks = html.split(/<div[^>]*class="[^"]*match[^"]*"[^>]*>/);
  }
  debug.matchBlocksFound = matchBlocks.length - 1;

  console.log(`[Liquipedia] Found ${matchBlocks.length - 1} match blocks`);

  for (let i = 1; i < matchBlocks.length; i++) {
    const block = matchBlocks[i].substring(0, 5000);

    // Extract timestamp
    const tsMatch = block.match(/data-timestamp="(\d+)"/);
    const timestamp = tsMatch ? parseInt(tsMatch[1]) : null;

    // Filter: only upcoming within 14 days (for debugging)
    if (!timestamp || timestamp < now || timestamp > weekLater * 2) {
      continue;
    }

    console.log(`[Liquipedia] Timestamp ${timestamp} is valid (now=${now})`);

    // Extract team names - preserve order (left team first, right team second)
    // teamNames[0] = left team (radiant), teamNames[1] = right team (dire)
    const teamNamesSet = new Set();

    // Pattern 1: <a href="/dota2/TeamName" title="TeamName"><img...
    const pattern1 = /href="\/dota2\/([^"]+)"\s+title="([^"]+)"/g;
    let m;
    while ((m = pattern1.exec(block)) !== null && teamNamesSet.size < 2) {
      const href = m[1].trim();
      const title = m[2].trim();
      // Skip if href contains special characters
      if (href.includes('/') || href.includes('#')) continue;
      if (title.length >= 2 && title.length < 40) {
        teamNamesSet.add(title);  // Set automatically dedupes
      }
    }

    const teamNames = [...teamNamesSet];
    if (teamNames.length < 2) continue;

    console.log(`[Liquipedia] Found teams: [${teamNames.join(', ')}]`);

    // Add to debug
    if (!debug.sampleTeams) debug.sampleTeams = [];
    if (debug.sampleTeams.length < 5) {
      debug.sampleTeams.push(teamNames.slice(0, 4));
    }

    // Check if any of our target teams are in this match
    // teamNames[0] = left team (radiant), teamNames[1] = right team (dire)
    let matchedTeam = null;
    let isOurTeamRadiant = false;

    // First check if our target team is on the left (radiant position)
    for (let i = 0; i < teamNames.length; i++) {
      const name = teamNames[i];

      const team = matchTargetTeam(name, teamLookup);
      if (team) {
        matchedTeam = { team_id: String(team.team_id), name: team.name, region: team.region };
        isOurTeamRadiant = (i === 0);  // true if left team, false if right team
        break;
      }
      if (matchedTeam) break;
    }

    if (!matchedTeam) continue; // Not one of our target teams

    // Determine opponent based on our team's position
    const opponentName = isOurTeamRadiant ? teamNames[1] : teamNames[0];

    // Debug: log all extracted teams
    console.log(`[Liquipedia] Debug teams: teamNames=[${teamNames.join(', ')}], matched=${matchedTeam.name}, opp=${opponentName}`);

    // Extract tournament
    const tournMatch = block.match(/class="match-info-tournament"[^]*?title="([^"]+)"/);
    let tournament = '';
    if (tournMatch) {
      const parts = tournMatch[1].replace(/_/g, ' ').split('/');
      const name = parts[0].trim();
      const season = parts[1] ? parts[1].trim() : '';
      tournament = season ? `${name} Season ${season}` : name;
    }

    // Filter by target leagues (if any)
    const isTargetLeague = TARGET_LEAGUE_KEYWORDS.length === 0 || TARGET_LEAGUE_KEYWORDS.some(kw =>
      tournament.toLowerCase().includes(kw)
    );
    if (!isTargetLeague) continue;

    // Skip if opponent is the same as our team (BYE match)
    if (opponentName.toLowerCase() === matchedTeam.name.toLowerCase()) {
      console.log(`[Liquipedia] Skipping BYE match: ${matchedTeam.name} vs ${opponentName}`);
      continue;
    }

    // Debug: log extracted team names
    console.log(`[Liquipedia] Match: [${teamNames[0]}] vs [${teamNames[1]}] -> our=${matchedTeam.name}(${isOurTeamRadiant ? 'radiant' : 'dire'}) opp=${opponentName}`);

    // Extract best-of
    const boMatch = block.match(/\(Bo(\d+)\)/i);
    const bestOf = boMatch ? `BO${boMatch[1]}` : 'BO3';

    upcoming.push({
      ourTeamId: matchedTeam.team_id,
      ourTeamName: matchedTeam.name,
      opponentName,
      isOurTeamRadiant,
      tournament,
      bestOf,
      timestamp
    });
  }

  // Sort by timestamp
  upcoming.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`[Liquipedia] Found ${upcoming.length} upcoming matches for our teams`);

  // Debug: return team names extracted
  console.log(`[Liquipedia] DEBUG: ${JSON.stringify(upcoming.map(u => ({ teams: [u.ourTeamName, u.opponentName], isRadiant: u.isOurTeamRadiant })))}`);

  return { upcoming, debug };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  console.log('[Sync Liquipedia] Starting...');

  try {
    const now = Math.floor(Date.now() / 1000);

    // Step 1: Clean up past series and invalid data
    console.log('[Sync Liquipedia] Cleaning up past/invalid series...');
    await db`DELETE FROM upcoming_series WHERE start_time < ${now}`;

    // Also clean up matches where radiant == dire (invalid BYE matches)
    await db`DELETE FROM upcoming_series WHERE radiant_team_id = dire_team_id`;

    // Step 2: Remove series that already have matches
    await db`
      DELETE FROM upcoming_series us
      WHERE EXISTS (
        SELECT 1 FROM matches m
        WHERE m.series_id = us.series_id
        AND m.series_id IS NOT NULL
      )
    `;
    console.log('[Sync Liquipedia] Cleaned up series that already have matches');

    // Step 3: Load teams from database and use region mapping from teams table.
    console.log('[Sync Liquipedia] Loading teams from database...');
    const allTeams = await db`SELECT team_id, name, tag, region FROM teams`;
    const teamNameToId = new Map();

    for (const t of allTeams) {
      teamNameToId.set(t.name.toLowerCase(), t.team_id);
      if (t.tag) {
        teamNameToId.set(t.tag.toLowerCase(), t.team_id);
      }
    }
    console.log(`[Sync Liquipedia] Loaded ${allTeams.length} teams from database`);

    const targetTeams = allTeams.filter((t) => {
      const region = String(t.region || '').trim().toLowerCase();
      return region && region !== 'unknown';
    });
    console.log(`[Sync Liquipedia] Loaded ${targetTeams.length} target teams from teams.region`);

    // Step 4: Fetch from Liquipedia
    console.log('[Sync Liquipedia] Fetching from Liquipedia...');
    let liquipediaUpcoming = [];

    try {
      const result = await fetchLiquipediaUpcoming(targetTeams);
      liquipediaUpcoming = result.upcoming;
    } catch (e) {
      console.log(`[Sync Liquipedia] Liquipedia fetch failed: ${e.message}`);
    }

    // Step 5: Save new upcoming series
    let saved = 0;

    for (const m of liquipediaUpcoming) {
      const ourNameLower = String(m.ourTeamName || '').toLowerCase();
      const opponentLower = m.opponentName.toLowerCase();

      // Find team IDs from database
      const existingOurTeamId = m.ourTeamId ? String(m.ourTeamId) : null;
      let ourTeamId = existingOurTeamId || teamNameToId.get(ourNameLower);
      let opponentTeamId = teamNameToId.get(opponentLower);

      // If not found, fetch from OpenDota
      if (!ourTeamId) {
        ourTeamId = await saveTeamFromOpenDota(db, m.ourTeamName);
      }
      if (!opponentTeamId) {
        opponentTeamId = await saveTeamFromOpenDota(db, m.opponentName);
      }

      if (!ourTeamId || !opponentTeamId) {
        console.log(`[Liquipedia] Could not find team IDs: ${m.ourTeamName} -> ${ourTeamId}, ${m.opponentName} -> ${opponentTeamId}`);
        continue;
      }

      const radiantTeamId = m.isOurTeamRadiant ? ourTeamId : opponentTeamId;
      const direTeamId = m.isOurTeamRadiant ? opponentTeamId : ourTeamId;

      // Determine league_id from tournament name
      let leagueId = null;
      const tourneyLower = m.tournament.toLowerCase();
      if (tourneyLower.includes('dreamleague') && (tourneyLower.includes('28') || tourneyLower.includes('season 28'))) {
        leagueId = 19269;
      } else if (tourneyLower.includes('dreamleague') && (tourneyLower.includes('27') || tourneyLower.includes('season 27'))) {
        leagueId = 18988;
      } else if (tourneyLower.includes('blast') && tourneyLower.includes('slam') && tourneyLower.includes('vi')) {
        leagueId = 19099;
      } else if (tourneyLower.includes('esl') && tourneyLower.includes('challenger') && tourneyLower.includes('china')) {
        leagueId = 19130;
      }

      if (!leagueId) {
        console.log(`[Liquipedia] Skipping unknown tournament: ${m.tournament}`);
        continue;
      }

      const seriesId = `${leagueId}_${m.ourTeamName}_vs_${m.opponentName}`.toLowerCase().replace(/\s+/g, '_');
      const id = `${leagueId}_${m.timestamp}_${m.ourTeamName}_vs_${m.opponentName}`.toLowerCase().replace(/\s+/g, '_');

      await saveUpcomingSeries(db, {
        id,
        series_id: seriesId,
        league_id: leagueId,
        radiant_team_id: radiantTeamId,
        dire_team_id: direTeamId,
        start_time: m.timestamp,
        series_type: m.bestOf,
        status: 'upcoming'
      });
      saved++;
    }

    console.log(`[Sync Liquipedia] Saved ${saved} upcoming series`);

    return res.status(200).json({
      success: true,
      stats: {
        liquipedia: liquipediaUpcoming.length,
        saved
      }
    });
  } catch (e) {
    console.error('[Sync Liquipedia] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
