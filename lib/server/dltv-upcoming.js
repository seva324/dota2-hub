const UPCOMING_MATCH_BLOCK_RE = /<div\b[^>]*class=(["'])[^"']*\bmatch\b[^"']*\bupcoming\b[^"']*\1[^>]*>/gi;
const TEAM_NAME_RE = /<div\b[^>]*class=(["'])[^"']*\bteam__title\b[^"']*\1[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/gi;
const HEAD_FORMAT_RE = /<[^>]+\bclass=(["'])[^"']*\bmatch__head-format\b[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/gi;

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

function normalizeBestOf(value) {
  const match = cleanText(value).match(/bo\s*(\d+)/i);
  return match ? `BO${match[1]}` : null;
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
    openingTag: match[0],
    html: source.slice(
      match.index,
      index + 1 < matches.length ? matches[index + 1].index : source.length
    ),
  }));
}

export function parseDltvUpcomingMatchesPage(html, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000);
  const maxStartTime = Number.isFinite(options.maxStartTime)
    ? options.maxStartTime
    : now + 7 * 24 * 60 * 60;

  const upcoming = [];

  for (const block of collectUpcomingBlocks(html)) {
    const timestamp = parseUtcDateTimeToUnixSeconds(getAttribute(block.openingTag, 'data-matches-odd'));
    if (!timestamp || timestamp < now || timestamp > maxStartTime) continue;

    const tournament = cleanText(
      block.html.match(/<[^>]+\bclass=(["'])[^"']*\bmatch__head-event\b[^"']*\1[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[2]
    );
    if (!tournament) continue;

    const formatTexts = [...block.html.matchAll(HEAD_FORMAT_RE)]
      .map((match) => cleanText(match[2]))
      .filter(Boolean);
    const bestOf = formatTexts
      .map((value) => normalizeBestOf(value))
      .find(Boolean) || 'BO3';
    const stage = formatTexts.find((value) => normalizeBestOf(value) !== bestOf) || null;

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
      stage,
      bestOf,
      timestamp,
    });
  }

  upcoming.sort((left, right) => left.timestamp - right.timestamp);
  return upcoming;
}
