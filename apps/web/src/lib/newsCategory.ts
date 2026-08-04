export const CATEGORY_COLORS: Record<string, string> = {
  esports: '#3b82f6',
  tournament: '#3b82f6',
  patch: '#22c55e',
  gameplay: '#22c55e',
  news: '#94a3b8',
  transfer: '#a855f7',
  roster: '#a855f7',
  drama: '#f43f5e',
  takes: '#f59e0b',
  community: '#f59e0b',
  default: '#94a3b8',
};

export const CATEGORY_LABELS: Record<string, string> = {
  esports: '赛事',
  tournament: '赛事',
  patch: '版本',
  gameplay: '版本',
  news: '资讯',
  transfer: '转会',
  roster: '阵容',
  drama: '八卦',
  takes: '观点',
  community: '社区',
  default: '资讯',
};

export const CATEGORY_ORDER = ['赛事', '版本', '转会', '阵容', '八卦', '观点', '社区', '资讯'];

export function categoryInfo(category?: string): { label: string; color: string } {
  const key = String(category || '').toLowerCase();
  return {
    label: CATEGORY_LABELS[key] || CATEGORY_LABELS.default,
    color: CATEGORY_COLORS[key] || CATEGORY_COLORS.default,
  };
}
