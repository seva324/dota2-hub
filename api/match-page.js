/**
 * Match Page API
 * 单个 DLTV 系列赛详情（#/match/<seriesId> 深链的数据源）。
 * 赛程元数据来自 dltv.org 比赛详情页内嵌的 series_item JSON；
 * 两队统计对比来自 /api/v1/series/{id}/lineups/teams（warm cron 预热到 Neon）。
 */

import { getDltvMatchPage } from '../lib/server/dltv-match-page-service.js';
import { getDltvSeriesStats } from '../lib/server/dltv-series-stats.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

// match-page 现在由预热 cron 写 Neon（6h 缓存），数据更静态；CDN 边缘缓存加长到 6h，
// 让 EdgeOne 吸收重复点击、省 Neon 读。浏览器端仍短缓存（300s），保证更新及时可见。
const MATCH_PAGE_CACHE_CONTROL = 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400';
const MATCH_PAGE_NO_STORE_CACHE_CONTROL = 'no-store';

function proxyUrl(url, req) {
  if (!url) return null;
  return getMirroredAssetUrl(url, req);
}

function mapItem(item, req) {
  if (!item) return null;
  return {
    id: item.id,
    title: item.title,
    steamId: item.steamId,
    image: proxyUrl(item.image, req),
  };
}

function mapPlayer(row, playersMeta, req) {
  const meta = playersMeta[String(row.playerId)];
  return {
    teamId: row.teamId,
    playerId: row.playerId,
    playerName: row.playerName || meta?.name || null,
    avatar: proxyUrl(meta?.image, req),
    steamId: meta?.steamId ?? null,
    country: meta?.country ?? null,
    countryFlag: proxyUrl(meta?.countryFlag, req),
    rank: meta?.rank ?? null,
    heroId: row.heroId,
    heroTitle: row.heroTitle,
    heroImg: proxyUrl(row.heroImg, req),
    facetTitle: row.facetTitle ?? null,
    level: row.level,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    lastHits: row.lastHits,
    denies: row.denies,
    gpm: row.gpm,
    xpm: row.xpm,
    goldTotal: row.goldTotal,
    goldCurrent: row.goldCurrent,
    items: (row.items || []).map((item) => mapItem(item, req)).filter(Boolean),
    backpack: (row.backpack || []).map((item) => mapItem(item, req)).filter(Boolean),
    neutralItem: mapItem(row.neutralItem, req),
    hasScepter: row.hasScepter,
    hasShard: row.hasShard,
  };
}

/** 赛前阵容里的选手（带位置 + 高亮数据 + 签名英雄），图片走 /api/asset-image 代理。 */
function mapLineupPlayer(player, req) {
  if (!player) return null;
  return {
    id: player.id ?? null,
    steamId: player.steamId ?? null,
    name: player.name ?? null,
    image: proxyUrl(player.image, req),
    rank: player.rank ?? null,
    role: player.role ?? null,
    roleLabel: player.roleLabel ?? null,
    winRate: player.winRate ?? null,
    maps: player.maps ?? null,
    kda: player.kda ?? null,
    avgGpm: player.avgGpm ?? null,
    avgXpm: player.avgXpm ?? null,
    avgDmg: player.avgDmg ?? null,
    topHeroes: (player.topHeroes || []).map((hero) => ({
      heroId: hero.heroId ?? null,
      heroTitle: hero.heroTitle ?? null,
      heroImage: proxyUrl(hero.heroImage ?? hero.heroIcon, req),
      maps: hero.maps ?? null,
      wins: hero.wins ?? null,
      winRate: hero.winRate ?? null,
    })),
  };
}

function mapEvent(event, req) {
  if (!event) return null;
  return {
    name: event.name ?? null,
    tag: event.tag ?? null,
    countryId: event.countryId ?? null,
    country: event.country
      ? {
          name: event.country.name ?? null,
          code: event.country.code ?? null,
          emoji: event.country.emoji ?? null,
          flag: proxyUrl(event.country.flag, req),
        }
      : null,
    startDate: event.startDate ?? null,
    endDate: event.endDate ?? null,
    tier: event.tier ?? null,
    prizePool: event.prizePool ?? null,
    twitchLink: event.twitchLink ?? null,
    bracketsLink: event.bracketsLink ?? null,
    image: proxyUrl(event.image, req),
  };
}

function mapStreams(streams) {
  return (streams || []).map((stream) => ({
    platform: stream.platform ?? null,
    url: stream.url ?? null,
    channelTitle: stream.channelTitle ?? null,
    isLive: Boolean(stream.isLive),
  }));
}

/** 单条统计行（队伍总览或按英雄）。 */
function mapStatRow(row) {
  if (!row) return null;
  return {
    maps: row.maps ?? null,
    wins: row.wins ?? null,
    winRate: row.winRate ?? null,
    fbRate: row.fbRate ?? null,
    f10Rate: row.f10Rate ?? null,
    winFbRate: row.winFbRate ?? null,
    winF10Rate: row.winF10Rate ?? null,
    avgKills: row.avgKills ?? null,
    avgDeaths: row.avgDeaths ?? null,
    avgAssists: row.avgAssists ?? null,
    avgTime: row.avgTime ?? null,
  };
}

