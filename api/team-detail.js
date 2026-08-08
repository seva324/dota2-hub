/**
 * Team Detail API
 * Data: DLTV official API (https://dltv.org/api/v1/teams/:slug/recent_maps + /stats)
 * 归一化为 team-falcons.html 的 TEAM_DATA 结构（档案/快速统计/数据总览/常用英雄/对标/最近比赛/下一场）。
 * 缓存：内存 TTL 300s + single-flight（与 dltv-ranking-service 同款模式）。
 */

import { getMirroredAssetUrl } from '../lib/asset-mirror.js';
import { getDltvUpcoming } from '../lib/server/dltv-matches-service.js';
import { getDltvMatchPage } from '../lib/server/dltv-match-page-service.js';
import { getDb } from '../lib/db.js';
import { readDltvCache, writeDltvCache } from '../lib/server/dltv-neon-cache.js';

const DLTV_API_BASE = 'https://dltv.org/api/v1';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;
// Neon 持久缓存：跨实例共享，EdgeOne 冷启动（内存空）时不必直连 dltv.org。
const NEON_CACHE_TTL_MS = 15 * 60 * 1000;
const NEON_STALE_MAX_MS = 6 * 60 * 60 * 1000;

function neonCacheKey(slug) {
  return `dltv:team-detail:${String(slug || '').trim().toLowerCase()}`;
}

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
  const recentMatches = [];
  const seen = new Map();
  const pickCounts = new Map();
  const banCounts = new Map();
  const pickWin = new Map();
  const pickTotal = new Map();

  // 从 recent_maps 的 series 里定位本队（first_team/second_team 不按阵营，仅用于队名/logo）
  const locateTeam = (series) => {
    const ft = series?.first_team || {};
    const st = series?.second_team || {};
    if (String(ft.slug || '').toLowerCase() === teamSlug.toLowerCase()) return { team: ft, isFirst: true };
    if (String(st.slug || '').toLowerCase() === teamSlug.toLowerCase()) return { team: st, isFirst: false };
    return null;
  };

  for (const m of maps || []) {
    const series = m.series || {};
    const located = locateTeam(series);
    if (!located) continue;
    const myTeamId = located.isFirst ? series.first_team_id : series.second_team_id;
    const opp = located.isFirst ? series.second_team || {} : series.first_team || {};

    // 胜负判定：map_results[].is_winner 按 team_id 聚合（map.winner 在该数据源不可靠）。
    // 与 dltv-series-parser 约定一致：按队伍 ID 判定，不按 radiant/dire 阵营（队伍可换边）。
    const myResults = (m.map_results || []).filter((r) => String(r.team_id) === String(myTeamId));
    const won = myResults.some((r) => Number(r.is_winner) === 1);
    const myScore = myResults.find((r) => r.score != null)?.score;
    const oppResults = (m.map_results || []).filter((r) => String(r.team_id) !== String(myTeamId));
    const oppScore = oppResults.find((r) => r.score != null)?.score;

    // 本队英雄：从本队 map_results 的 hero_id 提取（准确对应上场英雄）
    const myHeroIds = [...new Set(myResults.map((r) => r.hero_id).filter((v) => v != null))];
    const oppHeroIds = [...new Set(oppResults.map((r) => r.hero_id).filter((v) => v != null))];
    const heroName = (id) => heroes?.[String(id)]?.title || heroes?.[id]?.title || null;

    for (const hid of myHeroIds) {
      const name = heroName(hid);
      if (!name) continue;
      pickCounts.set(name, (pickCounts.get(name) || 0) + 1);
      pickTotal.set(name, (pickTotal.get(name) || 0) + 1);
      if (won) pickWin.set(name, (pickWin.get(name) || 0) + 1);
    }
    for (const hid of oppHeroIds) {
      const name = heroName(hid);
      if (!name) continue;
      banCounts.set(name, (banCounts.get(name) || 0) + 1);
    }
    // 禁用：两队的 bans 都算（本队 ban + 对手 ban）
    for (const entry of [...(m.radiant_bans || []), ...(m.dire_bans || [])]) {
      const hid = typeof entry === 'object' ? (entry.hero_id ?? entry.heroId) : entry;
      if (hid == null) continue;
      const name = heroName(hid);
      if (!name) continue;
      banCounts.set(name, (banCounts.get(name) || 0) + 1);
    }

    const heroNames = myHeroIds.map(heroName).filter(Boolean);
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

    // 英雄图标：heroes 字典补 image
    const heroImg = (id) => {
      const hero = heroes?.[String(id)] || heroes?.[id];
      return hero?.image ? `https://dltv.org${String(hero.image).startsWith('/') ? '' : '/'}${hero.image}` : '';
    };
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
      heroImgs: myHeroIds.map(heroImg).filter(Boolean),
      seriesId: series.id != null ? String(series.id) : null,
      seriesSlug: series.slug || '',
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

/**
 * 用 match-page（series_item JSON）覆盖 recent_maps 的英雄数据。
 * recent_maps 的 map_results hero_id 常过期/错位（与 DLTV 页面不一致），
 * 而系列赛详情页的 players[].heroTitle 是权威来源。
 */
async function enrichRecentMatchesHeroes(recentMatches, teamSlug, fetchImpl) {
  const httpFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  // 按 seriesId 去重（同系列赛多场共用一次抓取）
  const bySeries = new Map();
  for (const m of recentMatches || []) {
    if (!m.seriesId) continue;
    if (!bySeries.has(m.seriesId)) {
      bySeries.set(m.seriesId, { slug: m.seriesSlug || '', matches: [] });
    }
    bySeries.get(m.seriesId).matches.push(m);
  }

  await Promise.all([...bySeries.entries()].map(async ([seriesId, info]) => {
    try {
      const result = await getDltvMatchPage({ seriesId, slug: info.slug }, { fetchImpl: httpFetch });
      const series = result?.series;
      const maps = Array.isArray(series?.maps) ? series.maps : [];
      // 按开始时间升序排列（series_item 的 maps 顺序可能无序）
      maps.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
      for (const m of info.matches) {
        // recentMatches 的顺序 = 时间倒序，第 i 场对应升序 maps 的第 (len-1-i) 场
        const idxInSeries = maps.length - 1 - (info.matches.indexOf(m));
        const map = maps[idxInSeries];
        if (!map) continue;
        const players = (map.players || []).filter((p) => {
          // 需要知道本队在系列赛中的 teamId —— players 有 teamId 字段
          return p && p.heroTitle;
        });
        // 取本队英雄：对比 map.radiantTeamId/direTeamId 与 series teams
        const ft = series?.radiantTeam || {};
        const st = series?.direTeam || {};
        const myTeamSlug = teamSlug.toLowerCase();
        const xtremeSide = String(ft?.slug || '').toLowerCase() === myTeamSlug || String(ft?.id) === teamSlug
          ? 'radiant'
          : String(st?.slug || '').toLowerCase() === myTeamSlug || String(st?.id) === teamSlug
            ? 'dire'
            : null;
        const myTeamId = xtremeSide === 'radiant' ? map.radiantTeamId : xtremeSide === 'dire' ? map.direTeamId : null;
        const myPlayers = (map.players || []).filter((p) => myTeamId != null && String(p.teamId) === String(myTeamId));
        const heroNames = [...new Set(myPlayers.map((p) => p.heroTitle).filter(Boolean))];
        const heroImgs = [...new Set(myPlayers.map((p) => p.heroImg).filter(Boolean))];
        if (heroNames.length > 0) {
          m.heroes = heroNames;
          m.heroImgs = heroImgs;
        }
      }
    } catch (error) {
      console.error('[TeamDetail] match-page hero enrich failed:', error instanceof Error ? error.message : String(error));
    }
  }));
  return recentMatches;
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

// —— 战队页 HTML 缓存（squad + achievements 从页面解析） ——
const TEAM_PAGE_CACHE_TTL_MS = 5 * 60 * 1000;
const pageCache = new Map();

async function fetchTeamPageHtml(teamSlug, fetchImpl = fetch) {
  const cached = pageCache.get(teamSlug);
  if (cached && Date.now() - cached.at < TEAM_PAGE_CACHE_TTL_MS) return cached.html;
  const httpFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const url = `https://dltv.org/teams/${encodeURIComponent(teamSlug)}`;
  // direct 失败(EdgeOne 出口直连 dltv 间歇不可用)时转 jina;校验页面确实是对应战队页(含自身 slug),
  // 避免把 CDN 挑战页/错误页当成功结果缓存,导致 squad/draft 等页面区块解析为空。
  const attempts = [
    { url, timeoutMs: FETCH_TIMEOUT_MS, headers: {} },
    {
      url: buildJinaUrl(url),
      timeoutMs: FETCH_TIMEOUT_MS + 3000,
      headers: { 'X-Return-Format': 'html', 'X-No-Cache': 'true' },
    },
  ];
  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.timeoutMs);
    try {
      const res = await httpFetch(attempt.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)', Accept: 'text/html', ...attempt.headers },
        signal: timeout.signal,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (String(text || '').trim().length < 2000 || !text.includes(`/teams/${teamSlug}`)) continue;
      pageCache.set(teamSlug, { html: text, at: Date.now() });
      return text;
    } catch {
      // 忽略单次尝试,继续下一来源。
    } finally {
      timeout.dispose();
    }
  }
  console.error('[TeamDetail] team page fetch failed:', teamSlug);
  return cached?.html || '';
}

