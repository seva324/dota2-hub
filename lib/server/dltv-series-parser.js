/**
 * DLTV series_item 解析器
 *
 * dltv.org 的比赛详情页内嵌一个 `series_item = {...}` JSON。
 * 它包含整个系列赛的结构与全部数据：每张地图的 steam_id、比分、winner、时长、选/ban，
 * 以及每张地图 10 名选手的完整数据（英雄、KDA、正反补、GPM/XPM、金钱、装备、A杖/魔晶）。
 * 本模块负责从 HTML 中提取并归一化为前端可直接渲染的结构。
 */

function extractSeriesItemJson(html) {
  const marker = 'series_item = ';
  const start = String(html || '').indexOf(marker);
  if (start === -1) return null;

  const source = html.slice(start + marker.length);
  let depth = 0;
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < source.length) {
    const char = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        break;
      }
    }
    i += 1;
  }

  if (depth !== 0) return null;
  try {
    return JSON.parse(source.slice(0, i + 1));
  } catch {
    return null;
  }
}

function toAbsDltvUrl(path) {
  if (!path) return null;
  const trimmed = String(path).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://dltv.org${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function parseBestOf(formatOptionId) {
  // format_option_id: 3=BO3（实测 427386）。常见映射见 sync-opendota 的 series_type。
  const map = { 0: 'BO1', 1: 'BO3', 2: 'BO5', 3: 'BO3', 4: 'BO2' };
  return map[Number(formatOptionId)] || 'BO3';
}

// DLTV 位置码：1=Core, 2=Mid, 3=Offlane, 4=Support, 5=Full Support。
const ROLE_LABELS = { 1: 'Core', 2: 'Mid', 3: 'Offlane', 4: 'Support', 5: 'Full Support' };

function normalizeTopHero(rawHero) {
  if (!rawHero?.hero) return null;
  return {
    heroId: rawHero.hero.id ?? null,
    heroTitle: rawHero.hero.title ?? null,
    heroSlug: rawHero.hero.slug ?? null,
    heroImage: toAbsDltvUrl(rawHero.hero.image ?? null),
    heroIcon: toAbsDltvUrl(rawHero.hero.icon ?? null),
    maps: rawHero.maps_total ?? null,
    wins: rawHero.wins_total ?? null,
    winRate: rawHero.win_rate ?? null,
  };
}

/** 阵容里的选手（带位置 + 高亮数据 + 签名英雄），区别于 normalizePlayerMeta（仅作 id→meta 查找）。 */
function normalizeTeamPlayer(rawPlayer) {
  if (!rawPlayer) return null;
  return {
    id: rawPlayer.id ?? null,
    steamId: rawPlayer.steam_id ?? null,
    name: rawPlayer.title ?? null,
    image: toAbsDltvUrl(rawPlayer.image ?? null),
    fullName: rawPlayer.full_name ?? null,
    country: rawPlayer.country?.title ?? null,
    countryFlag: rawPlayer.country?.image ? toAbsDltvUrl(rawPlayer.country.image) : null,
    rank: rawPlayer.rank ?? null,
    role: rawPlayer.role ?? null,
    roleLabel: ROLE_LABELS[rawPlayer.role] ?? null,
    winRate: rawPlayer.win_rate ?? null,
    maps: rawPlayer.maps_total ?? null,
    kda: rawPlayer.kda ?? null,
    killsPercent: rawPlayer.kills_percent ?? null,
    avgGpm: rawPlayer.avg_gpm ?? null,
    avgXpm: rawPlayer.avg_xpm ?? null,
    avgDmg: rawPlayer.avg_dmg ?? null,
    heroRatio: rawPlayer.hero_ratio ?? null,
    topHeroes: Array.isArray(rawPlayer.top_heroes) ? rawPlayer.top_heroes.map(normalizeTopHero).filter(Boolean).slice(0, 3) : [],
  };
}

