import Taro from '@tarojs/taro';
import {
  DEFAULT_API_BASE_URL,
  type MatchDetailPayload,
  type TeamFlyoutResponse,
  type TournamentDetailResponse,
  type TournamentListResponse,
  type UpcomingResponse,
} from '@dota2hub/shared-types';
import { createDota2HubApiClient, joinApiUrl, type RequestJson } from '@dota2hub/api-client';

const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || DEFAULT_API_BASE_URL;

const requestJson: RequestJson = async <T = unknown>(path: string): Promise<T> => {
  const response = await Taro.request<T>({
    url: joinApiUrl(apiBaseUrl, path),
    method: 'GET',
    timeout: 15000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Request failed: ${response.statusCode}`);
  }

  return response.data;
};

export const apiClient = createDota2HubApiClient(requestJson);

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export function fetchUpcoming(days?: number): Promise<UpcomingResponse> {
  return apiClient.fetchUpcoming(days);
}

export function fetchTournaments(): Promise<TournamentListResponse> {
  return apiClient.fetchTournaments();
}

export function fetchTournamentDetail(
  tournamentId: string,
  offset?: number,
  limit?: number
): Promise<TournamentDetailResponse> {
  return apiClient.fetchTournamentDetail(tournamentId, offset, limit);
}

export function fetchTeamDetail(
  teamId: string,
  offset?: number,
  limit?: number
): Promise<TeamFlyoutResponse> {
  return apiClient.fetchTeamDetail(teamId, offset, limit);
}

export function fetchMatchDetail(matchId: string): Promise<MatchDetailPayload> {
  return apiClient.fetchMatchDetail(matchId);
}
