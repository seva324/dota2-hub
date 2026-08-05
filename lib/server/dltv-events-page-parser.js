/**
 * DLTV /events 页面解析器（2026-08-02 markup）
 *
 * /events            → "Ongoing & Upcoming Events"，events__card 卡片（LIVE 徽标）
 * /events/finished   → "Finished Events"，table 列表
 *
 * 兼容三种来源格式：
 * 1. direct HTML（日期在 data-moment span 文本）
 * 2. jina HTML（日期在 data-datetime-source 属性，host 带尾点 dltv.org.，图片相对路径）
 * 3. jina Markdown 快照（`[日期 名称 地区 奖金 Tier 胜者](url)`，无图片）
 */

import { deriveTournamentStatus } from './tournament-status.js';

const DLTV_ORIGIN = 'https://dltv.org';

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
  const raw = String(url || '').trim();
  if (!raw) return null;
  // jina 会产出 host 尾点（dltv.org.）
  const cleaned = raw.replace(/\.\//g, '/');
  if (cleaned.startsWith('/')) {
    return `${DLTV_ORIGIN}${cleaned}`;
  }
  try {
    const parsed = new URL(cleaned.replace(/:\/\/([^/]+)\.\//, '://$1/'));
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return cleaned.replace(/\/$/, '');
  }
}

function toAbsoluteAssetUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\.\//g, '/');
  }
  return `${DLTV_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
}

function parseDateTimeFromText(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Date.parse(normalized.replace(' ', 'T'));
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed / 1000);
}

function parseTier(value) {
  const text = cleanText(value).toUpperCase();
  const match = text.match(/\b([SABCD])(?:-|\s)?(QUAL)?\s*TIER\b/);
  if (!match) return text || null;
  return match[2] ? `${match[1]}-Qual` : match[1];
}

function parsePrizePool(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/\$[\d,]+(?:\.\d+)?/);
  return match ? match[0].replace(/\s+/g, '') : null;
}

function parsePrizeUsd(value) {
  const text = String(value || '').trim();
  const match = text.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

function toFlagImageUrl(location, explicitFlagUrl) {
  if (explicitFlagUrl) return explicitFlagUrl;
  return null;
}

/** 大图优先，其次 relative /uploads/events 图，最后 small logo */
function pickEventImage(rawBlock) {
  const source = String(rawBlock || '');
  const bigMatch = source.match(
    /background-image:\s*url\(['"]?(https?:\/\/s3\.dltv\.org\/uploads\/events\/big\/[^'")\s]+)['"]?\)/i
  );
  if (bigMatch) return bigMatch[1];
  const absoluteMatch = source.match(
    /background-image:\s*url\(['"]?(https?:\/\/s3\.dltv\.org\/uploads\/events\/[^'")\s]+)['"]?\)/i
  );
  if (absoluteMatch) return absoluteMatch[1];
  const relativeMatch = source.match(
    /background-image:\s*url\(['"]?(\/uploads\/events\/[^'")\s]+)['"]?\)/i
  );
  if (relativeMatch) return toAbsoluteAssetUrl(relativeMatch[1]);
  const cellLogoMatch = source.match(/cell__logo[^>]*data-theme-light=(["'])([^"']+)\1/i);
  return cellLogoMatch ? toAbsoluteAssetUrl(cellLogoMatch[2]) : null;
}

/* ------------------------------------------------------------------ */
/* /events：Ongoing & Upcoming 卡片（HTML）                             */
/* ------------------------------------------------------------------ */

const CARD_HEAD_RE = /<a[^>]+href=(["'])([^"']+)\1[^>]*class=(["'])[^"']*\bevents__card-head\b[^"']*\3[^>]*>([\s\S]*?)<\/a>/gi;

function parseCardHead(block, href) {
  // jina HTML：日期在 data-datetime-source 属性；direct HTML：日期在 data-moment span 文本
  const dateSources = [...String(block || '').matchAll(/data-datetime-source=(["'])([^"']+)\1/gi)]
    .map((match) => match[2]);
  const dateTexts = dateSources.length > 0
    ? dateSources
    : [...String(block || '').matchAll(/<span[^>]*data-moment=[^>]*>(\d{4}-\d{2}-\d{2}[^<]*)<\/span>/gi)]
        .map((match) => cleanText(match[1]))
        .filter(Boolean);
  const startTime = parseDateTimeFromText(dateTexts[0]);
  const endTime = parseDateTimeFromText(dateTexts[1]);

  const location = cleanText(
    String(block || '').match(/info__col-item__flag[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]
  ) || null;

  const flagRaw = String(block || '').match(
    /info__col-item__flag[^>]*style=["'][^"']*url\(['"]?([^'")\s]+)['"]?\)/i
  )?.[1] || null;

  const prizePool = parsePrizePool(
    cleanText(String(block || '').match(/info__col-item prize[\s\S]*?<strong>([\s\S]*?)<\/strong>/i)?.[1] || null)
  );

  const tier = parseTier(
    cleanText(String(block || '').match(/info__col-item align-right">([\s\S]*?Tier)<\/div>/i)?.[1] || null)
  );

  const title = cleanText(String(block || '').match(/info__col-item name">([\s\S]*?)<\/div>/i)?.[1] || null);

  const isLive = /\bLIVE\b/i.test(String(block || '').match(/pic__tag[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '');

  return {
    sourceUrl: normalizeUrl(href),
    title,
    // LIVE 徽标是权威信号：DLTV 的结束日期精确到赛事首日 00:00，按日期推导会把
    // 仍在进行的赛事误判为 completed/upcoming。
    status: isLive ? 'ongoing' : deriveTournamentStatus(startTime, endTime),
    live: isLive,
    tier,
    location: location || null,
    locationFlagUrl: toFlagImageUrl(location, toAbsoluteAssetUrl(flagRaw)),
    startTime,
    endTime,
    prizePool,
    prizePoolUsd: parsePrizeUsd(prizePool),
    image: pickEventImage(block) || null,
  };
}

export function parseDltvOngoingUpcomingPage(raw) {
  const source = String(raw || '');
  const entries = [];
  for (const match of source.matchAll(CARD_HEAD_RE)) {
    const entry = parseCardHead(match[4], match[2]);
    if (!entry.title || !entry.sourceUrl) continue;
    if (entry.sourceUrl === DLTV_ORIGIN || entry.sourceUrl === `${DLTV_ORIGIN}/events`) continue;
    entries.push(entry);
  }
  // 去重（LIVE 卡片可能在 featured + 列表重复出现）
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.title}|${entry.startTime || ''}|${entry.endTime || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* /events/finished：表格（HTML）                                       */
/* ------------------------------------------------------------------ */

const TABLE_ROW_RE = /<a[^>]+href=(["'])([^"']+)\1[^>]*class=(["'])[^"']*\btable__body-row\b[^"']*\3[^>]*>([\s\S]*?)<\/a>/gi;

function parseFinishedRow(block, href) {
  const dateTexts = [...String(block || '').matchAll(/<span[^>]*>(\d{4}-\d{2}-\d{2}[^<]*)<\/span>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);
  const startTime = parseDateTimeFromText(dateTexts[0]);
  const endTime = parseDateTimeFromText(dateTexts[1]);

  const title = cleanText(String(block || '').match(/cell__name">([\s\S]*?)<\/div>/i)?.[1] || null);

  const cellTexts = [...String(block || '').matchAll(/class="cell__text">([\s\S]*?)<\/div>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  const tier = parseTier(cellTexts.find((value) => /\btier\b/i.test(value)) || null);
  const prizePool = parsePrizePool(cellTexts.find((value) => /^\$[\d,]/.test(value)) || null);

  const logoMatch = String(block || '').match(
    /cell__logo[^>]*data-theme-light=(["'])([^"']+)\1/i
  );
  const image = toAbsoluteAssetUrl(logoMatch?.[2] || null);

  return {
    sourceUrl: normalizeUrl(href),
    title,
    status: 'finished',
    live: false,
    tier,
    location: null,
    locationFlagUrl: null,
    startTime,
    endTime,
    prizePool,
    prizePoolUsd: parsePrizeUsd(prizePool),
    image,
    winner: cellTexts[0] && !/\btier\b/i.test(cellTexts[0]) && !/^\$[\d,]/.test(cellTexts[0])
      ? cellTexts[0]
      : null,
  };
}

export function parseDltvFinishedPage(raw) {
  const source = String(raw || '');
  const entries = [];
  for (const match of source.matchAll(TABLE_ROW_RE)) {
    const entry = parseFinishedRow(match[4], match[2]);
    if (!entry.title || !entry.sourceUrl) continue;
    entries.push(entry);
  }
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.title}|${entry.startTime || ''}|${entry.endTime || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Markdown 快照（jina 偶发返回 Markdown 而非 HTML）                    */
/* ------------------------------------------------------------------ */

function isMarkdownSnapshot(raw) {
  const source = String(raw || '');
  return source.includes('Markdown Content:')
    || (!source.includes('<html') && source.includes('\n[') && source.includes('](https://dltv.org/events'));
}

function cleanMarkdownLine(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/^\s*#+\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTH_NAME_TO_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseMmDdYear(monthName, day, year) {
  const month = MONTH_NAME_TO_INDEX[String(monthName || '').toLowerCase().slice(0, 3)];
  const dayNum = Number(day);
  if (month === undefined || !Number.isFinite(dayNum)) return null;
  const timestamp = Date.parse(
    `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}T00:00:00Z`
  );
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

const MD_MMM_DATE_RE = /\b([A-Za-z]{3})\s+(\d{1,2})\s*-\s*([A-Za-z]{3})\s+(\d{1,2})\b/;
const MD_REGION_RE = /\b(Europe|North America|South America|Southeast Asia|SEA|China|Kazakhstan|Malta|Romania|Saudi Arabia|Russia|Brazil|Peru|USA)\b/i;
const MD_TIER_RE = /\b([SABC])(?:-|\s)?(Qual)?\s*Tier(?:\s*Tier)?\b/i;
const MD_PRIZE_RE = /\$[\d,]+(?:\.\d+)?/;

/** 解析 markdown 事件行 `[日期 名称 地区 奖金 Tier 胜者](url)` */
function parseMdEventEntry(label, href, yearContext, isFinished) {
  const text = cleanMarkdownLine(label);
  if (!text) return null;

  let startTime = null;
  let endTime = null;
  let dateSpan = null;

  // 完整消费 `YYYY-MM-DD HH:mm:ss - YYYY-MM-DD HH:mm:ss`，避免留下 HH:mm:ss 残留
  const isoFullRange = text.match(/(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\s*-\s*(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}/);
  if (isoFullRange) {
    startTime = parseDateTimeFromText(isoFullRange[1]);
    endTime = parseDateTimeFromText(isoFullRange[2]);
    dateSpan = isoFullRange[0];
  } else {
    const mmmRange = text.match(MD_MMM_DATE_RE);
    if (mmmRange) {
      const year = yearContext || new Date().getFullYear();
      startTime = parseMmDdYear(mmmRange[1], mmmRange[2], year);
      endTime = parseMmDdYear(mmmRange[3], mmmRange[4], year);
      dateSpan = mmmRange[0];
    }
  }

  const prizeMatch = text.match(MD_PRIZE_RE);
  const prizePool = prizeMatch ? prizeMatch[0] : null;
  const tierMatch = text.match(MD_TIER_RE);

  let title = text;
  let winner = null;
  let location = null;

  if (isFinished) {
    // finished 格式：DATE NAME TIER [WINNER] $PRIZE → 名称 = tier 之前的文本
    const afterDate = dateSpan ? text.slice(dateSpan.length).trim() : text;
    const tierRel = afterDate.match(MD_TIER_RE);
    if (tierRel) {
      title = afterDate.slice(0, tierRel.index).trim();
      winner = afterDate.slice(tierRel.index + tierRel[0].length).replace(MD_PRIZE_RE, ' ').replace(/\s+/g, ' ').trim() || null;
    } else {
      title = afterDate.replace(MD_PRIZE_RE, ' ').replace(/\s+/g, ' ').trim();
    }
  } else {
    // ongoing/featured 格式：DATE NAME [REGION] Prize pool $X TIER N participants
    const regionMatch = text.match(MD_REGION_RE);
    location = regionMatch?.[1] || null;
    if (dateSpan) title = title.replace(dateSpan, ' ');
    title = title.replace(/Prize pool/i, ' ');
    title = title.replace(MD_PRIZE_RE, ' ');
    title = title.replace(MD_TIER_RE, ' ');
    title = title.replace(/\b\d+\s+participants?\b/i, ' ');
    if (location) title = title.replace(new RegExp(`\\b${location}\\b`, 'i'), ' ');
    // Online/Offline 是 event type 列，从名称中剔除
    title = title.replace(/\b(Online|Offline)\b/i, ' ');
    title = title.replace(/^\s*LIVE\b/i, '');
    title = title.replace(/\s+/g, ' ').trim();
  }

  if (!title) return null;

  const isLive = /^\s*LIVE\b/i.test(text);

  return {
    sourceUrl: normalizeUrl(href),
    title,
    // 与 HTML 卡片一致：LIVE 徽标优先于日期推导。
    status: isLive ? 'ongoing' : deriveTournamentStatus(startTime, endTime),
    live: isLive,
    tier: tierMatch ? (tierMatch[2] ? `${tierMatch[1]}-Qual` : tierMatch[1]) : null,
    location,
    locationFlagUrl: null,
    startTime,
    endTime,
    prizePool,
    prizePoolUsd: parsePrizeUsd(prizePool),
    image: null,
    winner,
  };
}

const MD_YEAR_HEADING_RE = /^#{1,6}\s+(?:[A-Za-z]+\s+)?(\d{4})\s*$/i;
const MD_EVENT_LINK_RE = /\[([\s\S]*?)\]\((https?:\/\/dltv\.org\.?\/events\/[^)\s]+)\)/g;

/**
 * 逐条解析 markdown 快照中的事件链接（可能多行，也可能一行多个链接）。
 * `#### Month Year` 标题为后续 MMM DD 日期提供年份上下文（扫描向前最近标题）。
 */
