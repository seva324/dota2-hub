const DLTV_BASE_URL = 'https://dltv.org';

const FEATURED_TOURNAMENT_DEFINITIONS = [
  {
    id: 'pgl-wallachia-s7',
    leagueId: '19435',
    names: ['PGL Wallachia Season 7'],
    sourceLabel: 'DLTV',
    sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
  },
];

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function cleanText(value) {
  return decodeHtmlEntities(stripTags(value)).replace(/\s+/g, ' ').trim();
}

function resolveUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return `${DLTV_BASE_URL}${url}`;
  return `${DLTV_BASE_URL}/${url.replace(/^\/+/, '')}`;
}

function extractSlugFromHref(href) {
  const segments = String(href || '').split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

function getEventSlug(definition) {
  return extractSlugFromHref(definition?.sourceUrl || '');
}

function parseStandings(groupSectionHtml, definition) {
  const groupColumns = String(groupSectionHtml || '').split('<div class="col-6">').slice(1);
  const standingsRows = (groupColumns[0] || '')
    .split('<div class="table__body-row">')
    .slice(1)
    .map((rowHtml) => {
      const rank = cleanText(rowHtml.match(/<div class="cell__coloured">([\s\S]*?)<\/div>/)?.[1]);
      const teamHref = rowHtml.match(/<a href="([^"]+)" class="table__body-row__cell/)?.[1] || '';
      const teamBlock = rowHtml.match(/<div class="cell__name">([\s\S]*?)<\/div>\s*<\/a>/)?.[1] || '';
      const teamParts = [...teamBlock.matchAll(/<div(?: class="cell__name-text")?>([\s\S]*?)<\/div>/g)].map((match) => cleanText(match[1]));
      const logoUrl = resolveUrl(rowHtml.match(/<div class="cell__logo"[^>]*data-theme-light="([^"]*)"/)?.[1]);
      const record = cleanText(rowHtml.match(/<div class="cell__text big">([\s\S]*?)<\/div>/)?.[1]);

      return {
        rank: Number.parseInt(rank || '0', 10) || null,
        teamName: teamParts[0] || 'TBD',
        country: teamParts[1] || null,
        record: record || null,
        logoUrl,
        teamHref: resolveUrl(teamHref),
        teamSlug: extractSlugFromHref(teamHref),
      };
    })
    .filter((row) => row.rank && row.teamName);

  const roundHeaders = [...(groupColumns[1] || '').matchAll(/<div class="table__head-item[^"]*">\s*([^<]+)\s*<\/div>/g)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  const roundRows = (groupColumns[1] || '')
    .split('<div class="table__body-row">')
    .slice(1)
    .map((rowHtml) => {
      const cells = [];
      const cellRegex = /<a href="([^"]+)" class="table__body-row__cell[^>]*>[\s\S]*?<div class="cell__logo-md"[^>]*data-theme-light="([^"]*)"[\s\S]*?<strong>\s*([^<]+)\s*<\/strong>[\s\S]*?<\/a>|<div class="table__body-row__cell[^>]*align-center">\s*<\/div>/g;
      for (const match of rowHtml.matchAll(cellRegex)) {
        if (match[1]) {
          cells.push({
            href: resolveUrl(match[1]),
            logoUrl: resolveUrl(match[2]),
            score: cleanText(match[3]) || null,
          });
        } else {
          cells.push(null);
        }
      }
      return cells;
    });

  const slugToName = new Map(standingsRows.map((row) => [row.teamSlug, row.teamName]));

  return {
    title: 'Group Stage',
    rounds: roundHeaders,
    standings: standingsRows.map((row, rowIndex) => ({
      rank: row.rank,
      teamName: row.teamName,
      country: row.country,
      record: row.record,
      logoUrl: row.logoUrl,
      teamHref: row.teamHref,
      advancement: row.rank <= 8 ? 'playoff' : 'eliminated',
      rounds: roundHeaders.map((roundLabel, roundIndex) => {
        const cell = roundRows[rowIndex]?.[roundIndex] || null;
        if (!cell) {
          return {
            roundLabel,
            pending: true,
            href: null,
            opponentName: null,
            opponentLogoUrl: null,
            score: null,
          };
        }

        const eventSlug = getEventSlug(definition);
        const matchSlug = extractSlugFromHref(cell.href).replace(new RegExp(`-${eventSlug}$`), '');
        const [leftSlug, rightSlug] = matchSlug.split('-vs-');
        const opponentSlug = leftSlug === row.teamSlug ? rightSlug : leftSlug;

        return {
          roundLabel,
          pending: false,
          href: cell.href,
          opponentName: slugToName.get(opponentSlug) || cleanText(opponentSlug).replace(/-/g, ' ') || 'TBD',
          opponentLogoUrl: cell.logoUrl,
          score: cell.score,
        };
      }),
    })),
  };
}

