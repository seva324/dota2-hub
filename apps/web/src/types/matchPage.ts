export interface SeriesTeamInfo {
  id: number | null;
  name: string | null;
  tag: string | null;
  logo: string | null;
  logoDark: string | null;
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
  teams: {
    radiant: SeriesTeamInfo;
    dire: SeriesTeamInfo;
  };
  maps: SeriesMapBlock[];
}
