/**
 * 队伍招牌英雄聚合（match 详情页用）。
 *
 * dltv `/lineups/teams` 接口的队伍维度英雄统计与详情页选手数据经常不一致
 * （用户反馈队伍招牌英雄是错的、选手的是对的），所以改为从 5 个选手的
 * 招牌英雄（topHeroes）聚合出队伍招牌：
 *   - 按 heroId 合并各选手的出场/胜场；
 *   - "预期获胜" = 出场 × 胜率（按每位选手自己的胜率加权），作为排序依据；
 *   - 取预期获胜最高的 10 个英雄。
 */

/** 解析 DLTV 胜率字段："79%" / "63.000" / 67 → 0-100 数值；无效返回 0。 */
function parseWinRate(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(String(value).trim().replace('%', ''));
  return Number.isFinite(num) ? num : 0;
}

/**
 * 从队伍选手列表的 topHeroes 聚合队伍招牌英雄。
 * @param {Array<{ topHeroes?: Array<{ heroId: number|string, heroTitle?: string,
 *   heroImage?: string, maps?: number|string, wins?: number|string, winRate?: string|number }> }>} players
 * @returns {Array<{ heroId, heroTitle, heroImage, maps, wins, winRate, expectedWins }>}
 */
export function aggregateTeamSignatureHeroes(players) {
  const acc = new Map();
  for (const player of players || []) {
    for (const hero of player.topHeroes || []) {
      if (hero.heroId == null) continue;
      const key = String(hero.heroId);
      const row = acc.get(key) || {
        heroId: hero.heroId,
        heroTitle: hero.heroTitle ?? null,
        heroImage: hero.heroImage ?? null,
        maps: 0,
        wins: 0,
        expectedWins: 0,
      };
      const maps = Number(hero.maps) || 0;
      const wins = Number(hero.wins) || 0;
      row.maps += maps;
      row.wins += wins;
      row.expectedWins += maps * (parseWinRate(hero.winRate) / 100);
      acc.set(key, row);
    }
  }

  return [...acc.values()]
    .filter((row) => row.maps > 0)
    .sort((a, b) => b.expectedWins - a.expectedWins || b.maps - a.maps)
    .slice(0, 10)
    .map((row) => ({
      heroId: row.heroId,
      heroTitle: row.heroTitle,
      heroImage: row.heroImage,
      maps: row.maps,
      wins: row.wins,
      winRate: row.maps > 0 ? Math.round((row.wins / row.maps) * 1000) / 10 : null,
      expectedWins: Math.round(row.expectedWins * 100) / 100,
    }));
}
