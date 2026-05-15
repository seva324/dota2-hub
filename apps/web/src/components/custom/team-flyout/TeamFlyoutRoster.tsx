import { UserRound } from 'lucide-react';
import { toFlagImageUrl } from '@/lib/playerProfile';

type Player = { accountId: number | null; name: string; realname: string | null; countryCode: string | null; avatarUrl: string | null; role?: string | null };
type Props = { players: Player[]; onPlayerClick?: (accountId: number) => void };

export function TeamFlyoutRoster({ players, onPlayerClick }: Props) {
  if (!players.length) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-2.5"><UserRound className="w-4 h-4 text-red-400" /><h4 className="text-xs font-bold text-foreground uppercase tracking-wider">当前阵容</h4></div>
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">暂无最近一场比赛阵容</div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5"><UserRound className="w-4 h-4 text-red-400" /><h4 className="text-xs font-bold text-foreground uppercase tracking-wider">当前阵容</h4></div>
      <div className="grid grid-cols-2 gap-2">
        {players.map((player, idx) => {
          const flagUrl = toFlagImageUrl(player.countryCode, 32);
          const body = (
            <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-gradient-to-br from-secondary/50 to-secondary/20 p-2.5 transition-all duration-200 hover:border-red-400/30 hover:bg-gradient-to-br hover:from-secondary/70 hover:to-red-950/10 hover:shadow-[var(--shadow-glow)]">
              <div className="w-12 h-12 rounded-full bg-slate-700/60 border border-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                {player.avatarUrl ? <img src={player.avatarUrl} alt={player.name} className="h-full w-full object-cover" /> : <UserRound className="h-6 w-6 text-slate-500" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {flagUrl ? <img src={flagUrl} alt={player.countryCode || ''} className="h-3 w-[18px] rounded-[2px] object-cover flex-shrink-0" /> : <span className="inline-block h-3 w-[18px] rounded-[2px] bg-slate-700 flex-shrink-0" />}
                  <span className="text-sm font-semibold text-slate-100 truncate">{player.name}</span>
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">{player.realname || '—'}</div>
                {player.role && <div className="text-[10px] font-medium text-amber-400/70 truncate mt-0.5 uppercase tracking-wide">{player.role}</div>}
              </div>
            </div>
          );
          return player.accountId ? (
            <button key={`squad-${player.accountId}-${idx}`} type="button" className="text-left"
              data-visual-role={player.name === '33' ? 'player-profile-trigger' : undefined}
              data-player-name={player.name === '33' ? '33' : undefined}
              onClick={() => onPlayerClick?.(player.accountId!)}>
              {body}
            </button>
          ) : (
            <div key={`squad-${player.name}-${idx}`}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
