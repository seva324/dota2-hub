import { getDb } from '../_db.js';
import {
  handleOptions,
  loadTeamDetailPayload,
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

  const teamId = String(req.query?.id || '').trim();
  if (!teamId) {
    return sendApiError(res, 400, 'INVALID_TEAM_ID', 'Team id is required');
  }

  const { limit, offset } = parsePagination(req.query, { limit: 5, maxLimit: 20 });

  try {
    const payload = await loadTeamDetailPayload(db, teamId, { limit, offset });
    if (!payload) {
      return sendApiError(res, 404, 'TEAM_NOT_FOUND', 'Team not found');
    }
    return sendApiSuccess(res, payload);
  } catch (error) {
    console.error('[MP Team Detail API] Error:', error instanceof Error ? error.message : error);
    return sendApiError(
      res,
      500,
      'MP_TEAM_DETAIL_FAILED',
      error instanceof Error ? error.message : 'Failed to load mini program team detail'
    );
  }
}
