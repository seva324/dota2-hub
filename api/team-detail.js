/**
 * Team Detail API
 * Data: DLTV official API (https://dltv.org/api/v1/teams/:slug/recent_maps + /stats)
 * 归一化为 team-falcons.html 的 TEAM_DATA 结构（档案/快速统计/数据总览/常用英雄/对标/最近比赛/下一场）。
 * 缓存：内存 TTL 300s + single-flight（与 dltv-ranking-service 同款模式）。
 */

import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import { getDltvUpcoming } from '../lib/server/dltv-matches-service.js';

const DLTV_API_BASE = 'https://dltv.org/api/v1';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

const memoryCache = new Map();
let inFlight = null;

function buildJinaUrl(url) {
  return `https://r.jina.ai/http://${String(url).replace(/^https?:\/\//i, '')}`;
}

function buildTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

async function fetchJson(url, timeoutMs, fetchImpl = fetch) {
  const attempts = [
    { url, type: 'direct', timeoutMs, headers: {} },
    {
      url: buildJinaUrl(url),
      type: 'jina',
      timeoutMs: timeoutMs + 3000,
      headers: { 'X-Return-Format': 'json', 'X-No-Cache': 'true' },
    },
  ];
  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.timeoutMs);
    try {
      const res = await fetchImpl(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'application/json,text/html,text/plain',
          ...attempt.headers,
        },
        signal: timeout.signal,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (String(text || '').trim().length < 40) continue;
      try {
        return { payload: JSON.parse(text), sourceType: attempt.type };
      } catch {
        continue;
      }
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }
  return { payload: null, sourceType: 'failed' };
}

function normalizeTeamName(value) {
  return String(value || '').trim().toLowerCase();
}