const SQUAD_ROLE_LABEL = { 1: 'Core', 2: 'Mid', 3: 'Offlane', 4: 'Support', 5: 'Full Support' };

/** 从战队页 HTML 解析 Active squad（昵称/真名/照片/国旗/天梯分/角色/教练）。 */
function parseSquadHtml(html) {
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

/** 从战队页 HTML 解析成就（赛事名/奖牌/年份/链接/图标）。 */
function parseAchievementsHtml(html) {
  const achStart = html.indexOf('<div class="achievements">');
  if (achStart < 0) return [];
  // 区块结束：swiper-wrapper 容器的 4 层闭合 div 或下一个 section
  const wrapperStart = html.indexOf('swiper-wrapper', achStart);
  if (wrapperStart < 0) return [];
  const nextSection = html.indexOf('<section', wrapperStart);
  const endMark = nextSection > 0 ? nextSection : achStart + 12000;
  const wrapperHtml = html.slice(wrapperStart, endMark);
  const achievements = [];
  const slideRe = /<div class="swiper-slide">([\s\S]*?)<\/a>\s*<\/div>/g;
  for (const m of wrapperHtml.matchAll(slideRe)) {
    const item = m[1];
    const slug = item.match(/href="https:\/\/dltv\.org\/events\/([^"]+)"/)?.[1];
    const name = item.match(/data-tippy-content="([^"]+)"/)?.[1];
    const cup = item.match(/cup (gold|silver|bronze)/)?.[1];
    const year = item.match(/<small>([\s\S]*?)<\/small>/)?.[1]?.trim();
    const img = item.match(/data-theme-light="([^"]+)"/)?.[1];
    if (!name) continue;
    achievements.push({
      name,
      slug: slug || '',
      cup: cup || '',
      year: year || '',
      img: img ? `https://dltv.org${String(img).startsWith('/') ? '' : '/'}${img}` : '',
    });
  }
  return achievements;
}

