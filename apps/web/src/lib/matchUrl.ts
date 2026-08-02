/** 从 DLTV match_url（https://dltv.org/matches/<id>/<slug>）提取 slug，用于比赛详情页加载数据 */
export function slugFromMatchUrl(url?: string | null): string {
  if (!url) return '';
  const match = String(url).match(/\/matches\/\d+\/([^/]+)/i);
  return match?.[1] ?? '';
}
