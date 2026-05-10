/**
 * EPT Ranking API
 * Scrapes DLTV.org for the current EPT (ESL Pro Tour) ranking.
 * Falls back to hardcoded data when DLTV is unreachable.
 */

const FALLBACK_TEAMS = [
  { rank: 1, name: 'Tundra Esports', logo: 'https://s3.dltv.org/uploads/teams/small/UA0TkIDfiYKdehswu3gIMyqZWkzsf1xc.png', points: 14510 },
  { rank: 2, name: 'Team Yandex', logo: 'https://s3.dltv.org/uploads/teams/n6lR8FGHdGnrXE9IDxRI0EEFs6XbyY81.png.webp', points: 10400 },
  { rank: 3, name: 'Xtreme Gaming', logo: 'https://s3.dltv.org/uploads/teams/GchHJf4tIIk1qWBGeob5QKr1D88q4rH8.png.webp', points: 9560 },
  { rank: 4, name: 'Aurora', logo: 'https://s3.dltv.org/uploads/teams/small/2fxCLHnhSIGZE2EGlg1y9HI9X1dgxkZk.png', points: 8230 },
  { rank: 5, name: 'PARIVISION', logo: 'https://s3.dltv.org/uploads/teams/eT2duK11e7GzuuCAYFdxZrSX9CNfUMso.png.webp', points: 8210 },
  { rank: 6, name: 'Team Spirit', logo: null, points: 6000 },
  { rank: 7, name: 'Team Falcons', logo: null, points: 4325 },
  { rank: 8, name: 'Team Liquid', logo: null, points: 4125 },
  { rank: 9, name: 'MOUZ', logo: null, points: 2760 },
];

function parseEptHtml(html) {
  const teams = [];
  const rowMatches = html.match(/<a[^>]+class=["'][^"']*table__body-row[^"']*["'][^>]*>[\s\S]*?<\/a>/gi) || [];

  for (const segment of rowMatches) {
    if (teams.length >= 10) break;

    const rankMatch = segment.match(/cell__num[^>]*>\s*0*(\d+)/);
    if (!rankMatch) continue;
    const rank = Number.parseInt(rankMatch[1], 10);
    if (!rank || rank < 1 || rank > 20) continue;

    const logoMatch = segment.match(/data-theme-dark="([^"]+)"/);
    const logo = logoMatch ? logoMatch[1].trim() : null;

    const nameMatch = segment.match(/cell__name[^>]*>\s*([^<\n\r]+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    if (!name) continue;

    const pointsMatch = segment.match(/cell__text[^>]*>\s*([\d\s]+)\s*pts/i);
    const points = pointsMatch ? Number.parseInt(pointsMatch[1].replace(/\s/g, ''), 10) : 0;

    teams.push({ rank, name, logo, points });
  }

  return teams.sort((left, right) => left.rank - right.rank);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch('https://dltv.org/teams', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DotaHub/1.0; +https://dotahub.cn)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`DLTV returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const teams = parseEptHtml(html);
    if (teams.length === 0) {
      throw new Error('No teams parsed from DLTV HTML');
    }

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({ teams: teams.slice(0, 10), source: 'dltv' });
  } catch (error) {
    console.error('[EPT Ranking] Scrape failed, using fallback:', error instanceof Error ? error.message : error);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).json({ teams: FALLBACK_TEAMS, source: 'fallback' });
  }
}

