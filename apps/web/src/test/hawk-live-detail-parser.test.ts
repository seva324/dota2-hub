import { describe, expect, it } from 'vitest';

import { parseSeriesDetailPayload } from '../../../../lib/server/hawk-live.js';

function wrapDataPage(payload: unknown) {
  const encoded = JSON.stringify(payload)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  return `<div id="app" data-page="${encoded}"></div>`;
}

function buildSeriesPage(overrides: Record<string, unknown> = {}) {
  return wrapDataPage({
    component: 'SeriesPage',
    props: {
      seriesPageData: {
        id: 98859,
        slug: 'team-resilience-vs-rune-eaters',
        bestOf: 3,
        startAt: '2026-08-05T08:00:00.000000Z',
        championship: { id: 2365, name: 'Games of the Future 2026: Playoffs', slug: 'games-of-the-future-2026-playoffs' },
        team1: { id: 1926, name: 'Team Resilience', logoUrl: 'https://hawk.live/storage/teams/1926.png' },
        team2: { id: 3465, name: 'Rune Eaters', logoUrl: 'https://hawk.live/storage/teams/3465.png' },
        matches: [
          {
            id: 210027,
            number: 1,
            isTeam1Radiant: true,
            isRadiantWinner: null,
            picks: [
              { isRadiant: true, hero: { id: 98, name: 'Timbersaw', codeName: 'npc_dota_hero_shredder' }, player: { id: 145957968, name: 'niu', officialName: null } },
              { isRadiant: false, hero: { id: 9, name: 'Mirana', codeName: 'npc_dota_hero_mirana' }, player: { id: 326327879, name: 'Vevo', officialName: null } },
            ],
            states: [
              {
                id: 12061256, radiantScore: 0, direScore: 0, radiantNetWorthAdvantage: 0,
                buildingState: { radiant: { top: '11111', mid: '11111', bot: '11111', t4: '11' }, dire: { top: '11111', mid: '11111', bot: '11111', t4: '11' } },
                gameTime: 37,
              },
              { id: 12061258, radiantScore: 3, direScore: 1, radiantNetWorthAdvantage: -67, buildingState: { radiant: { top: '11111', mid: '11111', bot: '11111', t4: '11' }, dire: { top: '11111', mid: '11111', bot: '11111', t4: '11' } }, gameTime: 120 },
            ],
            oddsBundles: [
              { id: 224044, oddsProviderCodeName: 'betboom', isTeam1First: true, externalId: '5469532', odds: [{ id: 11920533, firstTeamWin: '2.15', secondTeamWin: '1.68' }, { id: 11923690, firstTeamWin: '2.05', secondTeamWin: '1.72' }] },
            ],
          },
        ],
        ...overrides,
      },
    },
  });
}

describe('parseSeriesDetailPayload', () => {
  it('returns null when page data is missing', () => {
    expect(parseSeriesDetailPayload('<div id="app"></div>')).toBeNull();
  });

  it('parses series meta, teams and live match state', () => {
    const payload = parseSeriesDetailPayload(buildSeriesPage());

    expect(payload?.seriesId).toBe('98859');
    expect(payload?.sourceUrl).toContain('/dota-2/matches/games-of-the-future-2026-playoffs/team-resilience-vs-rune-eaters');
    expect(payload?.championship).toEqual({ id: 2365, name: 'Games of the Future 2026: Playoffs', slug: 'games-of-the-future-2026-playoffs' });
    expect(payload?.team1).toMatchObject({ id: '1926', name: 'Team Resilience' });
    expect(payload?.team2).toMatchObject({ id: '3465', name: 'Rune Eaters' });
    expect(payload?.bestOf).toBe(3);
    expect(payload?.startAt).toBe('2026-08-05T08:00:00.000000Z');
  });

  it('normalizes the live map to team1/team2 perspective with full state history', () => {
    const payload = parseSeriesDetailPayload(buildSeriesPage());
    const map = payload?.maps?.[0];

    expect(map).toMatchObject({
      matchId: '210027',
      number: 1,
      isTeam1Radiant: true,
      status: 'live',
      winner: null,
      team1Score: 3,
      team2Score: 1,
      gameTime: 120,
      team1NetWorthLead: -67,
    });
    // isTeam1Radiant=true → radiant score 即 team1；净财富 advantage 直接透传
    expect(map?.states).toEqual([
      expect.objectContaining({ gameTime: 37, radiantScore: 0, direScore: 0, radiantNetWorthAdvantage: 0 }),
      expect.objectContaining({ gameTime: 120, radiantScore: 3, direScore: 1, radiantNetWorthAdvantage: -67 }),
    ]);
    expect(map?.buildingState).toEqual({
      radiant: { top: '11111', mid: '11111', bot: '11111', t4: '11' },
      dire: { top: '11111', mid: '11111', bot: '11111', t4: '11' },
    });
  });

  it('maps picks with hero + player and latest odds', () => {
    const payload = parseSeriesDetailPayload(buildSeriesPage());
    const map = payload?.maps?.[0];

    expect(map?.picks).toEqual([
      expect.objectContaining({
        isRadiant: true,
        hero: expect.objectContaining({ id: 98, name: 'Timbersaw', codeName: 'npc_dota_hero_shredder' }),
        player: expect.objectContaining({ id: 145957968, name: 'niu', officialName: null }),
      }),
      expect.objectContaining({
        isRadiant: false,
        hero: expect.objectContaining({ id: 9, name: 'Mirana' }),
        player: expect.objectContaining({ name: 'Vevo' }),
      }),
    ]);
    // odds 取每个 provider 最新一条
    expect(map?.odds).toEqual([expect.objectContaining({ provider: 'betboom', firstTeamWin: '2.05', secondTeamWin: '1.72' })]);
  });

  it('derives team wins and marks completed maps as finished', () => {
    const payload = parseSeriesDetailPayload(buildSeriesPage({
      matches: [
        { id: 1, number: 1, isTeam1Radiant: true, isRadiantWinner: true, states: [{ gameTime: 2100, radiantScore: 22, direScore: 30 }] },
        { id: 2, number: 2, isTeam1Radiant: true, isRadiantWinner: false, states: [{ gameTime: 1900, radiantScore: 18, direScore: 25 }] },
        { id: 3, number: 3, isTeam1Radiant: false, isRadiantWinner: null, states: [{ gameTime: 1738, radiantScore: 11, direScore: 14 }] },
      ],
    }));

    expect(payload?.team1Wins).toBe(1);
    expect(payload?.team2Wins).toBe(1);
    expect(payload?.currentMapNumber).toBe(3);

    const [m1, m2, m3] = payload?.maps ?? [];
    expect(m1?.status).toBe('completed');
    expect(m1?.winner).toBe('team1');
    // isTeam1Radiant=false：radiant=22 是 team2，dire=30 是 team1 → team1Score 30
    expect(m2).toMatchObject({ status: 'completed', winner: 'team2', team1Score: 18, team2Score: 25 });
    expect(m3).toMatchObject({ status: 'live', isTeam1Radiant: false, team1Score: 14, team2Score: 11 });
  });
});
