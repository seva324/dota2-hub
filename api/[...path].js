import assetImageHandler from '../lib/api-handlers/asset-image.js';
import bo3ImageHandler from '../lib/api-handlers/bo3-image.js';
import heroesHandler from '../lib/api-handlers/heroes.js';
import tournamentBackgroundHandler from '../lib/api-handlers/tournament-background.js';

const HANDLERS = {
  'asset-image': assetImageHandler,
  'bo3-image': bo3ImageHandler,
  heroes: heroesHandler,
  'tournament-background': tournamentBackgroundHandler,
};

function resolveRouteKey(req) {
  const rawPath = req?.query?.path;
  if (Array.isArray(rawPath)) return rawPath[0] || '';
  if (typeof rawPath === 'string' && rawPath) return rawPath.split('/')[0] || '';

  const pathname = new URL(req?.url || '/', 'https://local.dota2hub').pathname;
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] === 'api' ? (segments[1] || '') : '';
}

export default async function handler(req, res) {
  const routeKey = resolveRouteKey(req);
  const routeHandler = HANDLERS[routeKey];
  if (!routeHandler) {
    return res.status(404).json({ error: 'API route not found' });
  }
  return routeHandler(req, res);
}
