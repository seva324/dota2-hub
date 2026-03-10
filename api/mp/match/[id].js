import { getDb } from '../_db.js';
import {
  handleOptions,
  loadMatchDetailPayload,
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

  const matchId = Number(req.query?.id);
  if (!Number.isFinite(matchId)) {
    return sendApiError(res, 400, 'INVALID_MATCH_ID', 'Match id is required');
  }

  try {
    const payload = await loadMatchDetailPayload(db, matchId);
    if (!payload) {
      return sendApiError(res, 404, 'MATCH_NOT_FOUND', 'Match detail not found');
    }
    return sendApiSuccess(res, payload);
  } catch (error) {
    console.error('[MP Match Detail API] Error:', error instanceof Error ? error.message : error);
    return sendApiError(
      res,
      500,
      'MP_MATCH_DETAIL_FAILED',
      error instanceof Error ? error.message : 'Failed to load mini program match detail'
    );
  }
}