function normalizeEvent(rawEvent) {
  if (!rawEvent) return null;
  return {
    id: rawEvent.id ?? null,
    name: rawEvent.title ?? null,
    tag: rawEvent.tag ?? null,
    slug: rawEvent.slug ?? null,
    countryId: rawEvent.country_id ?? null,
    country: rawEvent.country
      ? {
          name: rawEvent.country.title ?? null,
          code: rawEvent.country.code ?? null,
          emoji: rawEvent.country.emoji ?? null,
          flag: toAbsDltvUrl(rawEvent.country.image ?? null),
        }
      : null,
    startDate: rawEvent.started_at ?? null,
    endDate: rawEvent.ended_at ?? null,
    tier: rawEvent.tier ?? null,
    prizePool: rawEvent.usd_prize ?? null,
    twitchLink: rawEvent.twitch_link ?? null,
    bracketsLink: rawEvent.brackets_link ?? null,
    image: toAbsDltvUrl(rawEvent.image ?? null),
  };
}

function normalizeTeam(rawTeam) {
  if (!rawTeam) return null;
  return {
    id: rawTeam.id ?? null,
    name: rawTeam.title ?? rawTeam.tag ?? null,
    tag: rawTeam.tag ?? null,
    slug: rawTeam.slug ?? null,
    logo: toAbsDltvUrl(rawTeam.image ?? null),
    logoDark: toAbsDltvUrl(rawTeam.image_dark ?? null),
    rank: rawTeam.rank ?? null,
    winRate: rawTeam.win_rate ?? null,
    fbRate: rawTeam.fb_rate ?? null,
    f10Rate: rawTeam.f10_rate ?? null,
    mapsTotal: rawTeam.maps_total ?? null,
    players: Array.isArray(rawTeam.players)
      ? rawTeam.players.map(normalizeTeamPlayer).filter(Boolean).sort((a, b) => (a.role ?? 9) - (b.role ?? 9))
      : [],
  };
}

function normalizePlayerMeta(rawPlayer) {
  if (!rawPlayer) return null;
  return {
    id: rawPlayer.id ?? null,
    steamId: rawPlayer.steam_id ?? null,
    name: rawPlayer.title ?? null,
    image: toAbsDltvUrl(rawPlayer.image ?? null),
    fullName: rawPlayer.full_name ?? null,
    country: rawPlayer.country?.title ?? null,
    countryFlag: rawPlayer.country?.image ? toAbsDltvUrl(rawPlayer.country.image) : null,
    rank: rawPlayer.rank ?? null,
  };
}

function normalizeItem(rawItem) {
  if (!rawItem) return null;
  return {
    id: rawItem.id ?? null,
    title: rawItem.title ?? null,
    steamId: rawItem.steam_id ?? null,
    image: toAbsDltvUrl(rawItem.image ?? null),
  };
}

function normalizeMapResults(results) {
  if (!Array.isArray(results)) return [];
  return results.map((entry) => ({
    teamId: entry.team_id ?? null,
    playerId: entry.player?.id ?? null,
    playerName: entry.player?.title ?? null,
    heroId: entry.hero?.id ?? null,
    heroTitle: entry.hero?.title ?? null,
    heroImg: toAbsDltvUrl(entry.hero?.image ?? null),
    facetTitle: entry.facet?.title ?? null,
    level: entry.level ?? null,
    kills: entry.kills ?? 0,
    deaths: entry.deaths ?? 0,
    assists: entry.assists ?? 0,
    lastHits: entry.last_hits ?? 0,
    denies: entry.denied_hits ?? 0,
    gpm: entry.gpm ?? 0,
    xpm: entry.xpm ?? 0,
    goldTotal: entry.gold_total ?? 0,
    goldCurrent: entry.gold_current ?? 0,
    items: Array.isArray(entry.items) ? entry.items.map(normalizeItem).filter(Boolean) : [],
    backpack: Array.isArray(entry.backpack) ? entry.backpack.map(normalizeItem).filter(Boolean) : [],
    neutralItem: normalizeItem(entry.neutral_item),
    hasScepter: entry.aghanims_scepter === 1 || entry.aghanims_scepter === true,
    hasShard: entry.aghanims_shard === 1 || entry.aghanims_shard === true,
  }));
}

