export interface SignatureHeroStat {
  hero_id: number;
  games: number;
  win: number;
}

export interface SignatureHeroResult {
  heroId: number;
  games: number;
  wins: number;
  winRate: number;
}

export interface RecentMatchDraftInput {
  matchId: number;
  startTime: number;
  tournament?: string | null;
  seriesType?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamLogoUrl?: string | null;
  opponentTeamId?: string | null;
  opponentName?: string | null;
  opponentLogoUrl?: string | null;
  teamPicks: number[];
  playerHeroId?: number | null;
  won?: boolean | null;
}

export interface RecentMatchDraftRow {
  matchId: number;
  startTime: number;
  tournament: string;
  seriesType: string;
  teamId: string | null;
  teamName: string;
  teamLogoUrl: string | null;
  opponentTeamId: string | null;
  opponentName: string;
  opponentLogoUrl: string | null;
  teamPicks: number[];
  playerHeroId: number | null;
  won: boolean | null;
}

export interface PlayerFlyoutNextMatch {
  opponentName?: string | null;
  opponentTeamId?: string | null;
  opponentLogoUrl?: string | null;
  selectedTeamId?: string | null;
  selectedTeamLogoUrl?: string | null;
  seriesType?: string | null;
  tournament?: string | null;
  startTime?: number | null;
}

export interface PlayerFlyoutSignatureHero {
  heroId: number;
  games: number;
  wins: number;
  winRate: number;
}

export interface PlayerFlyoutMostPlayedHero {
  heroId: number;
  games: number;
  wins: number;
  winRate: number;
}

export interface PlayerFlyoutRecentMatch {
  matchId: number;
  startTime: number;
  tournament?: string | null;
  seriesType?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamLogoUrl?: string | null;
  opponentTeamId?: string | null;
  opponentName?: string | null;
  opponentLogoUrl?: string | null;
  teamPicks: number[];
  playerHeroId?: number | null;
  won?: boolean | null;
}

export interface PlayerFlyoutModel {
  accountId: number;
  playerName: string;
  realName?: string | null;
  chineseName?: string | null;
  nationality?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamLogoUrl?: string | null;
  avatarUrl?: string | null;
  birthDate?: string | null;
  birthMonth?: number | null;
  birthYear?: number | null;
  age?: number | null;
  winRate?: number | null;
  signatureHeroes?: PlayerFlyoutSignatureHero[];
  signatureHero?: PlayerFlyoutSignatureHero | null;
  mostPlayedHeroes?: PlayerFlyoutMostPlayedHero[];
  nextMatch?: PlayerFlyoutNextMatch | null;
  recentMatches?: PlayerFlyoutRecentMatch[];
}

type ProPlayersSnapshotRow = {
  name?: string | null;
  name_cn?: string | null;
  team_id?: string | number | null;
  team_name?: string | null;
  country_code?: string | null;
  avatar_url?: string | null;
  realname?: string | null;
  birth_year?: number | null;
  birth_month?: number | null;
};

export function toBirthMonthYear(month?: number | null, year?: number | null): string {
  if (!month || !year) return '未知';
  const normalizedMonth = Math.min(Math.max(Math.trunc(month), 1), 12);
  const normalizedYear = Math.trunc(year);
  return `${String(normalizedMonth).padStart(2, '0')}/${normalizedYear}`;
}

export function toFlagEmoji(countryCode?: string | null): string {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return Array.from(code)
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
}

