export type TopLevelPage = 'home' | 'tournaments' | 'matches' | 'teams' | 'players' | 'news' | 'match';

export type OverlayState =
  | { type: 'match'; matchId: string }
  | { type: 'team'; teamName: string }
  | { type: 'player'; accountId: string };

export interface RouteState {
  page: TopLevelPage;
  overlay: OverlayState | null;
  /** 仅 page==='match'：DLTV 系列赛 ID */
  matchId?: string;
  /** 仅 page==='match'：DLTV 详情页 slug（/matches/<id>/<slug>），用于让 maps 非空 */
  slug?: string;
  /** 仅 page==='news'：单条新闻详情 ID */
  newsId?: string;
}

const TOP_LEVEL_PAGES: TopLevelPage[] = ['home', 'tournaments', 'matches', 'teams', 'players', 'news'];

export function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#/, '');
  const [path, queryString] = raw.split('?');
  const segments = path.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { page: 'home', overlay: null };
  }

  const [first, second] = segments;

  // 首页弹窗的 match 覆盖层：`#/home/match/<id>`（与新比赛详情页 `#/match/<id>` 区分开）
  if (first === 'home' && second === 'match' && segments.length >= 3) {
    return { page: 'home', overlay: { type: 'match', matchId: decodeURIComponent(segments[2]) } };
  }

  // 新闻详情页：`#/news/<id>`（需在 TOP_LEVEL_PAGES 检查之前拦截，否则会被拒回 home）
  if (first === 'news' && second) {
    return { page: 'news', overlay: null, newsId: decodeURIComponent(second) };
  }

  if (TOP_LEVEL_PAGES.includes(first as TopLevelPage)) {
    if (segments.length > 1) {
      return { page: 'home', overlay: null };
    }
    return { page: first as TopLevelPage, overlay: null };
  }

  switch (first) {
    case 'match': {
      if (!second) return { page: 'home', overlay: null };
      const query = new URLSearchParams(queryString || '');
      return {
        page: 'match',
        overlay: null,
        matchId: decodeURIComponent(second),
        slug: query.get('slug') ?? undefined,
      };
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
  if (route.page === 'news' && route.newsId) {
    return `#/news/${encodeURIComponent(route.newsId)}`;
  }
  if (route.page === 'match' && route.matchId) {
    const base = `#/match/${encodeURIComponent(route.matchId)}`;
    return route.slug ? `${base}?slug=${encodeURIComponent(route.slug)}` : base;
  }
  if (route.overlay) {
    switch (route.overlay.type) {
      case 'match':
        return `#/home/match/${encodeURIComponent(route.overlay.matchId)}`;
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
