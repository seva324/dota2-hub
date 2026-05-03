export type SeriesMatchInput = {
  id?: string | number | null;
  match_id?: string | number | null;
  series_id?: string | number | null;
  seriesId?: string | number | null;
  siteSeriesId?: string | number | null;
  sourceSeriesId?: string | number | null;
  upcomingSeriesId?: string | number | null;
  map_number?: string | number | null;
  mapNumber?: string | number | null;
  game_number?: string | number | null;
  gameNumber?: string | number | null;
  start_time?: string | number | null;
  tournament_name?: string | null;
  radiant_team_id?: string | number | null;
  dire_team_id?: string | number | null;
  radiant_team_name?: string | null;
  dire_team_name?: string | null;
  series_type?: string | number | null;
};

export type AggregatedSeriesMap<T extends SeriesMatchInput> = {
  label: string;
  mapNumber: number;
  matchId: string | null;
  match: T;
};

export type AggregatedSeries<T extends SeriesMatchInput> = {
  key: string;
  seriesId: string | null;
  primaryMatch: T;
  maps: AggregatedSeriesMap<T>[];
};

function toCleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getExplicitSeriesId(match: SeriesMatchInput): string | null {
  return (
    toCleanString(match.series_id) ||
    toCleanString(match.seriesId) ||
    toCleanString(match.siteSeriesId) ||
    toCleanString(match.upcomingSeriesId) ||
    toCleanString(match.sourceSeriesId)
  );
}

function getFallbackSeriesKey(match: SeriesMatchInput): string {
  const matchId = toCleanString(match.match_id) || toCleanString(match.id);
  if (matchId) return `match:${matchId}`;

  return [
    'fallback',
    match.tournament_name,
    match.radiant_team_id || match.radiant_team_name,
    match.dire_team_id || match.dire_team_name,
    match.start_time,
    match.series_type,
  ].map((part) => toCleanString(part) || 'unknown').join(':');
}

function getMapNumber(match: SeriesMatchInput, fallbackIndex: number): number {
  return (
    toFiniteNumber(match.map_number) ||
    toFiniteNumber(match.mapNumber) ||
    toFiniteNumber(match.game_number) ||
    toFiniteNumber(match.gameNumber) ||
    fallbackIndex + 1
  );
}

function getStartTime(match: SeriesMatchInput): number {
  return toFiniteNumber(match.start_time) || 0;
}

export function aggregateMatchesBySeries<T extends SeriesMatchInput>(matches: readonly T[]): AggregatedSeries<T>[] {
  const groups = new Map<string, { seriesId: string | null; matches: T[] }>();

  for (const match of matches) {
    const seriesId = getExplicitSeriesId(match);
    const key = seriesId ? `series:${seriesId}` : getFallbackSeriesKey(match);
    const group = groups.get(key);
    if (group) {
      group.matches.push(match);
    } else {
      groups.set(key, { seriesId, matches: [match] });
    }
  }

  return Array.from(groups.entries())
    .map(([key, group]) => {
      const orderedMatches = [...group.matches].sort((left, right) => getStartTime(left) - getStartTime(right));
      const maps = orderedMatches
        .map((match, index) => {
          const mapNumber = getMapNumber(match, index);
          return {
            label: `地图 ${mapNumber}`,
            mapNumber,
            matchId: toCleanString(match.match_id),
            match,
          };
        })
        .sort((left, right) => left.mapNumber - right.mapNumber || getStartTime(left.match) - getStartTime(right.match));

      return {
        key,
        seriesId: group.seriesId,
        primaryMatch: orderedMatches[0],
        maps,
      };
    })
    .sort((left, right) => getStartTime(left.primaryMatch) - getStartTime(right.primaryMatch));
}