// —— 归一化 recent_maps：最近比赛 + 对标 + 常用英雄 ——
function normalizeRecentMaps(maps, heroes, teamSlug) {
  const teamId = null; // 由调用方注入
  void teamId;
  const recentMatches = [];
  const seen = new Map();
  const pickCounts = new Map();
  const banCounts = new Map();
  const pickWin = new Map();
  const pickTotal = new Map();

  for (const m of maps || []) {
    const series = m.series || {};
    const isFalconsSide = (team) => {
      const slug = String(team?.slug || '').toLowerCase();
      return slug === teamSlug.toLowerCase();
    };
    const firstTeam = series.first_team || {};
    const secondTeam = series.second_team || {};
    const isRadiant = isFalconsSide(firstTeam);
    const isDire = isFalconsSide(secondTeam);
    if (!isRadiant && !isDire) continue;
    const opp = isRadiant ? secondTeam : firstTeam;
    const won = m.winner === (isRadiant ? 'radiant' : 'dire');
    const myScore = isRadiant ? m.radiant_score : m.dire_score;
    const oppScore = isRadiant ? m.dire_score : m.radiant_score;

    // 使用英雄（本队 picks）
    const myPicks = (isRadiant ? m.radiant_picks : m.dire_picks) || [];
    const oppPicks = (isRadiant ? m.dire_picks : m.radiant_picks) || [];
    const myBans = (isRadiant ? m.radiant_bans : m.dire_bans) || [];
    const oppBans = (isRadiant ? m.dire_bans : m.radiant_bans) || [];
    const heroName = (id) => heroes?.[String(id)]?.title || heroes?.[id]?.title || null;
    const toHeroId = (entry) => {
      if (entry === null || entry === undefined) return null;
      if (typeof entry === 'object') return entry.hero_id ?? entry.heroId ?? null;
      return entry;
    };

    for (const entry of myPicks) {
      const hid = toHeroId(entry);
      if (hid === null || hid === undefined) continue;
      const name = heroName(hid);
      if (!name) continue;
      pickCounts.set(name, (pickCounts.get(name) || 0) + 1);
      pickTotal.set(name, (pickTotal.get(name) || 0) + 1);
      if (won) pickWin.set(name, (pickWin.get(name) || 0) + 1);
    }
    for (const entry of oppPicks) {
      const hid = toHeroId(entry);
      if (hid === null || hid === undefined) continue;
      const name = heroName(hid);
      if (!name) continue;
      banCounts.set(name, (banCounts.get(name) || 0) + 1);
    }
    // 禁用：两队的 bans 都会统计（本队 ban + 对手 ban 都算禁用率）
    for (const entry of [...myBans, ...oppBans]) {
      const hid = toHeroId(entry);
      if (hid === null || hid === undefined) continue;
      const name = heroName(hid);
      if (!name) continue;
      banCounts.set(name, (banCounts.get(name) || 0) + 1);
    }

    const heroNames = myPicks.map((entry) => heroName(toHeroId(entry))).filter(Boolean);
    const slug = opp.slug || 'opponent';
    const rec = seen.get(slug) || {
      opponent: opp.title || 'Opponent',
      oppSlug: slug,
      oppLogo: opp.image ? `https://dltv.org${String(opp.image).startsWith('/') ? '' : '/'}${opp.image}` : '',
      series: 0,
      seriesWins: 0,
      maps: 0,
      mapsWon: 0,
      mapsLost: 0,
      last: null,
    };
    rec.series = 1;
    rec.maps += 1;
    if (won) rec.mapsWon += 1;
    else rec.mapsLost += 1;
    rec.last = m.started_at ? m.started_at.slice(0, 10) : rec.last;
    seen.set(slug, rec);

    recentMatches.push({
      date: m.started_at ? m.started_at.slice(0, 10) : '',
      event: series.slug ? String(series.slug).replaceAll('-', ' ') : '',
      opponent: opp.title || 'Opponent',
      oppSlug: slug,
      oppLogo: opp.image ? `https://dltv.org${String(opp.image).startsWith('/') ? '' : '/'}${opp.image}` : '',
      score: `${myScore ?? '-'} : ${oppScore ?? '-'}`,
      won,
      durationMin: Math.round((m.duration || 0) / 60),
      heroes: heroNames,
    });
  }

  const h2h = Array.from(seen.values()).map((r) => {
    const total = Math.max(r.maps, 1);
    return {
      opponent: r.opponent,
      slug: r.oppSlug,
      logo: r.oppLogo,
      series: r.series,
      seriesWins: r.mapsWon > r.mapsLost ? 1 : 0,
      maps: r.maps,
      mapsWon: r.mapsWon,
      mapsLost: r.mapsLost,
      last: r.last,
      winRate: Math.round((r.mapsWon / total) * 100) + '%',
    };
  });

  const toHeroRow = (name) => {
    const maps = pickTotal.get(name) || 0;
    const wins = pickWin.get(name) || 0;
    const hero = Object.values(heroes || {}).find((h) => h.title === name);
    return {
      name,
      img: hero?.image ? `https://dltv.org${String(hero.image).startsWith('/') ? '' : '/'}${hero.image}` : '',
      maps,
      rate: `${((maps / Math.max(recentMatches.length, 1)) * 100).toFixed(2)}%`,
      wins,
      losses: Math.max(maps - wins, 0),
    };
  };
  const topPicks = Array.from(pickCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => toHeroRow(name));
  const topBans = Array.from(banCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => {
      const hero = Object.values(heroes || {}).find((h) => h.title === name);
      return {
        name,
        img: hero?.image ? `https://dltv.org${String(hero.image).startsWith('/') ? '' : '/'}${hero.image}` : '',
        rate: `${((banCounts.get(name) / Math.max(recentMatches.length, 1)) * 100).toFixed(2)}%`,
        mapsVs: banCounts.get(name),
      };
    });

  return {
    recentMatches,
    h2h,
    draftStats: {
      period: '近 3 个月',
      firstPick: topPicks[0] ? { name: topPicks[0].name, count: topPicks[0].maps, label: '首选次数' } : null,
      firstBan: topBans[0] ? { name: topBans[0].name, count: topBans[0].mapsVs, label: '首禁次数' } : null,
      topPicks,
      topBans,
    },
  };
}

