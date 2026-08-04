import { describe, expect, it } from 'vitest';
import {
  deriveTeamFlyoutModel,
  resolveTeamFlyoutSources,
  type MatchLike,
  type TeamLike,
} from '@/lib/teamFlyoutModel';

const NOW = 1_750_000_000;

function makeMatch(overrides: Partial<MatchLike> = {}): MatchLike {
  return {
    match_id: '9001',
    start_time: NOW - 3600,
    series_type: 'BO3',
    radiant_team_id: '1',
    dire_team_id: '3',
    radiant_team_name: 'Team Alpha',
    dire_team_name: 'Opponent',
    radiant_score: 2,
    dire_score: 0,
    radiant_win: 1,
    tournament_name: 'Cup 1',
    ...overrides,
  };
}

describe('resolveTeamFlyoutSources', () => {
  it('prefers server payload when the team is present', () => {
    const sources = resolveTeamFlyoutSources(
      {
        team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
        recentMatches: [makeMatch({ match_id: 'srv-1' })],
        nextMatch: makeMatch({ match_id: 'srv-2', start_time: NOW + 3600 }),
      },
      { teams: [], matches: [], upcoming: [] },
    );

    expect(sources.hasServerPayload).toBe(true);
    expect(sources.teams).toHaveLength(1);
    expect(sources.matches.map((m) => m.match_id)).toEqual(['srv-1']);
    expect(sources.upcoming.map((m) => m.match_id)).toEqual(['srv-2']);
  });

  it('falls back to preloaded data when the server payload has no team', () => {
    const preloadedTeams: TeamLike[] = [{ team_id: '1', name: 'Team Alpha' }];
    const preloadedMatches = [makeMatch({ match_id: 'pre-1' })];
    const preloadedUpcoming = [makeMatch({ match_id: 'pre-2', start_time: NOW + 3600 })];

    const sources = resolveTeamFlyoutSources(
      { team: null, recentMatches: null, nextMatch: null },
      { teams: preloadedTeams, matches: preloadedMatches, upcoming: preloadedUpcoming },
    );

    expect(sources.hasServerPayload).toBe(false);
    expect(sources.teams).toEqual(preloadedTeams);
    expect(sources.matches).toEqual(preloadedMatches);
    expect(sources.upcoming).toEqual(preloadedUpcoming);
  });

  it('treats an empty server payload as no payload, falling back to preloaded data', () => {
    const sources = resolveTeamFlyoutSources(
      { team: null, recentMatches: [], nextMatch: null },
      { teams: [{ team_id: '1', name: 'Team Alpha' }], matches: [makeMatch()], upcoming: [] },
    );

    expect(sources.hasServerPayload).toBe(false);
    expect(sources.teams).toHaveLength(1);
    expect(sources.matches).toHaveLength(1);
  });

  it('does not invent data when the server has a team but no matches', () => {
    const sources = resolveTeamFlyoutSources(
      { team: { team_id: '1', name: 'Team Alpha' }, recentMatches: [], nextMatch: null },
      { teams: [], matches: [makeMatch()], upcoming: [makeMatch({ start_time: NOW + 3600 })] },
    );

    expect(sources.hasServerPayload).toBe(true);
    expect(sources.matches).toEqual([]);
    expect(sources.upcoming).toEqual([]);
  });
});

describe('deriveTeamFlyoutModel', () => {
  it('builds recent rows, next match, and win rate from sources', () => {
    const sources = resolveTeamFlyoutSources(
      {
        team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
        recentMatches: [
          makeMatch({ match_id: '9001', radiant_win: 1, start_time: NOW - 3600 }),
          makeMatch({ match_id: '9002', radiant_win: 0, start_time: NOW - 7200 }),
          makeMatch({ match_id: '9003', radiant_win: 1, start_time: NOW - 10800 }),
        ],
        nextMatch: makeMatch({ match_id: '9101', start_time: NOW + 3600 }),
      },
      { teams: [], matches: [], upcoming: [] },
    );

    const model = deriveTeamFlyoutModel({ team_id: '1', name: 'Team Alpha' }, sources, NOW);

    expect(model).not.toBeNull();
    expect(model?.recentRows).toHaveLength(3);
    expect(model?.wins).toBe(2);
    expect(model?.losses).toBe(1);
    expect(model?.winRate).toBe(67);
    expect(model?.nextMatch?.match_id).toBe('9101');
    expect(model?.meta?.tag).toBe('ALP');
  });

  it('excludes matches outside the 90-day window', () => {
    const sources = resolveTeamFlyoutSources(
      {
        team: { team_id: '1', name: 'Team Alpha' },
        recentMatches: [
          makeMatch({ match_id: 'old', start_time: NOW - 100 * 24 * 3600 }),
          makeMatch({ match_id: 'fresh', start_time: NOW - 3600 }),
        ],
        nextMatch: null,
      },
      { teams: [], matches: [], upcoming: [] },
    );

    const model = deriveTeamFlyoutModel({ team_id: '1', name: 'Team Alpha' }, sources, NOW);

    expect(model?.recentRows.map((r) => r.key)).toEqual(['fresh']);
  });

  it('resolves the team by alias when only the tag matches', () => {
    const sources = resolveTeamFlyoutSources(
      {
        team: { team_id: '1', name: 'Team Alpha', tag: 'ALP' },
        recentMatches: [],
        nextMatch: null,
      },
      { teams: [], matches: [], upcoming: [] },
    );

    const model = deriveTeamFlyoutModel({ team_id: '1', name: 'ALP' }, sources, NOW);

    expect(model?.meta?.name).toBe('Team Alpha');
  });
});
