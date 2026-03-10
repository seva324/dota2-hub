import { getDb } from '../_db.js';
import {
  handleOptions,
  loadTournamentDetailPayload,
  parsePagination,
  sendApiError,
  sendApiSuccess,
  setApiCors,
} from '../../../lib/server/mp-api.js';

export default async function handler(req, res) {
  setApiCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') {
    return sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const db = getDb();
  if (!db) {
    return sendApiError(res, 500, 'DATABASE_UNAVAILABLE', 'Database not available');
  }

  const tournamentId = String(req.query?.id || '').trim();
  if (!tournamentId) {
    return sendApiError(res, 400, 'INVALID_TOURNAMENT_ID', 'Tournament id is required');
  }

  const { limit, offset } = parsePagination(req.query, { limit: 10, maxLimit: 50 });

  try {
    const payload = await loadTournamentDetailPayload(db, tournamentId, { limit, offset });
    if (!payload) {
      return sendApiError(res, 404, 'TOURNAMENT_NOT_FOUND', 'Tournament not found');
    }
    return sendApiSuccess(res, payload);
  } catch (error) {
    console.error('[MP Tournament Detail API] Error:', error instanceof Error ? error.message : error);
    return sendApiError(
      res,
      500,
      'MP_TOURNAMENT_DETAIL_FAILED',
      error instanceof Error ? error.message : 'Failed to load mini program tournament detail'
    );
  }
}
