#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const FETCH_TIMEOUT_MS = Number(process.env.ENRICH_FETCH_TIMEOUT_MS || 15000);
const ENABLE_JINA_FALLBACK = process.env.ENRICH_ENABLE_JINA !== '0';
const execFile = promisify(execFileCallback);

const COUNTRY_CODE_MAP = {
  china: 'CN',
  chinese: 'CN',
  russia: 'RU',
  russian: 'RU',
  ukraine: 'UA',
  ukranian: 'UA',
  belarus: 'BY',
  kazakhstan: 'KZ',
  philippines: 'PH',
  peru: 'PE',
  brazil: 'BR',
  sweden: 'SE',
  denmark: 'DK',
  finland: 'FI',
  norway: 'NO',
  germany: 'DE',
  france: 'FR',
  poland: 'PL',
  czechia: 'CZ',
  czech: 'CZ',
  serbia: 'RS',
  jordan: 'JO',
  usa: 'US',
  'united states': 'US',
  canada: 'CA',
  argentina: 'AR',
  chile: 'CL',
  bolivia: 'BO',
  vietnam: 'VN',
  malaysia: 'MY',
  indonesia: 'ID',
  thailand: 'TH',
  mongolia: 'MN',
};

function usage() {
  console.log(
    [
      'Usage:',
      '  node scripts/manual-api/enrich-pro-players.js [options]',
      '',
      'Options:',
      '  --url <url>                 Add a source URL (repeatable)',
      '  --urls <u1,u2,...>          Add comma-separated source URLs',
      '  --account-id <id>           Restrict --from-db to a specific account_id (repeatable)',
      '  --from-db                   Build targets from pro_players rows with missing fields',
      '  --team-only                 Restrict --from-db candidates to rows with non-empty team_name',
      '  --require-team-id           Restrict --from-db candidates to rows with non-empty team_id',
      '  --missing-realname-only     Restrict --from-db candidates to rows with NULL realname',
      '  --account-id-only           Only use exact account_id DLTV search; skip name URL fallback',
      '  --limit <n>                 Row limit for --from-db (default: 50)',
      '  --shard-total <n>           Total shard count for parallel runs (default: 1)',
      '  --shard-index <n>           Current shard index [0..shard-total-1] (default: 0)',
      '  --output <path>             Output JSON path (default: /tmp/pro-player-enrichment.json)',
      '  --sql-output <path>         Output SQL path (default: /tmp/pro-player-enrichment.sql)',
      '  --apply                     Apply UPSERTs to DB (requires DATABASE_URL/POSTGRES_URL)',
      '  --help                      Show this help',
      '',
      'Examples:',
      '  node scripts/manual-api/enrich-pro-players.js --url https://dltv.org/players/AME',
      '  node scripts/manual-api/enrich-pro-players.js --from-db --limit 100 --apply',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    urls: [],
    accountIds: [],
    fromDb: false,
    teamOnly: false,
    requireTeamId: false,
    missingRealnameOnly: false,
    accountIdOnly: false,
    limit: 50,
    shardTotal: 1,
    shardIndex: 0,
    output: '/tmp/pro-player-enrichment.json',
    sqlOutput: '/tmp/pro-player-enrichment.sql',
    apply: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--url' && argv[i + 1]) {
      options.urls.push(String(argv[i + 1]));
      i += 1;
      continue;
    }
    if (arg === '--account-id' && argv[i + 1]) {
      options.accountIds.push(String(argv[i + 1]));
      i += 1;
      continue;
    }
    if (arg === '--urls' && argv[i + 1]) {
      const list = String(argv[i + 1])
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      options.urls.push(...list);
      i += 1;
      continue;
    }
    if (arg === '--from-db') {
      options.fromDb = true;
      continue;
    }
    if (arg === '--team-only') {
      options.teamOnly = true;
      continue;
    }
    if (arg === '--require-team-id') {
      options.requireTeamId = true;
      continue;
    }
    if (arg === '--missing-realname-only') {
      options.missingRealnameOnly = true;
      continue;
    }
    if (arg === '--account-id-only') {
      options.accountIdOnly = true;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      const limit = Number(argv[i + 1]);
      if (Number.isFinite(limit) && limit > 0) options.limit = Math.trunc(limit);
      i += 1;
      continue;
    }
    if (arg === '--shard-total' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n >= 1) options.shardTotal = Math.trunc(n);
      i += 1;
      continue;
    }
    if (arg === '--shard-index' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n >= 0) options.shardIndex = Math.trunc(n);
      i += 1;
      continue;
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--sql-output' && argv[i + 1]) {
      options.sqlOutput = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      options.apply = true;
    }
  }

  return options;
}

