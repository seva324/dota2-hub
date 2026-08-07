/**
 * DLTV 赛事详情页解析器（/events/<slug>）
 *
 * 解析 1win Essence II 一类赛事详情页的完整区块：
 * overview（概览）/ about（简介 markdown）/ group_stage（小组赛积分榜）
 * / playoffs（淘汰赛 bracket + 决赛奖金）/ matches（比赛）/ participants（参赛队伍）/ prize_pool（奖金池）
 *
 * 解析结果直接来自真 HTML（class/section 标记），与 events 列表解析器（dltv-events-page-parser.js）同源同风格。
 */

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

function toAbsoluteAssetUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${DLTV_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
}

function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\.\//g, '/');
  if (cleaned.startsWith('/')) return `${DLTV_ORIGIN}${cleaned}`;
  try {
    return new URL(cleaned).toString().replace(/\/$/, '');
  } catch {
    return cleaned.replace(/\/$/, '');
  }
}

/** 按 data-moment 时间戳取 unix 秒 */
function parseUtcTimestamp(value) {
  const normalized = String(value || '').trim();
  const timestamp = Date.parse(normalized.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function pickLogo(rawBlock) {
  return rawBlock.match(/data-theme-dark="([^"]+)"/)?.[1]
    || rawBlock.match(/data-theme-light="([^"]+)"/)?.[1] || null;
}

/* ------------------------------------------------------------------ */
/* overview                                                            */
/* ------------------------------------------------------------------ */

/**
 * overview 固定 6 项，按 DLTV 顺序：Dates / Country / Event tier / Event type / Prize pool / Participants。
 * item__title 文本会随 DLTV 本地化变化（英文 / 中文：日期·国家·活动等级·活动类型·奖池·参与者），
 * 因此按位置 + 中英别名双重归一化，前端契约固定为英文 key。
 */
const OVERVIEW_ORDER = ['Dates', 'Country', 'Event tier', 'Event type', 'Prize pool', 'Participants'];
const OVERVIEW_ALIAS = {
  日期: 'Dates', '时间': 'Dates', '开始日期': 'Dates', '结束日期': 'Dates',
  国家: 'Country', '地区': 'Country',
  '活动等级': 'Event tier', '赛事级别': 'Event tier', '等级': 'Event tier', '赛事等级': 'Event tier',
  '活动类型': 'Event type', '赛事类型': 'Event type', '类型': 'Event type',
  奖池: 'Prize pool', '奖金池': 'Prize pool', '奖金': 'Prize pool', '奖励池': 'Prize pool',
  参与者: 'Participants', '参赛队伍': 'Participants', '队伍': 'Participants', '参赛人数': 'Participants',
};

function parseOverview(html) {
  const overview = {};
  const start = html.indexOf('<div class="event__overview-block__details">');
  if (start < 0) return { overview, live: false, heroImage: null };
  const end = html.indexOf('</section>', start);
  const block = html.slice(start, end < 0 ? html.length : end);
  const items = [];
  for (const m of block.matchAll(/<div class="item__title">([\s\S]*?)<\/div>[\s\S]*?<div class="item__text">([\s\S]*?)<\/div>\s*<\/div>/g)) {
    items.push({ title: cleanText(m[1]), value: cleanText(m[2]) });
  }
  items.forEach((item, index) => {
    const byAlias = OVERVIEW_ALIAS[item.title] || OVERVIEW_ALIAS[String(item.title).toLowerCase()];
    const key = byAlias || OVERVIEW_ORDER[index] || item.title;
    overview[key] = item.value;
  });
  const live = /event__overview-block__image[\s\S]*?<span class="live">/i.test(html);
  const heroImage = html.match(/event__overview-block__image" style="background-image: url\('([^']+)'\)/)?.[1] || null;
  return { overview, live, heroImage: toAbsoluteAssetUrl(heroImage) };
}

/* ------------------------------------------------------------------ */
/* about（简介 markdown 段落）                                          */
/* ------------------------------------------------------------------ */