function extractMdEventLinks(raw, isFinished) {
  const source = String(raw || '');
  const contentStart = source.indexOf('Markdown Content:');
  const body = contentStart >= 0 ? source.slice(contentStart) : source;

  // 收集年份标题位置
  const yearMarks = [];
  for (const match of body.matchAll(/^#{1,6}\s+[A-Za-z]+\s+(\d{4})\s*$/gim)) {
    yearMarks.push({ index: match.index, year: Number(match[1]) });
  }

  const entries = [];
  for (const match of body.matchAll(MD_EVENT_LINK_RE)) {
    const label = match[1];
    const href = match[2];
    if (!/\d{1,2}\s*[A-Za-z]{3}/.test(label) && !/\d{4}-\d{2}-\d{2}/.test(label)) continue;

    const yearContext = [...yearMarks].reverse().find((mark) => mark.index < match.index)?.year
      || new Date().getFullYear();

    const entry = parseMdEventEntry(label, href, yearContext, isFinished);
    if (entry && entry.title && (entry.startTime || entry.endTime)) {
      entries.push(entry);
    }
  }

  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.title}|${entry.startTime || ''}|${entry.endTime || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 从 Markdown 快照解析 /events 页（Ongoing & Upcoming） */
export function parseDltvOngoingUpcomingMarkdown(raw) {
  return extractMdEventLinks(raw, false);
}

/** 从 Markdown 快照解析 /events/finished 页 */
export function parseDltvFinishedMarkdown(raw) {
  return extractMdEventLinks(raw, true).map((entry) => ({
    ...entry,
    status: 'finished',
  }));
}

/** 统一入口：自动识别 HTML 或 Markdown */
export function parseDltvEventsPageRaw(raw, kind) {
  if (isMarkdownSnapshot(raw)) {
    return kind === 'finished'
      ? parseDltvFinishedMarkdown(raw)
      : parseDltvOngoingUpcomingMarkdown(raw);
  }
  return kind === 'finished'
    ? parseDltvFinishedPage(raw)
    : parseDltvOngoingUpcomingPage(raw);
}
