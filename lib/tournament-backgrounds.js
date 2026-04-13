const SITE_BASE_URL_FALLBACK = 'https://dotahub.cn';

const TOURNAMENT_BACKGROUND_SOURCES = {
  'els-one': 'https://s3.dltv.org/uploads/events/big/ss7zk4XQXlCHb5xW4oMghiq6Ntj0UTGV.png',
  wallachia: 'https://s3.dltv.org/uploads/events/big/1Hc95JBZfYQUlGVImpRYuFurLzummAHS.png',
  'blast-slam': 'https://s3.dltv.org/uploads/events/VRfbbHunEWUIpjZsRyzA0ydlA1JZ3YgU.png',
  dreamleague: 'https://s3.dltv.org/uploads/events/MhAj31f9Cvs4gnNKcRlVuOeDI16xEWEt.png',
  'premier-series': 'https://s3.dltv.org/uploads/events/MhAj31f9Cvs4gnNKcRlVuOeDI16xEWEt.png',
  'fissure-universe-episode-8': 'https://s3.dltv.org/uploads/events/big/7y8afruiGSdAYnLvjZUBHFXaqVoEEwRk.png',
};

function normalizeTournamentText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function getTournamentCandidates(tournamentOrName) {
  if (typeof tournamentOrName === 'string') {
    return [tournamentOrName];
  }

  return [tournamentOrName?.name_cn, tournamentOrName?.name].filter(Boolean);
}

export function resolveTournamentBackgroundSlug(tournamentOrName) {
  const candidates = getTournamentCandidates(tournamentOrName).map(normalizeTournamentText).filter(Boolean);
  if (candidates.some((value) => value === 'fissureuniverseepisode8')) return 'fissure-universe-episode-8';
  if (candidates.some((value) => value.includes('elsone'))) return 'els-one';
  if (candidates.some((value) => value.includes('wallachia'))) return 'wallachia';
  if (candidates.some((value) => value.includes('blastslam'))) return 'blast-slam';
  if (candidates.some((value) => value.includes('dreamleague'))) return 'dreamleague';
  if (candidates.some((value) => value.includes('premierseries'))) return 'premier-series';
  return null;
}

export function getTournamentBackgroundSourceUrl(slug) {
  return TOURNAMENT_BACKGROUND_SOURCES[String(slug || '').trim()] || null;
}

export function getTournamentSiteBaseUrl(req) {
  const configured = process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return String(configured).replace(/\/$/, '');

  const host = req?.headers?.host || req?.headers?.Host;
  const proto = req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'] || 'https';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');

  return SITE_BASE_URL_FALLBACK;
}

export function buildTournamentBackgroundUrl(tournamentOrName, req) {
  const slug = resolveTournamentBackgroundSlug(tournamentOrName);
  if (!slug) return null;
  return `${getTournamentSiteBaseUrl(req)}/api/tournament-background?slug=${encodeURIComponent(slug)}`;
}
