export type TopLevelPage = 'home' | 'tournaments' | 'matches' | 'teams' | 'players' | 'news';

export type OverlayState =
  | { type: 'match'; matchId: string }
  | { type: 'team'; teamName: string }
  | { type: 'player'; accountId: string };

export interface RouteState {
  page: TopLevelPage;
  overlay: OverlayState | null;
}

const TOP_LEVEL_PAGES: TopLevelPage[] = ['home', 'tournaments', 'matches', 'teams', 'players', 'news'];

export function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#/, '');
  const [path] = raw.split('?');
  const segments = path.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { page: 'home', overlay: null };
  }

  const [first, second] = segments;

  if (TOP_LEVEL_PAGES.includes(first as TopLevelPage)) {
    if (segments.length > 1) {
      return { page: 'home', overlay: null };
    }
    return { page: first as TopLevelPage, overlay: null };
  }

  switch (first) {
    case 'match': {
      if (!second) return { page: 'home', overlay: null };
      return { page: 'home', overlay: { type: 'match', matchId: decodeURIComponent(second) } };
    }
    case 'team': {
      if (!second) return { page: 'home', overlay: null };
      return { page: 'home', overlay: { type: 'team', teamName: decodeURIComponent(second) } };
    }
    case 'player': {
      if (!second) return { page: 'home', overlay: null };
      return { page: 'home', overlay: { type: 'player', accountId: decodeURIComponent(second) } };
    }
    default: {
      return { page: 'home', overlay: null };
    }
  }
}

export function toHash(route: RouteState): string {
  if (route.overlay) {
    switch (route.overlay.type) {
      case 'match':
        return `#/match/${encodeURIComponent(route.overlay.matchId)}`;
      case 'team':
        return `#/team/${encodeURIComponent(route.overlay.teamName)}`;
      case 'player':
        return `#/player/${encodeURIComponent(route.overlay.accountId)}`;
    }
  }
  if (route.page === 'home') {
    return '#/';
  }
  return `#/${route.page}`;
}
