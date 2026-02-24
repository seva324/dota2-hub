import teams from './public/data/teams.json' with { type: 'json' };

const logoMap = new Map();
teams.forEach(team => {
    logoMap.set(team.name.toLowerCase(), team.logo_url);
    if (team.name_cn) logoMap.set(team.name_cn.toLowerCase(), team.logo_url);
    if (team.tag) logoMap.set(team.tag.toLowerCase(), team.logo_url);
});

// New fuzzy matching function
function findTeamLogo(logoMap, teamName) {
  if (!teamName) return null;
  
  const normalizedName = teamName.toLowerCase().trim();
  
  // Exact match first
  if (logoMap.has(normalizedName)) {
    return logoMap.get(normalizedName);
  }
  
  // Fuzzy match: check if any key is contained in the team name or vice versa
  for (const [key, logoUrl] of logoMap.entries()) {
    // Skip short tags that cause false matches
    if (key.length <= 2) continue;
    
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return logoUrl;
    }
  }
  
  return null;
}

console.log("=== Fuzzy Matching Tests ===\n");

// Test various name variations that might come from KV
const testNames = [
  'MOUZ', 'MOUZ ', ' MOUZ',                    // whitespace variants
  'Tundra Esports', 'Tundra', 'tundra',         // partial matches  
  'BetBoom Team', 'BetBoom',                   
  'Team Spirit', 'Spirit',
  'paiN Gaming', 'paiN',
  'PARIVISION', 'PARI',
  'Natus Vincere', "Na'Vi", 'na\'vi',
  'Unknown Team',                               // should return null
];

testNames.forEach(name => {
    const result = findTeamLogo(logoMap, name);
    console.log(`"${name}" => ${result ? 'FOUND' : 'NOT FOUND'}`);
});