function normalizeShardOptions(options) {
  if (options.shardTotal < 1) options.shardTotal = 1;
  if (options.shardIndex < 0) options.shardIndex = 0;
  if (options.shardIndex >= options.shardTotal) {
    throw new Error(`--shard-index must be in [0, ${options.shardTotal - 1}]`);
  }
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMeta(html, prop) {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const match = String(html || '').match(re);
  return match ? normalizeWhitespace(decodeHtmlEntities(match[1])) : null;
}

function extractFirst(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1]);
  }
  return null;
}

function mapCountryCode(rawCountry) {
  if (!rawCountry) return null;
  const key = normalizeName(rawCountry);
  if (key.length === 2) return key.toUpperCase();
  return COUNTRY_CODE_MAP[key] || null;
}

function parseBirthMonthYear(raw) {
  if (!raw) return { birthYear: null, birthMonth: null };
  const value = String(raw).trim();

  const iso = value.match(/(\d{4})[-/](\d{1,2})[-/]\d{1,2}/);
  if (iso) {
    return { birthYear: Number(iso[1]), birthMonth: Number(iso[2]) };
  }

  const monthYear = value.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b\s+\d{1,2},?\s*(\d{4})/i
  ) || value.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b[^0-9]*(\d{4})/i
  );
  if (monthYear) {
    const monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    const month = monthNames.indexOf(monthYear[1].toLowerCase()) + 1;
    return { birthYear: Number(monthYear[2]), birthMonth: month > 0 ? month : null };
  }

  const yearOnly = value.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnly) {
    return { birthYear: Number(yearOnly[1]), birthMonth: null };
  }

  return { birthYear: null, birthMonth: null };
}

function parseIsoBirthDate(raw) {
  if (!raw) return null;
  const match = String(raw).trim().match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function pathAliasFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts[parts.length - 1] || '';
    return decodeURIComponent(slug).replace(/[_-]+/g, ' ').trim();
  } catch {
    return null;
  }
}

function steam64ToAccountId(steam64Raw) {
  const steam64 = Number(steam64Raw);
  if (!Number.isFinite(steam64) || steam64 <= 76561197960265728) return null;
  return steam64 - 76561197960265728;
}

function normalizePlayerName(raw) {
  if (!raw) return null;
  return normalizeWhitespace(
    String(raw)
      .replace(/\s*[-|].*$/, '')
      .replace(/\s+::.*$/, '')
      .replace(/^\s*player\s*:\s*/i, '')
  );
}

function buildJinaUrl(url) {
  return `https://r.jina.ai/http://${String(url).replace(/^https?:\/\//i, '')}`;
}

async function fetchWithCurl(url, accept) {
  try {
    const { stdout } = await execFile(
      'curl',
      [
        '-L',
        '-sS',
        '--max-time',
        String(Math.max(5, Math.ceil(FETCH_TIMEOUT_MS / 1000))),
        '-H',
        'User-Agent: Mozilla/5.0 (compatible; Dota2HubBot/1.0)',
        '-H',
        `Accept: ${accept}`,
        url,
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return stdout || '';
  } catch {
    return '';
  }
}

async function fetchUrlText(url, { allowJina = ENABLE_JINA_FALLBACK } = {}) {
  const attempts = [{ url, hint: 'direct' }];
  if (allowJina) {
    attempts.push({ url: buildJinaUrl(url), hint: 'jina' });
  }

  for (const attempt of attempts) {
    const startedAt = Date.now();
    try {
      const res = await fetch(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2HubBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 200) {
        return {
          raw: text,
          source: attempt.hint,
          url: attempt.url,
          duration_ms: Date.now() - startedAt,
        };
      }
    } catch {
      // ignore and try curl/jina fallback
    }

    const curlText = await fetchWithCurl(attempt.url, 'text/html,application/xhtml+xml,text/plain');
    if (curlText && curlText.length > 200) {
      return {
        raw: curlText,
        source: `${attempt.hint}-curl`,
        url: attempt.url,
        duration_ms: Date.now() - startedAt,
      };
    }
  }

  return { raw: '', source: 'failed', url, duration_ms: null };
}

async function fetchJson(url) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Dota2HubBot/1.0)',
        Accept: 'application/json,text/plain,*/*',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const curlText = await fetchWithCurl(url, 'application/json,text/plain,*/*');
      if (!curlText) {
        return { json: null, source: 'failed', url, duration_ms: Date.now() - startedAt };
      }
      return {
        json: JSON.parse(curlText),
        source: 'curl',
        url,
        duration_ms: Date.now() - startedAt,
      };
    }

    return {
      json: await res.json(),
      source: 'direct',
      url,
      duration_ms: Date.now() - startedAt,
    };
  } catch {
    const curlText = await fetchWithCurl(url, 'application/json,text/plain,*/*');
    if (curlText) {
      try {
        return {
          json: JSON.parse(curlText),
          source: 'curl',
          url,
          duration_ms: Date.now() - startedAt,
        };
      } catch {
        // fall through to failed
      }
    }
    return { json: null, source: 'failed', url, duration_ms: null };
  }
}

