export interface SeriesCountryInfo {
  name: string | null;
  code: string | null;
  emoji: string | null;
  flag: string | null;
}

export interface SeriesTeamStatRow {
  maps: number | null;
  wins: number | null;
  winRate: number | null;
  fbRate: number | null;
  f10Rate: number | null;
  winFbRate: number | null;
  winF10Rate: number | null;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  avgTime: number | null;
}

export interface SeriesHeroStat {
  heroId: number | null;
  heroTitle: string | null;
  heroImage: string | null;
  maps: number | null;
  wins: number | null;
  winRate: number | null;
}

export interface SeriesTeamStats {
  overall: SeriesTeamStatRow | null;
  heroes: SeriesHeroStat[];
}

export interface SeriesTeamInfo {
  id: number | null;
  name: string | null;
  slug: string | null;
  tag: string | null;
  logo: string | null;
  logoDark: string | null;
  rank: number | null;
  winRate: string | null;
  fbRate: string | null;
  f10Rate: string | null;
  mapsTotal: number | null;
  players: SeriesLineupPlayer[];
  stats: SeriesTeamStats | null;
}

export interface SeriesTopHero {
  heroId: number | null;
  heroTitle: string | null;
  heroImage: string | null;
  maps: number | null;
  wins: number | null;
  winRate: string | null;
}

export interface SeriesLineupPlayer {
  id: number | null;
  steamId: string | null;
  name: string | null;
  image: string | null;
  rank: number | null;
  role: number | null;
  roleLabel: string | null;
  winRate: string | null;
  maps: number | null;
  kda: string | null;
  avgGpm: string | null;
  avgXpm: string | null;
  avgDmg: string | null;
  topHeroes: SeriesTopHero[];
}

export interface SeriesEventInfo {
  name: string | null;
  tag: string | null;
  countryId: number | null;
  country: SeriesCountryInfo | null;
  startDate: string | null;
  endDate: string | null;
  tier: number | null;
  prizePool: number | null;
  twitchLink: string | null;
  bracketsLink: string | null;
  image: string | null;
}

export interface SeriesStream {
  platform: string | null;
  url: string | null;
  channelTitle: string | null;
  isLive: boolean;
}

export interface SeriesPlayerRow {
  teamId: number | null;
  playerId: number | null;
  playerName: string | null;
  avatar: string | null;
  steamId: string | null;
  country: string | null;
  countryFlag: string | null;
  rank: number | null;
  heroId: number | null;
  heroTitle: string | null;
  heroImg: string | null;
  facetTitle: string | null;
  level: number | null;
  kills: number;
  deaths: number;
  assists: number;
  lastHits: number;
  denies: number;
  gpm: number;
  xpm: number;
  goldTotal: number;
  goldCurrent: number;
  items: Array<{ id: number | null; title: string | null; steamId: string | null; image: string | null }>;
  backpack: Array<{ id: number | null; title: string | null; steamId: string | null; image: string | null }>;
  neutralItem: { id: number | null; title: string | null; steamId: string | null; image: string | null } | null;
  hasScepter: boolean;
  hasShard: boolean;
}

export interface SeriesMapBlock {
  gameNo: number;
  steamId: string | null;
  label: string | null;
  radiantTeamId: number | null;
  direTeamId: number | null;
  radiantScore: number | null;
  direScore: number | null;
  winner: 'radiant' | 'dire' | null;
  duration: number | null;
  fb: 'radiant' | 'dire' | null;
  f10: 'radiant' | 'dire' | null;
  startTime: number | null;
  radiantPicks: number[];
  direPicks: number[];
  radiantBans: number[];
  direBans: number[];
  players: SeriesPlayerRow[];
}

export interface MatchPagePayload {
  seriesId: number;
  eventName: string | null;
  bestOf: string | null;
  startTime: number | null;
  radiantWins: number;
  direWins: number;
  status?: number | null;
  stage?: string | null;
  eventFormat?: string | null;
  event?: SeriesEventInfo | null;
  streams?: SeriesStream[];
  source?: 'cache' | 'stale' | 'dltv' | 'timeout';
  teams: {
    radiant: SeriesTeamInfo;
    dire: SeriesTeamInfo;
  };
  maps: SeriesMapBlock[];
}
