export type TopLevelPage = 'home' | 'tournaments' | 'matches' | 'teams' | 'players' | 'news' | 'match' | 'live' | 'event' | 'team';

export type OverlayState =
  | { type: 'match'; matchId: string }
  | { type: 'player'; accountId: string };

export interface RouteState {
  page: TopLevelPage;
  overlay: OverlayState | null;
  /** 仅 page==='match'：DLTV 系列赛 ID */
  matchId?: string;
  /** 仅 page==='match'：DLTV 详情页 slug（/matches/<id>/<slug>）；仅 page==='live'：hawk.live 系列赛 slug（构造 detail URL） */
  slug?: string;
  /** 仅 page==='live'：hawk.live 系列赛 ID */
  seriesId?: string;
  /** 仅 page==='live'：hawk.live 赛事 slug，配合 slug 构造 detail URL（避免回源抓首页匹配） */
  champ?: string;
  /** 仅 page==='news'：单条新闻详情 ID */
  newsId?: string;
  /** 仅 page==='event'：DLTV 赛事 slug（/events/<slug>） */
  eventSlug?: string;
  /** 仅 page==='team'：战队名（URL 段，可被 %20 等编码） */
  teamName?: string;
  /** 仅 page==='team'：战队 team_id（query 参数，用于精确匹配） */
  teamId?: string;
  /** 仅 page==='team'：DLTV 战队 slug（query 参数，优先于 name 启发式转换，用于精确拉取战队详情） */
  teamSlug?: string;
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
    case 'event': {
      if (!second) return { page: 'home', overlay: null };
      return {
        page: 'event',
        overlay: null,
        eventSlug: decodeURIComponent(second),
      };
    }
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
    case 'live': {
      if (!second) return { page: 'home', overlay: null };
      const query = new URLSearchParams(queryString || '');
      return {
        page: 'live',
        overlay: null,
        seriesId: decodeURIComponent(second),
        slug: query.get('slug') ?? undefined,
        champ: query.get('champ') ?? undefined,
      };
    }
    case 'team': {
      if (!second) return { page: 'home', overlay: null };
      const query = new URLSearchParams(queryString || '');
      return {
        page: 'team',
        overlay: null,
        teamName: decodeURIComponent(second),
        teamId: query.get('teamId') ?? undefined,
        teamSlug: query.get('slug') ?? undefined,
      };
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
  if (route.page === 'event' && route.eventSlug) {
    return `#/event/${encodeURIComponent(route.eventSlug)}`;
  }
  if (route.page === 'news' && route.newsId) {
    return `#/news/${encodeURIComponent(route.newsId)}`;
  }
  if (route.page === 'match' && route.matchId) {
    const base = `#/match/${encodeURIComponent(route.matchId)}`;
    return route.slug ? `${base}?slug=${encodeURIComponent(route.slug)}` : base;
  }
  if (route.page === 'live' && route.seriesId) {
    const base = `#/live/${encodeURIComponent(route.seriesId)}`;
    if (route.slug || route.champ) {
      const params = new URLSearchParams();
      if (route.slug) params.set('slug', route.slug);
      if (route.champ) params.set('champ', route.champ);
      return `${base}?${params.toString()}`;
    }
    return base;
  }
  if (route.page === 'team' && route.teamName) {
    const base = `#/team/${encodeURIComponent(route.teamName)}`;
    const params = new URLSearchParams();
    if (route.teamId) params.set('teamId', route.teamId);
    if (route.teamSlug) params.set('slug', route.teamSlug);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }
  if (route.overlay) {
    switch (route.overlay.type) {
      case 'match':
        return `#/home/match/${encodeURIComponent(route.overlay.matchId)}`;
      case 'player':
        return `#/player/${encodeURIComponent(route.overlay.accountId)}`;
    }
  }
  if (route.page === 'home') {
    return '#/';
  }
  return `#/${route.page}`;
}