/** 把某队的统计（总体 + 签名英雄）映射进 payload，hero 名称/图从 stats.heroes 字典解析。 */
function mapTeamStats(stats, teamId, req) {
  const team = stats?.teams?.[String(teamId)];
  if (!team) return null;
  const heroMeta = stats.heroes || {};
  return {
    overall: mapStatRow(team.overall),
    heroes: (team.heroes || [])
      .map((row) => {
        const hero = heroMeta[String(row.heroId)] || {};
        return {
          heroId: row.heroId,
          heroTitle: hero.title ?? null,
          heroImage: proxyUrl(hero.image ?? null, req),
          maps: row.maps,
          wins: row.wins,
          winRate: row.winRate,
        };
      })
      .filter((hero) => hero.heroId != null)
      .sort((a, b) => (b.maps ?? 0) - (a.maps ?? 0))
      .slice(0, 5),
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', MATCH_PAGE_CACHE_CONTROL);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rawId = req.query.series_id ?? req.query.seriesId ?? req.query.id;
  const seriesId = Number(rawId);
  if (!Number.isFinite(seriesId) || seriesId <= 0) {
    return res.status(400).json({ error: 'Invalid series_id' });
  }
  const slug = String(req.query.slug || '').trim() || undefined;

  try {
    // 元数据（series_item）与统计（lineups/teams）并行拉取；统计是 best-effort，
    // 失败（null）时 payload 照常返回，视图隐藏对比区块。
    const [{ series, source }, statsResult] = await Promise.all([
      getDltvMatchPage({ seriesId, slug }),
      getDltvSeriesStats({ seriesId }),
    ]);
    const stats = statsResult?.stats || null;

    // 真冷启动抓取超时/失败 → 返回 200 + source:'timeout'，绝不 404：
    // 前端看到 timeout 会自动重试，且底层抓取仍在后台跑，重试大概率命中内存缓存。
    // no-store 防止 EdgeOne 把空/超时响应缓存 600s。
    if (!series) {
      res.setHeader('Cache-Control', MATCH_PAGE_NO_STORE_CACHE_CONTROL);
      return res.status(200).json({ seriesId, source: 'timeout', maps: [] });
    }

    const playersMeta = series.players || {};

    const payload = {
      seriesId: series.seriesId,
      eventName: series.eventName,
      bestOf: series.bestOf,
      startTime: series.startTime,
      radiantWins: series.radiantWins,
      direWins: series.direWins,
      // 赛前（upcoming）区块：未开赛时 maps 为空，前端据此渲染详情页。
      status: series.status ?? null,
      stage: series.stage ?? null,
      eventFormat: series.eventFormat ?? null,
      event: mapEvent(series.event, req),
      streams: mapStreams(series.streams),
      teams: {
        radiant: {
          id: series.radiantTeam?.id ?? null,
          name: series.radiantTeam?.name ?? null,
          slug: series.radiantTeam?.slug ?? null,
          tag: series.radiantTeam?.tag ?? null,
          logo: proxyUrl(series.radiantTeam?.logo, req),
          logoDark: proxyUrl(series.radiantTeam?.logoDark, req),
          rank: series.radiantTeam?.rank ?? null,
          winRate: series.radiantTeam?.winRate ?? null,
          fbRate: series.radiantTeam?.fbRate ?? null,
          f10Rate: series.radiantTeam?.f10Rate ?? null,
          mapsTotal: series.radiantTeam?.mapsTotal ?? null,
          players: (series.radiantTeam?.players || []).map((player) => mapLineupPlayer(player, req)).filter(Boolean),
          stats: mapTeamStats(stats, series.radiantTeam?.id, req),
        },
        dire: {
          id: series.direTeam?.id ?? null,
          name: series.direTeam?.name ?? null,
          slug: series.direTeam?.slug ?? null,
          tag: series.direTeam?.tag ?? null,
          logo: proxyUrl(series.direTeam?.logo, req),
          logoDark: proxyUrl(series.direTeam?.logoDark, req),
          rank: series.direTeam?.rank ?? null,
          winRate: series.direTeam?.winRate ?? null,
          fbRate: series.direTeam?.fbRate ?? null,
          f10Rate: series.direTeam?.f10Rate ?? null,
          mapsTotal: series.direTeam?.mapsTotal ?? null,
          players: (series.direTeam?.players || []).map((player) => mapLineupPlayer(player, req)).filter(Boolean),
          stats: mapTeamStats(stats, series.direTeam?.id, req),
        },
      },
      maps: (() => {
        const available = (series.maps || []).filter((map) => map.available);
        return available.map((map, index) => ({
          gameNo: index + 1,
          steamId: map.steamId,
          label: map.label,
          radiantTeamId: map.radiantTeamId ?? null,
          direTeamId: map.direTeamId ?? null,
          radiantScore: map.radiantScore,
          direScore: map.direScore,
          winner: map.winner,
          duration: map.duration,
          fb: map.fb ?? null,
          f10: map.f10 ?? null,
          startTime: map.startTime,
          radiantPicks: map.radiantPicks || [],
          direPicks: map.direPicks || [],
          radiantBans: map.radiantBans || [],
          direBans: map.direBans || [],
          players: (map.players || []).map((row) => mapPlayer(row, playersMeta, req)),
        }));
      })(),
    };

    res.setHeader('X-DLTV-Source', source);
    return res.status(200).json(payload);
  } catch (e) {
    console.error('[MatchPage API] Error:', e instanceof Error ? e.message : String(e));
    // 500 同样不缓存，避免一次性源错误污染共享缓存。
    res.setHeader('Cache-Control', MATCH_PAGE_NO_STORE_CACHE_CONTROL);
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