// —— 归一化 stats：数据总览 ——
function normalizeStats(entries) {
  const a = entries && entries.length ? entries[0] : {};
  const maps = Number(a.maps_total || 0);
  const wins = Number(a.wins_total || 0);
  return {
    period: '近 3 个月 (date_range=2)',
    aggregate: {
      maps,
      wins,
      win_rate: Number(a.win_rate || 0),
      avg_kills: Number(a.kills_total || 0) / Math.max(maps, 1),
      avg_deaths: Number(a.deaths_total || 0) / Math.max(maps, 1),
      avg_assists: Math.round(Number(a.assists_total || 0) / Math.max(maps, 1)),
      first_blood_rate: Number(a.first_blood_rate || 0),
      first_ten_rate: Number(a.first_ten_rate || 0),
      win_first_blood_rate: Number(a.win_first_blood_rate || 0),
      win_first_ten_rate: Number(a.win_first_ten_rate || 0),
      avg_time_min: Math.round((Number(a.total_duration || 0) / 60) / Math.max(maps, 1)),
    },
  };
}

// —— 从排名页/本地 teams 拿 slug ——
function slugFromName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// —— 归一化 upcoming：过滤本队下一场 ——
function normalizeNextMatch(upcoming, teamName, teamTag) {
  const normalizedName = normalizeTeamName(teamName);
  const normalizedTag = normalizeTeamName(teamTag);
  const upcomingList = Array.isArray(upcoming) ? upcoming : [];
  const match = upcomingList.find((row) => {
    const rad = normalizeTeamName(row.radiantName);
    const dire = normalizeTeamName(row.direName);
    return rad === normalizedName || rad === normalizedTag || dire === normalizedName || dire === normalizedTag;
  });
  if (!match) return null;
  const isRadiant = normalizeTeamName(match.radiantName) === normalizedName || normalizeTeamName(match.radiantName) === normalizedTag;
  const myLogo = isRadiant ? match.radiantLogo : match.direLogo;
  const oppName = isRadiant ? match.direName : match.radiantName;
  const oppLogo = isRadiant ? match.direLogo : match.radiantLogo;
  const toUrl = (p) => (p ? (String(p).startsWith('http') ? p : `https://dltv.org${String(p).startsWith('/') ? '' : '/'}${p}`) : '');
  return {
    event: match.tournament || '',
    opponent: oppName,
    opponentSlug: slugFromName(oppName),
    opponentLogo: toUrl(oppLogo),
    oppLogo: toUrl(oppLogo),
    format: match.bestOf || 'BO3',
    scheduledAt: match.timestamp ? new Date(match.timestamp * 1000).toISOString() : '',
    stage: match.stage || '',
    note: '来自 DLTV 官方赛程数据；由后端定时刷新',
    myLogo: toUrl(myLogo),
  };
}

