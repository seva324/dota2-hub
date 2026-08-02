import { describe, expect, it } from 'vitest';
import { parseHash, toHash } from '@/lib/hashRouter';

describe('parseHash', () => {
  it('parses empty hash as home', () => {
    expect(parseHash('')).toEqual({ page: 'home', overlay: null });
  });

  it('parses "#/" as home', () => {
    expect(parseHash('#/')).toEqual({ page: 'home', overlay: null });
  });

  it('parses a bare "#" as home', () => {
    expect(parseHash('#')).toEqual({ page: 'home', overlay: null });
  });

  it('parses top-level pages', () => {
    expect(parseHash('#/tournaments')).toEqual({ page: 'tournaments', overlay: null });
    expect(parseHash('#/matches')).toEqual({ page: 'matches', overlay: null });
    expect(parseHash('#/teams')).toEqual({ page: 'teams', overlay: null });
    expect(parseHash('#/players')).toEqual({ page: 'players', overlay: null });
  });

  it('parses a match deep link as its own page', () => {
    expect(parseHash('#/match/7777')).toEqual({
      page: 'match',
      overlay: null,
      matchId: '7777',
      slug: undefined,
    });
  });

  it('parses a match deep link with a slug', () => {
    expect(parseHash('#/match/427386?slug=midas-club-vs-team-resilience')).toEqual({
      page: 'match',
      overlay: null,
      matchId: '427386',
      slug: 'midas-club-vs-team-resilience',
    });
  });

  it('parses a home match overlay deep link', () => {
    expect(parseHash('#/home/match/90001')).toEqual({
      page: 'home',
      overlay: { type: 'match', matchId: '90001' },
    });
  });

  it('parses a team deep link with encoded names', () => {
    expect(parseHash('#/team/Team%20Spirit')).toEqual({
      page: 'home',
      overlay: { type: 'team', teamName: 'Team Spirit' },
    });
  });

  it('parses a player deep link', () => {
    expect(parseHash('#/player/898754153')).toEqual({
      page: 'home',
      overlay: { type: 'player', accountId: '898754153' },
    });
  });

  it('falls back to home for unknown routes', () => {
    expect(parseHash('#/unknown')).toEqual({ page: 'home', overlay: null });
    expect(parseHash('#/match')).toEqual({ page: 'home', overlay: null });
    expect(parseHash('#/team')).toEqual({ page: 'home', overlay: null });
    expect(parseHash('#/player')).toEqual({ page: 'home', overlay: null });
  });
});

describe('toHash', () => {
  it('serializes home', () => {
    expect(toHash({ page: 'home', overlay: null })).toBe('#/');
  });

  it('serializes top-level pages', () => {
    expect(toHash({ page: 'matches', overlay: null })).toBe('#/matches');
    expect(toHash({ page: 'tournaments', overlay: null })).toBe('#/tournaments');
  });

  it('serializes the standalone match page', () => {
    expect(toHash({ page: 'match', overlay: null, matchId: '7777' })).toBe('#/match/7777');
    expect(toHash({ page: 'match', overlay: null, matchId: '7777', slug: 'midas-club-vs-team-resilience' })).toBe(
      '#/match/7777?slug=midas-club-vs-team-resilience',
    );
  });

  it('serializes a home match overlay', () => {
    expect(toHash({ page: 'home', overlay: { type: 'match', matchId: '90001' } })).toBe('#/home/match/90001');
  });

  it('serializes a team overlay with encoding', () => {
    expect(toHash({ page: 'home', overlay: { type: 'team', teamName: 'Team Spirit' } })).toBe(
      '#/team/Team%20Spirit',
    );
  });

  it('serializes a player overlay', () => {
    expect(toHash({ page: 'home', overlay: { type: 'player', accountId: '898754153' } })).toBe(
      '#/player/898754153',
    );
  });

  it('round-trips a team deep link through parseHash and toHash', () => {
    const parsed = parseHash('#/team/Team%20Spirit');
    expect(toHash(parsed)).toBe('#/team/Team%20Spirit');
  });

  it('round-trips a match deep link', () => {
    const parsed = parseHash('#/match/7777?slug=midas-club-vs-team-resilience');
    expect(parsed.page).toBe('match');
    expect(toHash(parsed)).toBe('#/match/7777?slug=midas-club-vs-team-resilience');
  });
});
