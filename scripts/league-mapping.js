/**
 * OpenDota League ID 到 Tournament ID 的映射表
 * 用于将 OpenDota 的比赛关联到本地 tournament
 *
 * 获取 OpenDota league_id 的方法:
 * 1. 访问 https://api.opendota.com/api/leagues 查看所有联赛
 * 2. 或在比赛数据中查看 league_id
 *
 * 常用联赛ID (需要根据实际情况更新):
 * - DreamLeague: 117 = DreamLeague Season 19, 132 = DreamLeague S21
 * - ESL One: 地区和年份不同 ID 不同
 * - The International: 1 = TI10, 2 = TI11, etc.
 */

// OpenDota league_id -> tournament_id 映射
export const LEAGUE_TO_TOURNAMENT_MAP = {
  // DreamLeague 系列
  117: 'dreamleague-s28',
  132: 'dreamleague-s29',
  143: 'dreamleague-s30',

  // ESL One
  1829: 'esl-one-2025-spring',
  1830: 'esl-one-birmingham-2025',

  // PGL
  1801: 'pgl-wallachia-7',
  1802: 'pgl-wallachia-s8',

  // The International
  1: 'ti-2021',
  2: 'ti-2022',
  3: 'ti-2023',
  4: 'ti-2024',

  // BLAST
  1443: 'blast-slam-6',
  1444: 'blast-slam-7',
};

// 反向映射: tournament_id -> league_ids
export const TOURNAMENT_LEAGUE_IDS = {
  'dreamleague-s28': [117],
  'dreamleague-s29': [132],
  'pgl-wallachia-7': [1801],
  'pgl-wallachia-s8': [1802],
  'blast-slam-6': [1443],
};

/**
 * 根据 league_id 查找 tournament_id
 */
export function getTournamentIdByLeagueId(leagueId) {
  if (!leagueId) return null;
  return LEAGUE_TO_TOURNAMENT_MAP[leagueId] || null;
}

/**
 * 根据 tournament_id 查找 league_id
 */
export function getLeagueIdsByTournamentId(tournamentId) {
  if (!tournamentId) return [];
  return TOURNAMENT_LEAGUE_IDS[tournamentId] || [];
}