async function fetchTeamDetail(teamSlug, teamName, teamTag, fetchImpl) {
  const base = `${DLTV_API_BASE}/teams/${encodeURIComponent(teamSlug)}`;
  const [rmResult, statsResult, upcomingResult] = await Promise.all([
    fetchJson(`${base}/recent_maps?date_range=2&event_type=&hero_id=0`, FETCH_TIMEOUT_MS, fetchImpl),
    fetchJson(`${base}/stats?date_range=2&event_type=`, FETCH_TIMEOUT_MS, fetchImpl),
    getDltvUpcoming(fetchImpl).then(
      (r) => ({ payload: r.upcoming, sourceType: 'dltv' }),
      () => ({ payload: [], sourceType: 'failed' }),
    ),
  ]);

  if (!rmResult.payload && !statsResult.payload) {
    return null;
  }

  const heroes = rmResult.payload?.heroes || statsResult.payload?.heroes || {};
  const maps = rmResult.payload?.maps || [];
  const normalized = normalizeRecentMaps(maps, heroes, teamSlug);
  const statsOverview = normalizeStats(statsResult.payload?.stats || []);
  const nextMatch = normalizeNextMatch(upcomingResult.payload, teamName, teamTag);

  // 战队档案：从 recent_maps 的 series 提取（title/image/rank/maps/prizes 全字段），fallback 用入参
  const COUNTRY_CODE = {
    1: 'cn', 2: 'us', 3: 'ru', 4: 'br', 5: 'sa', 6: 'se', 7: 'de', 8: 'ua', 9: 'pl', 10: 'ca',
    11: 'gb', 12: 'fr', 13: 'es', 14: 'fi', 15: 'nl', 16: 'ro', 17: 'bg', 18: 'dk', 19: 'no', 20: 'it',
    21: 'au', 22: 'my', 23: 'ph', 24: 'id', 25: 'th', 26: 'vn', 27: 'pe', 28: 'ar', 29: 'mx', 30: 'cl',
    31: 'cr', 32: 'jp', 33: 'kr', 34: 'tw', 35: 'hk', 36: 'sg', 37: 'nz', 38: 'za', 39: 'tr', 40: 'gr',
    41: 'il', 42: 'ae', 43: 'qa', 44: 'kz', 45: 'uz', 46: 'az', 47: 'ge', 48: 'am', 49: 'by', 50: 'lt',
    51: 'lv', 52: 'ee', 53: 'cz', 54: 'sk', 55: 'hu', 56: 'si', 57: 'hr', 58: 'ba', 59: 'rs', 60: 'mk',
    61: 'al', 62: 'jo', 63: 'pk', 64: 'bd', 65: 'np', 66: 'lk', 67: 'af', 68: 'ir', 69: 'iq', 70: 'sy',
  };
  let teamMeta = { name: teamName, slug: teamSlug, tag: teamTag || '' };
  const firstSeries = maps[0]?.series;
  if (firstSeries) {
    const t = String(firstSeries.first_team?.slug || '').toLowerCase() === teamSlug.toLowerCase()
      ? firstSeries.first_team
      : String(firstSeries.second_team?.slug || '').toLowerCase() === teamSlug.toLowerCase()
        ? firstSeries.second_team
        : null;
    if (t) {
      const countryCode = t.country_id ? (COUNTRY_CODE[Number(t.country_id)] || '') : '';
      teamMeta = {
        name: t.title || teamName,
        slug: t.slug || teamSlug,
        tag: t.tag || teamTag || '',
        logo: t.image ? `https://dltv.org${String(t.image).startsWith('/') ? '' : '/'}${t.image}` : '',
        countryCode,
        countryZh: countryCode ? String(countryCode).toUpperCase() : '',
        rank: t.rank ?? null,
        rankLabel: t.rank ? `#${t.rank} 世界排名` : '',
        maps: t.maps_total ?? null,
        events: null,
        firstPlaces: null,
        prize: t.prizes ?? null,
        winrate3m: t.win_rate ? Number(t.win_rate) : null,
        locationNote: '',
        socials: [],
      };
    }
  }

  // —— 归一化 squad：从最近一场本队 map_results 提取（5 人首发 + 角色 + 常用英雄） ——
  function normalizeSquad(maps, heroes, teamSlug) {
    const teamIdFromSeries = null;
    void teamIdFromSeries;
    const latestMap = [...(maps || [])]
      .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')))[0];
    if (!latestMap) return [];
    const series = latestMap.series || {};
    const isRadiant = String(series.first_team?.slug || '').toLowerCase() === teamSlug.toLowerCase();
    const myTeamId = isRadiant ? latestMap.radiant_team_id : latestMap.dire_team_id;
    const results = (latestMap.map_results || []).filter((r) => String(r.team_id) === String(myTeamId));
    const byPlayer = new Map();
    for (const r of results) {
      if (r.player_id === null || r.player_id === undefined) continue;
      const existing = byPlayer.get(String(r.player_id)) || {
        accountId: r.player_id,
        roleKey: null,
        rank: r.player_rank ?? null,
        heroes: [],
      };
      if (existing.roleKey === null && r.role) existing.roleKey = r.role;
      const heroName = heroes?.[String(r.hero_id)]?.title || null;
      if (heroName && !existing.heroes.includes(heroName)) existing.heroes.push(heroName);
      byPlayer.set(String(r.player_id), existing);
    }
    const ROLE_LABEL = { 1: '一号位', 2: '二号位', 3: '三号位', 4: '四号位', 5: '五号位', 6: 'Carry', 7: 'Mid', 8: 'Offlane', 9: 'Support' };
    return Array.from(byPlayer.values())
      .map((p) => ({
        nick: `Player ${p.accountId}`,
        playerId: p.accountId,
        role: p.roleKey ? (ROLE_LABEL[p.roleKey] || `位置 ${p.roleKey}`) : '',
        roleKey: p.roleKey ? String(p.roleKey) : '',
        rank: p.rank,
        flag: '',
        country: '',
        photo: '',
        sig: p.heroes.slice(0, 3).map((name) => {
          const hero = Object.values(heroes || {}).find((h) => h.title === name);
          return { name, img: hero?.image ? `https://dltv.org${String(hero.image).startsWith('/') ? '' : '/'}${hero.image}` : '' };
        }),
        isCoach: false,
      }))
      .sort((a, b) => (a.roleKey || '9').localeCompare(b.roleKey || '9'));
  }

  return {
    meta: {
      source: `https://dltv.org/teams/${teamSlug}`,
      capturedAt: new Date().toISOString(),
      apiBase: DLTV_API_BASE,
      dataNote: '归一化自 dltv.org 官方 API（recent_maps + stats + upcoming）',
    },
    team: teamMeta,
    nextMatch,
    upcomingMatches: nextMatch ? [nextMatch] : [],
    quickStats: [
      ...(teamMeta.rank ? [{ label: '世界排名', value: `#${teamMeta.rank}`, unit: '', href: 'https://dltv.org/ranking' }] : []),
      ...(teamMeta.maps ? [{ label: '总地图数', value: String(teamMeta.maps), unit: 'maps', href: `https://dltv.org/teams/${teamSlug}/maps` }] : []),
      ...(teamMeta.prize ? [{ label: '赛事奖金', value: `$${Number(teamMeta.prize).toLocaleString('en-US')}`, unit: '', href: '' }] : []),
      { label: '近 3 个月地图', value: String(statsOverview.aggregate.maps), unit: 'maps', href: '' },
      { label: '近 3 个月胜率', value: String(statsOverview.aggregate.win_rate) + '%', unit: '', href: '' },
    ].slice(0, 5),
    statsOverview,
    draftStats: normalized.draftStats,
    h2h: normalized.h2h,
    recentMatches: normalized.recentMatches,
    squad: normalizeSquad(maps, heroes, teamSlug),
    rosterHistory: [],
    currentFive: [],
    achievements: [],
    news: [],
  };
}