function parseJsonLdPerson(raw) {
  const scripts = [...String(raw || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    const source = String(match[1] || '').trim();
    if (!source) continue;
    try {
      const parsed = JSON.parse(source);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const type = String(item['@type'] || '').toLowerCase();
        if (type !== 'person') continue;
        const nationalityName = Array.isArray(item.nationality)
          ? item.nationality[0]?.name
          : item.nationality?.name || item.nationality || null;
        const teamName = Array.isArray(item.affiliation) ? item.affiliation[0]?.name : item.affiliation?.name || null;
        return {
          alias: item.additionalName || null,
          fullName: item.name || null,
          realname: [item.givenName, item.familyName].filter(Boolean).join(' ').trim() || null,
          birthDate: item.birthDate || null,
          country: nationalityName || null,
          teamName: teamName || null,
          image: item.image || null,
        };
      }
    } catch {
      // ignore malformed script blocks
    }
  }
  return null;
}

function parseDltvProfileFields(raw) {
  const bornBlock = extractFirst(raw, [
    /<div class="item">\s*<span>\s*Born\s*<\/span>([\s\S]*?)<\/div>/i,
  ]);
  const country = extractFirst(raw, [
    /<div class="country">[\s\S]*?<span[^>]*>\s*([A-Za-z ]+)\s*<\/span>\s*<\/div>/i,
  ]);
  const teamName = extractFirst(raw, [
    /<div class="item">\s*<span>\s*Team\s*<\/span>[\s\S]*?<span>\s*([^<]+)\s*<\/span>/i,
  ]);
  const realname = extractFirst(raw, [
    /<div class="item">\s*<span>\s*Real name\s*<\/span>\s*<span>\s*([^<]+)\s*<\/span>/i,
  ]);
  const bornIso = extractFirst(bornBlock, [
    /data-datetime-source="(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}"/i,
    /\b(\d{4}-\d{2}-\d{2})\b(?:\s+\d{2}:\d{2}:\d{2})?/i,
    /\b([A-Za-z]+\s+\d{1,2},\s+\d{4})\b/i,
  ]);
  const steamProfile = extractFirst(raw, [
    /https:\/\/steamcommunity\.com\/profiles\/(\d{17})/i,
  ]);
  const avatarUrl = extractFirst(raw, [
    /<span[^>]+data-theme-light="(https:\/\/s3\.dltv\.org\/uploads\/players\/[^"]+)"/i,
    /<div class="photo"[^>]*style="background-image:\s*url\('([^']+)'\)"/i,
  ]);
  return {
    country,
    teamName,
    realname,
    bornIso,
    avatarUrl,
    accountId: steamProfile ? steam64ToAccountId(steamProfile) : null,
  };
}

async function fetchDltvSearchProfile(accountId) {
  if (!Number.isFinite(accountId) || accountId <= 0) return null;

  const searchUrl = `https://dltv.org/api/v1/search?q=${encodeURIComponent(String(accountId))}`;
  const fetched = await fetchJson(searchUrl);
  const players = Array.isArray(fetched.json?.players) ? fetched.json.players : [];
  const player = players.find((item) => Number(item?.steam_id) === accountId);
  if (!player?.slug) return null;

  const { birthYear, birthMonth } = parseBirthMonthYear(player.birthday || null);
  const birthDate = parseIsoBirthDate(player.birthday || null);
  const profileUrl = `https://dltv.org/players/${encodeURIComponent(player.slug)}`;

  return {
    profileUrl,
    fetched,
    parsed: {
      account_id: Number(player.steam_id) || accountId,
      source_url: profileUrl,
      player_name: player.title || null,
      name_cn: null,
      realname: player.full_name || null,
      team_name: player.team?.title || null,
      nationality_raw: player.country?.title || player.country?.code || null,
      country_code: mapCountryCode(player.country?.code || player.country?.title || null),
      avatar_url: player.image || null,
      birth_date: birthDate,
      birth_year: birthYear,
      birth_month: birthMonth,
    },
  };
}

