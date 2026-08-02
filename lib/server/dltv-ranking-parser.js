/**
 * DLTV 战队排名解析器（dltv.org/ranking）
 *
 * 页面结构（2026-08-02 实测）：
 * - 榜单：`<div class="ranking__list-case">` 下 50 个 `<div class="ranking__list-case__item">`
 * - 每队：#N 序号、`item__info-logo` 队徽（data-theme-light/dark）、`item__info-team__name` 队名
 * - 选手：`item__team-case__item` × 5，`photo`（data-theme-light=选手照片）、
 *   `photo__rank-num` 天梯分、`name__flag` 国旗、`name__name` 选手名
 * - 图片为相对路径（/uploads/...），需拼 https://dltv.org；队徽可能带 .webp 后缀
 */

const DLTV_BASE_URL = 'https://dltv.org';

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

function extractAttr(tag, attribute) {
  const match = String(tag || '').match(new RegExp(`${attribute}=("([^"]*)"|'([^']*)')`, 'i'));
  return match?.[2] || match?.[3] || null;
}

function resolveDltvUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  try {
    return new URL(raw, DLTV_BASE_URL).toString();
  } catch {
    return null;
  }
}

function extractFlagCode(style = '') {
  const match = String(style).match(/flags\/4x3\/([a-z]{2})\.svg/i);
  return match?.[1] ?? null;
}

function parseTeamBlock(block) {
  const rankMatch = block.match(/item__info-num">\s*#(\d+)/);
  if (!rankMatch) return null;
  const rank = Number.parseInt(rankMatch[1], 10);
  if (!Number.isFinite(rank)) return null;

  const logoTag = block.match(/class="item__info-logo"[^>]*>/);
  const logo = logoTag ? resolveDltvUrl(extractAttr(logoTag[0], 'data-theme-dark') || extractAttr(logoTag[0], 'data-theme-light')) : null;

  const nameMatch = block.match(/item__info-team__name"[^>]*>\s*<div class="name">([^<]*)</);
  if (!nameMatch) return null;
  const name = decodeHtml(nameMatch[1]).trim();
  if (!name) return null;

  const urlMatch = block.match(/<a href="(https:\/\/dltv\.org\/teams\/[^"]+)" class="item__info-team__name">/);
  const teamUrl = urlMatch?.[1] ?? null;

  const playerBlocks = block.match(/<a href="(https:\/\/dltv\.org\/players\/[^"]+)" class="item__team-case__item">[\s\S]*?(?=<a href="https:\/\/dltv\.org\/players\/|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>|$)/g) || [];
  const players = [];
  for (const pb of playerBlocks) {
    if (players.length >= 5) break;
    const playerUrl = pb.match(/<a href="([^"]+)" class="item__team-case__item">/)?.[1] ?? null;

    const photoMatch = pb.match(/<div class="photo" data-theme-light="([^"]+)" data-theme-dark="([^"]+)"/);
    const rawPhoto = photoMatch ? (photoMatch[2] || photoMatch[1]) : null;
    // DLTV 用 /images/desktop/empty/player_dark_new.svg 表示无照片，过滤掉让前端走 fallback
    const photo = rawPhoto && !rawPhoto.includes('/images/desktop/empty/')
      ? resolveDltvUrl(rawPhoto)
      : null;

    const rankMatch2 = pb.match(/photo__rank-num">\s*(\d+)/);
    const soloRank = rankMatch2 ? Number.parseInt(rankMatch2[1], 10) : null;

    const flagMatch = pb.match(/name__flag[^>]*style="background-image: url\('?([^'")]+)'?\)/);
    const flag = flagMatch ? extractFlagCode(flagMatch[1]) : null;

    const nameMatch2 = pb.match(/name__name[^>]*>([^<]*)</);
    const playerName = nameMatch2 ? decodeHtml(nameMatch2[1]).trim() : null;
    if (!playerName) continue;

    players.push({
      name: playerName,
      photo,
      soloRank: Number.isFinite(soloRank) ? soloRank : null,
      country: flag,
      playerUrl,
    });
  }

  return { rank, name, logo, teamUrl, players };
}

/**
 * 解析 DLTV ranking 页面 HTML。
 * @returns {Array<{rank:number,name:string,logo:string|null,teamUrl:string|null,players:Array}>}
 */
export function parseDltvRanking(html) {
  const raw = String(html || '');
  if (!raw.includes('ranking__list')) return [];

  const blocks = raw.match(/<div class="ranking__list-case__item[\s\S]*?(?=<div class="ranking__list-case__item|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/section>|$)/g) || [];
  const teams = [];
  for (const block of blocks) {
    const team = parseTeamBlock(block);
    if (team) teams.push(team);
  }
  return teams.sort((a, b) => a.rank - b.rank);
}
