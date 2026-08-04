export interface HeroInfo {
  id: number;
  name: string;
  img: string;
  name_cn: string;
  img_url?: string;
  nicknames?: string[];
}

export interface ItemInfo {
  id: number;
  name: string;
  img: string;
}

export interface Player {
  player_slot: number;
  account_id: number;
  personaname?: string;
  name?: string;
  hero_id: number;
  level: number;
  kills: number;
  deaths: number;
  assists: number;
  gold?: number;
  net_worth?: number;
  gold_per_min: number;
  xp_per_min: number;
  last_hits: number;
  denies: number;
  hero_damage: number;
  tower_damage: number;
  hero_healing: number;
  lane?: number;
  items?: number[];
  neutral_item?: number;
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  item_neutral?: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  aghanims_scepter?: boolean | number;
  aghanims_shard?: boolean | number;
  has_scepter?: boolean | number;
  has_shard?: boolean | number;
  permanent_buffs?: Array<{ permanent_buff: number; stack_count?: number }>;
}

export interface PicksBans {
  is_pick: boolean;
  hero_id: number;
  team: number;
  order: number;
}

export interface MatchDetail {
  match_id: number;
  radiant_team_id: number;
  radiant_team_name: string;
  dire_team_id: number;
  dire_team_name: string;
  radiant_team?: { team_id: number; name: string; tag: string; logo_url: string };
  dire_team?: { team_id: number; name: string; tag: string; logo_url: string };
  radiant_score: number;
  dire_score: number;
  radiant_win: boolean;
  duration: number;
  start_time: number;
  league_name: string;
  series_id: number;
  series_type: number;
  players: Player[];
  picks_bans: PicksBans[];
  radiant_gold_adv?: number[];
  radiant_xp_adv?: number[];
  league?: { name?: string; id?: number };
  tournament_name?: string;
}

export type SeriesMap = {
  label: string;
  matchId: string;
  radiantScore?: number;
  direScore?: number;
  duration?: number;
};

export type TeamRef = {
  team_id?: string | null;
  name?: string | null;
  logo_url?: string | null;
};

export interface MatchDetailModel {
  match: MatchDetail | null;
  radiantPlayers: Player[];
  direPlayers: Player[];
  radiantTeamName: string;
  direTeamName: string;
  radiantTeamRef: TeamRef | null;
  direTeamRef: TeamRef | null;
  radiantSeriesWins: number;
  direSeriesWins: number;
}

function createFallbackPlayer(
  player_slot: number,
  account_id: number,
  name: string,
  hero_id: number,
  kills: number,
  deaths: number,
  assists: number,
  net_worth: number,
): Player {
  return {
    player_slot,
    account_id,
    name,
    hero_id,
    level: 24,
    kills,
    deaths,
    assists,
    net_worth,
    gold_per_min: Math.round(net_worth / 38),
    xp_per_min: Math.round(net_worth / 34),
    last_hits: Math.round(net_worth / 80),
    denies: deaths + 8,
    hero_damage: Math.round(net_worth * 0.9),
    tower_damage: Math.round(net_worth * 0.08),
    hero_healing: assists * 300,
    items: [50, 63, 116, 145, 147, 160],
  };
}