export function toFlagImageUrl(countryCode?: string | null, width = 40): string {
  const code = String(countryCode || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return '';
  return `https://flagcdn.com/w${Math.max(16, Math.trunc(width))}/${code}.png`;
}

export function formatBirthDisplay(date?: string | null, month?: number | null, year?: number | null): string {
  if (date) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) {
      const yyyy = parsed.getUTCFullYear();
      const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(parsed.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  if (year && month) {
    return `${Math.trunc(year)}-${String(Math.min(Math.max(Math.trunc(month), 1), 12)).padStart(2, '0')}`;
  }

  return '未知';
}

export function pickSignatureHeroByWinRate(
  stats: SignatureHeroStat[],
  minGames = 5
): SignatureHeroResult | null {
  const eligible = stats.filter((hero) => {
    const games = Number(hero.games || 0);
    const wins = Number(hero.win || 0);
    return games >= minGames && wins <= games;
  });

  if (!eligible.length) return null;

  const best = eligible
    .map((hero) => {
      const games = Number(hero.games || 0);
      const wins = Number(hero.win || 0);
      const winRate = games > 0 ? (wins / games) * 100 : 0;
      return {
        heroId: Number(hero.hero_id),
        games,
        wins,
        winRate,
      };
    })
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.games - a.games;
    })[0];

  return {
    ...best,
    winRate: Number(best.winRate.toFixed(1)),
  };
}

