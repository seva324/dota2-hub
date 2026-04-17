const UPCOMING_MATCH_BLOCK_RE = /<div\b[^>]*class=(["'])[^"']*\bmatch\b[^"']*\bupcoming\b[^"']*\1[^>]*>/gi;
const TEAM_NAME_RE = /<div\b[^>]*class=(["'])[^"']*\bteam__title\b[^"']*\1[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/gi;
const HEAD_FORMAT_RE = /<[^>]+\bclass=(["'])[^"']*\bmatch__head-format\b[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/gi;
const JINA_EVENT_LINK_RE = /^\[\]\((https?:\/\/dltv\.org\/events\/[^)]+)\)$/i;
const JINA_MATCH_LINK_RE = /^\[\]\((https?:\/\/dltv\.org\/matches\/(\d+)\/[^)#]+)\)$/i;
const JINA_SKIP_LINE_RE = /^(starts in:?|live in:?|stats|lineups|vs)\b/i;
const MONTH_INDEX = new Map([
  ['jan', 0],
  ['feb', 1],
  ['mar', 2],
  ['apr', 3],
  ['may', 4],
  ['jun', 5],
  ['jul', 6],
  ['aug', 7],
  ['sep', 8],
  ['oct', 9],
  ['nov', 10],
  ['dec', 11],
]);

export const DLTV_MATCHES_URL = 'https://dltv.org/matches';

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

function normalizeName(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`${name}=(["'])(.*?)\\1`, 'i'));
  return match?.[2] || null;
}

function normalizeUrl(url) {
  if (!url) return null;
  try {
    return new URL(url).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function extractEventUrl(html) {
  const match = String(html || '').match(/<a\b[^>]*href=(["'])(https?:\/\/dltv\.org\/events\/[^"']+)\1/i);
  return normalizeUrl(match?.[2] || null);
}

function extractLastEventUrl(html) {
  const matches = [...String(html || '').matchAll(/<a\b[^>]*href=(["'])(https?:\/\/dltv\.org\/events\/[^"']+)\1/gi)];
  return normalizeUrl(matches[matches.length - 1]?.[2] || null);
}

function normalizeBestOf(value) {
  const match = cleanText(value).match(/bo\s*(\d+)/i);
  return match ? `BO${match[1]}` : null;
}

function cleanMarkdownLine(value) {
  return String(value || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

export function parseUtcDateTimeToUnixSeconds(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const timestamp = Date.parse(normalized.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor(timestamp / 1000);
}

function collectUpcomingBlocks(html) {
  const source = String(html || '');
  const matches = [...source.matchAll(UPCOMING_MATCH_BLOCK_RE)];
  return matches.map((match, index) => ({
    startIndex: Number(match.index) || 0,
    openingTag: match[0],
    html: source.slice(
      match.index,
      index + 1 < matches.length ? matches[index + 1].index : source.length
    ),
  }));
}

function extractFormatTexts(html) {
  return [...String(html || '').matchAll(HEAD_FORMAT_RE)]
    .map((match) => cleanText(match[2]))
    .filter(Boolean);
}

function extractHeadTournament(html) {
  return cleanText(
    String(html || '').match(/<[^>]+\bclass=(["'])[^"']*\bmatch__head-event\b[^"']*\1[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[2]
  );
}

function extractContextFallback(source, startIndex) {
  const context = String(source || '').slice(Math.max(0, Number(startIndex || 0) - 4000), Math.max(0, Number(startIndex || 0)));
  return {
    tournament: extractHeadTournament(context),
    eventUrl: extractLastEventUrl(context),
    formatTexts: extractFormatTexts(context),
  };
}

function nextNonEmptyLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (cleanMarkdownLine(lines[index])) return index;
  }
  return -1;
}

function parseMarkdownTimestamp(value, now) {
  const match = String(value || '').match(/\b([A-Z][a-z]{2})\s+(\d{1,2})\s*\*{0,2}(\d{2}:\d{2})\*{0,2}\b/);
  if (!match) return null;

  const monthIndex = MONTH_INDEX.get(match[1].toLowerCase());
  if (monthIndex === undefined) return null;

  const [hours, minutes] = match[3].split(':').map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const baseNow = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  const currentYear = new Date(baseNow * 1000).getUTCFullYear();

  let timestamp = Math.floor(Date.UTC(currentYear, monthIndex, Number(match[2]), hours, minutes) / 1000);
  if (timestamp < baseNow - 14 * 24 * 60 * 60) {
    timestamp = Math.floor(Date.UTC(currentYear + 1, monthIndex, Number(match[2]), hours, minutes) / 1000);
  } else if (timestamp > baseNow + 330 * 24 * 60 * 60) {
    timestamp = Math.floor(Date.UTC(currentYear - 1, monthIndex, Number(match[2]), hours, minutes) / 1000);
  }

  return timestamp;
}

export function parseDltvUpcomingMatchesMarkdown(markdown, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000);
  const maxStartTime = Number.isFinite(options.maxStartTime)
    ? options.maxStartTime
    : now + 7 * 24 * 60 * 60;
  const lines = String(markdown || '').split(/\r?\n/);
  const upcoming = [];

  for (let index = 0; index < lines.length; index += 1) {
    const eventMatch = cleanMarkdownLine(lines[index]).match(JINA_EVENT_LINK_RE);
    if (!eventMatch) continue;

    let cursor = nextNonEmptyLine(lines, index + 1);
    if (cursor < 0) continue;
    const tournament = cleanMarkdownLine(lines[cursor]);
    if (!tournament) continue;

    cursor = nextNonEmptyLine(lines, cursor + 1);
    if (cursor < 0) continue;
    const stage = cleanMarkdownLine(lines[cursor]);

    cursor = nextNonEmptyLine(lines, cursor + 1);
    if (cursor < 0) continue;
    const bestOf = normalizeBestOf(lines[cursor]);
    if (!bestOf) continue;

    cursor = nextNonEmptyLine(lines, cursor + 1);
    if (cursor < 0) continue;
    const matchLink = cleanMarkdownLine(lines[cursor]).match(JINA_MATCH_LINK_RE);
    if (!matchLink) continue;

    cursor = nextNonEmptyLine(lines, cursor + 1);
    if (cursor < 0) continue;
    const radiantName = cleanMarkdownLine(lines[cursor]);

    cursor = nextNonEmptyLine(lines, cursor + 1);
    if (cursor < 0) continue;
    const timestamp = parseMarkdownTimestamp(lines[cursor], now);
    if (!timestamp || timestamp < now || timestamp > maxStartTime) continue;

    cursor = nextNonEmptyLine(lines, cursor + 1);
    while (cursor >= 0 && cursor < lines.length && JINA_SKIP_LINE_RE.test(cleanMarkdownLine(lines[cursor]))) {
      cursor = nextNonEmptyLine(lines, cursor + 1);
    }
    if (cursor < 0) continue;
    const direName = cleanMarkdownLine(lines[cursor]);
    if (!radiantName || !direName || normalizeName(radiantName) === normalizeName(direName)) continue;

    upcoming.push({
      seriesId: matchLink[2],
      radiantName,
      direName,
      tournament,
      eventUrl: normalizeUrl(eventMatch[1]),
      stage: stage || null,
      bestOf,
      timestamp,
    });
  }

  upcoming.sort((left, right) => left.timestamp - right.timestamp);
  return upcoming;
}

export function parseDltvUpcomingMatchesPage(html, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000);
  const maxStartTime = Number.isFinite(options.maxStartTime)
    ? options.maxStartTime
    : now + 7 * 24 * 60 * 60;
  const source = String(html || '');

  if (source.includes('Markdown Content:') || (!source.includes('<div') && source.includes('https://dltv.org/matches/'))) {
    return parseDltvUpcomingMatchesMarkdown(source, { now, maxStartTime });
  }

  const upcoming = [];

  for (const block of collectUpcomingBlocks(source)) {
    const timestamp = parseUtcDateTimeToUnixSeconds(getAttribute(block.openingTag, 'data-matches-odd'));
    if (!timestamp || timestamp < now || timestamp > maxStartTime) continue;

    const contextFallback = extractContextFallback(source, block.startIndex);
    const tournament = extractHeadTournament(block.html) || contextFallback.tournament;
    if (!tournament) continue;

    const formatTexts = extractFormatTexts(block.html);
    const effectiveFormatTexts = formatTexts.length > 0 ? formatTexts : contextFallback.formatTexts;
    const bestOf = effectiveFormatTexts
      .map((value) => normalizeBestOf(value))
      .find(Boolean) || 'BO3';
    const stage = effectiveFormatTexts.find((value) => normalizeBestOf(value) !== bestOf) || null;

    const teamNames = [...block.html.matchAll(TEAM_NAME_RE)]
      .map((match) => cleanText(match[2]))
      .filter(Boolean)
      .slice(0, 2);
    if (teamNames.length < 2) continue;

    const [radiantName, direName] = teamNames;
    if (normalizeName(radiantName) === normalizeName(direName)) continue;

    upcoming.push({
      seriesId: getAttribute(block.openingTag, 'data-series-id'),
      radiantName,
      direName,
      tournament,
      eventUrl: extractEventUrl(block.html) || contextFallback.eventUrl,
      stage,
      bestOf,
      timestamp,
    });
  }

  upcoming.sort((left, right) => left.timestamp - right.timestamp);
  return upcoming;
}
