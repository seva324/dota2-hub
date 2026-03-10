import { getDb } from './_db.js';
import {
  handleOptions,
  loadUpcomingPayload,
  parsePagination,
  parsePositiveInt,
  sendApiError,
  sendApiSuccess,
  setApiCors,
} from '../../lib/server/mp-api.js';

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

  const { limit, offset } = parsePagination(req.query, { limit: 10, maxLimit: 50 });
  const days = parsePositiveInt(req.query?.days, 2, { min: 1, max: 14 });

  try {
    const payload = await loadUpcomingPayload(db, { days, limit, offset });
    return sendApiSuccess(res, payload);
  } catch (error) {
    console.error('[MP Upcoming API] Error:', error instanceof Error ? error.message : error);
    return sendApiError(
      res,
      500,
      'MP_UPCOMING_FAILED',
      error instanceof Error ? error.message : 'Failed to load mini program upcoming matches'
    );
  }
}
