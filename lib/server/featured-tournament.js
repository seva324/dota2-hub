const DLTV_BASE_URL = 'https://dltv.org';

const FEATURED_TOURNAMENT_DEFINITIONS = [
  {
    id: 'pgl-wallachia-s7',
    leagueId: '19435',
    names: ['PGL Wallachia Season 7'],
    sourceLabel: 'DLTV',
    sourceUrl: 'https://dltv.org/events/pgl-wallachia-season-7',
    format: 'swiss',
  },
  {
    id: 'esl-one-birmingham-2026',
    leagueId: '19669',
    names: ['ESL One Birmingham 2026', 'ESL One Season Birmingham'],
    sourceLabel: 'DLTV',
    sourceUrl: 'https://dltv.org/events/esl-one-birmingham-2026',
    format: 'round-robin',
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

function getCellLogoUrl(cellHtml) {
  return resolveUrl(
    cellHtml.match(/data-theme-light="([^"]*)"/)?.[1]
      || cellHtml.match(/background-image:\s*url\('([^']+)'\)/)?.[1]
      || cellHtml.match(/background-image:\s*url\("([^"]+)"\)/)?.[1]
      || cellHtml.match(/background-image:\s*url\(([^)]+)\)/)?.[1]?.replace(/^['"]|['"]$/g, '')
  );
}

function parseSwissStandings(groupSectionHtml, definition) {
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
    format: 'swiss',
    rounds: roundHeaders,
    groups: [],
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

function parseRoundRobinGroups(groupSectionHtml) {
  const markers = [...String(groupSectionHtml || '').matchAll(/<div class="table__head-item width-80 width-m-70 big-text">([\s\S]*?)<\/div>/g)];
  const groups = markers
    .map((marker, index) => {
      const title = cleanText(marker[1]);
      const start = marker.index || 0;
      const end = index + 1 < markers.length ? (markers[index + 1].index || String(groupSectionHtml).length) : String(groupSectionHtml).length;
      const columnHtml = String(groupSectionHtml).slice(start, end);

      const rows = columnHtml
        .split('<a href="')
        .slice(1)
        .map((chunk) => {
          const [hrefPart, bodyHtml] = chunk.split('" class="table__body-row"', 2);
          const rank = cleanText((bodyHtml || '').match(/<div class="cell__coloured"[^>]*>\s*([\s\S]*?)\s*<\/div>/)?.[1]);
          const teamParts = [...((bodyHtml || '').matchAll(/<div class="cell__name(?:-text)?">?([\s\S]*?)<\/div>/g))].map((match) => cleanText(match[1])).filter(Boolean);
          const nameMatches = [...(bodyHtml || '').matchAll(/<div class="cell__name">\s*<div>([^<]+)<\/div>\s*<div class="cell__name-text">([^<]+)<\/div>\s*<\/div>/g)][0];
          const teamName = cleanText(nameMatches?.[1]) || teamParts[0] || 'TBD';
          const country = cleanText(nameMatches?.[2]) || teamParts[1] || null;
          const seriesRecord = cleanText((bodyHtml || '').match(/<strong>([^<]+)<\/strong>/)?.[1]);
          const cellTexts = [...(bodyHtml || '').matchAll(/<div class="cell__text">\s*([\s\S]*?)\s*<\/div>/g)].map((match) => cleanText(match[1]));
          const mapsRecord = cellTexts[cellTexts.length - 1] || null;
          const teamHref = resolveUrl(hrefPart);

          return {
            rank: Number.parseInt(rank || '0', 10) || null,
            teamName,
            country,
            record: seriesRecord || null,
            mapRecord: mapsRecord,
            logoUrl: resolveUrl((bodyHtml || '').match(/<div class="cell__logo"[^>]*data-theme-light="([^"]*)"/)?.[1]),
            teamHref,
            advancement: null,
            rounds: [],
          };
        })
        .filter((row) => row.rank && row.teamName);

      for (const row of rows) {
        if (row.rank <= 2) row.advancement = 'upper';
        else if (row.rank <= 4) row.advancement = 'lower';
        else row.advancement = 'eliminated';
      }

      return {
        name: title,
        standings: rows,
      };
    })
    .filter(Boolean);

  return {
    title: 'Group Stage',
    format: 'round-robin',
    rounds: [],
    groups,
    standings: groups.flatMap((group) => group.standings),
  };
}

function parseStandings(groupSectionHtml, definition) {
  if (definition?.format === 'round-robin') {
    return parseRoundRobinGroups(groupSectionHtml);
  }
  return parseSwissStandings(groupSectionHtml, definition);
}

function parsePlayoffRounds(playoffsHtml) {
  return String(playoffsHtml || '')
    .split('<div class="playoffs__box-row__col')
    .slice(1)
    .map((columnHtml, columnIndex) => {
      const roundName = cleanText(columnHtml.match(/<div class="col__head">([\s\S]*?)<\/div>/)?.[1]);
      if (!roundName) return null;

      const matches = columnHtml
        .split('<div class="col__serie ')
        .slice(1)
        .map((seriesHtml, matchIndex) => {
          const teams = [...seriesHtml.matchAll(/<div class="col__serie-teams__item">([\s\S]*?)(?=<div class="col__serie-teams__delimiter">|<div class="col__serie-teams__item">|<\/div>\s*<\/div>\s*<\/a>|<\/div>\s*<\/div>\s*<\/div>)/g)]
            .map((match) => ({
              name: cleanText(match[1].match(/<div class="name [^"]*">([^<]+)<\/div>/)?.[1]) || 'TBD',
              logoUrl: getCellLogoUrl(match[1]),
              score: cleanText(match[1].match(/<div class="score[^>]*">\s*([^<]*)\s*/)?.[1]) || '-',
            }))
            .filter(Boolean);

          if (teams.length < 2) return null;

          const href = resolveUrl(seriesHtml.match(/<a href="([^"]+)"/)?.[1]);
          const explicitMoment = cleanText(seriesHtml.match(/data-moment="MMM">([^<]+)<\/div>/)?.[1]);
          const dateBlock = seriesHtml.match(/<div class="col__serie-date">([\s\S]*?)<\/div>\s*<div class="col__serie-teams">/)?.[1] || '';
          const dateItems = [...dateBlock.matchAll(/<div[^>]*>\s*([^<]*)\s*<\/div>/g)]
            .map((item) => cleanText(item[1]))
            .filter(Boolean);
          const startTime = explicitMoment || (dateItems.length >= 2 ? `${dateItems[0]} ${dateItems[1]}`.trim() : (dateItems[0] || null));
          const bracketLane = /Grand Final/i.test(roundName)
            ? 'grand'
            : /Upper Bracket/i.test(roundName)
              ? 'upper'
              : /Lower Bracket/i.test(roundName)
                ? 'lower'
                : 'other';

          return {
            href,
            startTime,
            teams,
            bracketLane,
            roundIndex: columnIndex,
            slotIndex: matchIndex,
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
  const groupStart = html.indexOf('<section class="group__stage">');
  const playoffsStart = html.indexOf('<section class="playoffs">');
  const matchesStart = html.indexOf('<section class="matches__scores">');

  const groupSectionHtml = groupStart >= 0
    ? html.slice(groupStart, playoffsStart >= 0 ? playoffsStart : html.length)
    : '';
  const playoffsSectionHtml = playoffsStart >= 0
    ? html.slice(playoffsStart, matchesStart >= 0 ? matchesStart : html.length)
    : '';
  const matchesSectionHtml = matchesStart >= 0
    ? html.slice(matchesStart)
    : '';

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
