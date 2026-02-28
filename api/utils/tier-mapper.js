/**
 * Tournament Tier Mapper
 * Maps tournament names/league IDs to T1/T2/T3 tiers
 *
 * T1: The International, Major, DPC Masters, ESL One, DreamLeague Major
 * T2: Regional tournaments, Minor, ESL Challenger, BTS Pro Series
 * T3: Smaller online tournaments, qualifiers
 */

// Tournament name mappings (case-insensitive)
const TOURNAMENT_TIER_MAP = {
  // T1 - Top tier major events
  'the international': 'T1',
  'ti': 'T1',
  'dota 2 major': 'T1',
  'dreamleague major': 'T1',
  'dreamleague season': 'T1',
  'pgl major': 'T1',
  'esl one': 'T1',
  'blast slam': 'T1',
  'blast premier': 'T1',
  'dpc master': 'T1',
  'dpc season': 'T1',

  // T2 - Mid tier events
  'dreamleague challenger': 'T2',
  'esl challenger': 'T2',
  'esl impact': 'T2',
  'bts pro series': 'T2',
  'weplay': 'T2',
  'spirit league': 'T2',
  'galactic':
  'T2',
  'pgl minor': 'T2',
  'dpc qualifier': 'T3',

  // T3 - Lower tier events
  'open qualifier': 'T3',
  'closed qualifier': 'T3',
  'showmatch': 'T3',
  'friendly': 'T3',
  'exhibition': 'T3',
};

// League ID mappings
const LEAGUE_ID_TIER_MAP = {
  19269: 'T1', // DreamLeague Season 28
  18988: 'T1', // DreamLeague Season 27
  19099: 'T1', // BLAST Slam VI
  19130: 'T2', // ESL Challenger China
};

/**
 * Map a tournament to its tier
 * @param {string} tournamentName - The tournament name
 * @param {number|string} leagueId - Optional league ID
 * @returns {string} T1, T2, T3, or null if unknown
 */
export function mapTier(tournamentName, leagueId) {
  // First try league ID if available
  if (leagueId) {
    const idNum = typeof leagueId === 'string' ? parseInt(leagueId) : leagueId;
    if (LEAGUE_ID_TIER_MAP[idNum]) {
      return LEAGUE_ID_TIER_MAP[idNum];
    }
  }

  // Then try tournament name
  if (!tournamentName) {
    return null;
  }

  const normalized = tournamentName.toLowerCase().trim();

  // Check exact matches first
  if (TOURNAMENT_TIER_MAP[normalized]) {
    return TOURNAMENT_TIER_MAP[normalized];
  }

  // Check partial matches
  for (const [key, tier] of Object.entries(TOURNAMENT_TIER_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return tier;
    }
  }

  // Default to T3 for unknown tournaments
  return 'T3';
}

/**
 * Add tier to a match object
 * @param {object} match - Match object with tournament_name and/or league_id
 * @returns {object} Match object with added tier field
 */
export function addTierToMatch(match) {
  return {
    ...match,
    tier: mapTier(match.tournament_name, match.league_id)
  };
}

/**
 * Add tier to multiple matches
 * @param {array} matches - Array of match objects
 * @returns {array} Array of match objects with tier field
 */
export function addTierToMatches(matches) {
  return matches.map(addTierToMatch);
}

export default { mapTier, addTierToMatch, addTierToMatches };
