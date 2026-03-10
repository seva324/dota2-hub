import { z } from 'zod';

export const teamSummarySchema = z.object({
  team_id: z.string().nullable().optional(),
  id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  name_cn: z.string().nullable().optional(),
  tag: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  is_cn_team: z.union([z.number(), z.boolean()]).nullable().optional(),
});

export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const upcomingMatchSchema = z.object({
  id: z.union([z.string(), z.number()]),
  series_id: z.string().nullable().optional(),
  radiant_team_id: z.string().nullable().optional(),
  dire_team_id: z.string().nullable().optional(),
  radiant_team_name: z.string().nullable().optional(),
  dire_team_name: z.string().nullable().optional(),
  radiant_team_logo: z.string().nullable().optional(),
  dire_team_logo: z.string().nullable().optional(),
  start_time: z.number(),
  series_type: z.string().nullable().optional(),
  tournament_name: z.string().nullable().optional(),
  tournament_name_cn: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

export type UpcomingMatch = z.infer<typeof upcomingMatchSchema>;

export const upcomingResponseSchema = z.object({
  days: z.number(),
  upcoming: z.array(upcomingMatchSchema),
  teams: z.array(teamSummarySchema),
});

export type UpcomingResponse = z.infer<typeof upcomingResponseSchema>;

export const tournamentSummarySchema = z.object({
  id: z.string(),
  league_id: z.union([z.string(), z.number()]).nullable().optional(),
  name: z.string(),
  name_cn: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  start_time: z.number().nullable().optional(),
  end_time: z.number().nullable().optional(),
  prize_pool: z.string().nullable().optional(),
  prize_pool_usd: z.number().nullable().optional(),
  image: z.string().nullable().optional(),
});

export type TournamentSummary = z.infer<typeof tournamentSummarySchema>;

export const seriesGameSchema = z.object({
  match_id: z.string(),
  radiant_team_id: z.string().nullable().optional(),
  dire_team_id: z.string().nullable().optional(),
  radiant_team_name: z.string().nullable().optional(),
  dire_team_name: z.string().nullable().optional(),
  radiant_team_logo: z.string().nullable().optional(),
  dire_team_logo: z.string().nullable().optional(),
  radiant_score: z.number().nullable().optional(),
  dire_score: z.number().nullable().optional(),
  radiant_win: z.union([z.number(), z.boolean()]).nullable().optional(),
  start_time: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
});

export type SeriesGame = z.infer<typeof seriesGameSchema>;

export const tournamentSeriesSchema = z.object({
  series_id: z.string(),
  series_type: z.string().nullable().optional(),
  radiant_team_id: z.string().nullable().optional(),
  dire_team_id: z.string().nullable().optional(),
  radiant_team_name: z.string().nullable().optional(),
  dire_team_name: z.string().nullable().optional(),
  radiant_team_logo: z.string().nullable().optional(),
  dire_team_logo: z.string().nullable().optional(),
  radiant_score: z.number().nullable().optional(),
  dire_score: z.number().nullable().optional(),
  stage: z.string().nullable().optional(),
  stage_kind: z.string().nullable().optional(),
  games: z.array(seriesGameSchema),
});

export type TournamentSeries = z.infer<typeof tournamentSeriesSchema>;

export const paginationPayloadSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
  nextCursor: z.number().nullable().optional(),
});

export type PaginationPayload = z.infer<typeof paginationPayloadSchema>;

export const tournamentListResponseSchema = z.object({
  tournaments: z.array(tournamentSummarySchema),
});

export type TournamentListResponse = z.infer<typeof tournamentListResponseSchema>;

export const tournamentDetailResponseSchema = z.object({
  tournament: tournamentSummarySchema,
  series: z.array(tournamentSeriesSchema),
  pagination: paginationPayloadSchema,
});

export type TournamentDetailResponse = z.infer<typeof tournamentDetailResponseSchema>;

export const teamFlyoutMatchSchema = z.object({
  match_id: z.string(),
  series_id: z.string().nullable().optional(),
  radiant_team_id: z.string().nullable().optional(),
  dire_team_id: z.string().nullable().optional(),
  radiant_team_name: z.string().nullable().optional(),
  dire_team_name: z.string().nullable().optional(),
  radiant_team_logo: z.string().nullable().optional(),
  dire_team_logo: z.string().nullable().optional(),
  radiant_score: z.number().nullable().optional(),
  dire_score: z.number().nullable().optional(),
  start_time: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  league_id: z.number().nullable().optional(),
  series_type: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  tournament_name: z.string().nullable().optional(),
});

export type TeamFlyoutMatch = z.infer<typeof teamFlyoutMatchSchema>;

export const teamFlyoutResponseSchema = z.object({
  team: teamSummarySchema.nullable(),
  recentMatches: z.array(teamFlyoutMatchSchema),
  nextMatch: teamFlyoutMatchSchema.nullable(),
  activeSquad: z.array(
    z.object({
      account_id: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      realname: z.string().nullable().optional(),
      country_code: z.string().nullable().optional(),
      avatar_url: z.string().nullable().optional(),
    })
  ),
  topHeroes: z.array(
    z.object({
      hero_id: z.number(),
      matches: z.number(),
    })
  ),
  stats: z.object({
    wins: z.number(),
    losses: z.number(),
    winRate: z.number(),
  }),
  pagination: paginationPayloadSchema,
});

export type TeamFlyoutResponse = z.infer<typeof teamFlyoutResponseSchema>;

export const matchPlayerSchema = z.object({
  account_id: z.number().nullable().optional(),
  personaname: z.string().nullable().optional(),
  hero_id: z.number().nullable().optional(),
  kills: z.number().nullable().optional(),
  deaths: z.number().nullable().optional(),
  assists: z.number().nullable().optional(),
  net_worth: z.number().nullable().optional(),
  player_slot: z.number().nullable().optional(),
});

export type MatchPlayer = z.infer<typeof matchPlayerSchema>;

export const matchDetailPayloadSchema = z.object({
  match_id: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  radiant_score: z.number().nullable().optional(),
  dire_score: z.number().nullable().optional(),
  radiant_win: z.union([z.boolean(), z.number()]).nullable().optional(),
  start_time: z.number().nullable().optional(),
  radiant_team: z.object({
    team_id: z.union([z.number(), z.string()]).nullable().optional(),
    name: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
  }).nullable().optional(),
  dire_team: z.object({
    team_id: z.union([z.number(), z.string()]).nullable().optional(),
    name: z.string().nullable().optional(),
    logo_url: z.string().nullable().optional(),
  }).nullable().optional(),
  players: z.array(matchPlayerSchema).optional(),
  picks_bans: z.array(
    z.object({
      hero_id: z.number().nullable().optional(),
      is_pick: z.union([z.boolean(), z.number()]).nullable().optional(),
      team: z.union([z.number(), z.string()]).nullable().optional(),
      order: z.number().nullable().optional(),
    })
  ).optional(),
});

export type MatchDetailPayload = z.infer<typeof matchDetailPayloadSchema>;
