/* ------------------------------------------------------------------ */
/* 工具                                                               */
/* ------------------------------------------------------------------ */

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
    return new URL(url).toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

const TABLE_ROW_START_RE = /<div\b[^>]*class=(["'])[^"']*\btable__body-row\b[^"']*\1[^>]*>/gi;
const CELL_NAME_RE = /<div\b[^>]*class=(["'])[^"']*\bcell__name\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/gi;

/** 提取 slide 内所有 table__body-row 的 cell 文本数组（每行一个数组） */
function extractTableRows(slideHtml) {
  const source = String(slideHtml || '');
  const starts = [...source.matchAll(TABLE_ROW_START_RE)];
  const rows = [];

  for (let index = 0; index < starts.length; index += 1) {
    const endIndex = index + 1 < starts.length ? starts[index + 1].index : source.length;
    const rowHtml = source.slice(starts[index].index, endIndex);
    const cells = [...rowHtml.matchAll(CELL_NAME_RE)]
      .map((match) => cleanText(match[2]))
      .filter(Boolean);
    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

function parseUtcDateToUnixSeconds(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const timestamp = Date.parse(normalized.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor(timestamp / 1000);
}

function formatDateRange(startTs, endTs) {
  if (!startTs || !endTs) return '';
  const start = new Date(startTs * 1000);
  const end = new Date(endTs * 1000);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const fmt = (d, withYear) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
  return `${fmt(start, false)} - ${fmt(end, true)}`;
}

/* ------------------------------------------------------------------ */
/* Primary leagues 解析                                                */
/* ------------------------------------------------------------------ */

const PRIMARY_SECTION_RE = /class=["']primary["'][^>]*>([\s\S]*?)<div\s+class=["'](?!swiper)[^"']*[^"']*["']/i;
const SLIDE_RE = /<div\b[^>]*class=(["'])[^"']*\bswiper-slide\b[^"']*\1[^>]*>([\s\S]*?)(?=<div\b[^>]*class=(["'])[^"']*\bswiper-slide\b[^"']*\3[^>]*>|$)/gi;

/**
 * 解析 dltv.org 首页 "Primary leagues" 区块。
 * 每个 swiper-slide 是一个赛事卡片，包含名称/日期/地区/奖金/Tier/logo/链接。
 */
export function parseDltvPrimaryLeagues(html) {
  const source = String(html || '');
  const primaryMatch = source.match(/class=["']primary["']/i);
  if (!primaryMatch) return [];

  const primaryStart = primaryMatch.index;
  // 从 primary 区块开始，切到下一个非 swiper 大区块（约 150KB 足够覆盖全部 slide）
  const primaryBlock = source.slice(primaryStart, primaryStart + 200000);

  const slides = [];
  const slideMatches = [...primaryBlock.matchAll(SLIDE_RE)];

  for (const match of slideMatches) {
    const slideHtml = match[2] || '';
    const tournament = parseSingleSlide(slideHtml);
    if (tournament) slides.push(tournament);
  }

  return slides;
}

function parseSingleSlide(slideHtml) {
  const name = cleanText(String(slideHtml).match(/<span\b[^>]*class=(["'])[^"']*\btitle\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/i)?.[2]);
  if (!name) return null;

  const logoMatch = String(slideHtml).match(/data-theme-dark=(["'])([^"']+)\1/i);
  const logo = logoMatch?.[2] || null;

  const dates = [...String(slideHtml).matchAll(/data-moment=(["'])DD MMMM[^"']*\1[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((m) => cleanText(m[2]))
    .filter(Boolean);
  const startTs = parseUtcDateToUnixSeconds(dates[0]);
  const endTs = parseUtcDateToUnixSeconds(dates[1]);

  const country = cleanText(
    String(slideHtml).match(/<span\b[^>]*class=(["'])[^"']*\bcell__name\b[^"']*\1[^>]*>([\s\S]*?)<\/span>/i)?.[2]
  ) || null;

  // 国旗 URL（如 /assets/plugins/flag-icon/flags/4x3/eu.svg）
  const flagUrl = String(slideHtml).match(/cell__flag[^>]*style=["'][^"']*url\(['"]?([^'")\s]+)['"]?\)/i)?.[1] || null;

  // 按行解析：每行 [label, value, ...]，不依赖 label 文本（兼容不同语言/结构）
  const rowCells = extractTableRows(slideHtml);
  const prizeRow = rowCells.find((cells) => /^\$[\d,]+/.test(cells[1] || ''));
  const tierRow = rowCells.find((cells) => /^[SABC]-tier$/i.test(cells[1] || ''));

  const prize = prizeRow?.[1] || null;
  const tier = tierRow?.[1] || null;

  const eventUrl = normalizeUrl(
    String(slideHtml).match(/<a\b[^>]*href=(["'])(https?:\/\/dltv\.org\/events\/[^"']+)\1/i)?.[2]
  ) || null;

  return {
    name,
    logo: logo ? `https://dltv.org${logo.startsWith('/') ? '' : '/'}${logo}` : null,
    startTime: startTs,
    endTime: endTs,
    dateRange: formatDateRange(startTs, endTs),
    country,
    flag: flagUrl ? `https://dltv.org${flagUrl.startsWith('/') ? '' : '/'}${flagUrl}` : null,
    prizePool: prize,
    tier,
    eventUrl,
  };
}
