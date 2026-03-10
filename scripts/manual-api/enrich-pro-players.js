#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { buildDbUrlWithAppName, ensureProPlayerAuditLog } from '../../lib/server/pro-player-audit.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

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
      '  --from-db                   Build targets from pro_players rows with missing fields',
      '  --limit <n>                 Row limit for --from-db (default: 50)',
      '  --output <path>             Output JSON path (default: /tmp/pro-player-enrichment.json)',
      '  --sql-output <path>         Output SQL path (default: /tmp/pro-player-enrichment.sql)',
      '  --apply                     Apply UPSERTs to DB (requires DATABASE_URL/POSTGRES_URL)',
      '  --help                      Show this help',
      '',
      'Examples:',
      '  node scripts/manual-api/enrich-pro-players.js --url https://dltv.org/players/AME --url https://bo3.gg/dota2/players/nightfall --url https://liquipedia.net/dota2/Flyfly',
      '  node scripts/manual-api/enrich-pro-players.js --from-db --limit 100 --apply',
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    urls: [],
    fromDb: false,
    limit: 50,
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
    if (arg === '--limit' && argv[i + 1]) {
      const limit = Number(argv[i + 1]);
      if (Number.isFinite(limit) && limit > 0) options.limit = Math.trunc(limit);
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
      continue;
    }
  }

  return options;
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
      .replace(/\s+[|–—-]\s+.*$/, '')
      .replace(/\s+::.*$/, '')
      .replace(/^\s*player\s*:\s*/i, '')
  );
}

function buildJinaUrl(url) {
  return `https://r.jina.ai/http://${String(url).replace(/^https?:\/\//i, '')}`;
}

