import { describe, expect, it } from 'vitest';
import { calculateDynamicAge, summarizePlayerMatches } from '../../lib/player-profile.js';

describe('player profile helpers', () => {
  it('calculates dynamic age from birth year/month and birth date', () => {
    const now = new Date('2026-03-05T00:00:00.000Z');

    expect(calculateDynamicAge({ birthYear: 2000, birthMonth: 3 }, now)).toBe(26);
    expect(calculateDynamicAge({ birthDate: '2000-03-10' }, now)).toBe(25);
    expect(calculateDynamicAge({ birthDate: '2000-03-01' }, now)).toBe(26);
  });

  it('summarizes most-played heroes and opponent info for recent matches', () => {
    const rows = [
      {
        match_id: 3,
        start_time: 1741000000,
        radiant_team_id: '10',
        dire_team_id: '20',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_score: 2,
        dire_score: 0,
        radiant_win: true,
        payload: {
          players: [
            { account_id: 1001, player_slot: 0, hero_id: 1 },
            { account_id: 2001, player_slot: 1, hero_id: 2 },
            { account_id: 2002, player_slot: 2, hero_id: 3 },
            { account_id: 2003, player_slot: 3, hero_id: 4 },
            { account_id: 2004, player_slot: 4, hero_id: 5 },
            { account_id: 3001, player_slot: 128, hero_id: 6 },
            { account_id: 3002, player_slot: 129, hero_id: 7 },
            { account_id: 3003, player_slot: 130, hero_id: 8 },
            { account_id: 3004, player_slot: 131, hero_id: 9 },
            { account_id: 3005, player_slot: 132, hero_id: 10 },
          ],
          radiant_team: { team_id: '10', name: 'Team A' },
          dire_team: { team_id: '20', name: 'Team B' },
        },
      },
      {
        match_id: 2,
        start_time: 1740500000,
        radiant_team_id: '30',
        dire_team_id: '10',
        radiant_team_name: 'Team C',
        dire_team_name: 'Team A',
        radiant_score: 1,
        dire_score: 2,
        radiant_win: false,
        payload: {
          players: [
            { account_id: 4001, player_slot: 0, hero_id: 11 },
            { account_id: 4002, player_slot: 1, hero_id: 12 },
            { account_id: 4003, player_slot: 2, hero_id: 13 },
            { account_id: 4004, player_slot: 3, hero_id: 14 },
            { account_id: 4005, player_slot: 4, hero_id: 15 },
            { account_id: 1001, player_slot: 128, hero_id: 1 },
            { account_id: 5002, player_slot: 129, hero_id: 16 },
            { account_id: 5003, player_slot: 130, hero_id: 17 },
            { account_id: 5004, player_slot: 131, hero_id: 18 },
            { account_id: 5005, player_slot: 132, hero_id: 19 },
          ],
          radiant_team: { team_id: '30', name: 'Team C' },
          dire_team: { team_id: '10', name: 'Team A' },
        },
      },
      {
        match_id: 1,
        start_time: 1730000000,
        radiant_team_id: '10',
        dire_team_id: '40',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team D',
        radiant_score: 0,
        dire_score: 2,
        radiant_win: false,
        payload: {
          players: [
            { account_id: 1001, player_slot: 0, hero_id: 2 },
            { account_id: 6001, player_slot: 1, hero_id: 3 },
            { account_id: 6002, player_slot: 2, hero_id: 4 },
            { account_id: 6003, player_slot: 3, hero_id: 5 },
            { account_id: 6004, player_slot: 4, hero_id: 6 },
            { account_id: 7001, player_slot: 128, hero_id: 7 },
            { account_id: 7002, player_slot: 129, hero_id: 8 },
            { account_id: 7003, player_slot: 130, hero_id: 9 },
            { account_id: 7004, player_slot: 131, hero_id: 10 },
            { account_id: 7005, player_slot: 132, hero_id: 11 },
          ],
          radiant_team: { team_id: '10', name: 'Team A' },
          dire_team: { team_id: '40', name: 'Team D' },
        },
      },
    ];

    const summary = summarizePlayerMatches(rows, 1001, {
      nowTs: 1741200000,
      windowDays: 90,
      recentLimit: 10,
    });

    expect(summary.recentMatches).toHaveLength(3);
    expect(summary.recentMatches[0].opponent.name).toBe('Team B');
    expect(summary.recentMatches[1].opponent.name).toBe('Team C');

    expect(summary.mostPlayedHeroes[0]).toMatchObject({ hero_id: 1, matches: 2, wins: 2, win_rate: 100 });
    expect(summary.signatureHero).toMatchObject({ hero_id: 1, win_rate: 100 });
    expect(summary.winRate).toBe(100);
  });

  it('preserves draft pick order for team heroes when picks_bans is present', () => {
    const summary = summarizePlayerMatches([
      {
        match_id: 99,
        start_time: 1741000000,
        radiant_win: true,
        payload: {
          players: [
            { account_id: 1001, player_slot: 0, hero_id: 1 },
            { account_id: 2001, player_slot: 1, hero_id: 2 },
            { account_id: 2002, player_slot: 2, hero_id: 3 },
            { account_id: 2003, player_slot: 3, hero_id: 4 },
            { account_id: 2004, player_slot: 4, hero_id: 5 },
            { account_id: 3001, player_slot: 128, hero_id: 6 },
            { account_id: 3002, player_slot: 129, hero_id: 7 },
            { account_id: 3003, player_slot: 130, hero_id: 8 },
            { account_id: 3004, player_slot: 131, hero_id: 9 },
            { account_id: 3005, player_slot: 132, hero_id: 10 },
          ],
          picks_bans: [
            { hero_id: 2, team: 'radiant', is_pick: true, order: 5 },
            { hero_id: 1, team: 'radiant', is_pick: true, order: 1 },
            { hero_id: 5, team: 'radiant', is_pick: true, order: 9 },
            { hero_id: 4, team: 'radiant', is_pick: true, order: 7 },
            { hero_id: 3, team: 'radiant', is_pick: true, order: 3 },
            { hero_id: 6, team: 'dire', is_pick: true, order: 2 },
          ],
        },
      },
    ], 1001, {
      nowTs: 1741200000,
      windowDays: 90,
      recentLimit: 10,
    });

    expect(summary.recentMatches).toHaveLength(1);
    expect(summary.recentMatches[0].team_hero_ids).toEqual([1, 3, 2, 4, 5]);
  });
});
