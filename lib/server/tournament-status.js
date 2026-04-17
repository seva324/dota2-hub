export function deriveTournamentStatus(startTime, endTime, now = Date.now()) {
  if (startTime == null || endTime == null || startTime === '' || endTime === '') {
    return 'upcoming';
  }
  const start = Number(startTime);
  const end = Number(endTime);
  const current = Math.floor(Number(now) / 1000);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return 'upcoming';
  }
  if (current < start) return 'upcoming';
  if (current <= end) return 'ongoing';
  return 'completed';
}
