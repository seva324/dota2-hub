// DOTA2 Pro Hub - Type Definitions

export interface Team {
  id: string;
  name: string;
  tag: string;
  logo?: string;
  country?: string;
  ranking?: number;
  points?: number;
}

export interface Player {
  id: string;
  name: string;
  position: number;
  country?: string;
  avatar?: string;
}

export interface MatchResult {
  matchId: string;
  radiantTeam: Team;
  direTeam: Team;
  radiantScore: number;
  direScore: number;
  duration: string;
  winner: 'radiant' | 'dire';
  timestamp: string;
}

export interface Series {
  seriesId: string;
  teamA: Team;
  teamB: Team;
  scoreA: number;
  scoreB: number;
  format: 'BO1' | 'BO3' | 'BO5';
  winner?: Team;
  matches: MatchResult[];
  timestamp: string;
  stage: string;
}

export interface Tournament {
  id: string;
  name: string;
  organizer: string;
  tier: 'T1' | 'T2' | 'T3';
  prizePool: string;
  location: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'ongoing' | 'completed';
  format: string;
  teams: Team[];
  standings?: Standing[];
  series: Series[];
  image?: string;
}

export interface Standing {
  position: number;
  team: Team;
  wins: number;
  losses: number;
  points?: number;
}

export interface Transfer {
  id: string;
  player: Player;
  fromTeam?: Team;
  toTeam?: Team;
  date: string;
  type: 'transfer' | 'join' | 'leave' | 'retire';
  note?: string;
}

export interface News {
  id: string;
  title: string;
  summary: string;
  content?: string;
  source: string;
  author?: string;
  publishedAt: string;
  image?: string;
  category: 'tournament' | 'transfer' | 'patch' | 'community';
}

export interface CommunityPost {
  id: string;
  title: string;
  author: string;
  source: 'reddit' | 'nga' | 'twitter';
  upvotes: number;
  comments: number;
  url: string;
  publishedAt: string;
}

export interface Hero {
  id: number;
  name: string;
  localizedName: string;
  primaryAttr: 'str' | 'agi' | 'int' | 'uni';
  attackType: 'Melee' | 'Ranged';
  image?: string;
}
