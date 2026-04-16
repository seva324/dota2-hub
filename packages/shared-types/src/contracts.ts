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
  location_flag_url: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  dltv_event_slug: z.string().nullable().optional(),
  event_group_slug: z.string().nullable().optional(),
  background_image_url: z.string().nullable().optional(),
  related_tournaments: z.array(
    z.object({
      id: z.string(),
      league_id: z.union([z.string(), z.number()]).nullable().optional(),
      name: z.string(),
      tier: z.string().nullable().optional(),
      status: z.string().nullable().optional(),
      start_time: z.number().nullable().optional(),
      end_time: z.number().nullable().optional(),
    })
  ).optional(),
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
  league_id: z.union([z.string(), z.number()]).nullable().optional(),
  tournament_name: z.string().nullable().optional(),
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

export const newsSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  published_at: z.number(),
  category: z.string().nullable().optional(),
});

export type NewsSummary = z.infer<typeof newsSummarySchema>;

export const heroLiveTeamSchema = z.object({
  side: z.enum(['team1', 'team2']).nullable().optional(),
  name: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
});

export type HeroLiveTeam = z.infer<typeof heroLiveTeamSchema>;

export const heroLiveMapSchema = z.object({
  label: z.string(),
  score: z.string().nullable().optional(),
  status: z.enum(['completed', 'live']).nullable().optional(),
  result: z.enum(['team1', 'team2']).nullable().optional(),
  gameTime: z.number().nullable().optional(),
  team1Score: z.number().nullable().optional(),
  team2Score: z.number().nullable().optional(),
  team1NetWorthLead: z.number().nullable().optional(),
  team2NetWorthLead: z.number().nullable().optional(),
});

export type HeroLiveMap = z.infer<typeof heroLiveMapSchema>;

export const heroLiveSummarySchema = z.object({
  source: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  leagueName: z.string().nullable().optional(),
  bestOf: z.union([z.string(), z.number()]).nullable().optional(),
  seriesScore: z.string().nullable().optional(),
  live: z.boolean().nullable().optional(),
  startedAt: z.union([z.string(), z.number()]).nullable().optional(),
  teams: z.array(heroLiveTeamSchema),
  maps: z.array(heroLiveMapSchema),
  liveMap: heroLiveMapSchema.nullable().optional(),
});

export type HeroLiveSummary = z.infer<typeof heroLiveSummarySchema>;

export const apiResponseMetaSchema = z.object({
  generatedAt: z.string(),
  requestId: z.string().nullable().optional(),
});

export type ApiResponseMeta = z.infer<typeof apiResponseMetaSchema>;

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;

export function createApiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
    error: z.null(),
    meta: apiResponseMetaSchema,
  });
}

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  data: z.null(),
  error: apiErrorSchema,
  meta: apiResponseMetaSchema,
});

export const mpUpcomingPayloadSchema = z.object({
  days: z.number(),
  items: z.array(upcomingMatchSchema),
  teams: z.array(teamSummarySchema),
  pagination: paginationPayloadSchema,
});

export type MpUpcomingPayload = z.infer<typeof mpUpcomingPayloadSchema>;

export const mpTournamentListPayloadSchema = z.object({
  items: z.array(tournamentSummarySchema),
  pagination: paginationPayloadSchema,
});

export type MpTournamentListPayload = z.infer<typeof mpTournamentListPayloadSchema>;

export const mpTournamentDetailPayloadSchema = z.object({
  tournament: tournamentSummarySchema,
  items: z.array(tournamentSeriesSchema),
  pagination: paginationPayloadSchema,
});

export type MpTournamentDetailPayload = z.infer<typeof mpTournamentDetailPayloadSchema>;

export const mpTeamDetailPayloadSchema = z.object({
  team: teamSummarySchema.nullable(),
  items: z.array(teamFlyoutMatchSchema),
  nextMatch: teamFlyoutMatchSchema.nullable(),
  activeSquad: teamFlyoutResponseSchema.shape.activeSquad,
  topHeroes: teamFlyoutResponseSchema.shape.topHeroes,
  stats: teamFlyoutResponseSchema.shape.stats,
  pagination: paginationPayloadSchema,
});

export type MpTeamDetailPayload = z.infer<typeof mpTeamDetailPayloadSchema>;

export const mpHomePayloadSchema = z.object({
  heroLive: heroLiveSummarySchema.nullable(),
  liveMatchCount: z.number(),
  upcoming: z.array(upcomingMatchSchema),
  tournaments: z.array(tournamentSummarySchema),
  news: z.array(newsSummarySchema),
});

export type MpHomePayload = z.infer<typeof mpHomePayloadSchema>;

export const mpMatchDetailPayloadSchema = matchDetailPayloadSchema;

export type MpMatchDetailPayload = z.infer<typeof mpMatchDetailPayloadSchema>;

export const mpHomeResponseSchema = createApiSuccessSchema(mpHomePayloadSchema);
export const mpUpcomingResponseSchema = createApiSuccessSchema(mpUpcomingPayloadSchema);
export const mpTournamentListResponseSchema = createApiSuccessSchema(mpTournamentListPayloadSchema);
export const mpTournamentDetailResponseSchema = createApiSuccessSchema(mpTournamentDetailPayloadSchema);
export const mpTeamDetailResponseSchema = createApiSuccessSchema(mpTeamDetailPayloadSchema);
export const mpMatchDetailResponseSchema = createApiSuccessSchema(mpMatchDetailPayloadSchema);
