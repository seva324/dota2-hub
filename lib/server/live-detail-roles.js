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

/** 昵称归一化：小写、去所有非字母数字——去掉"医者watson"这类中文昵称前缀装饰。 */
function normalizeNick(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 按非字母数字切词（≥4 字符），用于真名/昵称的 token 匹配。 */
function tokenize(name) {
  return String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
}

/** hawk.live 选手显示名与 DLTV squad 昵称的已知差异（归一化 key → DLTV 昵称）。
 *  YSR-04E = 杨绍涵 = Erika（Team Resilience 1号位，hawk 用其赛事 ID 显示；场上
 *  打 SF/Tiny 与 1 号位吻合）。新增差异名在此补充，配合子串/token 兜底覆盖多数情况。 */
const HAWK_NAME_ALIASES = new Map([
  // key/value 均按 normalizeNick 后的格式（小写去非字母数字）。
  ['ysr04e', 'erika'],
]);

/** 宽松匹配（按优先级）：别名表 → 归一化精确 → 归一化双向子串（≥3）→ token 包含
 *  （hawk 名含 squad 名/真名任一词 ≥4 字符，如 KingJungles ⊃ jungles ← 真名
 *  "Matheus Santos Jungles Diniz"）。短名不做子串/token 匹配防误配。 */
function matchRoleKey(key, roled) {
  const norm = normalizeNick(key);
  if (!norm) return undefined;
  const alias = HAWK_NAME_ALIASES.get(norm);
  if (alias) {
    const hit = roled.get(String(alias).toLowerCase()) || roled.get(normalizeNick(alias));
    if (hit) return hit;
  }
  const exact = roled.get(norm);
  if (exact) return exact;
  if (norm.length < 3) return undefined;
  for (const [name, roleKey] of roled) {
    const nameNorm = normalizeNick(name);
    if (nameNorm.length >= 3 && (norm.includes(nameNorm) || nameNorm.includes(norm))) return roleKey;
  }
  for (const [name, roleKey] of roled) {
    for (const token of tokenize(name)) {
      if (norm.includes(token)) return roleKey;
    }
  }
  return undefined;
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
        // 存原始小写：tokenize 需要保留空格/连字符等分隔符。
        if (p.nick) byName.set(String(p.nick).toLowerCase(), roleKey);
        if (p.realName) byName.set(String(p.realName).toLowerCase(), roleKey);
      }
      if (byName.size === 0) {
        console.warn(`[live-detail-roles] squad parse empty for "${teamName}" (${slug}) — will retry next call`);
      }
      return byName;
    })();
    inflight.set(slug, task);
    task.finally(() => inflight.delete(slug));
  }

  const byName = await task;
  // 空结果不缓存：EdgeOne 出口抓 dltv 战队页间歇失败（限速/空 body），
  // 缓存空 Map 会让错误结果顶住 30min，造成位置号"时有时无"。
  if (byName.size > 0) squadCache.set(slug, { at: Date.now(), byName });
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
      const roleKey = matchRoleKey(pick.player?.name, roled);
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