export function buildRecentMatchDraftRows(
  rows: RecentMatchDraftInput[],
  limit = 8
): RecentMatchDraftRow[] {
  return rows
    .slice()
    .sort((a, b) => Number(b.startTime || 0) - Number(a.startTime || 0))
    .slice(0, limit)
    .map((row) => ({
      matchId: Number(row.matchId),
      startTime: Number(row.startTime || 0),
      tournament: row.tournament || 'Unknown Tournament',
      seriesType: row.seriesType || 'BO3',
      teamId: row.teamId ? String(row.teamId) : null,
      teamName: row.teamName || 'Team',
      teamLogoUrl: row.teamLogoUrl || null,
      opponentTeamId: row.opponentTeamId ? String(row.opponentTeamId) : null,
      opponentName: row.opponentName || 'Opponent',
      opponentLogoUrl: row.opponentLogoUrl || null,
      teamPicks: row.teamPicks.slice(0, 5),
      playerHeroId: row.playerHeroId ? Number(row.playerHeroId) : null,
      won: row.won ?? null,
    }));
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toWinRate(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return Number(n.toFixed(1));
}

export function mapPlayerProfileApiToFlyoutModel(data: any): PlayerFlyoutModel | null {
  if (!data || typeof data !== 'object') return null;
  const accountId = toNumber(data.account_id);
  if (!accountId) return null;

  const player = data.player || {};
  const stats = data.stats || {};
  const signatureHeroesRaw = Array.isArray(data.signature_heroes)
    ? data.signature_heroes
    : (data.signature_hero ? [data.signature_hero] : []);
  const mostPlayed = Array.isArray(data.most_played_heroes) ? data.most_played_heroes : [];
  const recent = Array.isArray(data.recent_matches) ? data.recent_matches : [];
  const next = data.next_match || null;
  const nationality = player.country_code ? String(player.country_code).toUpperCase() : null;
  const chineseName = nationality === 'CN' ? (player.name_cn || null) : null;

  const signatureHeroes = signatureHeroesRaw
    .map((hero: any) => ({
      heroId: toNumber(hero.hero_id) || 0,
      games: toNumber(hero.matches) || 0,
      wins: toNumber(hero.wins) || 0,
      winRate: toWinRate(hero.win_rate) || 0,
    }))
    .filter((hero: PlayerFlyoutSignatureHero) => hero.heroId > 0 && hero.games > 0)
    .slice(0, 3);

  return {
    accountId,
    playerName: String(player.name || player.realname || accountId),
    realName: player.realname || null,
    chineseName,
    nationality,
    teamId: player.team_id ? String(player.team_id) : (next?.selected_team?.team_id ? String(next.selected_team.team_id) : null),
    teamName: player.team_name || null,
    teamLogoUrl: next?.selected_team?.logo_url || null,
    avatarUrl: player.avatar_url || null,
    birthDate: player.birth_date || null,
    birthMonth: toNumber(player.birth_month),
    birthYear: toNumber(player.birth_year),
    age: toNumber(player.age),
    winRate: toWinRate(stats.win_rate),
    signatureHeroes,
    signatureHero: signatureHeroes[0] || null,
    mostPlayedHeroes: mostPlayed
      .map((hero: any) => ({
        heroId: toNumber(hero.hero_id) || 0,
        games: toNumber(hero.matches) || 0,
        wins: toNumber(hero.wins) || 0,
        winRate: toWinRate(hero.win_rate) || 0,
      }))
      .filter((hero: PlayerFlyoutMostPlayedHero) => hero.heroId > 0 && hero.games > 0)
      .slice(0, 6),
    nextMatch: next
      ? {
          opponentName: next.opponent?.name || null,
          opponentTeamId: next.opponent?.team_id ? String(next.opponent.team_id) : null,
          opponentLogoUrl: next.opponent?.logo_url || null,
          selectedTeamId: next.selected_team?.team_id ? String(next.selected_team.team_id) : null,
          selectedTeamLogoUrl: next.selected_team?.logo_url || null,
          seriesType: next.series_type || null,
          tournament: next.tournament_name || null,
          startTime: toNumber(next.start_time),
        }
      : null,
    recentMatches: recent.map((match: any) => ({
      matchId: toNumber(match.match_id) || 0,
      startTime: toNumber(match.start_time) || 0,
      tournament: match.tournament_name || null,
      seriesType: match.series_type || null,
      teamId: match.selected_team?.team_id ? String(match.selected_team.team_id) : null,
      teamName: match.selected_team?.name || null,
      teamLogoUrl: match.selected_team?.logo_url || null,
      opponentTeamId: match.opponent?.team_id ? String(match.opponent.team_id) : null,
      opponentName: match.opponent?.name || null,
      opponentLogoUrl: match.opponent?.logo_url || null,
      teamPicks: Array.isArray(match.team_hero_ids)
        ? match.team_hero_ids.map((id: unknown) => toNumber(id) || 0).filter((id: number) => id > 0).slice(0, 5)
        : [],
      playerHeroId: toNumber(match.player_hero_id),
      won: match.won === null || match.won === undefined ? null : Boolean(match.won),
    })),
  };
}

export function createMinimalPlayerFlyoutModel(accountId: number): PlayerFlyoutModel {
  return {
    accountId,
    playerName: String(accountId),
    realName: null,
    chineseName: null,
    nationality: null,
    teamId: null,
    teamName: null,
    teamLogoUrl: null,
    avatarUrl: null,
    birthDate: null,
    birthMonth: null,
    birthYear: null,
    age: null,
    winRate: null,
    signatureHeroes: [],
    signatureHero: null,
    mostPlayedHeroes: [],
    nextMatch: null,
    recentMatches: [],
  };
}

function buildFallbackFlyoutModel(accountId: number, row: ProPlayersSnapshotRow | null): PlayerFlyoutModel {
  const fallback = createMinimalPlayerFlyoutModel(accountId);
  const nationality = row?.country_code ? String(row.country_code).toUpperCase() : null;

  return {
    ...fallback,
    playerName: row?.name || fallback.playerName,
    realName: row?.realname || null,
    chineseName: nationality === 'CN' ? (row?.name_cn || null) : null,
    nationality,
    teamId: row?.team_id !== null && row?.team_id !== undefined ? String(row.team_id) : null,
    teamName: row?.team_name || null,
    avatarUrl: row?.avatar_url || null,
    birthMonth: toNumber(row?.birth_month),
    birthYear: toNumber(row?.birth_year),
  };
}

async function fetchProPlayersSnapshot(accountId: number): Promise<ProPlayersSnapshotRow | null> {
  try {
    const res = await fetch(`/api/pro-players?account_id=${accountId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return data as ProPlayersSnapshotRow;
  } catch {
    return null;
  }
}

export async function fetchPlayerProfileFlyoutModel(accountId: number): Promise<PlayerFlyoutModel | null> {
  const id = Number(accountId);
  if (!Number.isFinite(id) || id <= 0) return null;

  try {
    const res = await fetch(`/api/player-profile?account_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      const mapped = mapPlayerProfileApiToFlyoutModel(data);
      if (mapped) return mapped;
    }
  } catch {
    // fall through to fallback snapshot
  }

  const snapshot = await fetchProPlayersSnapshot(id);
  return buildFallbackFlyoutModel(id, snapshot);
}
