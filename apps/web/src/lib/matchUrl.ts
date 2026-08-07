/** 从 DLTV match_url（https://dltv.org/matches/<id>/<slug>）提取 slug，用于比赛详情页加载数据 */
export function slugFromMatchUrl(url?: string | null): string {
  if (!url) return '';
  const match = String(url).match(/\/matches\/\d+\/([^/]+)/i);
  return match?.[1] ?? '';
}

/** 从 DLTV match_url 同时提取 seriesId + slug，用于内部比赛详情页跳转（#/match/<id>?slug=）。 */
export function seriesIdAndSlugFromMatchUrl(url?: string | null): { matchId: string; slug?: string } | null {
  if (!url) return null;
  const match = String(url).match(/\/matches\/(\d+)(?:\/([^/?#]+))?/i);
  if (!match) return null;
  return { matchId: match[1], slug: match[2] ? decodeURIComponent(match[2]) : undefined };
}
