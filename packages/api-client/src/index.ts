import {
  DEFAULT_API_BASE_URL,
  DEFAULT_TEAM_HISTORY_PAGE_SIZE,
  DEFAULT_TOURNAMENT_SERIES_PAGE_SIZE,
  DEFAULT_UPCOMING_DAYS,
  matchDetailPayloadSchema,
  teamFlyoutResponseSchema,
  tournamentDetailResponseSchema,
  tournamentListResponseSchema,
  upcomingResponseSchema,
} from '@dota2hub/shared-types';

export type RequestJson = <T = unknown>(url: string) => Promise<T>;

export function joinApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createFetchRequestJson(baseUrl = DEFAULT_API_BASE_URL): RequestJson {
  return async function requestJson<T = unknown>(path: string): Promise<T> {
    const response = await fetch(joinApiUrl(baseUrl, path));
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  };
}

export function createDota2HubApiClient(requestJson: RequestJson) {
  return {
    async fetchUpcoming(days = DEFAULT_UPCOMING_DAYS) {
      return upcomingResponseSchema.parse(
        await requestJson(`/api/upcoming?days=${days}`)
      );
    },
    async fetchTournaments() {
      return tournamentListResponseSchema.parse(
        await requestJson('/api/tournaments')
      );
    },
    async fetchTournamentDetail(
      tournamentId: string,
      offset = 0,
      limit = DEFAULT_TOURNAMENT_SERIES_PAGE_SIZE
    ) {
      return tournamentDetailResponseSchema.parse(
        await requestJson(
          `/api/tournaments?tournamentId=${encodeURIComponent(tournamentId)}&limit=${limit}&offset=${offset}`
        )
      );
    },
    async fetchTeamDetail(
      teamId: string,
      offset = 0,
      limit = DEFAULT_TEAM_HISTORY_PAGE_SIZE
    ) {
      return teamFlyoutResponseSchema.parse(
        await requestJson(
          `/api/team-flyout?teamId=${encodeURIComponent(teamId)}&limit=${limit}&offset=${offset}`
        )
      );
    },
    async fetchMatchDetail(matchId: string) {
      return matchDetailPayloadSchema.parse(
        await requestJson(`/api/match-details?matchId=${encodeURIComponent(matchId)}`)
      );
    },
  };
}
