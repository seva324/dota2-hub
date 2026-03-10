import {
  handleOptions,
  loadHomePayload,
  loadMatchDetailPayload,
  loadTeamDetailPayload,
  loadTournamentDetailPayload,
  loadUpcomingPayload,
  listTournamentSummaries,
  parsePagination,
  parsePositiveInt,
  sendApiError,
  sendApiSuccess,
  setApiCors,
  MP_DEFAULT_UPCOMING_DAYS,
} from './mp-api.js';

function splitRoute(route) {
  return String(route || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export async function handleMpRoute(req, res, db) {
  setApiCors(res);
  if (handleOptions(req, res)) return true;

  if (req.method !== 'GET') {
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    return true;
  }

  if (!db) {
    sendApiError(res, 500, 'DATABASE_UNAVAILABLE', 'Database not available');
    return true;
  }

  const [resource, id] = splitRoute(req.query?.__mp);

  try {
    switch (resource) {
      case 'home': {
        const payload = await loadHomePayload(db);
        sendApiSuccess(res, payload);
        return true;
      }
      case 'tournaments': {
        const { limit, offset } = parsePagination(req.query, { limit: 20, offset: 0 });
        const payload = await listTournamentSummaries(db, { limit, offset });
        sendApiSuccess(res, payload);
        return true;
      }
      case 'upcoming': {
        const { limit, offset } = parsePagination(req.query, { limit: 20, offset: 0 });
        const days = parsePositiveInt(req.query?.days, MP_DEFAULT_UPCOMING_DAYS, { min: 1, max: 14 });
        const payload = await loadUpcomingPayload(db, { days, limit, offset });
        sendApiSuccess(res, payload);
        return true;
      }
      case 'tournament': {
        if (!id) {
          sendApiError(res, 400, 'MISSING_TOURNAMENT_ID', 'Tournament id is required');
          return true;
        }
        const { limit, offset } = parsePagination(req.query, { limit: 10, offset: 0 });
        const payload = await loadTournamentDetailPayload(db, id, { limit, offset });
        if (!payload) {
          sendApiError(res, 404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
          return true;
        }
        sendApiSuccess(res, payload);
        return true;
      }
      case 'team': {
        if (!id) {
          sendApiError(res, 400, 'MISSING_TEAM_ID', 'Team id is required');
          return true;
        }
        const { limit, offset } = parsePagination(req.query, { limit: 5, offset: 0 });
        const payload = await loadTeamDetailPayload(db, id, { limit, offset });
        if (!payload) {
          sendApiError(res, 404, 'TEAM_NOT_FOUND', 'Team not found');
          return true;
        }
        sendApiSuccess(res, payload);
        return true;
      }
      case 'match': {
        if (!id) {
          sendApiError(res, 400, 'MISSING_MATCH_ID', 'Match id is required');
          return true;
        }
        const payload = await loadMatchDetailPayload(db, id);
        if (!payload) {
          sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match detail not found');
          return true;
        }
        sendApiSuccess(res, payload);
        return true;
      }
      default:
        sendApiError(res, 404, 'MP_ROUTE_NOT_FOUND', 'Mini program endpoint not found');
        return true;
    }
  } catch (error) {
    sendApiError(
      res,
      500,
      'MP_ROUTE_FAILED',
      error instanceof Error ? error.message : 'Failed to load mini program payload'
    );
    return true;
  }
}
