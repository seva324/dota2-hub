import { describe, expect, it } from 'vitest';

import {
  buildUnorderedTeamKey,
  extractInertiaPageData,
  parseHawkHomepageSeriesList,
  selectMatchingLiveSeries,
  summarizeSeriesDetail,
} from '@/../lib/server/hawk-live.js';

function wrapDataPage(payload: unknown) {
  const encoded = JSON.stringify(payload)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `<div id="app" data-page="${encoded}"></div>`;
}

describe('hawk live parser helpers', () => {
  it('normalizes unordered team pairs', () => {
    expect(buildUnorderedTeamKey('Aurora', 'Heroic')).toBe(buildUnorderedTeamKey('Heroic', 'Aurora'));
    expect(buildUnorderedTeamKey('Team Spirit', 'BetBoom Team')).toBe(buildUnorderedTeamKey('BetBoom Team', 'Spirit'));
  });

  it('extracts the inertia payload and homepage series rows', () => {
    const html = wrapDataPage({
      component: 'HomePage',
      props: {
        seriesList: [
          {
            id: 92350,
            slug: 'aurora-vs-heroic',
            championship: { slug: 'pgl-wallachia-season-7-group-stage', name: 'PGL Wallachia Season 7: Group Stage' },
            team1: { name: 'Aurora', logoUrl: 'https://hawk.live/storage/teams/6274.png' },
            team2: { name: 'Heroic', logoUrl: 'https://hawk.live/storage/teams/6398.png' },
            bestOf: 3,
            startAt: '2026-03-08T10:30:00.000000Z',
            team1Score: 1,
            team2Score: 1,
            currentMatchNumber: 3,
          },
        ],
      },
    });

    const page = extractInertiaPageData(html);
    expect(page?.component).toBe('HomePage');

    const rows = parseHawkHomepageSeriesList(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      leagueName: 'PGL Wallachia Season 7: Group Stage',
      team1Name: 'Aurora',
      team2Name: 'Heroic',
      team1Score: 1,
      team2Score: 1,
    });
    expect(rows[0]?.url).toContain('/dota-2/matches/pgl-wallachia-season-7-group-stage/aurora-vs-heroic');
  });

  it('summarizes completed maps and the live map from series detail data', () => {
    const html = wrapDataPage({
      component: 'SeriesPage',
      props: {
        seriesPageData: {
          id: 92350,
          slug: 'aurora-vs-heroic',
          bestOf: 3,
          team1: { name: 'Aurora', logoUrl: 'https://hawk.live/storage/teams/6274.png' },
          team2: { name: 'Heroic', logoUrl: 'https://hawk.live/storage/teams/6398.png' },
          matches: [
            { id: 1, number: 1, isTeam1Radiant: true, isRadiantWinner: false, states: [{ radiantScore: 22, direScore: 30, gameTime: 2100 }] },
            { id: 2, number: 2, isTeam1Radiant: true, isRadiantWinner: true, states: [{ radiantScore: 28, direScore: 17, gameTime: 1950 }] },
            { id: 3, number: 3, isTeam1Radiant: false, isRadiantWinner: null, states: [{ radiantScore: 11, direScore: 14, gameTime: 1738 }] },
          ],
        },
      },
    });

    const summary = summarizeSeriesDetail(html);
    expect(summary?.maps).toEqual([
      expect.objectContaining({ label: 'Map 1', score: '22 - 30', status: 'completed', result: 'team2', team1SeriesWins: 0, team2SeriesWins: 1, gameTime: 2100 }),
      expect.objectContaining({ label: 'Map 2', score: '28 - 17', status: 'completed', result: 'team1', team1SeriesWins: 1, team2SeriesWins: 1, gameTime: 1950 }),
      expect.objectContaining({ label: 'Map 3', score: '14 - 11', status: 'live', team1SeriesWins: 1, team2SeriesWins: 1 }),
    ]);
    expect(summary?.liveMap).toMatchObject({ label: 'Map 3', score: '14 - 11', status: 'live' });
  });

  it('matches all upcoming rows against hawk live rows using unordered normalized team keys', () => {
    const matches = selectMatchingLiveSeries(
      [
        { upcomingSeriesId: '1', team1Name: 'OG', team2Name: 'BetBoom Team' },
        { upcomingSeriesId: '2', team1Name: 'NAVI', team2Name: 'PARIVISION' },
      ],
      [
        { id: 'hawk-1', teamKey: buildUnorderedTeamKey('BetBoom Team', 'OG') },
        { id: 'hawk-2', teamKey: buildUnorderedTeamKey('PARIVISION', 'Natus Vincere') },
      ],
    );

    expect(matches).toHaveLength(2);
    expect(matches[0]?.upcoming?.upcomingSeriesId).toBe('1');
    expect(matches[1]?.upcoming?.upcomingSeriesId).toBe('2');
  });
});