function parseAbout(html) {
  const start = html.indexOf('<div class="article__body-text middle__text">');
  const groupStart = html.indexOf('<section class="group__stage">');
  if (start < 0) return { intro: '', sections: [], prizeBreakdown: [] };
  const block = html.slice(start, groupStart < 0 ? html.length : groupStart);
  const paragraphs = [...block.matchAll(/<p class="ds-markdown-paragraph">([\s\S]*?)<\/p>/g)]
    .map((m) => ({ raw: m[1].trim(), text: cleanText(m[1]) }))
    .filter((p) => p.text.length > 0);
  if (paragraphs.length === 0) return { intro: '', sections: [], prizeBreakdown: [] };

  // 首段为简介，后续以「纯 <strong> 包裹段」为小标题，其余段落归入当前小节正文。
  const intro = paragraphs[0].text;
  const sections = [];
  let current = null;
  for (const p of paragraphs.slice(1)) {
    if (/^<strong>[\s\S]*<\/strong>$/.test(p.raw)) {
      current = { heading: p.text, body: '' };
      sections.push(current);
    } else if (current) {
      current.body += (current.body ? '\n' : '') + p.text;
    }
  }
  const prizeBreakdown = extractPrizeBreakdown(sections);
  return { intro, sections, prizeBreakdown };
}

/** 从「奖金池」小节正文解析 [名次, 金额] 明细行，如 ["第一名", "100,000 美元"] / ["1st Place", "$100,000"]。 */
function extractPrizeBreakdown(sections) {
  const prize = sections.find((s) => /奖金|prize/i.test(s.heading));
  if (!prize) return [];
  const rowRe = /^(第[^：:]+|(?:\d+(?:st|nd|rd|th)(?:\s*[-–—]\s*\d+(?:st|nd|rd|th))?\s*Place[s]?))[：:]\s*(.+)$/i;
  const decode = (line) => line.replace(/&ndash;/gi, '\u2013').replace(/&mdash;/gi, '\u2014');
  return prize.body
    .split('\n')
    .map((line) => decode(line.trim()))
    .filter(Boolean)
    .map((line) => line.match(rowRe))
    .filter(Boolean)
    .map((m) => [m[1].trim(), m[2].trim().replace(/^各\s*/, '').replace(/\s*each\s*$/i, '')]);
}

/* ------------------------------------------------------------------ */
/* group stage 小组赛积分榜（支持：双栏分组 / 单组瑞士轮 / 单循环）        */
/* ------------------------------------------------------------------ */

/** 提取行内背景色（晋级/淘汰由 DLTV 着色区分）。 */
function rowTone(htmlBlock) {
  const match = htmlBlock.match(/data-theme-dark-bgcolor="([^"]+)"/);
  return match ? match[1].toLowerCase() : '';
}

