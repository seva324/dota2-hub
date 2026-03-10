import { getDb } from './_db.js';
import {
  handleOptions,
  loadHomePayload,
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

  try {
    const payload = await loadHomePayload(db);
    return sendApiSuccess(res, payload);
  } catch (error) {
    console.error('[MP Home API] Error:', error instanceof Error ? error.message : error);
    return sendApiError(
      res,
      500,
      'MP_HOME_FAILED',
      error instanceof Error ? error.message : 'Failed to load mini program home payload'
    );
  }
}
