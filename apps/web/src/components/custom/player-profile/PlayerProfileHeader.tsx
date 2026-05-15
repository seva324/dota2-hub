import { Star } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import type { PlayerFlyoutModel } from '@/lib/playerProfile';

type Props = {
  player: PlayerFlyoutModel | null;
  flagImageUrl: string | null;
  nationalityLabel: string;
  teamLogoUrl: string | null;
  onTeamSelect?: (team: { team_id?: string | null; name?: string | null; logo_url?: string | null }) => void;
};

export function PlayerProfileHeader({ player, flagImageUrl, nationalityLabel, teamLogoUrl, onTeamSelect }: Props) {
  return (
    <div className="relative border-b border-border/60 bg-secondary/30 px-5 pb-0 pt-5">
      <button
        type="button"
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-lg border border-primary/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:border-red-400 hover:bg-red-500/10"
      >
        <Star className="size-3" />
        关注
      </button>

      <div className="flex gap-4">
        <div className="size-24 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-[2px] shadow-lg shadow-blue-900/25">
          <div className="h-full w-full overflow-hidden rounded-full bg-gradient-to-br from-slate-700 to-slate-900">
            <SafeImg
              src={player?.avatarUrl}
              alt={player?.playerName || 'Player'}
              className="h-full w-full object-cover"
              fallback={<div className="flex size-full items-center justify-center bg-gradient-to-br from-slate-600 to-slate-800"><span className="text-2xl font-bold text-slate-400">{player?.playerName?.[0] || '?'}</span></div>}
            />
          </div>
        </div>

        <div className="min-w-0 pt-1 pr-20">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-xl font-bold text-foreground">{player?.playerName || '—'}</h2>
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">✓</span>
          </div>
          {player?.realName && (
            <div className="mt-0.5 text-xs text-slate-400">{player.realName}{player?.chineseName ? ` · ${player.chineseName}` : ''}</div>
          )}
          <button
            type="button"
            className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-300 transition hover:text-white"
            onClick={() => onTeamSelect?.({ team_id: player?.teamId, name: player?.teamName, logo_url: teamLogoUrl })}
          >
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-800">
              <SafeImg src={teamLogoUrl} alt={player?.teamName || ''} className="h-full w-full object-contain" fallback={<span className="text-[9px] text-slate-500">队</span>} />
            </span>
            <span className="truncate">{player?.teamName || 'Free Agent'}</span>
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
            {player?.hotRank != null && (
              <span className="text-slate-500">人气排名 <span className="font-semibold text-amber-300">#{player.hotRank}</span></span>
            )}
            {player?.hotScore && (
              <span className="text-slate-500">热度 <span className="text-slate-300">{player.hotScore}</span></span>
            )}
            {player?.nationality && (
              <span className="flex items-center gap-1 text-slate-400">
                {flagImageUrl && <img src={flagImageUrl} alt={player.nationality} className="h-3 w-4 rounded-[2px] object-cover" />}
                {nationalityLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
