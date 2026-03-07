import { describe, expect, it } from 'vitest';
import { summarizePlayerMatches } from '../../lib/player-profile.js';

describe('player profile regression coverage', () => {
  it('builds recent matches and 3-month hero stats from db-style string payload values', () => {
    const rows = [
      {
        match_id: '301',
        start_time: 1741000000,
        radiant_team_id: '10',
        dire_team_id: '20',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        radiant_score: 2,
        dire_score: 1,
        radiant_win: true,
        payload: {
          players: [
            { accountId: '9001', player_slot: '0', hero_id: '99' },
            { account_id: '9002', player_slot: '1', hero_id: '2' },
            { account_id: '9003', player_slot: '2', hero_id: '3' },
            { account_id: '9004', player_slot: '3', hero_id: '4' },
            { account_id: '9005', player_slot: '4', hero_id: '5' },
            { account_id: '9101', player_slot: '128', hero_id: '6' },
            { account_id: '9102', player_slot: '129', hero_id: '7' },
            { account_id: '9103', player_slot: '130', hero_id: '8' },
            { account_id: '9104', player_slot: '131', hero_id: '9' },
            { account_id: '9105', player_slot: '132', hero_id: '10' },
          ],
          radiant_team: { team_id: '10', name: 'Team A' },
          dire_team: { team_id: '20', name: 'Team B' },
          picks_bans: [
            { hero_id: '5', team: 'radiant', is_pick: true, order: 4 },
            { hero_id: '99', team: 'radiant', is_pick: true, order: 0 },
            { hero_id: '3', team: 'radiant', is_pick: true, order: 2 },
            { hero_id: '2', team: 'radiant', is_pick: true, order: 1 },
            { hero_id: '4', team: 'radiant', is_pick: true, order: 3 },
          ],
        },
      },
      {
        match_id: '302',
        start_time: 1740500000,
        radiant_team_id: '20',
        dire_team_id: '10',
        radiant_team_name: 'Team B',
        dire_team_name: 'Team A',
        radiant_score: 2,
        dire_score: 0,
        radiant_win: true,
        payload: {
          players: [
            { account_id: '9101', player_slot: '0', hero_id: '11' },
            { account_id: '9102', player_slot: '1', hero_id: '12' },
            { account_id: '9103', player_slot: '2', hero_id: '13' },
            { account_id: '9104', player_slot: '3', hero_id: '14' },
            { account_id: '9105', player_slot: '4', hero_id: '15' },
            { accountid: '9001', player_slot: '128', hero_id: '99' },
            { account_id: '9002', player_slot: '129', hero_id: '16' },
            { account_id: '9003', player_slot: '130', hero_id: '17' },
            { account_id: '9004', player_slot: '131', hero_id: '18' },
            { account_id: '9005', player_slot: '132', hero_id: '19' },
          ],
          radiant_team: { team_id: '20', name: 'Team B' },
          dire_team: { team_id: '10', name: 'Team A' },
        },
      },
      {
        match_id: '303',
        start_time: 1730000000,
        radiant_team_id: '10',
        dire_team_id: '30',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team C',
        radiant_score: 2,
        dire_score: 0,
        radiant_win: true,
        payload: {
          players: [
            { account_id: '9001', player_slot: '0', hero_id: '42' },
            { account_id: '9201', player_slot: '1', hero_id: '2' },
            { account_id: '9202', player_slot: '2', hero_id: '3' },
            { account_id: '9203', player_slot: '3', hero_id: '4' },
            { account_id: '9204', player_slot: '4', hero_id: '5' },
            { account_id: '9301', player_slot: '128', hero_id: '6' },
            { account_id: '9302', player_slot: '129', hero_id: '7' },
            { account_id: '9303', player_slot: '130', hero_id: '8' },
            { account_id: '9304', player_slot: '131', hero_id: '9' },
            { account_id: '9305', player_slot: '132', hero_id: '10' },
          ],
          radiant_team: { team_id: '10', name: 'Team A' },
          dire_team: { team_id: '30', name: 'Team C' },
        },
      },
    ];

    const summary = summarizePlayerMatches(rows, '9001', {
      nowTs: 1741200000,
      windowDays: 90,
      signatureMinMatchesExclusive: 0,
      recentLimit: 15,
    });

    expect(summary.recentMatches).toHaveLength(3);
    expect(summary.recentMatches[0].team_hero_ids).toEqual([99, 2, 3, 4, 5]);
    expect(summary.mostPlayedHeroes).toHaveLength(1);
    expect(summary.mostPlayedHeroes[0]).toMatchObject({ hero_id: 99, matches: 2, wins: 1, win_rate: 50 });
    expect(summary.signatureHero).toMatchObject({ hero_id: 42 });
    expect(summary.winRate).toBe(50);
  });

  it('keeps recent matches even when player hero_id is missing', () => {
    const rows = [
      {
        match_id: 401,
        start_time: 1741100000,
        radiant_win: true,
        payload: {
          players: [
            { account_id: 7777, player_slot: 0, hero_id: 0 },
            { account_id: 8881, player_slot: 1, hero_id: 2 },
            { account_id: 8882, player_slot: 2, hero_id: 3 },
            { account_id: 8883, player_slot: 3, hero_id: 4 },
            { account_id: 8884, player_slot: 4, hero_id: 5 },
            { account_id: 8891, player_slot: 128, hero_id: 6 },
            { account_id: 8892, player_slot: 129, hero_id: 7 },
            { account_id: 8893, player_slot: 130, hero_id: 8 },
            { account_id: 8894, player_slot: 131, hero_id: 9 },
            { account_id: 8895, player_slot: 132, hero_id: 10 },
          ],
        },
      },
      {
        match_id: 400,
        start_time: 1740900000,
        radiant_win: false,
        payload: {
          players: [
            { account_id: 7777, player_slot: 128, hero_id: 23 },
            { account_id: 9991, player_slot: 0, hero_id: 11 },
            { account_id: 9992, player_slot: 1, hero_id: 12 },
            { account_id: 9993, player_slot: 2, hero_id: 13 },
            { account_id: 9994, player_slot: 3, hero_id: 14 },
            { account_id: 9995, player_slot: 4, hero_id: 15 },
            { account_id: 9901, player_slot: 129, hero_id: 16 },
            { account_id: 9902, player_slot: 130, hero_id: 17 },
            { account_id: 9903, player_slot: 131, hero_id: 18 },
            { account_id: 9904, player_slot: 132, hero_id: 19 },
          ],
        },
      },
    ];

    const summary = summarizePlayerMatches(rows, 7777, {
      nowTs: 1741200000,
      windowDays: 90,
      signatureMinMatchesExclusive: 0,
      recentLimit: 15,
    });

    expect(summary.recentMatches).toHaveLength(2);
    expect(summary.mostPlayedHeroes).toHaveLength(1);
    expect(summary.mostPlayedHeroes[0]).toMatchObject({ hero_id: 23, matches: 1 });
    expect(summary.signatureHero).toMatchObject({ hero_id: 23 });
  });
});