function collectProfilePageContext(sourceUrl, raw) {
  const text = htmlToText(raw);
  const ogTitle = extractMeta(raw, 'og:title');
  const ogDescription = extractMeta(raw, 'og:description');
  const metaDescription = extractMeta(raw, 'description');
  const ogImage = extractMeta(raw, 'og:image');
  const pageTitle = extractFirst(raw, [/<title>([^<]+)<\/title>/i]);
  const jsonLd = parseJsonLdPerson(raw);
  const dltvFields = parseDltvProfileFields(raw);
  const descriptionText = normalizeWhitespace(`${ogDescription || ''} ${metaDescription || ''}`.trim());
  const teamFromTitle = extractFirst(pageTitle || '', [/[–-]\s*([A-Za-z0-9 .'\-]{2,60})$/]);

  return {
    sourceUrl,
    raw,
    text,
    ogTitle,
    ogImage,
    pageTitle,
    jsonLd,
    dltvFields,
    descriptionText,
    teamFromTitle,
  };
}

function resolvePlayerName(context) {
  const rawPlayerName = normalizePlayerName(
    extractFirst(context.raw, [/<h1[^>]*>([^<]+)<\/h1>/i]) ||
      context.jsonLd?.alias ||
      context.jsonLd?.fullName ||
      context.ogTitle ||
      context.pageTitle ||
      pathAliasFromUrl(context.sourceUrl)
  );

  let playerName = rawPlayerName;
  let realnameFromTitle = null;
  const aliasMatch = String(rawPlayerName || '').match(/^(.*?)\s*[«"]([^»"]+)[»"]\s*(.*)$/);
  if (aliasMatch) {
    playerName = normalizeWhitespace(aliasMatch[2]);
    realnameFromTitle = normalizeWhitespace(`${aliasMatch[1]} ${aliasMatch[3]}`.trim());
  }

  return {
    playerName: playerName || null,
    realnameFromTitle,
  };
}

function resolveRealname(context, realnameFromTitle) {
  let realname =
    context.dltvFields.realname ||
    extractFirst(context.text, [
      /\b(?:Real Name|Full Name)\b[:\s-]+([A-Za-z][A-Za-z .'\-]{2,60})(?=\s{2,}|$|\(|,|\bBorn\b|\bNationality\b|\bCountry\b)/i,
      /\b(?:真名|本名)\b[:：\s-]+([^\s,，|]{2,40})/i,
    ]) ||
    context.jsonLd?.realname ||
    realnameFromTitle;

  const descriptionAlias = context.descriptionText.match(
    /^([A-Za-z][A-Za-z .'\-]{1,30})\s+[«"]([^»"]+)[»"]\s+([A-Za-z][A-Za-z .'\-]{1,30})/i
  );
  if (!realname && descriptionAlias) {
    realname = normalizeWhitespace(`${descriptionAlias[1]} ${descriptionAlias[3]}`);
  }
  if (!realname) {
    realname = extractFirst(context.descriptionText, [/\(([A-Za-z][A-Za-z .'\-]{2,60})\)/]);
  }

  return realname || null;
}

function resolveNationalityRaw(context) {
  return (
    context.dltvFields.country ||
    context.jsonLd?.country ||
    extractFirst(context.descriptionText, [
      /\bfrom\s+([A-Za-z ]{2,40})\b/i,
      /\bis a\s+([A-Za-z ]{2,30})\s+player\b/i,
    ]) ||
    extractFirst(context.text, [
      /\b(?:Nationality|Country)\b[:\s-]+([A-Za-z ]{2,40})(?=\s{2,}|$|,|\(|\bBorn\b|\bTeam\b)/i,
    ]) ||
    null
  );
}

function resolveTeamName(context) {
  return (
    context.dltvFields.teamName ||
    context.jsonLd?.teamName ||
    extractFirst(context.descriptionText, [
      /\bplaying for\s+([A-Za-z0-9 .'\-]{2,80})[.:,]/i,
      /\bplaying for\s+([A-Za-z0-9 .'\-]{2,80})$/i,
    ]) ||
    context.teamFromTitle ||
    extractFirst(context.text, [
      /\b(?:Team|Current Team|所属战队)\b[:\s-]+([A-Za-z0-9 .'\-]{2,40})(?=\s{2,}|$|,|\(|\bBorn\b|\bNationality\b|\bCountry\b)/i,
    ]) ||
    null
  );
}

function resolveBirthFields(context) {
  const bornRaw =
    context.dltvFields.bornIso ||
    extractFirst(context.text, [/\b(?:Born|Birthday|Birth Date|出生)\b[:：\s-]+([A-Za-z0-9,\-\/ ]{4,40})/i]) ||
    context.jsonLd?.birthDate ||
    extractFirst(context.descriptionText, [/\(born\s+([^)]+)\)/i, /\bborn\s+([A-Za-z0-9,\-\/ ]{4,40})/i]);

  return parseBirthMonthYear(bornRaw);
}

function resolveChineseName(context, playerName) {
  return (
    extractFirst(String(playerName || ''), [/[（(]([\u4e00-\u9fff·]{2,20})[)）]/]) ||
    extractFirst(context.text, [/\b(?:中文名|Chinese Name)\b[:：\s-]+([\u4e00-\u9fff·]{2,20})/i]) ||
    null
  );
}

function createEmptyParsedProfile(sourceUrl) {
  return {
    account_id: null,
    source_url: sourceUrl,
    player_name: null,
    name_cn: null,
    realname: null,
    team_name: null,
    nationality_raw: null,
    country_code: null,
    avatar_url: null,
    birth_date: null,
    birth_year: null,
    birth_month: null,
  };
}

function normalizeAvatarUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.endsWith('.png.webp')) return trimmed.slice(0, -5);
  if (trimmed.endsWith('.webp') && trimmed.includes('.png')) return trimmed.replace(/\.webp$/i, '');
  return trimmed;
}

function mergeParsedProfile(base, next) {
  return {
    account_id: base.account_id || next.account_id || null,
    source_url: base.source_url || next.source_url || null,
    player_name: base.player_name || next.player_name || null,
    name_cn: base.name_cn || next.name_cn || null,
    realname: base.realname || next.realname || null,
    team_name: base.team_name || next.team_name || null,
    nationality_raw: base.nationality_raw || next.nationality_raw || null,
    country_code: base.country_code || next.country_code || null,
    avatar_url: normalizeAvatarUrl(base.avatar_url || next.avatar_url || null),
    birth_date: base.birth_date || next.birth_date || null,
    birth_year: base.birth_year || next.birth_year || null,
    birth_month: base.birth_month || next.birth_month || null,
  };
}

function getProviderName(sourceUrl) {
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (hostname.includes('dltv.org')) return 'dltv';
    if (hostname.includes('bo3.gg')) return 'bo3';
    if (hostname.includes('liquipedia.net')) return 'liquipedia';
  } catch {
    // ignore malformed URLs and use generic fallback
  }

  return 'generic';
}

function getProviderPriority(sourceUrl) {
  const providerName = getProviderName(sourceUrl);
  if (providerName === 'dltv') return 0;
  if (providerName === 'bo3') return 1;
  if (providerName === 'liquipedia') return 2;
  return 3;
}

function prioritizeSourceUrls(urls) {
  return [...urls].sort((left, right) => getProviderPriority(left) - getProviderPriority(right));
}

function parseGenericProfile(context) {
  const { playerName, realnameFromTitle } = resolvePlayerName(context);
  const realname = resolveRealname(context, realnameFromTitle);
  const nationalityRaw = resolveNationalityRaw(context);
  const teamName = resolveTeamName(context);
  const birthDate = parseIsoBirthDate(context.dltvFields.bornIso || context.jsonLd?.birthDate || null);
  const { birthYear, birthMonth } = resolveBirthFields(context);
  const chineseName = resolveChineseName(context, playerName);

  return mergeParsedProfile(createEmptyParsedProfile(context.sourceUrl), {
    account_id: null,
    source_url: context.sourceUrl,
    player_name: playerName,
    name_cn: chineseName || null,
    realname: realname || null,
    team_name: teamName || null,
    nationality_raw: nationalityRaw || null,
    country_code: mapCountryCode(nationalityRaw),
    avatar_url: context.ogImage || null,
    birth_date: birthDate,
    birth_year: birthYear,
    birth_month: birthMonth,
  });
}

function parseDltvProfile(context) {
  const { playerName } = resolvePlayerName(context);
  const dltvBirth = parseBirthMonthYear(context.dltvFields.bornIso);
  const birthDate = parseIsoBirthDate(context.dltvFields.bornIso);

  return mergeParsedProfile(parseGenericProfile(context), {
    account_id: context.dltvFields.accountId || null,
    source_url: context.sourceUrl,
    player_name: playerName || null,
    name_cn: null,
    realname: context.dltvFields.realname || null,
    team_name: context.dltvFields.teamName || null,
    nationality_raw: context.dltvFields.country || null,
    country_code: mapCountryCode(context.dltvFields.country),
    avatar_url: context.dltvFields.avatarUrl || null,
    birth_date: birthDate,
    birth_year: dltvBirth.birthYear,
    birth_month: dltvBirth.birthMonth,
  });
}

function parseBo3Profile(context) {
  return parseGenericProfile(context);
}

function parseLiquipediaProfile(context) {
  return parseGenericProfile(context);
}

function parseProfileFromSource(sourceUrl, raw) {
  const context = collectProfilePageContext(sourceUrl, raw);
  const providerName = getProviderName(sourceUrl);

  if (providerName === 'dltv') return parseDltvProfile(context);
  if (providerName === 'bo3') return parseBo3Profile(context);
  if (providerName === 'liquipedia') return parseLiquipediaProfile(context);
  return parseGenericProfile(context);
}

function hasMeaningfulParsedFields(parsed) {
  return Boolean(parsed.avatar_url && parsed.birth_year && parsed.birth_month);
}

function shouldStopAfterParsedProfile(parsed) {
  return hasMeaningfulParsedFields(parsed);
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs === null) return 'n/a';
  return `${durationMs}ms`;
}

function logFetchResult(url, fetched, parsed, shouldStop) {
  console.log(
    [
      '[enrich-pro-players] fetch',
      `url=${url}`,
      `transport=${fetched.source}`,
      `duration=${formatDuration(fetched.duration_ms)}`,
      `has_raw=${fetched.raw ? 'yes' : 'no'}`,
      `avatar=${parsed.avatar_url ? 'yes' : 'no'}`,
      `birth_year=${parsed.birth_year || 'no'}`,
      `birth_month=${parsed.birth_month || 'no'}`,
      `stop=${shouldStop ? 'yes' : 'no'}`,
    ].join(' ')
  );
}

function logSkippedUrls(urls) {
  if (!urls.length) return;
  console.log(`[enrich-pro-players] skipped remaining urls: ${urls.join(', ')}`);
}

function mergeEnrichment(base, next) {
  return {
    account_id: base.account_id || next.account_id || null,
    name: base.name || next.name || null,
    name_cn: base.name_cn || next.name_cn || null,
    realname: base.realname || next.realname || null,
    team_name: base.team_name || next.team_name || null,
    country_code: base.country_code || next.country_code || null,
    avatar_url: normalizeAvatarUrl(base.avatar_url || next.avatar_url || null),
    birth_date: base.birth_date || next.birth_date || null,
    birth_year: base.birth_year || next.birth_year || null,
    birth_month: base.birth_month || next.birth_month || null,
    source_urls: Array.from(new Set([...(base.source_urls || []), ...(next.source_urls || [])])),
  };
}

function createEmptyMergedTarget(target) {
  return {
    account_id: target.account_id,
    name: target.current.name || target.name || null,
    name_cn: target.current.name_cn || null,
    realname: target.current.realname || null,
    team_name: target.current.team_name || null,
    country_code: target.current.country_code || null,
    avatar_url: target.current.avatar_url || null,
    birth_date: target.current.birth_date || null,
    birth_year: target.current.birth_year ?? null,
    birth_month: target.current.birth_month ?? null,
    source_urls: [],
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function loadDbCandidates(db, { limit, teamOnly, requireTeamId, missingRealnameOnly, shardTotal, shardIndex, accountIds }) {
  const normalizedAccountIds = Array.isArray(accountIds)
    ? accountIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return db.query(
    `
      SELECT account_id, name, name_cn, team_id, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month
      FROM pro_players
      WHERE (
          $7::int[] IS NULL
          OR account_id = ANY($7::int[])
        )
        AND (
          $2::boolean = false
          OR NULLIF(BTRIM(team_name), '') IS NOT NULL
        )
        AND (
          $3::boolean = false
          OR team_id IS NOT NULL
        )
        AND (
          ($4::boolean = true AND realname IS NULL)
          OR (
            $4::boolean = false
            AND (
              country_code IS NULL
              OR realname IS NULL
              OR birth_date IS NULL
              OR birth_year IS NULL
              OR avatar_url IS NULL
            )
          )
        )
        AND (
          $5::int <= 1
          OR MOD(account_id::numeric, $5::numeric) = $6::numeric
        )
      ORDER BY updated_at DESC NULLS LAST, account_id ASC
      LIMIT $1::int
    `,
    [limit, teamOnly, requireTeamId, missingRealnameOnly, shardTotal, shardIndex, normalizedAccountIds.length ? normalizedAccountIds : null]
  );
}

function buildCandidateUrlsFromName(name) {
  if (!name) return [];
  const plain = normalizeWhitespace(name);
  return [
    `https://dltv.org/players/${encodeURIComponent(plain)}`,
    // `https://bo3.gg/dota2/players/${encodeURIComponent(slugDash)}`,
    // `https://liquipedia.net/dota2/${encodeURIComponent(slugUnderscore)}`,
  ];
}

function createDbTarget(row, options = {}) {
  const accountId = Number(row.account_id);
  return {
    account_id: Number.isFinite(accountId) ? accountId : null,
    name: row.name || null,
    current: {
      name: row.name || null,
      name_cn: row.name_cn || null,
      team_name: row.team_name || null,
      country_code: row.country_code || null,
      avatar_url: row.avatar_url || null,
      realname: row.realname || null,
      birth_date: row.birth_date || null,
      birth_year: row.birth_year ?? null,
      birth_month: row.birth_month ?? null,
    },
    urls: options.accountIdOnly ? [] : prioritizeSourceUrls(buildCandidateUrlsFromName(row.name)),
  };
}

function createUrlTarget(url) {
  return {
    account_id: null,
    name: null,
    current: {},
    urls: prioritizeSourceUrls([url]),
  };
}

function buildNextEnrichment(merged, parsed, url) {
  return {
    account_id: merged.account_id || parsed.account_id || null,
    name: parsed.player_name || merged.name || null,
    name_cn: parsed.name_cn || null,
    realname: parsed.realname || null,
    team_name: parsed.team_name || null,
    country_code: parsed.country_code || null,
    avatar_url: parsed.avatar_url || null,
    birth_date: parsed.birth_date || null,
    birth_year: parsed.birth_year || null,
    birth_month: parsed.birth_month || null,
    source_urls: [url],
  };
}

async function resolveAccountIdByAlias(db, alias) {
  if (!db || !alias) return null;
  const norm = normalizeName(alias);
  if (!norm) return null;
  const rows = await db.query(
    `
      SELECT account_id
      FROM pro_players
      WHERE LOWER(name) = $1
         OR LOWER(name_cn) = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `,
    [norm]
  );
  if (!rows?.length) return null;
  const accountId = Number(rows[0].account_id);
  return Number.isFinite(accountId) && accountId > 0 ? accountId : null;
}

async function applyUpserts(db, rows) {
  let count = 0;
  for (const row of rows) {
    if (!row.account_id) continue;
    await db.query(
      `
        INSERT INTO pro_players (
          account_id, name, name_cn, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (account_id) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, pro_players.name),
          name_cn = COALESCE(EXCLUDED.name_cn, pro_players.name_cn),
          team_name = COALESCE(EXCLUDED.team_name, pro_players.team_name),
          country_code = COALESCE(EXCLUDED.country_code, pro_players.country_code),
          avatar_url = COALESCE(EXCLUDED.avatar_url, pro_players.avatar_url),
          realname = COALESCE(EXCLUDED.realname, pro_players.realname),
          birth_date = COALESCE(EXCLUDED.birth_date, pro_players.birth_date),
          birth_year = COALESCE(EXCLUDED.birth_year, pro_players.birth_year),
          birth_month = COALESCE(EXCLUDED.birth_month, pro_players.birth_month),
          updated_at = NOW()
      `,
      [
        row.account_id,
        row.name || null,
        row.name_cn || null,
        row.team_name || null,
        row.country_code || null,
        row.avatar_url || null,
        row.realname || null,
        row.birth_date || null,
        row.birth_year || null,
        row.birth_month || null,
      ]
    );
    count += 1;
  }
  return count;
}

function buildSqlStatement(row) {
  return `
INSERT INTO pro_players (account_id, name, name_cn, team_name, country_code, avatar_url, realname, birth_date, birth_year, birth_month, updated_at)
VALUES (${sqlLiteral(row.account_id)}, ${sqlLiteral(row.name)}, ${sqlLiteral(row.name_cn)}, ${sqlLiteral(row.team_name)}, ${sqlLiteral(row.country_code)}, ${sqlLiteral(row.avatar_url)}, ${sqlLiteral(row.realname)}, ${sqlLiteral(row.birth_date)}, ${sqlLiteral(row.birth_year)}, ${sqlLiteral(row.birth_month)}, NOW())
ON CONFLICT (account_id) DO UPDATE SET
  name = COALESCE(EXCLUDED.name, pro_players.name),
  name_cn = COALESCE(EXCLUDED.name_cn, pro_players.name_cn),
  team_name = COALESCE(EXCLUDED.team_name, pro_players.team_name),
  country_code = COALESCE(EXCLUDED.country_code, pro_players.country_code),
  avatar_url = COALESCE(EXCLUDED.avatar_url, pro_players.avatar_url),
  realname = COALESCE(EXCLUDED.realname, pro_players.realname),
  birth_date = COALESCE(EXCLUDED.birth_date, pro_players.birth_date),
  birth_year = COALESCE(EXCLUDED.birth_year, pro_players.birth_year),
  birth_month = COALESCE(EXCLUDED.birth_month, pro_players.birth_month),
  updated_at = NOW();`.trim();
}

async function enrichTarget(target, db, options = {}) {
  const merged = createEmptyMergedTarget(target);
  const urls = [...target.urls];
  let exactDltvMatched = false;

  if (target.account_id) {
    const dltvSearch = await fetchDltvSearchProfile(target.account_id);
    if (dltvSearch) {
      exactDltvMatched = true;
      Object.assign(
        merged,
        mergeEnrichment(merged, {
          account_id: dltvSearch.parsed.account_id,
          name: dltvSearch.parsed.player_name || null,
          name_cn: dltvSearch.parsed.name_cn || null,
          realname: dltvSearch.parsed.realname || null,
          team_name: dltvSearch.parsed.team_name || null,
          country_code: dltvSearch.parsed.country_code || null,
          avatar_url: dltvSearch.parsed.avatar_url || null,
          birth_date: dltvSearch.parsed.birth_date || null,
          birth_year: dltvSearch.parsed.birth_year || null,
          birth_month: dltvSearch.parsed.birth_month || null,
          source_urls: [dltvSearch.profileUrl],
        })
      );

      if (!urls.includes(dltvSearch.profileUrl)) {
        urls.unshift(dltvSearch.profileUrl);
      }

      const shouldStop = shouldStopAfterParsedProfile(dltvSearch.parsed);
      logFetchResult(dltvSearch.profileUrl, dltvSearch.fetched, dltvSearch.parsed, shouldStop);
    }

    if (!exactDltvMatched || options.accountIdOnly) {
      return merged;
    }
  }

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const fetched = await fetchUrlText(url, { allowJina: false });
    if (!fetched.raw) {
      logFetchResult(url, fetched, createEmptyParsedProfile(url), false);
      continue;
    }

    const parsed = parseProfileFromSource(url, fetched.raw);
    const resolvedAlias = parsed.player_name || pathAliasFromUrl(url);
    if (!merged.account_id && db && resolvedAlias) {
      merged.account_id = await resolveAccountIdByAlias(db, resolvedAlias);
    }

    Object.assign(merged, mergeEnrichment(merged, buildNextEnrichment(merged, parsed, url)));
    const shouldStop = shouldStopAfterParsedProfile(parsed);
    logFetchResult(url, fetched, parsed, shouldStop);

    if (shouldStop) {
      logSkippedUrls(urls.slice(index + 1));
      break;
    }
  }

  if (!merged.name) {
    merged.name = pathAliasFromUrl(urls[0]) || null;
  }

  return merged;
}

async function writeOutputs(options, results) {
  const outputDir = path.dirname(options.output);
  const sqlDir = path.dirname(options.sqlOutput);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(sqlDir, { recursive: true });

  const payload = {
    generated_at: new Date().toISOString(),
    targets: results.length,
    results,
  };
  await fs.writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const upsertRows = results.filter((row) => row.account_id && Array.isArray(row.source_urls) && row.source_urls.length > 0);
  const sqlStatements = upsertRows.map(buildSqlStatement);
  await fs.writeFile(options.sqlOutput, `${sqlStatements.join('\n\n')}\n`, 'utf8');

  return upsertRows;
}

async function main() {
  const options = parseArgs(process.argv);
  normalizeShardOptions(options);

  if (!options.fromDb && options.urls.length === 0) {
    console.error('No work items: pass --url/--urls or --from-db');
    usage();
    process.exit(1);
  }

  const db = DATABASE_URL ? neon(DATABASE_URL) : null;
  const targets = [];

  if (options.fromDb) {
    if (!db) {
      console.error('--from-db requires DATABASE_URL or POSTGRES_URL');
      process.exit(1);
    }
    const rows = await loadDbCandidates(db, {
      limit: options.limit,
      teamOnly: options.teamOnly,
      requireTeamId: options.requireTeamId,
      missingRealnameOnly: options.missingRealnameOnly,
      shardTotal: options.shardTotal,
      shardIndex: options.shardIndex,
      accountIds: options.accountIds,
    });
    for (const row of rows) {
      targets.push(createDbTarget(row, options));
    }
  }

  for (const url of options.urls) {
    targets.push(createUrlTarget(url));
  }

  const results = [];

  for (const target of targets) {
    results.push(await enrichTarget(target, db, options));
  }

  const upsertRows = await writeOutputs(options, results);

  let applied = 0;
  if (options.apply) {
    if (!db) {
      throw new Error('--apply requires DATABASE_URL or POSTGRES_URL');
    }
    applied = await applyUpserts(db, upsertRows);
  }

  console.log(`[enrich-pro-players] wrote JSON: ${options.output}`);
  console.log(`[enrich-pro-players] wrote SQL : ${options.sqlOutput}`);
  console.log(`[enrich-pro-players] enriched rows: ${results.length}`);
  console.log(`[enrich-pro-players] upsert-ready rows (with account_id): ${upsertRows.length}`);
  if (options.apply) {
    console.log(`[enrich-pro-players] applied rows: ${applied}`);
  }
}

main().catch((error) => {
  console.error('[enrich-pro-players] failed:', error?.message || error);
  process.exit(1);
});