export function createFallbackMatchDetail(matchId: number, seriesMaps: SeriesMap[]): MatchDetail {
  const activeMap = seriesMaps.find((map) => Number(map.matchId) === matchId) || seriesMaps[0];
  const radiantScore = activeMap?.radiantScore ?? 1;
  const direScore = activeMap?.direScore ?? 0;
  const duration = activeMap?.duration && activeMap.duration > 0 ? activeMap.duration : 2296;

  return {
    match_id: matchId,
    radiant_team_id: 8261500,
    radiant_team_name: 'XG',
    dire_team_id: 7119388,
    dire_team_name: 'Team Spirit',
    radiant_team: { team_id: 8261500, name: 'XG', tag: 'XG', logo_url: '/images/mirror/teams/8261500.png' },
    dire_team: { team_id: 7119388, name: 'Team Spirit', tag: 'TS', logo_url: '/images/mirror/teams/7119388.png' },
    radiant_score: radiantScore,
    dire_score: direScore,
    radiant_win: radiantScore >= direScore,
    duration,
    start_time: Math.floor(Date.now() / 1000) - duration,
    league_name: 'DreamLeague S23',
    series_id: 0,
    series_type: 1,
    players: [
      createFallbackPlayer(0, 898754153, 'Ame', 1, 7, 2, 14, 28400),
      createFallbackPlayer(1, 123456001, 'Xm', 10, 6, 3, 16, 22100),
      createFallbackPlayer(2, 123456002, 'Xxs', 2, 6, 1, 19, 18700),
      createFallbackPlayer(3, 123456003, 'XinQ', 86, 2, 3, 24, 11500),
      createFallbackPlayer(4, 123456004, 'Dy', 5, 3, 2, 20, 9400),
      createFallbackPlayer(128, 321580662, 'Yatoro', 8, 3, 6, 4, 22600),
      createFallbackPlayer(129, 123456101, 'Larl', 11, 2, 5, 7, 15400),
      createFallbackPlayer(130, 302214028, 'Collapse', 3, 1, 4, 7, 12600),
      createFallbackPlayer(131, 123456103, 'Mira', 4, 1, 4, 6, 8600),
      createFallbackPlayer(132, 123456104, 'Miposhka', 7, 2, 5, 6, 6500),
    ],
    picks_bans: [
      { is_pick: true, hero_id: 1, team: 0, order: 0 },
      { is_pick: true, hero_id: 10, team: 0, order: 1 },
      { is_pick: true, hero_id: 2, team: 0, order: 2 },
      { is_pick: true, hero_id: 86, team: 0, order: 3 },
      { is_pick: true, hero_id: 5, team: 0, order: 4 },
      { is_pick: true, hero_id: 8, team: 1, order: 5 },
      { is_pick: true, hero_id: 11, team: 1, order: 6 },
      { is_pick: true, hero_id: 3, team: 1, order: 7 },
      { is_pick: true, hero_id: 4, team: 1, order: 8 },
      { is_pick: true, hero_id: 7, team: 1, order: 9 },
    ],
    radiant_gold_adv: [-200, 120, 900, 1800, 2600, 5100, 7600, 9400, 12800, 18700],
    radiant_xp_adv: [-100, 400, 1100, 2100, 3900, 5600, 8400, 11200, 14600, 18100],
  };
}

function getTeamName(target: MatchDetail | null, side: 'radiant' | 'dire'): string {
  if (!target) return side === 'radiant' ? 'Radiant' : 'Dire';
  if (side === 'radiant') {
    return target.radiant_team?.name || target.radiant_team_name || 'Radiant';
  }
  return target.dire_team?.name || target.dire_team_name || 'Dire';
}

export function deriveMatchDetailModel(match: MatchDetail | null, seriesMaps: SeriesMap[]): MatchDetailModel {
  const radiantPlayers = match?.players.filter((p) => p.player_slot < 128) || [];
  const direPlayers = match?.players.filter((p) => p.player_slot >= 128) || [];

  const radiantTeamName = getTeamName(match, 'radiant');
  const direTeamName = getTeamName(match, 'dire');
  const radiantTeamRef = match
    ? {
        team_id: match.radiant_team?.team_id ? String(match.radiant_team.team_id) : (match.radiant_team_id ? String(match.radiant_team_id) : null),
        name: radiantTeamName,
        logo_url: match.radiant_team?.logo_url || null,
      }
    : null;
  const direTeamRef = match
    ? {
        team_id: match.dire_team?.team_id ? String(match.dire_team.team_id) : (match.dire_team_id ? String(match.dire_team_id) : null),
        name: direTeamName,
        logo_url: match.dire_team?.logo_url || null,
      }
    : null;

  const radiantSeriesWins = seriesMaps.filter(
    (m) => typeof m.radiantScore === 'number' && typeof m.direScore === 'number' && m.radiantScore > m.direScore
  ).length;
  const direSeriesWins = seriesMaps.filter(
    (m) => typeof m.radiantScore === 'number' && typeof m.direScore === 'number' && m.direScore > m.radiantScore
  ).length;

  return {
    match,
    radiantPlayers,
    direPlayers,
    radiantTeamName,
    direTeamName,
    radiantTeamRef,
    direTeamRef,
    radiantSeriesWins,
    direSeriesWins,
  };
}

export function fetchMatchDetailModel(matchId: number, seriesMaps: SeriesMap[], fetcher: (url: string) => Promise<Response> = fetch): Promise<MatchDetail | null> {
  return fetcher(`/api/match-details?match_id=${matchId}`)
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        throw new Error(data.error);
      }
      return data as MatchDetail;
    })
    .catch(() => createFallbackMatchDetail(matchId, seriesMaps));
}
