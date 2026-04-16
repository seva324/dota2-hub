const EVENT_LINK_RE = /https?:\/\/dltv\.org\/events\/[^\s)"'<]+/gi;
const ROMAN_NUMERAL_MAP = new Map([
  ['i', '1'],
  ['ii', '2'],
  ['iii', '3'],
  ['iv', '4'],
  ['v', '5'],
  ['vi', '6'],
  ['vii', '7'],
  ['viii', '8'],
  ['ix', '9'],
  ['x', '10'],
  ['xi', '11'],
  ['xii', '12'],
]);
const REGION_ALIAS_MAP = new Map([
  ['sea', 'southeastasia'],
  ['southeast', 'southeastasia'],
  ['southeastasia', 'southeastasia'],
  ['eu', 'europe'],
  ['europe', 'europe'],
  ['na', 'northamerica'],
  ['northamerica', 'northamerica'],
  ['sa', 'southamerica'],
  ['southamerica', 'southamerica'],
  ['cn', 'china'],
  ['china', 'china'],
]);
const TOURNAMENT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'dota',
  'event',
  'events',
  'for',
  'main',
  'of',
  'season',
  'series',
  'stage',
  'stages',
  'the',
  'tournament',
  'tour',
]);
const QUALIFIER_STOPWORDS = new Set([
  'closed',
  'open',
  'qualifier',
  'qualifiers',
]);
const COUNTRY_CODE_MAP = {
  argentina: 'AR',
  belarus: 'BY',
  bolivia: 'BO',
  brazil: 'BR',
  canada: 'CA',
  chile: 'CL',
  china: 'CN',
  czech: 'CZ',
  czechia: 'CZ',
  denmark: 'DK',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  indonesia: 'ID',
  jordan: 'JO',
  kazakhstan: 'KZ',
  malaysia: 'MY',
  mongolia: 'MN',
  norway: 'NO',
  peru: 'PE',
  philippines: 'PH',
  poland: 'PL',
  romania: 'RO',
  russia: 'RU',
  serbia: 'RS',
  sweden: 'SE',
  thailand: 'TH',
  ukraine: 'UA',
  'united states': 'US',
  usa: 'US',
  vietnam: 'VN',
};
const LABEL_BOUNDARIES = [
  'DATES',
  'COUNTRY',
  'LOCATION',
  'EVENT TIER',
  'TIER',
  'EVENT TYPE',
  'TYPE',
  'PARTICIPANTS',
  'PRIZE POOL',
  'PRIZE',
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

function normalizeUrl(url) {
  if (!url) return null;
  try {
    return new URL(String(url).trim()).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function buildJinaUrl(url) {
  return `https://r.jina.ai/http://${String(url).replace(/^https?:\/\//i, '')}`;
}

function buildTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

async function fetchText(url, fetchImpl = fetch) {
  const attempts = [
    { url: normalizeUrl(url), type: 'direct' },
    { url: buildJinaUrl(url), type: 'jina' },
  ].filter((attempt) => attempt.url);

  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.type === 'direct' ? 12000 : 15000);
    try {
      const res = await fetchImpl(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
        signal: timeout.signal,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (String(text || '').trim().length >= 80) {
        return { raw: text, sourceType: attempt.type, sourceUrl: attempt.url };
      }
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }

  return { raw: '', sourceType: 'failed', sourceUrl: normalizeUrl(url) };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMetaContent(raw, prop) {
  const escaped = escapeRegExp(prop);
  const match = String(raw || '').match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  );
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

function parseEventTitle(raw) {
  const candidates = [
    extractMetaContent(raw, 'og:title'),
    extractMetaContent(raw, 'twitter:title'),
    String(raw || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null,
    String(raw || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || null,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  const title = candidates[0] || null;
  if (!title) return null;
  return title
    .replace(/\s+overview\s*\|\s*dltv$/i, '')
    .replace(/\s*\|\s*dltv$/i, '')
    .trim();
}

function extractEventLinks(raw) {
  const hrefLinks = [...String(raw || '').matchAll(/href=(["'])(https?:\/\/dltv\.org\/events\/[^"']+)\1/gi)].map((match) => match[2]);
  const inlineLinks = [...String(raw || '').matchAll(EVENT_LINK_RE)].map((match) => match[0]);
  return Array.from(new Set([...hrefLinks, ...inlineLinks].map((link) => normalizeUrl(link)).filter(Boolean)));
}

export function parseDltvEventUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    return {
      sourceUrl: null,
      eventSlug: null,
      parentSlug: null,
      eventGroupSlug: null,
      pathSegments: [],
    };
  }

  try {
    const { pathname } = new URL(normalized);
    const parts = pathname.split('/').filter(Boolean);
    const eventIndex = parts.indexOf('events');
    const pathSegments = eventIndex >= 0 ? parts.slice(eventIndex + 1) : [];
    const eventSlug = pathSegments[pathSegments.length - 1] || null;
    const parentSlug = pathSegments.length > 1 ? pathSegments[0] : eventSlug;
    return {
      sourceUrl: normalized,
      eventSlug,
      parentSlug,
      eventGroupSlug: parentSlug || eventSlug || null,
      pathSegments,
    };
  } catch {
    return {
      sourceUrl: normalized,
      eventSlug: null,
      parentSlug: null,
      eventGroupSlug: null,
      pathSegments: [],
    };
  }
}

function normalizeTournamentToken(token) {
  const compact = String(token || '').trim().toLowerCase();
  if (!compact) return null;
  if (ROMAN_NUMERAL_MAP.has(compact)) return ROMAN_NUMERAL_MAP.get(compact);
  if (REGION_ALIAS_MAP.has(compact)) return REGION_ALIAS_MAP.get(compact);
  return compact;
}

export function tokenizeTournamentName(value, options = {}) {
  const stripQualifierWords = options.stripQualifierWords === true;
  return Array.from(new Set(
    cleanText(value)
      .toLowerCase()
      .replace(/[()[\],.:/\\_-]+/g, ' ')
      .split(/\s+/)
      .map((token) => normalizeTournamentToken(token))
      .filter((token) => token && token.length >= 2 && !TOURNAMENT_STOPWORDS.has(token))
      .filter((token) => !stripQualifierWords || !QUALIFIER_STOPWORDS.has(token))
  ));
}

function countOverlap(left, right) {
  const rightSet = new Set(right);
  return left.reduce((total, token) => total + (rightSet.has(token) ? 1 : 0), 0);
}

export function scoreTournamentNameMatch(eventName, candidateName) {
  const eventTokens = tokenizeTournamentName(eventName);
  const candidateTokens = tokenizeTournamentName(candidateName);
  const groupEventTokens = tokenizeTournamentName(eventName, { stripQualifierWords: true });
  const groupCandidateTokens = tokenizeTournamentName(candidateName, { stripQualifierWords: true });
  const detailOverlap = countOverlap(eventTokens, candidateTokens);
  const groupOverlap = countOverlap(groupEventTokens, groupCandidateTokens);
  const eventHasQualifier = eventTokens.some((token) => QUALIFIER_STOPWORDS.has(token));
  const candidateHasQualifier = candidateTokens.some((token) => QUALIFIER_STOPWORDS.has(token));
  let score = detailOverlap * 4 + groupOverlap * 2;

  if (eventHasQualifier === candidateHasQualifier) score += 1;
  if (cleanText(eventName).toLowerCase() === cleanText(candidateName).toLowerCase()) score += 6;

  return {
    score,
    detailOverlap,
    groupOverlap,
    eventHasQualifier,
    candidateHasQualifier,
  };
}

function extractLabelValue(text, label) {
  const escapedLabel = escapeRegExp(label);
  const boundaryPattern = LABEL_BOUNDARIES
    .filter((item) => item !== label)
    .map((item) => escapeRegExp(item))
    .join('|');
  const match = String(text || '').match(
    new RegExp(`${escapedLabel}\\s+([\\s\\S]*?)(?=\\s+(?:${boundaryPattern})\\b|$)`, 'i')
  );
  return match ? cleanText(match[1]) : null;
}

function parseStatus(text) {
  const direct = String(text || '').match(/\b(UPCOMING|FINISHED|LIVE|ONGOING)\b(?=\s+DATES\b)/i);
  const normalized = (direct?.[1] || '').toLowerCase();
  if (normalized === 'finished') return 'finished';
  if (normalized === 'live' || normalized === 'ongoing') return 'ongoing';
  if (normalized === 'upcoming') return 'upcoming';
  return null;
}

function parseTier(value) {
  const text = cleanText(value).toUpperCase();
  const match = text.match(/\b([SABCD])(?:-|\s)?(QUAL)?\s*TIER\b/);
  if (!match) return text || null;
  return match[2] ? `${match[1]}-QUAL` : match[1];
}

function normalizePrizePool(value) {
  const text = cleanText(value);
  if (!text) return null;
  const currencyMatch = text.match(/[$€£¥]\s*[\d,]+(?:\.\d+)?(?:\s*(?:USD|EUR|GBP|CNY|million|m|k))?/i);
  if (currencyMatch) return currencyMatch[0].replace(/\s+/g, ' ').trim();
  return null;
}

function parsePrizePoolUsd(value) {
  const text = String(value || '').trim();
  const match = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function normalizeMonth(value) {
  return String(value || '').replace(/\./g, '').trim();
}

function parseDisplayDate(value, fallbackYear = null, endOfDay = false) {
  const normalized = normalizeMonth(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const inferred = /\b\d{4}\b/.test(normalized)
    ? normalized
    : fallbackYear
      ? `${normalized}, ${fallbackYear}`
      : normalized;
  const parsed = Date.parse(`${inferred} UTC`);
  if (!Number.isFinite(parsed)) return null;
  const base = Math.floor(parsed / 1000);
  return endOfDay ? base + (24 * 60 * 60) - 1 : base;
}

function parseDateRangeFromDescription(description) {
  const match = String(description || '').match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:,\s+a\b|,\s+an\b|$)/i);
  if (!match) return null;
  const endYear = match[2].match(/\b(19|20)\d{2}\b/)?.[0] || null;
  const start = parseDisplayDate(match[1], endYear, false);
  const end = parseDisplayDate(match[2], endYear, true);
  return start || end ? { startTime: start, endTime: end } : null;
}

function parseDateRangeFromLabel(value) {
  const text = cleanText(value);
  if (!text) return null;
  const parts = text.split(/\s+-\s+/);
  if (parts.length !== 2) return null;
  const endYear = parts[1].match(/\b(19|20)\d{2}\b/)?.[0] || null;
  const start = parseDisplayDate(parts[0], endYear, false);
  const end = parseDisplayDate(parts[1], endYear, true);
  return start || end ? { startTime: start, endTime: end } : null;
}

function mapCountryCode(rawCountry) {
  if (!rawCountry) return null;
  const normalized = cleanText(rawCountry).toLowerCase();
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  return COUNTRY_CODE_MAP[normalized] || null;
}

function toFlagImageUrl(code, width = 40) {
  if (!code) return null;
  return `https://flagcdn.com/w${Math.max(16, Math.trunc(width))}/${String(code).toLowerCase()}.png`;
}

function parseImageUrl(raw) {
  const ogImage = normalizeUrl(extractMetaContent(raw, 'og:image') || extractMetaContent(raw, 'twitter:image'));
  if (!ogImage) return null;
  return ogImage.includes('/images/opengraph.png') ? null : ogImage;
}

export function parseDltvEventPage(raw, sourceUrl) {
  const normalizedSourceUrl = normalizeUrl(sourceUrl);
  const sourceInfo = parseDltvEventUrl(normalizedSourceUrl);
  const description = extractMetaContent(raw, 'description')
    || extractMetaContent(raw, 'og:description')
    || extractMetaContent(raw, 'twitter:description')
    || '';
  const text = cleanText(raw);
  const labeledDateRange = parseDateRangeFromLabel(extractLabelValue(text, 'DATES'));
  const describedDateRange = parseDateRangeFromDescription(description);
  const dateRange = describedDateRange || labeledDateRange || { startTime: null, endTime: null };
  const location = extractLabelValue(text, 'COUNTRY') || extractLabelValue(text, 'LOCATION');
  const relatedEventLinks = extractEventLinks(raw).filter((link) => link !== normalizedSourceUrl);
  const parentSourceUrl = relatedEventLinks.find((link) => {
    const info = parseDltvEventUrl(link);
    return Boolean(sourceInfo.parentSlug && info.eventSlug === sourceInfo.parentSlug);
  }) || (sourceInfo.parentSlug && sourceInfo.parentSlug !== sourceInfo.eventSlug
    ? normalizeUrl(`https://dltv.org/events/${sourceInfo.parentSlug}`)
    : normalizedSourceUrl);
  const countryCode = mapCountryCode(location);
  const prizePool = normalizePrizePool(
    extractLabelValue(text, 'PRIZE POOL')
    || description.match(/\$[\d,]+(?:\.\d+)?/)?.[0]
    || null
  );

  return {
    sourceUrl: normalizedSourceUrl,
    title: parseEventTitle(raw),
    status: parseStatus(text),
    tier: parseTier(extractLabelValue(text, 'EVENT TIER') || extractLabelValue(text, 'TIER')),
    location: location || null,
    locationFlagUrl: toFlagImageUrl(countryCode),
    startTime: dateRange.startTime || null,
    endTime: dateRange.endTime || null,
    prizePool,
    prizePoolUsd: parsePrizePoolUsd(prizePool),
    image: parseImageUrl(raw),
    eventSlug: sourceInfo.eventSlug,
    parentSlug: sourceInfo.parentSlug,
    eventGroupSlug: sourceInfo.eventGroupSlug,
    parentSourceUrl,
    relatedEventLinks,
  };
}

export async function fetchDltvEventMetadata(url, fetchImpl = fetch) {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return null;
  const { raw } = await fetchText(normalizedUrl, fetchImpl);
  if (!raw) return null;
  return parseDltvEventPage(raw, normalizedUrl);
}