/** 从战队页 HTML 解析 Hero Draft Statistics（First Pick/Ban 高亮 + Top-5 Picks/Bans 表）。 */
function parseDraftStatsHtml(html) {
  const draftStart = html.indexOf('draft__statistics');
  if (draftStart < 0) return null;
  // draft 区块可能较长（两张表 + 高亮），取足量范围
  const block = html.slice(draftStart, draftStart + 60000);

  const firstOf = (label) => {
    const re = new RegExp(`draft__statistics-first__title">\\s*<small>${label}</small>\\s*<strong>([\\s\\S]*?)<\\/strong>\\s*<span>([\\s\\S]*?)<\\/span>`);
    const m = block.match(re);
    if (!m) return null;
    // 图标在该 title 区块之前最近的 background-image（First Pick/Ban 高亮图标）
    const before = block.slice(Math.max(0, m.index - 800), m.index);
    const imgs = [...before.matchAll(/background-image: url\('([^']+)'\)/g)];
    const img = imgs.length > 0 ? imgs[imgs.length - 1][1] : '';
    return { name: m[1].trim(), note: m[2].trim(), img };
  };

  const tableOf = (heading) => {
    const idx = block.indexOf(heading);
    if (idx < 0) return [];
    const bodyStart = block.indexOf('table__body', idx);
    // 表结束：下一个 table__head（下一张表）或足够长的兜底范围（末表无后继 head）
    const nextHead = block.indexOf('table__head', bodyStart + 10);
    const endMark = nextHead > 0 ? nextHead : bodyStart + 12000;
    const tableBlock = block.slice(bodyStart, endMark);
    const rows = [];
    // 行开头是 <div class="table__body-row …">（可能带 non__stripped 等修饰类；排除 table__body-row__cell 内部类）
    const rowOpenRe = /<div class="table__body-row(?: |")/g;
    const opens = [...tableBlock.matchAll(rowOpenRe)].map((m) => m.index);
    for (let i = 0; i < opens.length; i += 1) {
      const start = opens[i];
      const end = i + 1 < opens.length ? opens[i + 1] : tableBlock.length;
      const rowHtml = tableBlock.slice(start, end);
      const hero = rowHtml.match(/cell__hero-title">\s*<span>([\s\S]*?)<\/span>/)?.[1]?.trim();
      const img = rowHtml.match(/background-image: url\('([^']+)'\)/)?.[1];
      const texts = [...rowHtml.matchAll(/cell__text">([\s\S]*?)<\/div>/g)].map((x) => x[1].trim());
      if (hero) rows.push({ hero, img: img || '', texts });
    }
    return rows;
  };

  const picks = tableOf('Top-5 Team Picks').slice(0, 5).map((r) => ({
    name: r.hero,
    img: r.img ? `https://dltv.org${r.img.startsWith('/') ? '' : '/'}${r.img}` : '',
    maps: Number(r.texts[0] || 0),
    rate: r.texts[1] || '',
    wins: Number(r.texts[2] || 0),
    losses: Number(r.texts[3] || 0),
  }));
  const bans = tableOf('Top-5 Team Bans').slice(0, 5).map((r) => ({
    name: r.hero,
    img: r.img ? `https://dltv.org${r.img.startsWith('/') ? '' : '/'}${r.img}` : '',
    rate: r.texts[0] || '',
    mapsVs: Number(r.texts[1] || 0),
    winsVs: Number(r.texts[2] || 0),
    losesVs: Number(r.texts[3] || 0),
  }));

  const firstPick = firstOf('First Pick');
  const firstBan = firstOf('First Ban');
  return {
    period: '近 3 个月',
    firstPick: firstPick ? { name: firstPick.name, count: Number(firstPick.note.match(/\d+/)?.[0] || 0), label: '首选次数', img: firstPick.img ? `https://dltv.org${firstPick.img.startsWith('/') ? '' : '/'}${firstPick.img}` : '' } : null,
    firstBan: firstBan ? { name: firstBan.name, count: Number(firstBan.note.match(/\d+/)?.[0] || 0), label: '首禁次数', img: firstBan.img ? `https://dltv.org${firstBan.img.startsWith('/') ? '' : '/'}${firstBan.img}` : '' } : null,
    topPicks: picks,
    topBans: bans,
  };
}

/** 从战队页 HTML 解析战队招牌英雄（top__heroes 区块，Hero + Winrate 进度条）。 */
function parseTeamSignatureHeroesHtml(html) {
  const sigStart = html.indexOf('<section class="top__heroes">');
  if (sigStart < 0) return [];
  const bodyStart = html.indexOf('table__body', sigStart);
  if (bodyStart < 0) return [];
  const nextHead = html.indexOf('table__head', bodyStart + 10);
  const endMark = nextHead > 0 ? nextHead : bodyStart + 8000;
  const block = html.slice(bodyStart, endMark);
  const heroes = [];
  const rowOpenRe = /<div class="table__body-row(?: |")/g;
  const opens = [...block.matchAll(rowOpenRe)].map((m) => m.index);
  for (let i = 0; i < opens.length; i += 1) {
    const start = opens[i];
    const end = i + 1 < opens.length ? opens[i + 1] : block.length;
    const rowHtml = block.slice(start, end);
    const name = rowHtml.match(/cell__name">([\s\S]*?)<\/div>/)?.[1]?.trim();
    const img = rowHtml.match(/background-image: url\('([^']+)'\)/)?.[1];
    const winrate = rowHtml.match(/percent">([\s\S]*?)<\/div>/)?.[1]?.trim();
    if (name) heroes.push({
      name,
      img: img ? `https://dltv.org${img.startsWith('/') ? '' : '/'}${img}` : '',
      winrate: winrate || '',
    });
  }
  return heroes;
}

/** 从选手页 HTML 解析 Signature heroes（招牌英雄 Top N）。 */
function parseSignatureHeroesHtml(html) {
  const sigStart = html.indexOf('Signature heroes');
  if (sigStart < 0) return [];
  const bodyStart = html.indexOf('table__body', sigStart);
  if (bodyStart < 0) return [];
  const nextHead = html.indexOf('table__head', bodyStart + 10);
  const endMark = nextHead > 0 ? nextHead : bodyStart + 6000;
  const block = html.slice(bodyStart, endMark);
  const heroes = [];
  const rowOpenRe = /<div class="table__body-row(?: |")/g;
  const opens = [...block.matchAll(rowOpenRe)].map((m) => m.index);
  for (let i = 0; i < opens.length; i += 1) {
    const start = opens[i];
    const end = i + 1 < opens.length ? opens[i + 1] : block.length;
    const rowHtml = block.slice(start, end);
    const name = rowHtml.match(/cell__name">([\s\S]*?)<\/div>/)?.[1]?.trim();
    const img = rowHtml.match(/background-image: url\('([^']+)'\)/)?.[1];
    const winrate = rowHtml.match(/percent">([\s\S]*?)<\/div>/)?.[1]?.trim();
    if (name) heroes.push({
      name,
      img: img ? `https://dltv.org${img.startsWith('/') ? '' : '/'}${img}` : '',
      winrate: winrate || '',
    });
  }
  return heroes.slice(0, 3);
}

/** 选手页 HTML 缓存（Signature heroes）。 */
const playerPageCache = new Map();

async function fetchPlayerPageHtml(playerSlug, fetchImpl) {
  const cached = playerPageCache.get(playerSlug);
  if (cached && Date.now() - cached.at < TEAM_PAGE_CACHE_TTL_MS) return cached.html;
  const url = `https://dltv.org/players/${encodeURIComponent(playerSlug)}`;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return cached?.html || '';
    const html = await res.text();
    playerPageCache.set(playerSlug, { html, at: Date.now() });
    return html;
  } catch (error) {
    console.error('[TeamDetail] player page fetch failed:', error instanceof Error ? error.message : String(error));
    return cached?.html || '';
  }
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
  const httpFetch = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const [rmResult, statsResult, upcomingResult, teamPageHtml] = await Promise.all([
    fetchJson(`${base}/recent_maps?date_range=2&event_type=&hero_id=0`, FETCH_TIMEOUT_MS, httpFetch),
    fetchJson(`${base}/stats?date_range=2&event_type=`, FETCH_TIMEOUT_MS, httpFetch),
    getDltvUpcoming(httpFetch).then(
      (r) => ({ payload: r.upcoming, sourceType: 'dltv' }),
      () => ({ payload: [], sourceType: 'failed' }),
    ),
    fetchTeamPageHtml(teamSlug, httpFetch),
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
  // —— 归一化 squad：战队页 HTML（昵称/照片/角色/天梯分）+ 选手页招牌英雄 ——
  function normalizeSquad(pagePlayers, sigBySlug) {
    const pages = Array.isArray(pagePlayers) ? pagePlayers : [];
    if (pages.length === 0) return [];
    return pages.map((p) => {
      const sigs = sigBySlug.get(p.slug) || [];
      return {
        nick: p.nick,
        playerId: p.playerId,
        role: p.role || '',
        roleKey: p.roleKey ? String(p.roleKey) : '',
        rank: p.rank,
        flag: p.flag,
        flagCode: p.flagCode || '',
        country: p.flagCode ? String(p.flagCode).toUpperCase() : '',
        photo: p.photo,
        realName: p.realName || '',
        slug: p.slug || '',
        sig: sigs,
        isCoach: Boolean(p.isCoach),
      };
    });
  }

  // —— 常用英雄：本队 recent_maps 的 map_results 聚合（pickCounts/pickWin），heroes 字典补图标 ——
  function normalizeDraftStats(heroDict, normalizedDraft) {
    const heroRows = (normalizedDraft?.topPicks || [])
      .map((h) => {
        const hero = Object.values(heroDict || {}).find((x) => x?.title === h.name);
        return { ...h, img: hero?.image ? `https://dltv.org${String(hero.image).startsWith('/') ? '' : '/'}${hero.image}` : '' };
      })
      .slice(0, 5);
    const bans = (normalizedDraft?.topBans || []).slice(0, 5);
    return {
      period: '近 3 个月',
      firstPick: heroRows[0] ? { name: heroRows[0].name, count: heroRows[0].maps, label: '首选次数' } : null,
      firstBan: bans[0] ? { name: bans[0].name, count: bans[0].mapsVs, label: '首禁次数' } : null,
      topPicks: heroRows,
      topBans: bans,
    };
  }

  const achievements = parseAchievementsHtml(teamPageHtml);
  const teamSignatureHeroes = parseTeamSignatureHeroesHtml(teamPageHtml);
  const pagePlayers = parseSquadHtml(teamPageHtml);
  const draftStats = parseDraftStatsHtml(teamPageHtml);

  // 招牌英雄：并行抓选手页 Signature heroes（教练跳过）
  const sigBySlug = new Map();
  const nonCoach = (pagePlayers || []).filter((p) => !p.isCoach && p.slug);
  await Promise.all(nonCoach.slice(0, 5).map(async (p) => {
    const playerHtml = await fetchPlayerPageHtml(p.slug, httpFetch);
    const sigs = parseSignatureHeroesHtml(playerHtml);
    if (sigs.length > 0) sigBySlug.set(p.slug, sigs);
  }));

  return {
    meta: {
      source: `https://dltv.org/teams/${teamSlug}`,
      capturedAt: new Date().toISOString(),
      apiBase: DLTV_API_BASE,
      dataNote: '归一化自 dltv.org 官方 API（recent_maps + stats + upcoming + team page）',
    },
    team: teamMeta,
    nextMatch,
    upcomingMatches: nextMatch ? [nextMatch] : [],
    quickStats: [
      ...(teamMeta.rank ? [{ label: '世界排名', value: `#${teamMeta.rank}`, unit: '', href: 'https://dltv.org/ranking' }] : []),
      ...(teamMeta.maps ? [{ label: '总地图数', value: String(teamMeta.maps), unit: '场', href: `https://dltv.org/teams/${teamSlug}/maps` }] : []),
      ...(teamMeta.prize ? [{ label: '赛事奖金', value: `$${Number(teamMeta.prize).toLocaleString('en-US')}`, unit: '', href: '' }] : []),
      { label: '近 3 个月地图', value: String(statsOverview.aggregate.maps), unit: '场', href: '' },
      { label: '近 3 个月胜率', value: String(statsOverview.aggregate.win_rate) + '%', unit: '', href: '' },
    ].slice(0, 5),
    statsOverview,
    // HTML 解析非空才用;战队页拉取异常导致 draft 区块为空时,回退到 recent_maps 聚合,
    // 避免 常用英雄 整块丢失。
    draftStats:
      draftStats?.topPicks?.length || draftStats?.topBans?.length
        ? draftStats
        : normalizeDraftStats(heroes, normalized.draftStats),
    teamSignatureHeroes,
    h2h: normalized.h2h,
    recentMatches: await enrichRecentMatchesHeroes(normalized.recentMatches, teamSlug, httpFetch),
    squad: normalizeSquad(pagePlayers, sigBySlug),
    rosterHistory: [],
    currentFive: [],
    achievements,
    news: [],
  };
}

function isFresh(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < CACHE_TTL_MS;
}

function isUsableStale(timestamp) {
  return Number.isFinite(timestamp) && Date.now() - timestamp < CACHE_MAX_AGE_MS;
}

async function readNeonTeamDetail(key) {
  const db = getDb();
  if (!db) return null;
  try {
    const entry = await readDltvCache(db, neonCacheKey(key));
    if (!entry?.payload) return null;
    return { payload: entry.payload, refreshedAt: entry.refreshedAt };
  } catch (error) {
    console.error('[TeamDetail] neon cache read failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

function persistNeonTeamDetail(key, payload) {
  const db = getDb();
  if (!db || !payload) return;
  writeDltvCache(db, neonCacheKey(key), { payload });
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

  // Neon 持久缓存兜底：跨实例冷启动（内存空）不必直连 dltv.org。
  if (!cached) {
    const neonEntry = await readNeonTeamDetail(key);
    if (neonEntry?.payload) {
      const age = Date.now() - neonEntry.refreshedAt;
      memoryCache.set(key, { ...neonEntry.payload, refreshedAt: neonEntry.refreshedAt });
      if (age < NEON_CACHE_TTL_MS) {
        return { ...neonEntry.payload, sourceType: 'cache' };
      }
      if (age < NEON_STALE_MAX_MS) {
        void getTeamDetailFresh(key, name, tag, fetchImpl);
        return { ...neonEntry.payload, sourceType: 'stale-cache' };
      }
    }
  }

  return getTeamDetailFresh(key, name, tag, fetchImpl);
}

/** 直抓 DLTV 并写内存 + Neon；并发共享一次在途抓取。 */
async function getTeamDetailFresh(key, name, tag, fetchImpl) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const payload = await fetchTeamDetail(key, name, tag, fetchImpl);
      if (payload) {
        memoryCache.set(key, { ...payload, refreshedAt: Date.now() });
        persistNeonTeamDetail(key, payload);
        return { ...payload, sourceType: 'dltv' };
      }
      const cached = memoryCache.get(key);
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

/** 供 cron 预热：按 slug 直抓并写 Neon（跨实例共享，用户请求免直连 DLTV）。 */
export async function warmTeamDetail({ slug, name, tag, fetchImpl = fetch } = {}) {
  const key = slug || slugFromName(name);
  if (!key) return { ok: false, reason: 'missing slug' };
  const db = getDb();
  const lockKey = neonCacheKey(key);
  const { tryAcquireDltvCacheLock } = await import('../lib/server/dltv-neon-cache.js');
  const acquired = db ? await tryAcquireDltvCacheLock(db, lockKey, 60_000) : true;
  if (!acquired) return { ok: false, reason: 'locked' };
  try {
    const payload = await fetchTeamDetail(key, name, tag, fetchImpl);
    if (payload) {
      memoryCache.set(key, { ...payload, refreshedAt: Date.now() });
      persistNeonTeamDetail(key, payload);
      return { ok: true, slug: key };
    }
    return { ok: false, reason: 'fetch failed' };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
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
