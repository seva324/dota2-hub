import Taro from '@tarojs/taro';
import {
  DEFAULT_API_BASE_URL,
  type MatchDetailPayload,
  type MpHomePayload,
  type MpMatchDetailPayload,
  type MpTeamDetailPayload,
  type MpTournamentDetailPayload,
  type MpTournamentListPayload,
  type MpUpcomingPayload,
  type TeamFlyoutResponse,
  type TournamentDetailResponse,
  type TournamentListResponse,
  type UpcomingResponse,
} from '@dota2hub/shared-types';
import { createDota2HubApiClient, joinApiUrl, type RequestJson } from '@dota2hub/api-client';
import { readCache, writeCache } from '@/services/cache';

const apiBaseUrl = process.env.TARO_APP_API_BASE_URL || DEFAULT_API_BASE_URL;
const REQUEST_RETRY_LIMIT = 1;
const REQUEST_RETRY_DELAY_MS = 250;
const REQUEST_CACHE_TTL_MS = 30 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown, statusCode?: number): boolean {
  if (typeof statusCode === 'number' && statusCode >= 500) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return message.includes('timeout') || message.includes('fail') || message.includes('network');
}

function normalizeRequestError(error: unknown, statusCode?: number): Error {
  if (typeof statusCode === 'number') {
    if (statusCode === 404) return new Error('Requested data was not found');
    if (statusCode === 400) return new Error('Request parameters were invalid');
    if (statusCode >= 500) return new Error('Server is temporarily unavailable');
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  if (message.includes('timeout')) return new Error('Request timed out');
  if (message.includes('network') || message.includes('fail')) return new Error('Network request failed');
  return error instanceof Error ? error : new Error('Request failed');
}

function shouldCache(path: string): boolean {
  return path.startsWith('/api/mp/');
}

const requestJson: RequestJson = async <T = unknown>(path: string): Promise<T> => {
  const requestUrl = joinApiUrl(apiBaseUrl, path);
  const cacheKey = `request:${requestUrl}`;
  const cached = shouldCache(path) ? readCache<T>(cacheKey) : null;
  if (cached) {
    return cached;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= REQUEST_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await Taro.request<T>({
        url: requestUrl,
        method: 'GET',
        timeout: 15000,
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const normalized = normalizeRequestError(new Error(`Request failed: ${response.statusCode}`), response.statusCode);
        if (attempt < REQUEST_RETRY_LIMIT && shouldRetry(normalized, response.statusCode)) {
          await sleep(REQUEST_RETRY_DELAY_MS);
          continue;
        }
        throw normalized;
      }

      if (shouldCache(path)) {
        writeCache(cacheKey, response.data, REQUEST_CACHE_TTL_MS);
      }

      return response.data;
    } catch (error) {
      lastError = normalizeRequestError(error);
      if (attempt < REQUEST_RETRY_LIMIT && shouldRetry(lastError)) {
        await sleep(REQUEST_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  throw lastError || new Error('Request failed');
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

export async function fetchMpHome(): Promise<MpHomePayload> {
  const response = await apiClient.fetchMpHome();
  return response.data;
}

export async function fetchMpUpcoming(days?: number, offset?: number, limit?: number): Promise<MpUpcomingPayload> {
  const response = await apiClient.fetchMpUpcoming(days, offset, limit);
  return response.data;
}

export async function fetchMpTournaments(offset?: number, limit?: number): Promise<MpTournamentListPayload> {
  const response = await apiClient.fetchMpTournaments(offset, limit);
  return response.data;
}

export async function fetchMpTournamentDetail(
  tournamentId: string,
  offset?: number,
  limit?: number
): Promise<MpTournamentDetailPayload> {
  const response = await apiClient.fetchMpTournamentDetail(tournamentId, offset, limit);
  return response.data;
}

export async function fetchMpTeamDetail(
  teamId: string,
  offset?: number,
  limit?: number
): Promise<MpTeamDetailPayload> {
  const response = await apiClient.fetchMpTeamDetail(teamId, offset, limit);
  return response.data;
}

export async function fetchMpMatchDetail(matchId: string): Promise<MpMatchDetailPayload> {
  const response = await apiClient.fetchMpMatchDetail(matchId);
  return response.data;
}
