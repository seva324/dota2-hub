/** live detail 页数据：来自 hawk.live series detail 完整解析（/api/live-detail）。 */

export interface LiveDetailPayload {
  source: string;
  sourceUrl?: string | null;
  seriesId: string;
  slug?: string | null;
  championship: { id: number; name: string | null; slug: string | null } | null;
  bestOf: number | null;
  startAt?: string | null;
  team1: LiveTeam;
  team2: LiveTeam;
  /** 系列累计胜场（已结束地图推导） */
  team1Wins: number;
  team2Wins: number;
  currentMapNumber: number | null;
  maps: LiveMap[];
  cached?: boolean;
  fetchedAt?: string;
}

export interface LiveTeam {
  id: string | null;
  name: string | null;
  logoUrl?: string | null;
}

export interface LiveMap {
  matchId: string | null;
  number: number;
  isTeam1Radiant: boolean;
  status: 'live' | 'completed' | 'upcoming';
  winner: 'team1' | 'team2' | null;
  /** team1 视角比分 */
  team1Score: number | null;
  team2Score: number | null;
  gameTime: number | null;
  /** 正值 = team1 经济领先 */
  team1NetWorthLead: number | null;
  team2NetWorthLead: number | null;
  buildingState: LiveBuildingState | null;
  picks: LivePick[];
  /** 经济曲线快照（radiantNetWorthAdvantage 正值 = radiant 领先） */
  states: LiveState[];
  odds: LiveOdds[];
}

export interface LiveBuildingState {
  radiant: { top: string; mid: string; bot: string; t4: string };
  dire: { top: string; mid: string; bot: string; t4: string };
}

export interface LivePick {
  isRadiant: boolean;
  hero: { id: number | null; name: string | null; codeName: string | null };
  player: { id: number | null; name: string | null; officialName: string | null };
}

export interface LiveState {
  id: string | null;
  gameTime: number;
  radiantScore: number;
  direScore: number;
  radiantNetWorthAdvantage: number;
}

export interface LiveOdds {
  provider: string | null;
  isTeam1First: boolean;
  firstTeamWin: string | null;
  secondTeamWin: string | null;
}
