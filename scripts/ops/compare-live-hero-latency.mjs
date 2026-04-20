import {
  buildUnorderedTeamKey,
  fetchHtml,
  fetchLiveSeriesDetails,
  parseHawkHomepageSeriesList,
} from '../../lib/server/hawk-live.js';

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
    } else {
      result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
    }
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : fallback;
}

function getSeriesKey(payload = {}) {
  const teams = Array.isArray(payload?.teams) ? payload.teams : [];
  return buildUnorderedTeamKey(teams[0]?.name, teams[1]?.name);
}

function getScoreSignature(payload = {}) {
  return JSON.stringify({
    seriesScore: payload?.seriesScore || null,
    liveMap: payload?.liveMap?.score || null,
    gameTime: payload?.liveMap?.gameTime || null,
  });
}

async function loadHawkSeriesSnapshot(targetTeamKey = null) {
  const homeHtml = await fetchHtml('https://hawk.live/');
  const rows = parseHawkHomepageSeriesList(homeHtml)
    .filter((row) => !targetTeamKey || row.teamKey === targetTeamKey);
  const detailedRows = await Promise.allSettled(rows.map((row) => fetchLiveSeriesDetails(row)));

  return detailedRows.flatMap((result) => {
    if (result.status !== 'fulfilled' || !result.value?.detail) return [];
    const row = result.value;
    return [{
      teamKey: row.teamKey,
      teams: [row.team1Name, row.team2Name],
      seriesScore: `${row.team1Score ?? row.detail.liveMap?.team1SeriesWins ?? 0} - ${row.team2Score ?? row.detail.liveMap?.team2SeriesWins ?? 0}`,
      liveMapScore: row.detail.liveMap?.score || null,
      gameTime: row.detail.liveMap?.gameTime || null,
      sourceUrl: row.url || null,
    }];
  });
}

async function loadSiteSeriesSnapshot(siteUrl, targetTeamKey = null) {
  const response = await fetch(`${siteUrl.replace(/\/$/, '')}/api/live-hero`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Site live hero API failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  const liveMatches = Array.isArray(payload?.liveMatches)
    ? payload.liveMatches
    : payload?.live
      ? [payload.live]
      : [];

  return liveMatches
    .map((match) => ({
      teamKey: getSeriesKey(match),
      teams: Array.isArray(match?.teams) ? match.teams.map((team) => team?.name || '?') : [],
      seriesScore: match?.seriesScore || null,
      liveMapScore: match?.liveMap?.score || null,
      gameTime: match?.liveMap?.gameTime || null,
      fetchedAt: match?.fetchedAt || null,
      sourceUrl: match?.sourceUrl || null,
      signature: getScoreSignature(match),
    }))
    .filter((match) => match.teamKey && (!targetTeamKey || match.teamKey === targetTeamKey));
}

function formatSnapshot(prefix, snapshot) {
  return `${prefix} ${snapshot.teams.join(' vs ')} | series ${snapshot.seriesScore || '-'} | map ${snapshot.liveMapScore || '-'} | gameTime ${snapshot.gameTime ?? '-'} | ${snapshot.sourceUrl || '-'}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const siteUrl = String(args.site || process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || 'https://dotahub.cn').trim();
  const intervalMs = toPositiveInt(args['interval-sec'], 5) * 1000;
  const cycles = toPositiveInt(args.cycles, 12);
  const teamA = String(args['team-a'] || '').trim();
  const teamB = String(args['team-b'] || '').trim();
  const targetTeamKey = teamA && teamB ? buildUnorderedTeamKey(teamA, teamB) : null;
  const hawkChangeTimes = new Map();
  const lastHawkSignatures = new Map();
  const lastSiteSignatures = new Map();

  console.log(`[compare-live-hero-latency] site=${siteUrl} intervalMs=${intervalMs} cycles=${cycles}${targetTeamKey ? ` target=${targetTeamKey}` : ''}`);

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    console.log(`\n[cycle ${cycle}] ${new Date().toISOString()}`);
    const [hawkSnapshots, siteSnapshots] = await Promise.all([
      loadHawkSeriesSnapshot(targetTeamKey),
      loadSiteSeriesSnapshot(siteUrl, targetTeamKey),
    ]);

    const hawkByKey = new Map(hawkSnapshots.map((snapshot) => [snapshot.teamKey, snapshot]));
    const siteByKey = new Map(siteSnapshots.map((snapshot) => [snapshot.teamKey, snapshot]));
    const allKeys = Array.from(new Set([...hawkByKey.keys(), ...siteByKey.keys()])).sort();

    if (!allKeys.length) {
      console.log('No live series found on Hawk or site API.');
    }

    for (const key of allKeys) {
      const hawk = hawkByKey.get(key);
      const site = siteByKey.get(key);
      const hawkSignature = hawk ? JSON.stringify({
        seriesScore: hawk.seriesScore,
        liveMapScore: hawk.liveMapScore,
        gameTime: hawk.gameTime,
      }) : null;
      const siteSignature = site?.signature || null;

      if (hawkSignature && lastHawkSignatures.get(key) !== hawkSignature) {
        hawkChangeTimes.set(key, Date.now());
        lastHawkSignatures.set(key, hawkSignature);
      }

      if (siteSignature) {
        lastSiteSignatures.set(key, siteSignature);
      }

      if (hawk) console.log(formatSnapshot('HAWK', hawk));
      if (site) console.log(formatSnapshot('SITE', site));

      if (hawk && site && hawkSignature === siteSignature) {
        const hawkChangedAt = hawkChangeTimes.get(key);
        const lagMs = hawkChangedAt ? Date.now() - hawkChangedAt : 0;
        console.log(`SYNC ${key} lag≈${lagMs}ms fetchedAt=${site.fetchedAt || 'n/a'}`);
      } else if (hawk && site) {
        console.log(`DIFF ${key} hawk!=site fetchedAt=${site.fetchedAt || 'n/a'}`);
      } else if (hawk) {
        console.log(`MISS ${key} present on Hawk only`);
      } else {
        console.log(`MISS ${key} present on site only`);
      }
    }

    if (cycle < cycles) {
      await sleep(intervalMs);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
