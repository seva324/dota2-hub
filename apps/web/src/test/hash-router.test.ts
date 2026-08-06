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

  it('parses an event deep link as its own page', () => {
    expect(parseHash('#/event/1win-essence-2')).toEqual({
      page: 'event',
      overlay: null,
      eventSlug: '1win-essence-2',
    });
  });

  it('round-trips an event route through toHash', () => {
    expect(toHash({ page: 'event', overlay: null, eventSlug: '1win-essence-2' })).toBe('#/event/1win-essence-2');
    expect(parseHash(toHash({ page: 'event', overlay: null, eventSlug: 'pgl wallachia s8' }))).toEqual({
      page: 'event',
      overlay: null,
      eventSlug: 'pgl wallachia s8',
    });
  });

  it('parses a live detail deep link as its own page', () => {
    expect(parseHash('#/live/98859')).toEqual({
      page: 'live',
      overlay: null,
      seriesId: '98859',
      slug: undefined,
      champ: undefined,
    });
  });

  it('parses a live deep link with hawk slug and champ', () => {
    expect(parseHash('#/live/98859?slug=team-resilience-vs-rune-eaters&champ=games-of-the-future-2026-playoffs')).toEqual({
      page: 'live',
      overlay: null,
      seriesId: '98859',
      slug: 'team-resilience-vs-rune-eaters',
      champ: 'games-of-the-future-2026-playoffs',
    });
  });

  it('parses a live deep link with encoded id', () => {
    expect(parseHash('#/live/team%20series%201')).toEqual({
      page: 'live',
      overlay: null,
      seriesId: 'team series 1',
    });
  });

  it('parses a news detail deep link as its own page', () => {
    expect(parseHash('#/news/hawk-some-story-1')).toEqual({
      page: 'news',
      overlay: null,
      newsId: 'hawk-some-story-1',
    });
  });

  it('parses a news detail deep link with encoded id', () => {
    expect(parseHash('#/news/bo3%20special')).toEqual({
      page: 'news',
      overlay: null,
      newsId: 'bo3 special',
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
      page: 'team',
      overlay: null,
      teamName: 'Team Spirit',
    });
  });

  it('parses a team deep link with teamId query', () => {
    expect(parseHash('#/team/Team%20Spirit?teamId=2163')).toEqual({
      page: 'team',
      overlay: null,
      teamName: 'Team Spirit',
      teamId: '2163',
    });
  });

  it('parses a team deep link with dltv slug query', () => {
    expect(parseHash('#/team/Team%20Liquid?slug=team-liquid')).toEqual({
      page: 'team',
      overlay: null,
      teamName: 'Team Liquid',
      teamSlug: 'team-liquid',
    });
  });

  it('serializes team detail with dltv slug', () => {
    expect(toHash({ page: 'team', overlay: null, teamName: 'Team Liquid', teamSlug: 'team-liquid' })).toBe(
      '#/team/Team%20Liquid?slug=team-liquid',
    );
  });

  it('round-trips a team deep link with dltv slug', () => {
    const parsed = parseHash('#/team/Team%20Liquid?slug=team-liquid');
    expect(toHash(parsed)).toBe('#/team/Team%20Liquid?slug=team-liquid');
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

  it('serializes the live detail page', () => {
    expect(toHash({ page: 'live', overlay: null, seriesId: '98859' })).toBe('#/live/98859');
  });

  it('round-trips a live detail deep link', () => {
    const parsed = parseHash('#/live/98859');
    expect(toHash(parsed)).toBe('#/live/98859');
  });

  it('serializes a live detail deep link with hawk slug and champ', () => {
    expect(toHash({ page: 'live', overlay: null, seriesId: '98859', slug: 'team-a-vs-team-b', champ: 'league' })).toBe(
      '#/live/98859?slug=team-a-vs-team-b&champ=league',
    );
    const parsed = parseHash('#/live/98859?slug=team-a-vs-team-b&champ=league');
    expect(toHash(parsed)).toBe('#/live/98859?slug=team-a-vs-team-b&champ=league');
  });

  it('serializes a home match overlay', () => {
    expect(toHash({ page: 'home', overlay: { type: 'match', matchId: '90001' } })).toBe('#/home/match/90001');
  });

  it('serializes the team detail page with encoding', () => {
    expect(toHash({ page: 'team', overlay: null, teamName: 'Team Spirit' })).toBe('#/team/Team%20Spirit');
    expect(toHash({ page: 'team', overlay: null, teamName: 'Team Spirit', teamId: '2163' })).toBe(
      '#/team/Team%20Spirit?teamId=2163',
    );
  });

  it('serializes a player overlay', () => {
    expect(toHash({ page: 'home', overlay: { type: 'player', accountId: '898754153' } })).toBe(
      '#/player/898754153',
    );
  });

  it('round-trips a team deep link through parseHash and toHash', () => {
    const parsed = parseHash('#/team/Team%20Spirit?teamId=2163');
    expect(toHash(parsed)).toBe('#/team/Team%20Spirit?teamId=2163');
  });

  it('serializes a news detail page', () => {
    expect(toHash({ page: 'news', overlay: null, newsId: 'hawk-some-story-1' })).toBe('#/news/hawk-some-story-1');
  });

  it('serializes the news list page', () => {
    expect(toHash({ page: 'news', overlay: null })).toBe('#/news');
  });

  it('round-trips a match deep link', () => {
    const parsed = parseHash('#/match/7777?slug=midas-club-vs-team-resilience');
    expect(parsed.page).toBe('match');
    expect(toHash(parsed)).toBe('#/match/7777?slug=midas-club-vs-team-resilience');
  });

  it('round-trips a news detail deep link', () => {
    const parsed = parseHash('#/news/hawk-some-story-1');
    expect(parsed).toMatchObject({ page: 'news', newsId: 'hawk-some-story-1' });
    expect(toHash(parsed)).toBe('#/news/hawk-some-story-1');
  });
});
