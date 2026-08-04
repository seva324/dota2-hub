import { describe, expect, it, vi } from 'vitest';
import {
  createFallbackMatchDetail,
  deriveMatchDetailModel,
  fetchMatchDetailModel,
} from '@/lib/matchDetailModel';

function makeMatch() {
  return {
    match_id: 9101,
    radiant_team_id: 1,
    radiant_team_name: 'XG',
    dire_team_id: 2,
    dire_team_name: 'Team Spirit',
    radiant_score: 2,
    dire_score: 1,
    radiant_win: true,
    duration: 1427,
    start_time: 1_700_000_000,
    league_name: 'DreamLeague',
    series_id: 321,
    series_type: 1,
    players: [
      { player_slot: 0, account_id: 11, name: 'R1', hero_id: 1, level: 30, kills: 5, deaths: 2, assists: 10, gold_per_min: 600, xp_per_min: 700, last_hits: 300, denies: 10, hero_damage: 10000, tower_damage: 2000, hero_healing: 100 },
      { player_slot: 128, account_id: 22, name: 'D1', hero_id: 2, level: 30, kills: 3, deaths: 5, assists: 8, gold_per_min: 500, xp_per_min: 600, last_hits: 250, denies: 5, hero_damage: 8000, tower_damage: 1000, hero_healing: 50 },
    ],
    picks_bans: [],
  };
}

describe('createFallbackMatchDetail', () => {
  it('builds a playable fallback match with XG vs Team Spirit', () => {
    const fallback = createFallbackMatchDetail(9101, [
      { label: '地图 1', matchId: '9101', radiantScore: 18, direScore: 9, duration: 1427 },
    ]);

    expect(fallback.match_id).toBe(9101);
    expect(fallback.radiant_team_name).toBe('XG');
    expect(fallback.dire_team_name).toBe('Team Spirit');
    expect(fallback.players).toHaveLength(10);
    expect(fallback.radiant_score).toBe(18);
    expect(fallback.dire_score).toBe(9);
    expect(fallback.radiant_win).toBe(true);
  });

  it('picks the matching series map when multiple maps exist', () => {
    const fallback = createFallbackMatchDetail(9102, [
      { label: '地图 1', matchId: '9101', radiantScore: 18, direScore: 9 },
      { label: '地图 2', matchId: '9102', radiantScore: 7, direScore: 16 },
    ]);

    expect(fallback.radiant_score).toBe(7);
    expect(fallback.dire_score).toBe(16);
    expect(fallback.radiant_win).toBe(false);
  });
});

describe('deriveMatchDetailModel', () => {
  it('splits players by side and resolves team names and refs', () => {
    const model = deriveMatchDetailModel(makeMatch(), []);

    expect(model.radiantPlayers).toHaveLength(1);
    expect(model.direPlayers).toHaveLength(1);
    expect(model.radiantTeamName).toBe('XG');
    expect(model.direTeamName).toBe('Team Spirit');
    expect(model.radiantTeamRef).toMatchObject({ team_id: '1', name: 'XG' });
    expect(model.direTeamRef).toMatchObject({ team_id: '2', name: 'Team Spirit' });
  });

  it('counts series wins from map scores per side', () => {
    const model = deriveMatchDetailModel(makeMatch(), [
      { label: '地图 1', matchId: '9101', radiantScore: 18, direScore: 9 },
      { label: '地图 2', matchId: '9102', radiantScore: 7, direScore: 16 },
      { label: '地图 3', matchId: '9103', radiantScore: 24, direScore: 20 },
    ]);

    expect(model.radiantSeriesWins).toBe(2);
    expect(model.direSeriesWins).toBe(1);
  });

  it('returns empty model for a null match', () => {
    const model = deriveMatchDetailModel(null, []);

    expect(model.radiantPlayers).toEqual([]);
    expect(model.direPlayers).toEqual([]);
    expect(model.radiantTeamName).toBe('Radiant');
    expect(model.direTeamName).toBe('Dire');
    expect(model.radiantTeamRef).toBeNull();
  });
});

describe('fetchMatchDetailModel', () => {
  it('returns the fetched match on success', async () => {
    const match = makeMatch();
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => match }) as Response);

    const result = await fetchMatchDetailModel(9101, [], fetcher);

    expect(result).toEqual(match);
    expect(fetcher).toHaveBeenCalledWith('/api/match-details?match_id=9101');
  });

  it('falls back to the fallback match when the API errors', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ error: 'server error' }) }) as Response);

    const result = await fetchMatchDetailModel(9101, [
      { label: '地图 1', matchId: '9101', radiantScore: 18, direScore: 9 },
    ], fetcher);

    expect(result?.match_id).toBe(9101);
    expect(result?.radiant_team_name).toBe('XG');
  });
});
