const DLTV_BASE_URL = 'https://dltv.org';
export const DLTV_RANKING_URL = 'https://dltv.org/ranking';
const TEAM_ALIAS_MAP = new Map([
  ['bb', 'betboom team'],
  ['betboom', 'betboom team'],
  ['bb team', 'betboom team'],
  ['falcons', 'team falcons'],
  ['gg', 'gaimin gladiators'],
  ['gaimin', 'gaimin gladiators'],
  ['gl', 'gamerlegion'],
  ['lgd', 'psg lgd'],
  ['liquid', 'team liquid'],
  ['navi', 'natus vincere'],
  ['spirit', 'team spirit'],
  ['tl', 'team liquid'],
  ['ts', 'team spirit'],
  ['tspirit', 'team spirit'],
  ['tundra', 'tundra esports'],
  ['vg', 'vici gaming'],
  ['vici', 'vici gaming'],
  ['xg', 'xtreme gaming'],
  ['xtreme', 'xtreme gaming'],
  ['yb', 'yakult brothers'],
  ['yakult', 'yakult brothers'],
]);

const HTML_ENTITIES = {
  '&amp;': '&',
  '&apos;': "'",
  '&#39;': "'",
  '&quot;': '"',
  '&#34;': '"',
  '&lt;': '<',
  '&gt;': '>',
};

function decodeHtml(value = '') {
  return String(value).replace(/&(amp|apos|#39|quot|#34|lt|gt);/g, (token) => HTML_ENTITIES[token] || token);
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractAttr(tag, attribute) {
  const match = String(tag || '').match(new RegExp(`${attribute}=("([^"]*)"|'([^']*)')`, 'i'));
  return match?.[2] || match?.[3] || null;
}

function extractCssUrl(style = '') {
  const match = String(style || '').match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ? match[2].trim() : null;
}

function resolveDltvUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return new URL(raw, DLTV_BASE_URL).toString();
}

function normalizeKey(value) {
  const decoded = decodeHtml(String(value || '').toLowerCase())
    .replace(/[_./-]+/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!decoded) return '';
  return TEAM_ALIAS_MAP.get(decoded) || decoded;
}

function compactKey(value) {
  const compact = String(value || '')
    .replace(/\b(team|esports|gaming|club|dota|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return compact || '';
}

function deriveNameFromHref(href) {
  const resolved = resolveDltvUrl(href);
  if (!resolved) return '';

  const pathname = new URL(resolved).pathname;
  const segment = pathname.split('/').filter(Boolean).pop() || '';
  const slug = segment.replace(/^\d+-/, '').replace(/[-_]+/g, ' ').trim();
  return slug;
}

export function buildDltvLookupKeys(...values) {
  const keys = new Set();

  for (const value of values.flat()) {
    const base = normalizeKey(value);
    if (!base) continue;
    keys.add(base);

    const compact = compactKey(base);
    if (compact) keys.add(compact);

    const canonical = TEAM_ALIAS_MAP.get(base) || TEAM_ALIAS_MAP.get(compact);
    if (canonical) {
      keys.add(canonical);
      const canonicalCompact = compactKey(canonical);
      if (canonicalCompact) keys.add(canonicalCompact);
    }
  }

  return [...keys];
}

export function parseDltvRankingLogos(html) {
  const source = String(html || '');
  const rowMatches = [...source.matchAll(/<[^>]*class="[^"]*\branking__list-case__item\b[^"]*"[^>]*>/gi)];
  if (!rowMatches.length) return [];

  const rows = rowMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end = rowMatches[index + 1]?.index ?? source.length;
    return source.slice(start, end);
  });

  return rows.map((row) => {
    const logoTag = row.match(/<a\b[^>]*class="[^"]*\bitem__info-logo\b[^"]*"[^>]*>/i)?.[0] || '';
    const teamNameTag = row.match(/<a\b[^>]*class="[^"]*\bitem__info-team__name\b[^"]*"[^>]*>[\s\S]*?<div\b[^>]*class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const fallbackTeamTag = row.match(/<div\b[^>]*class="[^"]*\bitem__info-team\b[^"]*"[^>]*>[\s\S]*?<\/div>/i)?.[0]
      || row.match(/<span\b[^>]*class="[^"]*\bitem__info-team\b[^"]*"[^>]*>[\s\S]*?<\/span>/i)?.[0]
      || row.match(/<strong\b[^>]*>[\s\S]*?<\/strong>/i)?.[0]
      || '';

    const teamHref = teamNameTag?.[0] ? extractAttr(teamNameTag[0], 'href') : null;
    const href = extractAttr(logoTag, 'href')
      || teamHref
      || extractAttr(fallbackTeamTag, 'href');
    const logoUrl = resolveDltvUrl(
      extractAttr(logoTag, 'data-theme-light')
      || extractCssUrl(extractAttr(logoTag, 'style'))
      || extractAttr(logoTag, 'data-theme-dark')
    );
    const name = stripTags(teamNameTag?.[1] || '') || stripTags(fallbackTeamTag) || deriveNameFromHref(href);
    const teamUrl = resolveDltvUrl(href);

    if (!logoUrl || !name) return null;

    return {
      name,
      teamUrl,
      logoUrl,
      lookupKeys: buildDltvLookupKeys(name, deriveNameFromHref(href)),
    };
  }).filter(Boolean);
}

export function buildDltvRankingLogoIndex(html) {
  const entries = parseDltvRankingLogos(html);
  const byKey = new Map();

  for (const entry of entries) {
    for (const key of entry.lookupKeys) {
      if (!byKey.has(key)) {
        byKey.set(key, entry);
      }
    }
  }

  return { entries, byKey };
}

export function findDltvRankingLogo(index, ...candidates) {
  const byKey = index?.byKey;
  if (!(byKey instanceof Map)) return null;

  for (const key of buildDltvLookupKeys(...candidates)) {
    const match = byKey.get(key);
    if (match) return match;
  }

  return null;
}

export async function fetchDltvRankingLogoIndex(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to load DLTV ranking logos');
  }

  const response = await fetchImpl(options.url || DLTV_RANKING_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
      Accept: 'text/html,application/xhtml+xml',
      ...(options.headers || {}),
    },
    signal: options.signal,
  });

  if (!response?.ok) {
    throw new Error(`DLTV ranking request failed: HTTP ${response?.status || 'unknown'}`);
  }

  return buildDltvRankingLogoIndex(await response.text());
}
