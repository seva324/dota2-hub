const HANDLER_LOADERS = {
  cron: () => import('../../api/cron.js'),
  'asset-image': () => import('../api-handlers/asset-image.js'),
  'bo3-image': () => import('../api-handlers/bo3-image.js'),
  heroes: () => import('../api-handlers/heroes.js'),
  'live-hero': () => import('../../api/live-hero.js'),
  'match-details': () => import('../../api/match-details.js'),
  matches: () => import('../../api/matches.js'),
  news: () => import('../../api/news.js'),
  'player-profile': () => import('../../api/player-profile.js'),
  'pro-players': () => import('../../api/pro-players.js'),
  'team-flyout': () => import('../../api/team-flyout.js'),
  'tournament-background': () => import('../api-handlers/tournament-background.js'),
  teams: () => import('../../api/teams.js'),
  tournaments: () => import('../../api/tournaments.js'),
  upcoming: () => import('../../api/upcoming.js'),
};

function normalizePathname(pathname = '/') {
  if (!pathname) return '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function resolveApiTarget(pathname) {
  const normalizedPath = normalizePathname(pathname);
  if (normalizedPath === '/api' || !normalizedPath.startsWith('/api')) {
    return null;
  }

  if (normalizedPath === '/api/sync-news') {
    return {
      key: 'cron',
      routePath: normalizedPath,
      queryOverrides: { action: 'sync-news' },
    };
  }

  if (normalizedPath === '/api/sync-liquipedia') {
    return {
      key: 'cron',
      routePath: normalizedPath,
      queryOverrides: { action: 'sync-liquipedia' },
    };
  }

  if (normalizedPath === '/api/mp') {
    return {
      key: 'matches',
      routePath: normalizedPath,
      queryOverrides: { __mp: '' },
    };
  }

  if (normalizedPath.startsWith('/api/mp/')) {
    return {
      key: 'matches',
      routePath: normalizedPath,
      queryOverrides: { __mp: normalizedPath.slice('/api/mp/'.length) },
    };
  }

  const routeKey = normalizedPath.slice('/api/'.length);
  if (!routeKey || routeKey.includes('/')) {
    return null;
  }

  if (!HANDLER_LOADERS[routeKey]) {
    return null;
  }

  return {
    key: routeKey,
    routePath: normalizedPath,
    queryOverrides: {},
  };
}

export async function loadApiHandler(key) {
  const loader = HANDLER_LOADERS[key];
  if (!loader) return null;
  const mod = await loader();
  return typeof mod?.default === 'function' ? mod.default : null;
}
