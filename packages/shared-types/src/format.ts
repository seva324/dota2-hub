export function formatMatchTime(timestamp?: number | null): string {
  if (!timestamp) return '待定';
  const date = new Date(timestamp * 1000);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export function formatRelativeCountdown(timestamp?: number | null): string {
  if (!timestamp) return '待定';
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return '进行中';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟后`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时后`;
  return `${Math.floor(diff / 86400)} 天后`;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return '未结束';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分`;
}

export function formatSeriesScore(left?: number | null, right?: number | null): string {
  return `${left ?? 0} : ${right ?? 0}`;
}

export function getTeamLabel(name?: string | null, tag?: string | null): string {
  return name || tag || 'TBD';
}

export function getWinRateLabel(winRate?: number | null): string {
  if (typeof winRate !== 'number' || Number.isNaN(winRate)) return '--';
  return `${winRate}%`;
}
