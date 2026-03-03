/**
 * Team data shared across the application
 * Use region to identify Chinese teams: China
 */

export interface Team {
  id: string;
  name: string;
  tag: string;
  region: 'China' | 'CIS' | 'Europe' | 'SEA' | 'South America' | 'North America';
}

export const TARGET_TEAMS: Record<string, Team> = {
  // China
  'xg': { id: '8261500', name: 'Xtreme Gaming', tag: 'XG', region: 'China' },
  'yb': { id: '9351740', name: 'Yakult Brothers', tag: 'YB', region: 'China' },
  'ybtt': { id: '9579337', name: 'YB.Tearlaments', tag: 'YB.TT', region: 'China' },
  'roar': { id: '9885310', name: 'Roar Gaming', tag: 'Roar', region: 'China' },
  'vg': { id: '726228', name: 'Vici Gaming', tag: 'VG', region: 'China' },
  'gm': { id: '10008067', name: 'Game Master', tag: 'GM', region: 'China' },
  'refusing': { id: '10007878', name: 'Team Refuser', tag: 'Refuser', region: 'China' },
  'thriving': { id: '9885928', name: 'Thriving', tag: 'THR', region: 'China' },
  'lgd': { id: '15', name: 'PSG.LGD', tag: 'LGD', region: 'China' },
  'azure': { id: '8574561', name: 'Azure Ray', tag: 'AR', region: 'China' },
  // CIS
  'spirit': { id: '7119388', name: 'Team Spirit', tag: 'Spirit', region: 'CIS' },
  'aurora': { id: '9467224', name: 'Aurora Gaming', tag: 'Aurora', region: 'CIS' },
  'parivision': { id: '9572001', name: 'PARIVISION', tag: 'PARI', region: 'CIS' },
  'yandex': { id: '9823272', name: 'Team Yandex', tag: 'Yandex', region: 'CIS' },
  'betboom': { id: '8255888', name: 'BetBoom Team', tag: 'BetBoom', region: 'CIS' },
  '1w': { id: '9255039', name: '1w Team', tag: '1w', region: 'CIS' },
  // Europe
  'liquid': { id: '2163', name: 'Team Liquid', tag: 'Liquid', region: 'Europe' },
  'tundra': { id: '8291895', name: 'Tundra Esports', tag: 'Tundra', region: 'Europe' },
  'falcons': { id: '9247354', name: 'Team Falcons', tag: 'Falcons', region: 'Europe' },
  'mouz': { id: '9338413', name: 'MOUZ', tag: 'MOUZ', region: 'Europe' },
  'navi': { id: '36', name: 'Natus Vincere', tag: 'Natus Vincere', region: 'Europe' },
  'nigma': { id: '7554697', name: 'Nigma Galaxy', tag: 'Nigma', region: 'Europe' },
  'zero': { id: '9600141', name: 'Zero Tenacity', tag: 'Zero', region: 'Europe' },
  // SEA
  'og': { id: '2586976', name: 'OG', tag: 'OG', region: 'SEA' },
  'rekonix': { id: '9828897', name: 'REKONIX', tag: 'REK', region: 'SEA' },
  // South America
  'heroic': { id: '9303484', name: 'HEROIC', tag: 'Heroic', region: 'South America' },
  // North America
  'gamerlegion': { id: '9964962', name: 'GamerLegion', tag: 'GL', region: 'North America' },
};

// Get all Chinese team names/tags (lowercase for matching)
const CHINA_TEAMS = Object.values(TARGET_TEAMS)
  .filter(t => t.region === 'China')
  .flatMap((t) => [
    t.name.toLowerCase(),
    t.tag.toLowerCase(),
    t.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
  ]);

const CHINA_TEAM_EXACT = new Set(CHINA_TEAMS);

const CHINA_TEAM_NORMALIZED = new Set(
  CHINA_TEAMS.map((name) => name.replace(/[^a-z0-9]/g, ''))
);

/**
 * Check if a team is a Chinese team
 */
export function isChineseTeam(teamName: string | undefined | null): boolean {
  if (!teamName) return false;
  const lower = teamName.toLowerCase().trim();
  const normalized = lower.replace(/[^a-z0-9]/g, '');
  return CHINA_TEAM_EXACT.has(lower) || CHINA_TEAM_NORMALIZED.has(normalized);
}