function isFresh(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < CACHE_TTL_MS;
}

function isUsableStale(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < CACHE_MAX_AGE_MS;
}

export async function getTeamDetail({ slug, name, tag }, fetchImpl) {
  const key = slug || slugFromName(name);
  if (!key) return null;

  const cached = memoryCache.get(key);
  if (cached && isFresh(cached.refreshedAt)) {
    return { ...cached, sourceType: 'cache' };
  }
  if (cached && isUsableStale(cached.refreshedAt)) {
    return { ...cached, sourceType: 'stale-cache' };
  }

  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const payload = await fetchTeamDetail(key, name, tag, fetchImpl);
      if (payload) {
        memoryCache.set(key, { ...payload, refreshedAt: Date.now() });
        return { ...payload, sourceType: 'dltv' };
      }
      if (cached && isUsableStale(cached.refreshedAt)) {
        return { ...cached, sourceType: 'stale-cache' };
      }
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const slug = String(req.query?.slug || '').trim();
  const name = String(req.query?.name || '').trim();
  const tag = String(req.query?.tag || '').trim();
  if (!slug && !name) {
    return res.status(400).json({ error: 'slug or name is required' });
  }

  try {
    const detail = await getTeamDetail({ slug, name, tag });
    if (!detail) {
      return res.status(502).json({ error: 'DLTV team data unavailable' });
    }

    // 图片走镜像代理（国内可达）
    const payload = JSON.parse(JSON.stringify(detail));
    const rewrite = (obj, field) => {
      if (obj && obj[field]) obj[field] = getMirroredAssetUrl(obj[field], req);
    };
    rewrite(payload.team, 'logo');
    for (const m of payload.recentMatches || []) rewrite(m, 'oppLogo');
    for (const h of payload.h2h || []) rewrite(h, 'logo');
    for (const p of payload.draftStats?.topPicks || []) rewrite(p, 'img');
    for (const b of payload.draftStats?.topBans || []) rewrite(b, 'img');
    rewrite(payload.nextMatch, 'opponentLogo');
    rewrite(payload.nextMatch, 'oppLogo');
    rewrite(payload.nextMatch, 'myLogo');

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-DLTV-Source', detail.sourceType);
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[TeamDetail API] Error:', e instanceof Error ? e.message : String(e));
    return res.status(500).json({ error: e instanceof Error ? e.message : 'team detail failed' });
  }
}
