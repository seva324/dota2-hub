// @ts-nocheck

export function formatMatchTime(timestamp) {
  if (!timestamp) return 'TBD';
  const date = new Date(timestamp * 1000);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export function formatRelativeCountdown(timestamp) {
  if (!timestamp) return 'TBD';
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff <= 0) return 'Live';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'In progress';
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function formatSeriesScore(left, right) {
  return `${left ?? 0} : ${right ?? 0}`;
}

export function getTeamLabel(name, tag) {
  return name || tag || 'TBD';
}

export function getWinRateLabel(winRate) {
  if (typeof winRate !== 'number' || Number.isNaN(winRate)) return '--';
  return `${winRate}%`;
}

export function formatPublishedDay(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(timestamp * 1000);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${month}/${day}`;
}

export function getMatchStatusMeta(match) {
  const now = Math.floor(Date.now() / 1000);
  if (match?.status === 'completed' || (match?.radiant_score != null && match?.dire_score != null && (match?.start_time || 0) < now - 2 * 3600)) {
    return { tone: 'completed', label: 'Completed' };
  }
  if (match?.status === 'live' || (match?.start_time && match.start_time <= now)) {
    return { tone: 'live', label: 'Live' };
  }
  return { tone: 'upcoming', label: 'Upcoming' };
}

export function getTournamentStatusMeta(tournament) {
  const status = String(tournament?.status || '').toLowerCase();
  if (status.includes('ongoing') || status.includes('live')) {
    return { tone: 'live', label: 'Ongoing' };
  }
  if (status.includes('done') || status.includes('completed') || status.includes('finished')) {
    return { tone: 'completed', label: 'Completed' };
  }
  return { tone: 'upcoming', label: 'Upcoming' };
}

export function getSeriesStatusMeta(series) {
  const games = Array.isArray(series?.games) ? series.games : [];
  const now = Math.floor(Date.now() / 1000);
  const hasCompletedGame = games.some((game) => game.radiant_score != null && game.dire_score != null);
  const hasFutureGame = games.some((game) => (game.start_time || 0) > now);

  if (hasCompletedGame && !hasFutureGame) {
    return { tone: 'completed', label: 'Completed' };
  }
  if ((series?.radiant_score || series?.dire_score) && hasFutureGame) {
    return { tone: 'live', label: 'Live' };
  }
  if (games.some((game) => (game.start_time || 0) <= now && (game.start_time || 0) >= now - 4 * 3600)) {
    return { tone: 'live', label: 'Live' };
  }
  return { tone: 'upcoming', label: 'Upcoming' };
}

export function formatPrizePool(prizePool, prizePoolUsd) {
  if (prizePool) return String(prizePool);
  if (prizePoolUsd) return `$${Number(prizePoolUsd).toLocaleString()}`;
  return 'TBD';
}

export function formatDateRange(startTime, endTime) {
  if (!startTime && !endTime) return 'TBD';
  const start = startTime ? formatPublishedDay(startTime) : '--';
  const end = endTime ? formatPublishedDay(endTime) : '--';
  return `${start} - ${end}`;
}

export function getMatchPayloadStatusMeta(payload) {
  const now = Math.floor(Date.now() / 1000);
  if (payload?.radiant_score != null && payload?.dire_score != null && (payload?.start_time || 0) < now - 2 * 3600) {
    return { tone: 'completed', label: 'Completed' };
  }
  if (payload?.start_time && payload.start_time <= now) {
    return { tone: 'live', label: 'Live / recent' };
  }
  return { tone: 'upcoming', label: 'Scheduled' };
}
