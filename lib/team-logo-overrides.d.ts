export interface CuratedTeamLogoEntry {
  name: string;
  aliases: string[];
  fileName: string;
  sourceUrl: string;
  mirrorPath: string;
  githubUrl: string;
  teamIds: string[];
  placeholder?: boolean;
}

export function normalizeCuratedTeamLogoKey(value: string | number | null | undefined): string;

export function findCuratedTeamLogoEntry(
  ...inputs: Array<
    | string
    | number
    | null
    | undefined
    | {
        teamId?: string | number | null;
        team_id?: string | number | null;
        id?: string | number | null;
        name?: string | null;
        tag?: string | null;
      }
  >
): CuratedTeamLogoEntry | null;

export function getCuratedTeamLogoMirrorPath(
  ...inputs: Parameters<typeof findCuratedTeamLogoEntry>
): string | null;

export function getCuratedTeamLogoGithubUrl(
  ...inputs: Parameters<typeof findCuratedTeamLogoEntry>
): string | null;

export function isCuratedTeamLogoUrl(value: string | null | undefined): boolean;

export const CURATED_TEAM_LOGOS: CuratedTeamLogoEntry[];
