/**
 * Live detail 的位置(1~5号位)富化。
 *
 * hawk.live 的 live-detail picks 不携带选手位置。这里从 DLTV 战队页的 Active squad
 * 解析每个选手的 role(DLTV 编码 1~5),再按选手昵称匹配 hawk 上场选手,给每个 pick 附
 * 上 position(数字 1~5)与 positionLabel('N号位')。匹配失败时保留 null 交由前端兜底。
 *
 * 缓存:DLTV 战队页 squad 变化极低,内存缓存 30min + single-flight 避免轮询放大。
 */

import { parseSquadHtml, positionLabelFromRoleKey } from './dltv-squad-parser.js';

const TEAM_PAGE_URL = 'https://dltv.org/teams/';
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const squadCache = new Map(); // teamSlug -> { at, byName: Map<lowercaseName, roleKey> }
const inflight = new Map(); // teamSlug -> Promise

/** 战队名 → DLTV slug(kebab-case)。 */
function toSlug(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function fetchHtmlRaw(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Cookie: '___user__language=en',
        'Accept-Language': 'en,en-US;q=0.9',
        'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
      },
      signal: controller.signal,
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** 解析一个战队页 squad,返回 { lowercase 昵称|真名 -> roleKey };排除教练。 */
async function getSquadRoleMap(teamName) {
  const slug = toSlug(teamName);
  if (!slug) return null;

  const cached = squadCache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.byName;

  let task = inflight.get(slug);
  if (!task) {
    task = (async () => {
      const html = await fetchHtmlRaw(`${TEAM_PAGE_URL}${encodeURIComponent(slug)}`);
      const byName = new Map();
      const players = parseSquadHtml(html);
      for (const p of players) {
        if (p.isCoach || !p.roleKey) continue;
        const roleKey = Number(p.roleKey);
        if (p.nick) byName.set(String(p.nick).toLowerCase(), roleKey);
        if (p.realName) byName.set(String(p.realName).toLowerCase(), roleKey);
      }
      return byName;
    })();
    inflight.set(slug, task);
    task.finally(() => inflight.delete(slug));
  }

  const byName = await task;
  squadCache.set(slug, { at: Date.now(), byName });
  return byName;
}

/**
 * 富化 live-detail payload:给每个 map 的 picks 附 position(1~5)与 positionLabel。
 * Radiant/Dire 归属由各 map 的 isTeam1Radiant 决定;队伍 → DLTV squad role 按选手名匹配。
 */
export async function enrichLiveDetailPositions(payload) {
  if (!payload?.maps || !payload?.team1?.name || !payload?.team2?.name) return payload;
  const [team1Roles, team2Roles] = await Promise.all([
    getSquadRoleMap(payload.team1.name).catch(() => null),
    getSquadRoleMap(payload.team2.name).catch(() => null),
  ]);
  const roles = { team1: team1Roles, team2: team2Roles };
  for (const map of payload.maps || []) {
    const isTeam1Radiant = map.isTeam1Radiant !== false;
    const radiantKey = isTeam1Radiant ? 'team1' : 'team2';
    const direKey = isTeam1Radiant ? 'team2' : 'team1';
    for (const pick of map.picks || []) {
      const teamKey = pick.isRadiant ? radiantKey : direKey;
      const roled = roles[teamKey];
      if (!roled) continue;
      const key = String(pick.player?.name || '').toLowerCase();
      const roleKey = key ? roled.get(key) : undefined;
      if (roleKey) {
        pick.position = Number(roleKey);
        pick.positionLabel = positionLabelFromRoleKey(roleKey);
      }
    }
  }
  return payload;
}

/** 供运维/测试清空缓存。 */
export function clearSquadRolesCache() {
  squadCache.clear();
  inflight.clear();
}
