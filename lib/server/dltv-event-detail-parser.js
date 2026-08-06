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
  if (start < 0) return [];
  const block = html.slice(start, groupStart < 0 ? html.length : groupStart);
  return [...block.matchAll(/<p class="ds-markdown-paragraph">([\s\S]*?)<\/p>/g)]
    .map((m) => cleanText(m[1]))
    .filter((text) => text.length > 0);
}

/* ------------------------------------------------------------------ */
/* group stage 小组赛积分榜                                             */
/* ------------------------------------------------------------------ */

function parseGroupStage(html) {
  const groupStart = html.indexOf('<section class="group__stage">');
  const playoffsStart = html.indexOf('<section class="playoffs">');
  if (groupStart < 0) return [];
  const block = html.slice(groupStart, playoffsStart < 0 ? html.length : playoffsStart);
  const groups = [];

  let cursor = 0;
  while (true) {
    const tableStart = block.indexOf('<div class="col-md-6">', cursor);
    if (tableStart < 0) break;
    const nextStart = block.indexOf('<div class="col-md-6">', tableStart + 10);
    const tableHtml = block.slice(tableStart, nextStart < 0 ? block.length : nextStart);
    cursor = nextStart < 0 ? block.length : nextStart;

    const name = tableHtml.match(/class="table__head-item[^"]*big-text">([\s\S]*?)<\/div>/)?.[1];
    const heads = [...tableHtml.matchAll(/class="table__head-item[^"]*">([\s\S]*?)<\/div>/g)].map((m) => cleanText(m[1]));
    const rows = [];

    const rowRe = /<a href="(https:\/\/dltv\.org\/teams\/[^"]+)" class="table__body-row">([\s\S]*?)<\/a>/g;
    for (const rm of tableHtml.matchAll(rowRe)) {
      const cells = [];
      let cc = 0;
      while (true) {
        const st = rm[2].indexOf('<div class="table__body-row__cell', cc);
        if (st < 0) break;
        const nt = rm[2].indexOf('<div class="table__body-row__cell', st + 10);
        cells.push(rm[2].slice(st, nt < 0 ? rm[2].length : nt));
        cc = nt < 0 ? rm[2].length : nt;
      }
      const texts = cells.map((c) => cleanText(c));
      const nameM = rm[2].match(/class="cell__name">\s*<div>([\s\S]*?)<\/div>[\s\S]*?cell__name-text">([\s\S]*?)<\/div>/);
      const logo = pickLogo(rm[2]);
      rows.push({
        teamUrl: rm[1],
        team: nameM ? cleanText(nameM[1]) : texts[1] || '',
        country: nameM ? cleanText(nameM[2]) : '',
        logo: logo ? toAbsoluteAssetUrl(logo) : null,
        position: texts[0] || '',
        record: texts[2] || '',
        maps: texts[3] || '',
        points: texts[4] || '',
        advance: Number(texts[0]) <= 3 && texts[0] !== '',
      });
    }
    if (rows.length > 0) groups.push({ name: cleanText(name || ''), heads, rows });
  }
  return groups;
}

/* ------------------------------------------------------------------ */
/* playoffs 淘汰赛 bracket                                             */
/* ------------------------------------------------------------------ */

function parsePlayoffs(html) {
  const playoffStart = html.indexOf('<section class="playoffs">');
  const matchesStart = html.indexOf('<section class="matches__scores">');
  if (playoffStart < 0) return [];
  const block = html.slice(playoffStart, matchesStart < 0 ? html.length : matchesStart);
  const rounds = [];

  const colRe = /<div class="playoffs__box-row__col[^"]*">([\s\S]*?)(?=<div class="playoffs__box-row__col|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>)/g;
  for (const cm of block.matchAll(colRe)) {
    const colHtml = cm[1];
    const head = colHtml.match(/<div class="col__head">\s*([\s\S]*?)\s*<\/div>/)?.[1];
    if (!head) continue;
    const roundName = cleanText(head);
    const matches = [];
    const serieRe = /<a href="(https:\/\/dltv\.org\/matches\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    for (const sm of colHtml.matchAll(serieRe)) {
      const teams = [];
      let sc = 0;
      while (true) {
        const st = sm[2].indexOf('<div class="col__serie-teams__item"', sc);
        if (st < 0) break;
        const nt = sm[2].indexOf('<div class="col__serie-teams__item"', st + 10);
        const itemRaw = sm[2].slice(st, nt < 0 ? sm[2].length : nt);
        sc = nt < 0 ? sm[2].length : nt;
        const logo = pickLogo(itemRaw);
        const name = itemRaw.match(/class="name[^"]*">([\s\S]*?)<\/div>/)?.[1];
        const score = itemRaw.match(/class="score[^"]*">([\s\S]*?)<\/div>/)?.[1];
        teams.push({
          logo: logo ? toAbsoluteAssetUrl(logo) : null,
          name: cleanText(name),
          score: cleanText(score),
          winner: /class="score text-red"/.test(itemRaw),
        });
      }
      matches.push({ url: sm[1], date: cleanText(sm[2].match(/data-moment="DD">([^<]+)<\/div>/)?.[1] || ''), teams });
    }
    rounds.push({ round: roundName, matches });
  }
  return rounds;
}

/* ------------------------------------------------------------------ */
/* matches 比赛（live/upcoming 区 + finished 区）                       */
/* ------------------------------------------------------------------ */

function parseMatchRows(block) {
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
    rows.push({
      url: m[1],
      left: cleanText(leftName),
      leftLogo: logo(cells[0] || ''),
      center,
      isLive: /label__danger">Live/.test(centerRaw),
      right: cleanText(rightName),
      rightLogo: logo(cells[2] || ''),
    });
  }
  return rows;
}

function parseMatches(html) {
  const firstTable = html.indexOf('class="matches__scores-table"');
  if (firstTable < 0) return { matches: [], finishedMatches: [] };
  const finishedMark = '<div class="card__title mt-4">Finished matches</div>';
  const finishedIdx = html.indexOf(finishedMark, firstTable);
  const mainBlock = finishedIdx >= 0 ? html.slice(firstTable, finishedIdx) : html.slice(firstTable);
  const finishedBlock = finishedIdx >= 0 ? html.slice(finishedIdx) : '';
  return {
    matches: parseMatchRows(mainBlock),
    finishedMatches: parseMatchRows(finishedBlock),
  };
}

/* ------------------------------------------------------------------ */
/* participants 参赛队伍                                                */
/* ------------------------------------------------------------------ */

function parseParticipants(html) {
  const start = html.indexOf('<section class="event__participants">');
  const end = html.indexOf('<section class="event__prizepool">');
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
    const logo = teamHtml.match(/class="logo" data-theme-light="([^"]+)"/)?.[1] || null;
    const invite = teamHtml.match(/class="invite[^"]*">([\s\S]*?)<\/div>/)?.[1];
    const players = [...teamHtml.matchAll(/class="players__item-title[^"]*">([\s\S]*?)<\/span>/g)].map((m) => cleanText(m[1]));
    teams.push({
      name: cleanText(name),
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
  return {
    slug,
    title: cleanText(html.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] || slug),
    live,
    heroImage,
    overview,
    about: parseAbout(html),
    groups: parseGroupStage(html),
    playoffRounds: parsePlayoffs(html),
    matches: parseMatches(html),
    participants: parseParticipants(html),
    prizePool: parsePrizePool(html),
  };
}