/** 解析单张积分表（tableHtml 为 <div class="table">…</div> 区域）。 */
function parseStandingTable(tableHtml, defaultName) {
  const name = tableHtml.match(/class="table__head-item[^"]*big-text">([\s\S]*?)<\/div>/)?.[1] || defaultName || '';
  const heads = [...tableHtml.matchAll(/class="table__head-item[^"]*">([\s\S]*?)<\/div>/g)].map((m) => cleanText(m[1])).filter(Boolean);
  const rows = [];

  // 行结构两种：<a class="table__body-row">（整行链接，分组赛）或 <div class="table__body-row">（瑞士轮）
  const rowRe = /<a href="(https:\/\/dltv\.org\/teams\/[^"]+)" class="table__body-row">([\s\S]*?)<\/a>|<div class="table__body-row">([\s\S]*?)(?=<div class="table__body-row">|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/g;
  for (const rm of tableHtml.matchAll(rowRe)) {
    const rowHtml = rm[2] || rm[3] || '';
    if (!rowHtml) continue;
    // div 行内可能含 <a class="table__body-row__cell">（瑞士轮队名列）
    const teamUrl = rm[1] || rowHtml.match(/<a href="(https:\/\/dltv\.org\/teams\/[^"]+)" class="table__body-row__cell[^"]*"/)?.[1] || null;
    const cells = [];
    let cc = 0;
    // cell 可能是 <div class="table__body-row__cell …"> 或 <a … class="table__body-row__cell …">（瑞士轮队名列）
    const divMarker = '<div class="table__body-row__cell';
    const anchorMarker = 'class="table__body-row__cell';
    const isAnchorAt = (index) => {
      const before = rowHtml.slice(Math.max(0, index - 400), index);
      const lastOpen = before.lastIndexOf('<');
      const tagMatch = lastOpen >= 0 ? before.slice(lastOpen + 1).match(/^\s*([a-zA-Z]+)/) : null;
      return tagMatch ? tagMatch[1].toLowerCase() === 'a' : false;
    };
    while (true) {
      const st = rowHtml.indexOf(divMarker, cc);
      const stA = rowHtml.indexOf(anchorMarker, cc);
      const isAnchor = stA >= 0 && isAnchorAt(stA);
      let stNext;
      let marker;
      if (isAnchor && (st < 0 || stA < st)) {
        stNext = stA;
        marker = anchorMarker;
      } else if (st >= 0) {
        stNext = st;
        marker = divMarker;
      } else {
        break;
      }
      const stDiv = rowHtml.indexOf(divMarker, stNext + marker.length);
      const stAnch = rowHtml.indexOf(anchorMarker, stNext + marker.length);
      const anchIsAnchor = stAnch >= 0 && isAnchorAt(stAnch);
      let nt;
      if (stDiv >= 0 && (!anchIsAnchor || stDiv < stAnch)) nt = stDiv;
      else nt = anchIsAnchor ? stAnch : -1;
      cells.push(rowHtml.slice(stNext, nt < 0 ? rowHtml.length : nt));
      cc = nt < 0 ? rowHtml.length : nt;
    }
    if (cells.length === 0) continue;
    const texts = cells.map((c) => cleanText(c));
    const nameM = rowHtml.match(/class="cell__name">\s*<div>([\s\S]*?)<\/div>[\s\S]*?cell__name-text">([\s\S]*?)<\/div>/);
    const logo = pickLogo(rowHtml);
    const tone = rowTone(rowHtml);
    // 排名取 cell__coloured 内容（避免被链接文本污染）
    const rankRaw = rowHtml.match(/class="cell__coloured"[^>]*>\s*([\s\S]*?)\s*<\/div>/)?.[1];
    const rank = rankRaw ? cleanText(rankRaw) : texts[0] || '';
    // 列布局由表头决定：
    //  - 双栏分组（Series/Maps/Points）：[rank, team, record, maps, points]
    //  - 单循环（Maps/Points，无 Series，中间可能留空列）：[rank, team, (空), maps, points]
    //  - 瑞士轮（Matches）：[rank, team, record]
    const hasSeries = /series|战绩/i.test(heads.join(' '));
    const hasMaps = /maps|图/i.test(heads.join(' '));
    const isSwiss = /matches|对阵/i.test(heads.join(' ')) && !hasSeries && !hasMaps;
    const last = texts.length - 1;
    let record = '';
    let maps = '';
    let points = '';
    if (hasSeries) {
      record = texts[2] || '';
      maps = texts[3] || '';
      points = texts[4] || '';
    } else if (isSwiss) {
      record = texts[2] || '';
    } else if (hasMaps) {
      // 单循环：末列 Points，前一列 Maps
      points = texts[last] || '';
      maps = texts[last - 1] || '';
    }
    rows.push({
      teamUrl: teamUrl || null,
      team: nameM ? cleanText(nameM[1]) : texts[1] || '',
      country: nameM ? cleanText(nameM[2]) : '',
      logo: logo ? toAbsoluteAssetUrl(logo) : null,
      position: rank,
      record,
      maps,
      points,
      // DLTV 深绿(#163819) = 直接晋级；蓝/青系 = 晋级候选；无着色时退化前 3 名推断。
      advance: tone
        ? /^#163819$/.test(tone) || /^(?:#f1f8e9|#e8f5e9|#dff5e1|#e6f4ea|#dcedc8|#c8e6c9|#a5d6a7|#81c784|#4caf50|#43a047|#388e3c|#237a70|#6d83b3)/.test(tone)
        : Number(rank) <= 3 && rank !== '',
    });
  }
  return { name: cleanText(name), heads, rows };
}