function normalizeMap(rawMap, index) {
  if (!rawMap) return null;
  const mapResults = normalizeMapResults(rawMap.map_results);
  return {
    id: rawMap.id ?? null,
    label: rawMap.label ?? `Map #${index + 1}`,
    steamId: rawMap.steam_id != null ? String(rawMap.steam_id) : null,
    radiantTeamId: rawMap.radiant_team_id ?? null,
    direTeamId: rawMap.dire_team_id ?? null,
    radiantScore: rawMap.radiant_score ?? null,
    direScore: rawMap.dire_score ?? null,
    winner: rawMap.winner ?? null,
    fb: rawMap.fb ?? null,
    f10: rawMap.f10 ?? null,
    duration: rawMap.duration ?? null,
    startTime: rawMap.started_at ? Math.floor(new Date(rawMap.started_at).getTime() / 1000) : null,
    radiantPicks: (rawMap.radiant_picks || []).map((p) => p.hero_id),
    direPicks: (rawMap.dire_picks || []).map((p) => p.hero_id),
    radiantBans: (rawMap.radiant_bans || []).map((p) => p.hero_id),
    direBans: (rawMap.dire_bans || []).map((p) => p.hero_id),
    players: mapResults,
    available: mapResults.length > 0,
  };
}

/**
 * 从 HTML 解析 series_item 并归一化。
 * @returns {object|null} 归一化后的系列赛数据；无法解析时返回 null。
 */
export function parseDltvSeriesItem(html) {
  const raw = extractSeriesItemJson(html);
  if (!raw) return null;

  const radiantTeam = normalizeTeam(raw.first_team);
  const direTeam = normalizeTeam(raw.second_team);

  const players = {};
  for (const entry of Array.isArray(raw.series_players) ? raw.series_players : []) {
    const meta = normalizePlayerMeta(entry?.player);
    if (meta?.id != null) players[String(meta.id)] = meta;
  }

  const maps = (Array.isArray(raw.maps) ? raw.maps : []).map(normalizeMap).filter(Boolean);

  // 系列赛总比分 = 各队累计胜场。
  // 注意：战队可以在不同地图间换边（map.radiant_team_id/dire_team_id 会变），
  // 所以必须按战队 ID 计数，而不是按 radiant/dire 侧。
  const firstTeamId = radiantTeam?.id;
  const secondTeamId = direTeam?.id;
  let firstTeamWins = 0;
  let secondTeamWins = 0;
  for (const map of maps) {
    if (!map.available || !map.winner) continue;
    const winnerTeamId = map.winner === 'radiant' ? map.radiantTeamId : map.winner === 'dire' ? map.direTeamId : null;
    if (winnerTeamId === firstTeamId) firstTeamWins += 1;
    else if (winnerTeamId === secondTeamId) secondTeamWins += 1;
  }

  // 每张地图按开始时间排序（升序 = 系列赛进行顺序），倒叙由前端决定
  maps.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  return {
    seriesId: raw.id ?? null,
    eventName: raw.event?.title ?? null,
    eventSlug: raw.event?.slug ?? null,
    bestOf: parseBestOf(raw.format_option_id),
    startTime: raw.started_at ? Math.floor(new Date(raw.started_at).getTime() / 1000) : null,
    // 赛前（upcoming）区块：未开赛时 maps 为空，靠这些字段渲染详情页。
    status: raw.status ?? null,
    stage: raw.format_option?.title ?? null,
    eventFormat: raw.event_format?.title ?? null,
    event: normalizeEvent(raw.event),
    streams: (Array.isArray(raw.streams) ? raw.streams : [])
      .map((s) => ({
        platform: s.platform ?? null,
        url: s.url ?? null,
        channelTitle: s.channel_title ?? s.stream_channel?.title ?? null,
        isLive: s.is_live === 1,
      }))
      .filter((s) => s.url || s.channelTitle),
    radiantTeam,
    direTeam,
    // 按战队归属的累计胜场（radiant=first_team, dire=second_team）
    radiantWins: firstTeamWins,
    direWins: secondTeamWins,
    players,
    maps,
    rawParsed: Boolean(raw),
  };
}
