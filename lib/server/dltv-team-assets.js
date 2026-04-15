const DLTV_BASE_URL = 'https://dltv.org';
export const DLTV_TEAM_STATS_URL = 'https://dltv.org/stats/teams';
export const DLTV_RANKING_URL = DLTV_TEAM_STATS_URL;
export const DLTV_STATS_API_URL = 'https://vn.dltv.org/api/v1/stats/teams';
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

function getDltvLogoFingerprint(value) {
  const resolved = resolveDltvUrl(value);
  if (!resolved) return null;
  try {
    const parsed = new URL(resolved);
    if (!/(?:^|\.)dltv\.org$/i.test(parsed.hostname)) return null;
    return `${parsed.hostname}${parsed.pathname.replace(/\/uploads\/teams\/(?:small|medium)\//i, '/uploads/teams/')}`;
  } catch {
    return null;
  }
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

function buildDltvEntry({ name, teamUrl, logoUrl, candidates = [] }) {
  const normalizedName = stripTags(name) || deriveNameFromHref(teamUrl);
  const normalizedTeamUrl = resolveDltvUrl(teamUrl);
  const normalizedLogoUrl = resolveDltvUrl(logoUrl);
  if (!normalizedName || !normalizedLogoUrl) return null;

  return {
    name: normalizedName,
    teamUrl: normalizedTeamUrl,
    logoUrl: normalizedLogoUrl,
    logoFingerprint: getDltvLogoFingerprint(normalizedLogoUrl),
    lookupKeys: buildDltvLookupKeys(
      normalizedName,
      normalizedTeamUrl ? deriveNameFromHref(normalizedTeamUrl) : '',
      candidates,
    ),
  };
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
  const rankingRowMatches = [...source.matchAll(/<[^>]*class="[^"]*\branking__list-case__item\b[^"]*"[^>]*>/gi)];
  const rankingRows = rankingRowMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end = rankingRowMatches[index + 1]?.index ?? source.length;
    return source.slice(start, end);
  });

  const statsRowMatches = [...source.matchAll(/<div\b[^>]*class="[^"]*\btable__body-row\b[^"]*"[^>]*>/gi)];
  const statsRows = statsRowMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end = statsRowMatches[index + 1]?.index ?? source.length;
    return source.slice(start, end);
  });

  const rankingEntries = rankingRows.map((row) => {
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

    return buildDltvEntry({
      name,
      teamUrl,
      logoUrl,
      candidates: [deriveNameFromHref(href)],
    });
  }).filter(Boolean);

  const statsEntries = statsRows.map((row) => {
    const teamTag = row.match(/<a\b[^>]*class="[^"]*\btable__body-row__cell\b[^"]*"[^>]*>[\s\S]*?<\/a>/i)?.[0] || '';
    const logoTag = row.match(/<div\b[^>]*class="[^"]*\bcell__logo\b[^"]*"[^>]*>/i)?.[0] || '';
    const nameTag = row.match(/<div\b[^>]*class="[^"]*\bcell__name\b[^"]*"[^>]*>\s*<div>([\s\S]*?)<\/div>/i);
    const href = extractAttr(teamTag, 'href');
    const logoUrl = resolveDltvUrl(
      extractAttr(logoTag, 'data-theme-light')
      || extractAttr(logoTag, 'data-src')
      || extractCssUrl(extractAttr(logoTag, 'style'))
    );
    const name = stripTags(nameTag?.[1] || '') || deriveNameFromHref(href);
    const teamUrl = resolveDltvUrl(href);

    return buildDltvEntry({
      name,
      teamUrl,
      logoUrl,
      candidates: [deriveNameFromHref(href)],
    });
  }).filter(Boolean);

  return rankingEntries.length ? rankingEntries : statsEntries;
}

export function buildDltvTeamSlugCandidates(...values) {
  const slugs = new Set();

  for (const value of values.flat()) {
    const base = normalizeKey(value);
    if (!base) continue;
    slugs.add(base.replace(/\s+/g, '-'));

    const compact = compactKey(base);
    if (compact) slugs.add(compact.replace(/\s+/g, '-'));
  }

  return [...slugs];
}

function parseDltvStatsTeamsPayload(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => buildDltvEntry({
    name: row?.title,
    teamUrl: row?.slug ? `${DLTV_BASE_URL}/teams/${row.slug}` : null,
    logoUrl: row?.image,
    candidates: [row?.slug, ...(Array.isArray(row?.liquipedia_titles) ? row.liquipedia_titles : [])],
  })).filter(Boolean);
}