/** 判断位置是否为真正的表格容器 <div class="table" / <div class="table mb-4">（排除 table__head 等内部类）。 */
function isTableContainer(block, index) {
  const after = block.slice(index + '<div class="table'.length, index + '<div class="table'.length + 4);
  return after.startsWith('"') || after.startsWith(' ');
}

/** 切分 group__stage 区域内的所有 <div class="table …"> 块（跨 col-md-6 / col-6 / 直接平铺）。 */
function splitTables(block) {
  const tables = [];
  let cursor = 0;
  while (true) {
    const start = block.indexOf('<div class="table', cursor);
    if (start < 0) break;
    if (!isTableContainer(block, start)) {
      cursor = start + 10;
      continue;
    }
    let next = block.indexOf('<div class="table', start + 10);
    while (next > 0 && !isTableContainer(block, next)) {
      next = block.indexOf('<div class="table', next + 10);
    }
    const chunkEnd = next < 0 ? block.length : next;
    tables.push(block.slice(start, chunkEnd));
    cursor = chunkEnd;
  }
  return tables;
}

function parseGroupStage(html) {
  const groupStart = html.indexOf('<section class="group__stage">');
  if (groupStart < 0) return [];
  // group 区块结束：首个 playoffs section 或 matches 区
  const firstPlayoff = html.indexOf('<section class="playoffs">', groupStart);
  const matchesStart = html.indexOf('<section class="matches__scores">', groupStart);
  const ends = [firstPlayoff, matchesStart].filter((x) => x > groupStart);
  const end = ends.length > 0 ? Math.min(...ends) : html.length;
  const block = html.slice(groupStart, end);
  const groups = [];

  for (const tableHtml of splitTables(block)) {
    const parsed = parseStandingTable(tableHtml, '');
    // 跳过非积分表（如瑞士轮对阵表 R1-R5：行内无排名单元格/无队伍链接）
    if (parsed.rows.length === 0) continue;
    if (parsed.rows.every((r) => !r.teamUrl)) continue;
    const name = parsed.name || (groups.length === 0 ? 'Group Stage' : `Stage ${groups.length + 1}`);
    groups.push({ ...parsed, name });
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* playoffs 淘汰赛 bracket                                             */
/* ------------------------------------------------------------------ */

function parsePlayoffSection(block, sectionTitle, teamBySlug) {
  const rounds = [];
  const colRe = /<div class="playoffs__box-row__col[^"]*">([\s\S]*?)(?=<div class="playoffs__box-row__col|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/g;
  for (const cm of block.matchAll(colRe)) {
    const colHtml = cm[1];
    const headRaw = colHtml.match(/<div class="col__head">\s*([\s\S]*?)\s*<\/div>/)?.[1];
    const roundName = headRaw ? cleanText(headRaw) : '';
    const matches = [];
    const serieRe = /<a href="(https:\/\/dltv\.org\/matches\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    for (const sm of colHtml.matchAll(serieRe)) {
      const [leftSlug, rightSlug] = matchUrlTeamSlugs(sm[1], teamBySlug);
      const teams = [];
      let sc = 0;
      while (true) {
        const st = sm[2].indexOf('<div class="col__serie-teams__item"', sc);
        if (st < 0) break;
        const nt = sm[2].indexOf('<div class="col__serie-teams__item"', st + 10);
        const itemRaw = sm[2].slice(st, nt < 0 ? sm[2].length : nt);
        sc = nt < 0 ? sm[2].length : nt;
        const logo = pickLogo(itemRaw);
        const name = cleanText(itemRaw.match(/class="name[^"]*">([\s\S]*?)<\/div>/)?.[1]);
        const slug = teams.length === 0 ? leftSlug : rightSlug;
        teams.push({
          logo: logo ? toAbsoluteAssetUrl(logo) : null,
          name: slug && teamBySlug.get(slug) ? teamBySlug.get(slug) : name,
          slug,
          score: cleanText(itemRaw.match(/class="score[^"]*">([\s\S]*?)<\/div>/)?.[1]),
          winner: /class="score text-red"/.test(itemRaw),
        });
      }
      matches.push({ url: sm[1], date: cleanText(sm[2].match(/data-moment="DD">([^<]+)<\/div>/)?.[1] || ''), teams });
    }

    // 无表头但含比赛的列 = Grand Final 赛果（DLTV 决赛列常无 head，比赛实体在最后一行）
    if (!roundName && matches.length > 0) {
      const gf = rounds.find((r) => /grand final/i.test(r.round));
      if (gf) {
        gf.matches.push(...matches);
      } else {
        rounds.push({ round: `${sectionTitle} Grand Final (bo5)`, matches });
      }
      continue;
    }
    if (!roundName) continue;
    rounds.push({ round: roundName, matches });
  }
  return rounds;
}

function parsePlayoffs(html, teamBySlug) {
  // 支持多个 playoffs section（如 Blast 的 Play-in + Playoffs 两个淘汰赛区块）
  const playoffSections = [...html.matchAll(/<section class="playoffs">([\s\S]*?)(?=<section class="playoffs">|<section class="group__stage">|<section class="matches__scores">|<\/main>|<\/body>)/g)];
  if (playoffSections.length === 0) return [];
  const rounds = [];
  for (const sm of playoffSections) {
    const block = sm[1];
    // 标题必须出现在 playoffs__box 之前（紧邻 section 开头），排除后续无关 section 的 card__title
    const boxIdx = block.indexOf('playoffs__box');
    const headArea = boxIdx > 0 ? block.slice(0, boxIdx) : block;
    const titleMatch = headArea.match(/<div class="card__title">([\s\S]*?)<\/div>/);
    const title = titleMatch ? cleanText(titleMatch[1]) : '';
    const sectionRounds = parsePlayoffSection(block, title, teamBySlug);
    for (const r of sectionRounds) {
      // Play-in（晋级赛）轮次加前缀，与主淘汰赛轮次区分；主 Playoffs 不加
      if (title && !/grand final/i.test(r.round) && !/^playoffs/i.test(title)) {
        r.round = `${title} ${r.round}`;
      }
      // 多个空 GF 占位轮合并为一个（DLTV 常有两个 "Grand Final" 轮：占位 + 赛果）
      const existingGf = rounds.find((x) => /^grand final/i.test(x.round) && x.matches.length > 0);
      if (/grand final/i.test(r.round) && existingGf && r.matches.length === 0) {
        continue;
      }
      rounds.push(r);
    }
  }
  return rounds;
}

/* ------------------------------------------------------------------ */
/* 战队 slug 还原（比赛行的缩写 tag → 官方全名 + 跳转 slug）              */
/* ------------------------------------------------------------------ */

function slugFromTeamUrl(url) {
  const match = String(url || '').match(/\/teams\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 参赛队伍 + 小组赛积分榜 → slug → 官方全名 映射。 */
function buildTeamBySlug(participants, groups) {
  const map = new Map();
  for (const p of participants || []) {
    const slug = slugFromTeamUrl(p.teamUrl);
    if (slug && p.name) map.set(slug, p.name);
  }
  for (const g of groups || []) {
    for (const row of g.rows || []) {
      const slug = slugFromTeamUrl(row.teamUrl);
      if (slug && row.team && !map.has(slug)) map.set(slug, row.team);
    }
  }
  return map;
}

/**
 * 从 DLTV match URL 还原对阵双方 slug。URL 末段形如
 * <teamA>-vs-<teamB>-<eventSlug>（如 .../427538/no-hoodwink-vs-zero-tenacity-epl-masters-1）。
 * 两侧各自在已知 slug 集合里做「最长前缀」匹配，剥掉事件后缀；未知（TBD 等）返回 null。
 */
function matchUrlTeamSlugs(matchUrl, teamBySlug) {
  if (!matchUrl || !teamBySlug || teamBySlug.size === 0) return [null, null];
  const part = String(matchUrl || '').split('/').pop() || '';
  const vsIdx = part.indexOf('-vs-');
  if (vsIdx < 0) return [null, null];
  const longestKnownPrefix = (candidate) => {
    let best = null;
    for (const slug of teamBySlug.keys()) {
      if (candidate === slug || candidate.startsWith(`${slug}-`)) {
        if (!best || slug.length > best.length) best = slug;
      }
    }
    return best;
  };
  return [longestKnownPrefix(part.slice(0, vsIdx)), longestKnownPrefix(part.slice(vsIdx + 4))];
}

/* ------------------------------------------------------------------ */
/* matches 比赛（live/upcoming 区 + finished 区）                       */
/* ------------------------------------------------------------------ */

function parseMatchRows(block, teamBySlug) {
  const rows = [];
  for (const m of block.matchAll(/<a href="(https:\/\/dltv\.org\/matches\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const row = m[2];
    const cells = [];
    let cc = 0;
    while (true) {
      const st = row.indexOf('<div class="table__body-row__cell', cc);
      if (st < 0) break;
      const nt = row.indexOf('<div class="table__body-row__cell', st + 10);
      cells.push(row.slice(st, nt < 0 ? row.length : nt));
      cc = nt < 0 ? row.length : nt;
    }
    const logo = (block) => {
      const raw = block.match(/data-theme-dark="([^"]+)"/)?.[1];
      return raw ? toAbsoluteAssetUrl(raw) : null;
    };
    const leftName = cells[0]?.match(/cell__name">([\s\S]*?)<\/div>/)?.[1];
    const centerRaw = cells[1] || '';
    const scoreMatch = centerRaw.match(/<div class="score">([\s\S]*?)<\/div>/);
    const center = scoreMatch
      ? cleanText(scoreMatch[1]).replace(/\s+/g, ' ')
      : centerRaw.match(/data-moment="HH:mm">([^<]+)</)?.[1] || '';
    const rightName = cells[2]?.match(/cell__name">([\s\S]*?)<\/div>/)?.[1];
    const [leftSlug, rightSlug] = matchUrlTeamSlugs(m[1], teamBySlug);
    const leftTag = cleanText(leftName);
    const rightTag = cleanText(rightName);
    rows.push({
      url: m[1],
      left: leftSlug && teamBySlug.get(leftSlug) ? teamBySlug.get(leftSlug) : leftTag,
      leftSlug,
      leftLogo: logo(cells[0] || ''),
      center,
      isLive: /label__danger">Live/.test(centerRaw),
      right: rightSlug && teamBySlug.get(rightSlug) ? teamBySlug.get(rightSlug) : rightTag,
      rightSlug,
      rightLogo: logo(cells[2] || ''),
    });
  }
  return rows;
}

function parseMatches(html, teamBySlug) {
  const firstTable = html.indexOf('class="matches__scores-table"');
  if (firstTable < 0) return { matches: [], finishedMatches: [] };
  const finishedMark = '<div class="card__title mt-4">Finished matches</div>';
  const finishedIdx = html.indexOf(finishedMark, firstTable);
  const mainBlock = finishedIdx >= 0 ? html.slice(firstTable, finishedIdx) : html.slice(firstTable);
  const finishedBlock = finishedIdx >= 0 ? html.slice(finishedIdx) : '';
  return {
    matches: parseMatchRows(mainBlock, teamBySlug),
    finishedMatches: parseMatchRows(finishedBlock, teamBySlug),
  };
}

/* ------------------------------------------------------------------ */
/* participants 参赛队伍                                                */
/* ------------------------------------------------------------------ */

function parseParticipants(html) {
  const start = html.indexOf('<section class="event__participants">');
  // participants 区块后是 group__stage（当前 DLTV 结构），不能用 prizepool 当结束（prizepool 在其前面）。
  const end = html.indexOf('<section class="group__stage">', start);
  if (start < 0) return [];
  const block = html.slice(start, end < 0 ? html.length : end);
  const teams = [];
  let cursor = 0;
  while (true) {
    const teamStart = block.indexOf('<div class="event__participants-teams__team">', cursor);
    if (teamStart < 0) break;
    const nextStart = block.indexOf('<div class="event__participants-teams__team">', teamStart + 10);
    const teamHtml = block.slice(teamStart, nextStart < 0 ? block.length : nextStart);
    cursor = nextStart < 0 ? block.length : nextStart;
    const name = teamHtml.match(/class="title[^"]*">([\s\S]*?)<\/a>/)?.[1];
    if (!name) continue;
    const teamUrl = teamHtml.match(/<a href="(https:\/\/dltv\.org\/teams\/[^"]+)"/)?.[1] || null;
    const logo = teamHtml.match(/class="logo" data-theme-light="([^"]+)"/)?.[1] || null;
    const invite = teamHtml.match(/class="invite[^"]*">([\s\S]*?)<\/div>/)?.[1];
    const players = [...teamHtml.matchAll(/class="players__item-title[^"]*">([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]));
    teams.push({
      name: cleanText(name),
      teamUrl,
      logo: logo ? toAbsoluteAssetUrl(logo) : null,
      invite: cleanText(invite),
      players,
    });
  }
  return teams;
}

/* ------------------------------------------------------------------ */
/* prize pool 奖金池                                                    */
/* ------------------------------------------------------------------ */

function parsePrizePool(html) {
  const start = html.indexOf('<section class="event__prizepool">');
  if (start < 0) return [];
  const end = html.indexOf('</section>', start);
  const block = html.slice(start, end < 0 ? html.length : end);
  const prizes = [];
  const seen = new Set();
  // 逐块索引切片，避免跨块贪婪匹配把 bronze 与后续 mobile 重复块的 Place 错配。
  let cursor = 0;
  while (true) {
    const blockStart = block.indexOf('class="event__prizepool-block', cursor);
    if (blockStart < 0) break;
    const nextStart = block.indexOf('class="event__prizepool-block', blockStart + 10);
    const piece = block.slice(blockStart, nextStart < 0 ? block.length : nextStart);
    cursor = nextStart < 0 ? block.length : nextStart;

    const tone = piece.match(/event__prizepool-block\s+([a-z]+)/)?.[1];
    const title = piece.match(/<[a-z]+\s[^>]*class="title[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1] || piece.match(/<[a-z]+\s+class="title[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1];
    const prize = piece.match(/<[a-z]+\s[^>]*class="prize[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1] || piece.match(/<[a-z]+\s+class="prize[^"]*"[^>]*>([\s\S]*?)<\/[a-z]+>/)?.[1];
    const place = piece.match(/<strong[^>]*>([\s\S]*?)<\/strong>\s*<span>Place<\/span>/)?.[1];
    if (!tone || !title || !prize || !place) continue;
    const key = `${cleanText(place)}|${cleanText(prize)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prizes.push({ tone, team: cleanText(title), prize: cleanText(prize), place: cleanText(place) });
  }
  return prizes;
}

/* ------------------------------------------------------------------ */
/* 统一入口                                                            */
/* ------------------------------------------------------------------ */

export function parseDltvEventDetailPage(raw, slug) {
  const html = String(raw || '');
  const { overview, live, heroImage } = parseOverview(html);
  const participants = parseParticipants(html);
  const groups = parseGroupStage(html);
  const teamBySlug = buildTeamBySlug(participants, groups);
  return {
    slug,
    title: cleanText(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || slug),
    live,
    heroImage,
    overview,
    about: parseAbout(html),
    groups,
    playoffRounds: parsePlayoffs(html, teamBySlug),
    matches: parseMatches(html, teamBySlug),
    participants,
    prizePool: parsePrizePool(html),
  };
}
