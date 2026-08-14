/**
 * DLTV 战队页 Active squad 解析(共享)。
 * 供 team-detail / live-detail 复用:从战队页 <section class="squad"> 解析每个选手的
 * 昵称/真名/国旗/天梯分/位置码(roleKey,DLTV 编码 1~5)/角色。
 *
 * DLTV 位置码:1=Core(1号位), 2=Mid(2号位), 3=Offlane(3号位),
 *            4=Support(4号位), 5=Full Support(5号位)
 */

const SQUAD_ROLE_LABEL = { 1: 'Core', 2: 'Mid', 3: 'Offlane', 4: 'Support', 5: 'Full Support' };

/** roleKey(DLTV 编码)→ 中文位置号标签,如 1→'1号位',3→'3号位';无/非法→null。 */
export function positionLabelFromRoleKey(roleKey) {
  const n = Number(roleKey);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return `${n}号位`;
}

/** 从战队页 HTML 解析 Active squad(昵称/真名/照片/国旗/天梯分/角色/教练)。 */
export function parseSquadHtml(html) {
  const squadStart = html.indexOf('<section class="squad">');
  if (squadStart < 0) return [];
  const squadHtml = html.slice(squadStart, html.indexOf('</section>', squadStart) + 10);
  const players = [];
  const itemRe = /<a href="https:\/\/dltv\.org\/players\/([^"]+)" class="squad__box-item">([\s\S]*?)<\/a>/g;
  for (const m of squadHtml.matchAll(itemRe)) {
    const item = m[2];
    // 昵称：flag 后第一个 <span>
    const nickMatch = item.match(/<div class="flag"[^>]*>[\s\S]*?<\/div>\s*<span>([\s\S]*?)<\/span>/);
    const nick = nickMatch ? nickMatch[1].trim() : item.match(/<span>([\s\S]*?)<\/span>/)?.[1]?.trim() || '';
    // 真名：name 区块第二个 div
    const real = item.match(/<\/span>\s*<\/div>\s*<div>([\s\S]*?)<\/div>/)?.[1]?.trim() || '';
    const photo = item.match(/data-theme-light="([^"]+)"/)?.[1] || '';
    // 国旗：直接取 DLTV 完整 URL（不依赖前端映射表）
    const flagUrl = item.match(/background-image: url\('([^']*flags\/4x3\/[^']+)'\)/)?.[1] || '';
    const flagCode = flagUrl.match(/flags\/4x3\/([a-z]+)\.svg/)?.[1] || '';
    const rankRaw = item.match(/rank__num">(\d+)</)?.[1];
    const roleBg = item.match(/role__bg-(\d+)/)?.[1];
    const isCoach = /class="coach"/.test(item);
    const playerIdRaw = item.match(/data-player-id="(\d+)"/)?.[1];
    if (!nick) continue;
    players.push({
      nick,
      realName: real,
      photo: photo ? `https://dltv.org${String(photo).startsWith('/') ? '' : '/'}${photo}` : '',
      flag: flagUrl ? `https://dltv.org${flagUrl.startsWith('/') ? '' : '/'}${flagUrl}` : '',
      flagCode,
      rank: rankRaw ? Number(rankRaw) : null,
      roleKey: roleBg || '',
      role: roleBg ? (SQUAD_ROLE_LABEL[Number(roleBg)] || `位置 ${roleBg}`) : isCoach ? 'Coach' : '',
      isCoach,
      playerId: playerIdRaw ? Number(playerIdRaw) : null,
      slug: m[1] || '',
    });
  }
  return players;
}
