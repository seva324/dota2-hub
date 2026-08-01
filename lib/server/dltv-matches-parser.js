import { parseUtcDateTimeToUnixSeconds } from './dltv-upcoming.js';

/* ------------------------------------------------------------------ */
/* HTML 工具                                                           */
/* ------------------------------------------------------------------ */

const TEAM_NAME_RE = /<div\b[^>]*class=(["'])[^"']*\bteam__title\b[^"']*\1[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/gi;
const HEAD_FORMAT_RE = /<[^>]+\bclass=(["'])[^"']*\bmatch__head-format\b[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/gi;

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

function extractMatchUrl(html) {
  const match = String(html || '').match(/<a\b[^>]*href=(["'])(https?:\/\/dltv\.org\/matches\/\d+\/[^"']+)\1/i);
  return normalizeUrl(match?.[2] || null);
}

function extractSeriesIdFromMatchUrl(matchUrl) {
  if (!matchUrl) return null;
  const match = String(matchUrl).match(/\/matches\/(\d+)\//i);
  return match?.[1] || null;
}

function normalizeBestOf(value) {
  const match = cleanText(value).match(/bo\s*(\d+)/i);
  return match ? `BO${match[1]}` : null;
}

function getTeamLogo(tag) {
  const dark = getAttribute(tag, 'data-theme-dark');
  const light = getAttribute(tag, 'data-theme-light');
  return dark || light || null;
}

/* ------------------------------------------------------------------ */
/* 区块收集                                                            */
/* ------------------------------------------------------------------ */

function collectBlocks(html, blockClassRegex) {
  const source = String(html || '');
  const matches = [...source.matchAll(blockClassRegex)];
  return matches.map((match, index) => ({
    startIndex: Number(match.index) || 0,
    openingTag: match[0],
    html: source.slice(
      match.index,
      index + 1 < matches.length ? matches[index + 1].index : source.length
    ),
  }));
}

const LIVE_MATCH_BLOCK_RE = /<div\b[^>]*class=(["'])[^"']*\bmatch\b[^"']*\blive\b[^"']*\1[^>]*>/gi;
const FINISHED_MATCH_BLOCK_RE = /<div\b[^>]*class=(["'])[^"']*\bmatch\b[^"']*\bfinished\b[^"']*\1[^>]*>/gi;

function extractHeadTournament(html) {
  return cleanText(
    String(html || '').match(/<[^>]+\bclass=(["'])[^"']*\bmatch__head-event\b[^"']*\1[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i)?.[2]
  );
}

function extractFormatTexts(html) {
  return [...String(html || '').matchAll(HEAD_FORMAT_RE)]
    .map((match) => cleanText(match[2]))
    .filter(Boolean);
}

function extractTeams(html) {
  const teamBlocks = [...String(html || '').matchAll(/<div\b[^>]*class=(["'])[^"']*\bmatch__body-details__team\b[^"']*\1[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)];
  const teams = [];

  for (const block of teamBlocks.slice(0, 2)) {
    const name = cleanText(
      String(block[2] || '').match(/<div\b[^>]*class=(["'])[^"']*\bteam__title\b[^"']*\1[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[2]
    );
    const logoMatch = String(block[2] || '').match(/<i\b[^>]*data-theme-light=(["'])([^"']+)\1[^>]*>/i)
      || String(block[2] || '').match(/<i\b[^>]*data-theme-dark=(["'])([^"']+)\1[^>]*>/i);
    teams.push({ name, logo: logoMatch?.[2] || null });
  }
  return teams;
}

function extractBestOfStage(html) {
  const formatTexts = extractFormatTexts(html);
  const bestOf = formatTexts.map((value) => normalizeBestOf(value)).find(Boolean) || 'BO3';
  const stage = formatTexts.find((value) => normalizeBestOf(value) !== bestOf) || null;
  return { bestOf, stage };
}

/* ------------------------------------------------------------------ */
/* Live 解析                                                           */
/* ------------------------------------------------------------------ */

/**
 * 解析 dltv.org/matches 页面的 live 卡片。
 * 每张卡片 = 一场正在进行的比赛。data-match 为 OpenDota matchId。
 */
export function parseDltvLiveMatches(html) {
  const live = [];

  for (const block of collectBlocks(html, LIVE_MATCH_BLOCK_RE)) {
    const tournament = extractHeadTournament(block.html);
    if (!tournament) continue;

    const { bestOf, stage } = extractBestOfStage(block.html);
    const teams = extractTeams(block.html);
    if (teams.length < 2 || !teams[0].name || !teams[1].name) continue;

    // 每队比分:score strong(当前击杀) + score small(系列赛胜场)
    const scoreBlocks = [...block.html.matchAll(/<div\b[^>]*class=(["'])[^"']*\bscore\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi)];
    const parseScore = (raw) => {
      const kills = Number(cleanText(String(raw || '').match(/<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1]) || 0);
      const wins = Number(cleanText(String(raw || '').match(/<small[^>]*>\((\d+)\)<\/small>/i)?.[1]) || 0);
      return { kills, wins };
    };
    const score1 = parseScore(scoreBlocks[0]?.[2]);
    const score2 = parseScore(scoreBlocks[1]?.[2]);

    const gameTimeRaw = cleanText(
      String(block.html).match(/<div\b[^>]*class=(["'])[^"']*\bduration__time\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)?.[2]
    );
    const gameTime = parseGameClock(gameTimeRaw);

    live.push({
      seriesId: getAttribute(block.openingTag, 'data-series-id'),
      matchId: getAttribute(block.openingTag, 'data-match'),
      tournament,
      eventUrl: extractEventUrl(block.html),
      matchUrl: extractMatchUrl(block.html),
      stage,
      bestOf,
      radiantName: teams[0].name,
      direName: teams[1].name,
      radiantLogo: teams[0].logo,
      direLogo: teams[1].logo,
      radiantKills: score1.kills,
      direKills: score2.kills,
      seriesWins1: score1.wins,
      seriesWins2: score2.wins,
      gameTime,
    });
  }

  return live;
}

function parseGameClock(value) {
  const match = String(value || '').match(/(\d+):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

/* ------------------------------------------------------------------ */
/* Results 解析                                                        */
/* ------------------------------------------------------------------ */

/**
 * 解析 dltv.org/results 页面的 finished 卡片。
 * 每张卡片 = 一个已结束的系列赛，比分即系列赛最终比分。
 * 第一个 team = radiant，第二个 = dire；text-red 为赢家。
 */
export function parseDltvFinishedMatches(html) {
  const results = [];

  for (const block of collectBlocks(html, FINISHED_MATCH_BLOCK_RE)) {
    const tournament = extractHeadTournament(block.html);
    if (!tournament) continue;

    const { bestOf, stage } = extractBestOfStage(block.html);
    const teams = extractTeams(block.html);
    if (teams.length < 2 || !teams[0].name || !teams[1].name) continue;

    // 比分:两个 score 块,每个 <strong class="text-gray|text-red">N</strong>
    const scoreValues = [...block.html.matchAll(/<div\b[^>]*class=(["'])[^"']*\bscore\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi)]
      .map((match) => {
        const strong = String(match[2] || '').match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
        const value = Number(cleanText(strong?.[1]));
        return Number.isFinite(value) ? value : null;
      })
      .filter((value) => value !== null);

    if (scoreValues.length < 2) continue;

    const startTime = parseUtcDateTimeToUnixSeconds(getAttribute(block.openingTag, 'data-matches-odd'));
    const matchUrl = extractMatchUrl(block.html);

    results.push({
      seriesId: getAttribute(block.openingTag, 'data-series-id') || extractSeriesIdFromMatchUrl(matchUrl),
      tournament,
      eventUrl: extractEventUrl(block.html),
      matchUrl,
      stage,
      bestOf,
      radiantName: teams[0].name,
      direName: teams[1].name,
      radiantLogo: teams[0].logo,
      direLogo: teams[1].logo,
      radiantScore: scoreValues[0],
      direScore: scoreValues[1],
      startTime,
    });
  }

  results.sort((left, right) => (right.startTime || 0) - (left.startTime || 0));
  return results;
}

/* ------------------------------------------------------------------ */
/* Upcoming 补充 logo                                                  */
/* ------------------------------------------------------------------ */

/**
 * 解析 dltv.org/matches 页面的 upcoming 卡片（含 logo）。
 * 复用 parseDltvUpcomingMatchesPage 的结果，再补充 logo 字段。
 */
export function parseDltvUpcomingMatchesWithLogos(html, options = {}, parseBase) {
  const baseRows = parseBase(html, options);
  const blocks = collectBlocks(html, /<div\b[^>]*class=(["'])[^"']*\bmatch\b[^"']*\bupcoming\b[^"']*\1[^>]*>/gi);
  const logoBySeriesId = new Map();

  for (const block of blocks) {
    const seriesId = getAttribute(block.openingTag, 'data-series-id');
    if (!seriesId) continue;
    const teams = extractTeams(block.html);
    if (teams.length >= 2) {
      logoBySeriesId.set(seriesId, { radiantLogo: teams[0].logo, direLogo: teams[1].logo });
    }
  }

  return baseRows.map((row) => {
    const logos = logoBySeriesId.get(String(row.seriesId)) || {};
    return {
      ...row,
      radiantLogo: logos.radiantLogo || null,
      direLogo: logos.direLogo || null,
      matchUrl: row.matchUrl || null,
    };
  });
}