async function fetchUrlText(url) {
  const attempts = [
    { url, hint: 'direct' },
    { url: buildJinaUrl(url), hint: 'jina' },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2HubBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
        },
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text && text.length > 200) {
        return { raw: text, source: attempt.hint, url: attempt.url };
      }
    } catch {
      // ignore and move to fallback
    }
  }

  return { raw: '', source: 'failed', url };
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
  const avatarUrl = extractFirst(raw, [
    /<div[^>]+class=["'][^"']*profile__v2-left__image\s+player[^"']*["'][^>]+style=["'][^"']*background-image:\s*url\((['"]?)(https?:\/\/[^)'"]+)\1\)[^"']*["']/i,
    /<div[^>]+class=["'][^"']*profile__v2-left__image\s+player[^"']*["'][^>]*>[\s\S]*?<span[^>]+data-theme-light=["'](https?:\/\/[^"']+)["']/i,
    /<div[^>]+class=["'][^"']*profile__v2-left__image\s+player[^"']*["'][^>]*>[\s\S]*?<span[^>]+data-theme-dark=["'](https?:\/\/[^"']+)["']/i,
    /<div[^>]+class=["'][^"']*profile__v2-left__image\s+player[^"']*["'][^>]+data-src=["'](https?:\/\/[^"']+)["']/i,
    /<div[^>]+class=["'][^"']*profile__v2-left__image\s+player[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["'](https?:\/\/[^"']+)["']/i,
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
  const bornIso = extractFirst(raw, [
    /<div class="item">\s*<span>\s*Born\s*<\/span>[\s\S]*?data-moment="[^"]*">\s*(\d{4}-\d{2}-\d{2})/i,
  ]);
  const steamProfile = extractFirst(raw, [
    /https:\/\/steamcommunity\.com\/profiles\/(\d{17})/i,
  ]);
  return {
    avatarUrl,
    country,
    teamName,
    realname,
    bornIso,
    accountId: steamProfile ? steam64ToAccountId(steamProfile) : null,
  };
}

function parseProfileFromSource(sourceUrl, raw) {
  const text = htmlToText(raw);
  const ogTitle = extractMeta(raw, 'og:title');
  const ogDescription = extractMeta(raw, 'og:description');
  const metaDescription = extractMeta(raw, 'description');
  const ogImage = extractMeta(raw, 'og:image');
  const pageTitle = extractFirst(raw, [/<title>([^<]+)<\/title>/i]);
  const jsonLd = parseJsonLdPerson(raw);
  const dltvFields = parseDltvProfileFields(raw);

  const rawPlayerName = normalizePlayerName(
    extractFirst(raw, [
      /<h1[^>]*>([^<]+)<\/h1>/i,
    ]) ||
      jsonLd?.alias ||
      jsonLd?.fullName ||
      ogTitle ||
      pageTitle ||
      pathAliasFromUrl(sourceUrl)
  );
  const teamFromTitle = extractFirst(pageTitle || '', [/[–-]\s*([A-Za-z0-9 .'\-]{2,60})$/]);

  let playerName = rawPlayerName;
  let realnameFromTitle = null;
  const aliasMatch = String(rawPlayerName || '').match(/^(.*?)\s*[«"]([^»"]+)[»"]\s*(.*)$/);
  if (aliasMatch) {
    playerName = normalizeWhitespace(aliasMatch[2]);
    realnameFromTitle = normalizeWhitespace(`${aliasMatch[1]} ${aliasMatch[3]}`.trim());
  }

  const descriptionText = normalizeWhitespace(`${ogDescription || ''} ${metaDescription || ''}`.trim());

  let realname = dltvFields.realname || extractFirst(text, [
    /\b(?:Real Name|Full Name)\b[:\s-]+([A-Za-z][A-Za-z .'\-]{2,60})(?=\s{2,}|$|\(|,|\bBorn\b|\bNationality\b|\bCountry\b)/i,
    /\b(?:真名|本名)\b[:：\s-]+([^\s,，|]{2,40})/i,
  ]) || jsonLd?.realname || realnameFromTitle;
  const descriptionAlias = descriptionText.match(
    /^([A-Za-z][A-Za-z .'\-]{1,30})\s+[«"]([^»"]+)[»"]\s+([A-Za-z][A-Za-z .'\-]{1,30})/i
  );
  if (!realname && descriptionAlias) {
    realname = normalizeWhitespace(`${descriptionAlias[1]} ${descriptionAlias[3]}`);
  }
  if (!realname) {
    realname = extractFirst(descriptionText, [/\(([A-Za-z][A-Za-z .'\-]{2,60})\)/]);
  }

  const nationalityRaw = dltvFields.country || jsonLd?.country || extractFirst(descriptionText, [
    /\bfrom\s+([A-Za-z ]{2,40})\b/i,
    /\bis a\s+([A-Za-z ]{2,30})\s+player\b/i,
  ]) || extractFirst(text, [
    /\b(?:Nationality|Country)\b[:\s-]+([A-Za-z ]{2,40})(?=\s{2,}|$|,|\(|\bBorn\b|\bTeam\b)/i,
  ]);

  const teamName = dltvFields.teamName || jsonLd?.teamName || extractFirst(descriptionText, [
    /\bplaying for\s+([A-Za-z0-9 .'\-]{2,80})[.:,]/i,
    /\bplaying for\s+([A-Za-z0-9 .'\-]{2,80})$/i,
  ]) || teamFromTitle || extractFirst(text, [
    /\b(?:Team|Current Team|所属战队)\b[:\s-]+([A-Za-z0-9 .'\-]{2,40})(?=\s{2,}|$|,|\(|\bBorn\b|\bNationality\b|\bCountry\b)/i,
  ]);

  const bornRaw = dltvFields.bornIso || extractFirst(text, [
    /\b(?:Born|Birthday|Birth Date|出生)\b[:：\s-]+([A-Za-z0-9,\-\/ ]{4,40})/i,
  ]) || jsonLd?.birthDate || extractFirst(descriptionText, [
    /\(born\s+([^)]+)\)/i,
    /\bborn\s+([A-Za-z0-9,\-\/ ]{4,40})/i,
  ]);
  const { birthYear, birthMonth } = parseBirthMonthYear(bornRaw);

  const chineseName =
    extractFirst(String(playerName || ''), [/[（(]([\u4e00-\u9fff·]{2,20})[)）]/]) ||
    extractFirst(text, [/\b(?:中文名|Chinese Name)\b[:：\s-]+([\u4e00-\u9fff·]{2,20})/i]);

  return {
    account_id: dltvFields.accountId || null,
    source_url: sourceUrl,
    player_name: playerName || null,
    name_cn: chineseName || null,
    realname: realname || null,
    team_name: teamName || null,
    nationality_raw: nationalityRaw || null,
    country_code: mapCountryCode(nationalityRaw),
    avatar_url: dltvFields.avatarUrl || ogImage || null,
    birth_year: birthYear,
    birth_month: birthMonth,
  };
}

export function mergeEnrichment(base, next) {
  return {
    account_id: base.account_id || next.account_id || null,
    name: next.name || base.name || null,
    name_cn: base.name_cn || next.name_cn || null,
    realname: base.realname || next.realname || null,
    team_name: base.team_name || next.team_name || null,
    country_code: base.country_code || next.country_code || null,
    avatar_url: base.avatar_url || next.avatar_url || null,
    birth_year: base.birth_year || next.birth_year || null,
    birth_month: base.birth_month || next.birth_month || null,
    source_urls: Array.from(new Set([...(base.source_urls || []), ...(next.source_urls || [])])),
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function loadDbCandidates(db, limit) {
  return db.query(
    `
      SELECT account_id, name, name_cn, team_name, country_code, avatar_url, realname, birth_year, birth_month
      FROM pro_players
      WHERE country_code IS NULL
         OR realname IS NULL
         OR birth_year IS NULL
         OR avatar_url IS NULL
      ORDER BY updated_at DESC NULLS LAST, account_id ASC
      LIMIT $1
    `,
    [limit]
  );
}

function buildCandidateUrlsFromName(name) {
  if (!name) return [];
  const plain = normalizeWhitespace(name);
  const slugDash = plain.toLowerCase().replace(/\s+/g, '-');
  const slugUnderscore = plain.replace(/\s+/g, '_');
  return [
    `https://dltv.org/players/${encodeURIComponent(plain)}`,
    `https://bo3.gg/dota2/players/${encodeURIComponent(slugDash)}`,
    `https://liquipedia.net/dota2/${encodeURIComponent(slugUnderscore)}`,
  ];
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
        /* name_source:enrich-pro-players */
        INSERT INTO pro_players (
          account_id, name, name_cn, team_name, country_code, avatar_url, realname, birth_year, birth_month, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (account_id) DO UPDATE SET
          name = COALESCE(NULLIF(EXCLUDED.name, ''), pro_players.name),
          name_cn = COALESCE(EXCLUDED.name_cn, pro_players.name_cn),
          team_name = COALESCE(EXCLUDED.team_name, pro_players.team_name),
          country_code = COALESCE(EXCLUDED.country_code, pro_players.country_code),
          avatar_url = COALESCE(EXCLUDED.avatar_url, pro_players.avatar_url),
          realname = COALESCE(EXCLUDED.realname, pro_players.realname),
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
        row.birth_year || null,
        row.birth_month || null,
      ]
    );
    count += 1;
  }
  return count;
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.fromDb && options.urls.length === 0) {
    console.error('No work items: pass --url/--urls or --from-db');
    usage();
    process.exit(1);
  }

  const db = DATABASE_URL
    ? neon(buildDbUrlWithAppName(DATABASE_URL, 'scripts/manual-api/enrich-pro-players.js'))
    : null;
  const targets = [];

  if (options.fromDb) {
    if (!db) {
      console.error('--from-db requires DATABASE_URL or POSTGRES_URL');
      process.exit(1);
    }
    await ensureProPlayerAuditLog(db);
    const rows = await loadDbCandidates(db, options.limit);
    for (const row of rows) {
      const accountId = Number(row.account_id);
      targets.push({
        account_id: Number.isFinite(accountId) ? accountId : null,
        name: row.name || null,
        current: {
          name: row.name || null,
          name_cn: row.name_cn || null,
          team_name: row.team_name || null,
          country_code: row.country_code || null,
          avatar_url: row.avatar_url || null,
          realname: row.realname || null,
          birth_year: row.birth_year ?? null,
          birth_month: row.birth_month ?? null,
        },
        urls: buildCandidateUrlsFromName(row.name),
      });
    }
  }

  for (const url of options.urls) {
    targets.push({
      account_id: null,
      name: null,
      current: {},
      urls: [url],
    });
  }

  const results = [];

  for (const target of targets) {
    const merged = {
      account_id: target.account_id,
      name: target.current.name || target.name || null,
      name_cn: target.current.name_cn || null,
      realname: target.current.realname || null,
      team_name: target.current.team_name || null,
      country_code: target.current.country_code || null,
      avatar_url: target.current.avatar_url || null,
      birth_year: target.current.birth_year ?? null,
      birth_month: target.current.birth_month ?? null,
      source_urls: [],
    };

    for (const url of target.urls) {
      const fetched = await fetchUrlText(url);
      if (!fetched.raw) continue;
      const parsed = parseProfileFromSource(url, fetched.raw);

      const resolvedAlias = parsed.player_name || pathAliasFromUrl(url);
      if (!merged.account_id && db && resolvedAlias) {
        merged.account_id = await resolveAccountIdByAlias(db, resolvedAlias);
      }

      const next = {
        account_id: merged.account_id || parsed.account_id || null,
        name: parsed.player_name || merged.name || null,
        name_cn: parsed.name_cn || null,
        realname: parsed.realname || null,
        team_name: parsed.team_name || null,
        country_code: parsed.country_code || null,
        avatar_url: parsed.avatar_url || null,
        birth_year: parsed.birth_year || null,
        birth_month: parsed.birth_month || null,
        source_urls: [url],
      };
      const mergedNext = mergeEnrichment(merged, next);
      Object.assign(merged, mergedNext);
    }

    if (!merged.name) {
      merged.name = pathAliasFromUrl(target.urls[0]) || null;
    }
    results.push(merged);
  }

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

  const upsertRows = results.filter((row) => row.account_id);
  const sqlStatements = upsertRows.map(
    (row) => `
/* name_source:enrich-pro-players */
INSERT INTO pro_players (account_id, name, name_cn, team_name, country_code, avatar_url, realname, birth_year, birth_month, updated_at)
VALUES (${sqlLiteral(row.account_id)}, ${sqlLiteral(row.name)}, ${sqlLiteral(row.name_cn)}, ${sqlLiteral(row.team_name)}, ${sqlLiteral(row.country_code)}, ${sqlLiteral(row.avatar_url)}, ${sqlLiteral(row.realname)}, ${sqlLiteral(row.birth_year)}, ${sqlLiteral(row.birth_month)}, NOW())
ON CONFLICT (account_id) DO UPDATE SET
  name = COALESCE(NULLIF(EXCLUDED.name, ''), pro_players.name),
  name_cn = COALESCE(EXCLUDED.name_cn, pro_players.name_cn),
  team_name = COALESCE(EXCLUDED.team_name, pro_players.team_name),
  country_code = COALESCE(EXCLUDED.country_code, pro_players.country_code),
  avatar_url = COALESCE(EXCLUDED.avatar_url, pro_players.avatar_url),
  realname = COALESCE(EXCLUDED.realname, pro_players.realname),
  birth_year = COALESCE(EXCLUDED.birth_year, pro_players.birth_year),
  birth_month = COALESCE(EXCLUDED.birth_month, pro_players.birth_month),
  updated_at = NOW();`.trim()
  );
  await fs.writeFile(options.sqlOutput, `${sqlStatements.join('\n\n')}\n`, 'utf8');

  let applied = 0;
  if (options.apply) {
    if (!db) {
      throw new Error('--apply requires DATABASE_URL or POSTGRES_URL');
    }
    await ensureProPlayerAuditLog(db);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[enrich-pro-players] failed:', error?.message || error);
    process.exit(1);
  });
}
