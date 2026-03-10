// @ts-nocheck
import Taro from '@tarojs/taro';

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || 'https://dota2-hub.vercel.app';

function joinUrl(path) {
  return `${API_BASE_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function requestJson(path) {
  const response = await Taro.request({
    url: joinUrl(path),
    method: 'GET',
    timeout: 15000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Request failed: ${response.statusCode}`);
  }

  return response.data;
}

export async function fetchUpcoming(days = 2) {
  return requestJson(`/api/upcoming?days=${days}`);
}

export async function fetchTournaments() {
  return requestJson('/api/tournaments');
}

export async function fetchTournamentDetail(tournamentId, offset = 0, limit = 10) {
  return requestJson(
    `/api/tournaments?tournamentId=${encodeURIComponent(tournamentId)}&limit=${limit}&offset=${offset}`,
  );
}

export async function fetchTeamDetail(teamId, offset = 0, limit = 5) {
  return requestJson(
    `/api/team-flyout?teamId=${encodeURIComponent(teamId)}&limit=${limit}&offset=${offset}`,
  );
}

export async function fetchMatchDetail(matchId) {
  return requestJson(`/api/match-details?matchId=${encodeURIComponent(matchId)}`);
}
