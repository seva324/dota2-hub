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

const SITE_ORIGIN_FALLBACK = 'https://dotahub.cn';

function firstHeaderValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanHost(value) {
  return String(firstHeaderValue(value) || '')
    .trim()
    .toLowerCase();
}

function normalizeHost(value) {
  return cleanHost(value).replace(/:\d+$/, '');
}

function isInternalEdgeHost(host) {
  return host.endsWith('.qcloudteo.com') || host.includes('pages-scf');
}

function buildOriginFromHost(host, proto) {
  const resolvedProto = String(firstHeaderValue(proto) || 'https').trim() || 'https';
  return `${resolvedProto}://${host}`.replace(/\/+$/, '');
}

function getPublicOrigin(req) {
  const configured =
    process.env.PUBLIC_SITE_ORIGIN ||
    process.env.VITE_PUBLIC_SITE_ORIGIN ||
    process.env.SITE_URL ||
    '';
  if (configured) return configured.replace(/\/+$/, '');

  const rawForwardedHost = cleanHost(
    req?.headers?.['x-forwarded-host']
      || req?.headers?.['X-Forwarded-Host']
      || req?.headers?.['x-original-host']
      || req?.headers?.['X-Original-Host']
  );
  const forwardedProto = req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'];
  if (rawForwardedHost && !isInternalEdgeHost(normalizeHost(rawForwardedHost))) {
    return buildOriginFromHost(rawForwardedHost, forwardedProto);
  }

  const rawHost = cleanHost(req?.headers?.host || req?.headers?.Host);
  const normalizedHost = normalizeHost(rawHost);
  if (rawHost && !isInternalEdgeHost(normalizedHost)) {
    const proto = forwardedProto || (/^(localhost|127\.0\.0\.1)$/.test(normalizedHost) ? 'http' : 'https');
    return buildOriginFromHost(rawHost, proto);
  }

  return SITE_ORIGIN_FALLBACK;
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
        const payload = await loadHomePayload(db, { req, publicOrigin: getPublicOrigin(req) });
        sendApiSuccess(res, payload);
        return true;
      }
      case 'tournaments': {
        const { limit, offset } = parsePagination(req.query, { limit: 20, offset: 0 });
        const payload = await listTournamentSummaries(db, { limit, offset, req });
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
        const payload = await loadTournamentDetailPayload(db, id, { limit, offset, req });
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
