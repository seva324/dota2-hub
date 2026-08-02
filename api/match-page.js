/**
 * Match Page API
 * 单个 DLTV 系列赛详情（#/match/<seriesId> 深链的数据源）。
 * 数据全部来自 dltv.org 比赛详情页内嵌的 series_item JSON。
 */

import { getDltvMatchPage } from '../lib/server/dltv-match-page-service.js';
import { getMirroredAssetUrl } from '../lib/asset-mirror.js';

const MATCH_PAGE_CACHE_CONTROL = 'public, max-age=120, s-maxage=600, stale-while-revalidate=3600';
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
    const { series, source } = await getDltvMatchPage({ seriesId, slug });
    if (!series) {
      // 404 不能进共享缓存：一次抓取失败（DLTV 偶发 404/超时）不应把"没找到比赛"
      // 缓存 600 秒，否则所有用户都会看到假的"not found"。
      res.setHeader('Cache-Control', MATCH_PAGE_NO_STORE_CACHE_CONTROL);
      return res.status(404).json({ error: 'Match page not found on DLTV' });
    }

    const playersMeta = series.players || {};

    const payload = {
      seriesId: series.seriesId,
      eventName: series.eventName,
      bestOf: series.bestOf,
      startTime: series.startTime,
      radiantWins: series.radiantWins,
      direWins: series.direWins,
      teams: {
        radiant: {
          id: series.radiantTeam?.id ?? null,
          name: series.radiantTeam?.name ?? null,
          tag: series.radiantTeam?.tag ?? null,
          logo: proxyUrl(series.radiantTeam?.logo, req),
          logoDark: proxyUrl(series.radiantTeam?.logoDark, req),
        },
        dire: {
          id: series.direTeam?.id ?? null,
          name: series.direTeam?.name ?? null,
          tag: series.direTeam?.tag ?? null,
          logo: proxyUrl(series.direTeam?.logo, req),
          logoDark: proxyUrl(series.direTeam?.logoDark, req),
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