function parseDltvTeamPageEntry(html, teamUrl) {
  const source = String(html || '');
  const logoUrl = source.match(/data-theme-light=(["'])([^"']*uploads\/teams[^"']*)\1/i)?.[2]
    || source.match(/<meta[^>]+property=(["'])og:image\1[^>]+content=(["'])([^"']+)\2/i)?.[3]
    || null;
  const title = decodeHtml(
    source.match(/<meta[^>]+property=(["'])og:title\1[^>]+content=(["'])([^"']+)\2/i)?.[3]
      || source.match(/<title>([^<]+)<\/title>/i)?.[1]
      || deriveNameFromHref(teamUrl),
  )
    .replace(/\s+[|—-]\s+.*$/, '')
    .trim();

  return buildDltvEntry({
    name: title,
    teamUrl,
    logoUrl,
    candidates: [deriveNameFromHref(teamUrl)],
  });
}

export function buildDltvRankingLogoIndex(input) {
  const entries = Array.isArray(input) ? input : parseDltvRankingLogos(input);
  const byKey = new Map();
  const byLogoFingerprint = new Map();

  for (const entry of entries) {
    for (const key of entry.lookupKeys) {
      if (!byKey.has(key)) {
        byKey.set(key, entry);
      }
    }
    if (entry.logoFingerprint) {
      const bucket = byLogoFingerprint.get(entry.logoFingerprint) || [];
      bucket.push(entry);
      byLogoFingerprint.set(entry.logoFingerprint, bucket);
    }
  }

  return { entries, byKey, byLogoFingerprint };
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

export function hasConflictingDltvLogo(index, entry, ...candidates) {
  const fingerprint = entry?.logoFingerprint || getDltvLogoFingerprint(entry?.logoUrl);
  const bucket = fingerprint ? index?.byLogoFingerprint?.get(fingerprint) : null;
  if (!bucket?.length) return false;
  const candidateKeys = new Set(buildDltvLookupKeys(...candidates));

  return bucket.some((match) => !match.lookupKeys.some((key) => candidateKeys.has(key)));
}

export async function fetchDltvTeamPageEntry(candidates, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to load DLTV team pages');
  }

  const cache = options.cache instanceof Map ? options.cache : null;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
    Accept: 'text/html,application/xhtml+xml',
    ...(options.headers || {}),
  };

  for (const slug of buildDltvTeamSlugCandidates(candidates)) {
    if (!slug) continue;
    if (cache?.has(slug)) {
      const cached = cache.get(slug);
      if (cached) return cached;
      continue;
    }

    const teamUrl = `${DLTV_BASE_URL}/teams/${slug}`;
    const response = await fetchImpl(teamUrl, {
      headers,
      signal: options.signal,
    });
    if (!response?.ok) {
      cache?.set(slug, null);
      continue;
    }

    const entry = parseDltvTeamPageEntry(await response.text(), teamUrl);
    if (entry && options.index && hasConflictingDltvLogo(options.index, entry, candidates)) {
      cache?.set(slug, null);
      continue;
    }
    cache?.set(slug, entry);
    if (entry) return entry;
  }

  return null;
}

export async function fetchDltvRankingLogoIndex(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to load DLTV ranking logos');
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
    Accept: 'text/html,application/xhtml+xml',
    ...(options.headers || {}),
  };
  const maxPages = Number.isFinite(Number(options.maxPages))
    ? Math.max(1, Math.trunc(Number(options.maxPages)))
    : 60;
  const statsEntries = [];
  const seenPageSignatures = new Set();

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const apiUrl = new URL(options.apiUrl || DLTV_STATS_API_URL);
      apiUrl.searchParams.set('page', String(page));
      const response = await fetchImpl(apiUrl.toString(), {
        headers,
        signal: options.signal,
      });
      if (!response?.ok) {
        throw new Error(`DLTV stats API request failed: HTTP ${response?.status || 'unknown'}`);
      }

      const pageEntries = parseDltvStatsTeamsPayload(await response.json());
      const signature = pageEntries.slice(0, 5).map((entry) => entry.teamUrl || entry.name).join('|');
      if (!pageEntries.length || (signature && seenPageSignatures.has(signature))) break;
      if (signature) seenPageSignatures.add(signature);
      statsEntries.push(...pageEntries);
    }
  } catch (error) {
    if (options.allowHtmlFallback === false) throw error;
  }

  if (statsEntries.length) {
    return buildDltvRankingLogoIndex(statsEntries);
  }

  const response = await fetchImpl(options.url || DLTV_TEAM_STATS_URL, {
    headers,
    signal: options.signal,
  });

  if (!response?.ok) {
    throw new Error(`DLTV ranking request failed: HTTP ${response?.status || 'unknown'}`);
  }

  return buildDltvRankingLogoIndex(await response.text());
}
