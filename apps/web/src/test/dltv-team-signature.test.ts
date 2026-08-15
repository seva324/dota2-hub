import { describe, expect, it } from 'vitest';

import { aggregateTeamSignatureHeroes } from '../../../../lib/server/dltv-team-signature.js';

const hero = (heroId: number, heroTitle: string, maps: number, wins: number, winRate: string) => ({
  heroId,
  heroTitle,
  heroImage: `https://dltv.org/img/${heroId}.png`,
  maps,
  wins,
  winRate,
});

describe('aggregateTeamSignatureHeroes', () => {
  it('aggregates the same hero across players and ranks by expected wins (maps × winRate)', () => {
    const players = [
      { topHeroes: [hero(126, 'Kez', 9, 7, '78%'), hero(11, 'Shadow Fiend', 8, 6, '75%')] },
      { topHeroes: [hero(126, 'Kez', 5, 4, '80%'), hero(73, 'Invoker', 11, 10, '91%')] },
    ];

    const result = aggregateTeamSignatureHeroes(players);

    expect(result).toHaveLength(3);
    // Kez：9×0.78 + 5×0.80 = 7.02 + 4 = 11.02 → 第一；maps 合并 14、wins 合并 11。
    expect(result[0]).toMatchObject({ heroId: 126, maps: 14, wins: 11, expectedWins: 11.02 });
    expect(result[0].winRate).toBeCloseTo((11 / 14) * 100, 1);
    // Invoker：11×0.91 = 10.01 → 第二。
    expect(result[1]).toMatchObject({ heroId: 73, expectedWins: 10.01 });
    // Shadow Fiend：8×0.75 = 6 → 第三。
    expect(result[2]).toMatchObject({ heroId: 11, expectedWins: 6 });
  });

  it('caps the output at 10 heroes and sorts by expected wins desc', () => {
    const players = Array.from({ length: 5 }, (_, i) => ({
      topHeroes: Array.from({ length: 6 }, (__, j) => hero(100 + j * 10 + i, `Hero${i}-${j}`, 10 - j, 5, '50%')),
    }));

    const result = aggregateTeamSignatureHeroes(players);

    expect(result).toHaveLength(10);
    for (let i = 1; i < result.length; i += 1) {
      expect(result[i - 1].expectedWins).toBeGreaterThanOrEqual(result[i].expectedWins);
    }
  });

  it('parses numeric winRate and percent strings', () => {
    const players = [
      { topHeroes: [hero(1, 'A', 10, 5, '50%'), hero(2, 'B', 10, 5, '63.000')] },
    ];

    const result = aggregateTeamSignatureHeroes(players);

    // 排序按预期获胜 desc：B(6.3) 在前，A(5) 在后。
    expect(result[0].expectedWins).toBe(6.3);
    expect(result[0].winRate).toBe(50);
    expect(result[1].expectedWins).toBe(5);
  });

  it('skips heroes without a heroId and returns empty for empty input', () => {
    const players = [{ topHeroes: [{ maps: 3, wins: 2, winRate: '67%' }] }];
    expect(aggregateTeamSignatureHeroes(players)).toEqual([]);
    expect(aggregateTeamSignatureHeroes([])).toEqual([]);
    expect(aggregateTeamSignatureHeroes(null)).toEqual([]);
  });
});