function parsePlayoffRounds(playoffsHtml) {
  return String(playoffsHtml || '')
    .split('<div class="playoffs__box-row__col')
    .slice(1)
    .map((columnHtml) => {
      const roundName = cleanText(columnHtml.match(/<div class="col__head">([\s\S]*?)<\/div>/)?.[1]);
      if (!roundName) return null;

      const matches = columnHtml
        .split('<div class="col__serie ')
        .slice(1)
        .map((seriesHtml) => {
          const teams = [...seriesHtml.matchAll(/<div class="col__serie-teams__item"[\s\S]*?<div class="logo"[^>]*data-theme-light="([^"]*)"[\s\S]*?<div class="name overflow-text-1">([^<]+)<\/div>[\s\S]*?<div class="score[^"]*">\s*([^<]*)\s*<\/div>/g)]
            .map((match) => ({
              name: cleanText(match[2]) || 'TBD',
              logoUrl: resolveUrl(match[1]),
              score: cleanText(match[3]) || '0',
            }));

          if (teams.length < 2) return null;

          return {
            href: resolveUrl(seriesHtml.match(/<a href="([^"]+)"/)?.[1]),
            startTime: cleanText(seriesHtml.match(/<div data-moment="MMM">([^<]+)<\/div>/)?.[1]) || null,
            teams,
          };
        })
        .filter(Boolean);

      return {
        roundName,
        matches,
      };
    })
    .filter(Boolean);
}

function parseMatchRows(matchesHtml, slugToName, definition) {
  return String(matchesHtml || '')
    .split('<a href="')
    .slice(1)
    .map((chunk) => {
      const [hrefPart, bodyHtml] = chunk.split('" class="table__body-row"', 2);
      const names = [...(bodyHtml || '').matchAll(/<div class="cell__name">([^<]+)<\/div>/g)].map((match) => cleanText(match[1]));
      const logos = [...(bodyHtml || '').matchAll(/<div class="cell__logo"[^>]*data-theme-light="([^"]*)"/g)].map((match) => resolveUrl(match[1]));
      if (names.length < 2) return null;

      const href = resolveUrl(hrefPart);
      const eventSlug = getEventSlug(definition);
      const fullHrefSlug = extractSlugFromHref(href).replace(new RegExp(`-${eventSlug}$`), '');
      const [leftSlug, rightSlug] = fullHrefSlug.split('-vs-');
      const startTime = cleanText((bodyHtml || '').match(/data-moment="HH:mm">([^<]+)<\/span>/)?.[1]) || null;
      const scoreParts = [...(bodyHtml || '').matchAll(/<span[^>]*>\s*([^<]+)\s*<\/span>/g)].map((match) => cleanText(match[1]));
      const score = startTime ? null : scoreParts.join('').replace(/\s+/g, '');

      return {
        href,
        startTime,
        score,
        teams: [
          {
            name: slugToName.get(leftSlug) || names[0] || 'TBD',
            shortName: names[0] || null,
            logoUrl: logos[0] || null,
          },
          {
            name: slugToName.get(rightSlug) || names[1] || 'TBD',
            shortName: names[1] || null,
            logoUrl: logos[1] || null,
          },
        ],
      };
    })
    .filter(Boolean);
}

function parseMatches(matchesSectionHtml, standings, definition) {
  const [upcomingHtml, finishedHtml = ''] = String(matchesSectionHtml || '').split('<div class="card__title mt-4">Finished matches</div>');
  const slugToName = new Map(
    (standings?.standings || []).map((row) => [row.teamHref ? extractSlugFromHref(row.teamHref) : row.teamName, row.teamName])
  );

  return {
    title: 'Matches & Scores',
    upcoming: parseMatchRows(upcomingHtml, slugToName, definition),
    finished: parseMatchRows(finishedHtml, slugToName, definition),
  };
}

export function parseDltvFeaturedTournamentPage(html, definition) {
  const groupSectionHtml = html.match(/<section class="group__stage">([\s\S]*?)<\/section>/)?.[1] || '';
  const playoffsSectionHtml = html.match(/<section class="playoffs">([\s\S]*?)<\/section>/)?.[1] || '';
  const matchesSectionHtml = html.match(/<section class="matches__scores">([\s\S]*?)<\/section>/)?.[1] || '';

  const groupStage = parseStandings(groupSectionHtml, definition);
  const playoffs = {
    title: 'Playoffs',
    rounds: parsePlayoffRounds(playoffsSectionHtml),
  };
  const matches = parseMatches(matchesSectionHtml, groupStage, definition);

  return {
    tournamentId: definition.id,
    title: 'Main Event',
    sourceLabel: definition.sourceLabel,
    sourceUrl: definition.sourceUrl,
    fetchedAt: new Date().toISOString(),
    groupStage,
    playoffs,
    matches,
  };
}

export function resolveFeaturedTournamentDefinition(tournamentId) {
  const normalized = String(tournamentId || '').trim().toLowerCase();
  if (!normalized) return null;

  return FEATURED_TOURNAMENT_DEFINITIONS.find((definition) => {
    if (definition.id.toLowerCase() === normalized) return true;
    if (String(definition.leagueId || '').toLowerCase() === normalized) return true;
    return definition.names.some((name) => name.toLowerCase() === normalized);
  }) || null;
}

export async function fetchFeaturedTournamentPayload(tournamentId) {
  const definition = resolveFeaturedTournamentDefinition(tournamentId);
  if (!definition) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(definition.sourceUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; dota2-hub/1.0; +https://github.com/seva324/dota2-hub)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`featured_tournament_http_${response.status}`);
    }

    const html = await response.text();
    return parseDltvFeaturedTournamentPage(html, definition);
  } finally {
    clearTimeout(timeout);
  }
}
