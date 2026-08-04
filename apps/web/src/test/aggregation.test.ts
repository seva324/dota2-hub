import { describe, expect, it } from 'vitest';
import { aggregateMatchesBySeries } from '@/lib/seriesAggregation';

describe('aggregateMatchesBySeries', () => {
  it('groups matches by explicit series_id and returns one series with ordered maps', () => {
    const matches = [
      {
        match_id: '12346',
        series_id: 321,
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        start_time: 1700000100,
      },
      {
        match_id: '12345',
        series_id: 321,
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        start_time: 1700000000,
      },
    ];

    const series = aggregateMatchesBySeries(matches);

    expect(series).toHaveLength(1);
    expect(series[0]?.seriesId).toBe('321');
    expect(series[0]?.primaryMatch.match_id).toBe('12345');
    expect(series[0]?.maps.map((m) => m.matchId)).toEqual(['12345', '12346']);
  });

  it('recognizes series id field aliases', () => {
    const cases = ['seriesId', 'siteSeriesId', 'upcomingSeriesId', 'sourceSeriesId'];

    for (const alias of cases) {
      const series = aggregateMatchesBySeries([
        {
          match_id: '1',
          [alias]: 'abc',
          start_time: 1700000000,
        },
        {
          match_id: '2',
          [alias]: 'abc',
          start_time: 1700000100,
        },
      ]);
      expect(series).toHaveLength(1);
      expect(series[0]?.seriesId).toBe('abc');
      expect(series[0]?.maps).toHaveLength(2);
    }
  });

  it('uses match_id as the fallback series key when no series id is present', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: '77',
        radiant_team_name: 'Team X',
        dire_team_name: 'Team Y',
        start_time: 1700000000,
      },
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]?.seriesId).toBeNull();
    expect(series[0]?.key).toBe('match:77');
    expect(series[0]?.primaryMatch.match_id).toBe('77');
  });

  it('sorts maps by map_number when map numbers are provided', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: 'map-2',
        series_id: 's1',
        map_number: 2,
        start_time: 1700000000,
      },
      {
        match_id: 'map-1',
        series_id: 's1',
        map_number: 1,
        start_time: 1700000300,
      },
    ]);

    expect(series[0]?.maps.map((m) => m.matchId)).toEqual(['map-1', 'map-2']);
    expect(series[0]?.maps[0]).toMatchObject({ label: '地图 1', mapNumber: 1 });
  });

  it('sorts maps by start_time when map numbers are missing, keeping primaryMatch first', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: 'late',
        series_id: 's2',
        start_time: 1700000200,
      },
      {
        match_id: 'early',
        series_id: 's2',
        start_time: 1700000000,
      },
    ]);

    expect(series[0]?.primaryMatch.match_id).toBe('early');
    expect(series[0]?.maps.map((m) => m.matchId)).toEqual(['early', 'late']);
  });

  it('sorts series by primary match start time ascending', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: 'later',
        series_id: 's-later',
        start_time: 1700000200,
      },
      {
        match_id: 'earlier',
        series_id: 's-earlier',
        start_time: 1700000000,
      },
    ]);

    expect(series.map((s) => s.primaryMatch.match_id)).toEqual(['earlier', 'later']);
  });

  it('keeps distinct series separate when series ids differ', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: 'a1',
        series_id: 'A',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        start_time: 1700000000,
      },
      {
        match_id: 'b1',
        series_id: 'B',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        start_time: 1700000000,
      },
    ]);

    expect(series).toHaveLength(2);
  });

  it('reads game_number as an alternative map number source', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: 'g2',
        series_id: 's3',
        game_number: 2,
        start_time: 1700000000,
      },
      {
        match_id: 'g1',
        series_id: 's3',
        game_number: 1,
        start_time: 1700000100,
      },
    ]);

    expect(series[0]?.maps.map((m) => m.matchId)).toEqual(['g1', 'g2']);
    expect(series[0]?.maps[0]?.mapNumber).toBe(1);
  });

  it('exposes the raw match through each map entry', () => {
    const series = aggregateMatchesBySeries([
      {
        match_id: 'raw-1',
        series_id: 's4',
        radiant_team_name: 'Team A',
        dire_team_name: 'Team B',
        start_time: 1700000000,
      },
    ]);

    expect(series[0]?.maps[0]?.match).toMatchObject({ match_id: 'raw-1' });
  });
});
