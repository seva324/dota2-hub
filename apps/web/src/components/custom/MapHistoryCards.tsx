import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import { resolveTeamLogo } from '@/lib/teams';
import type { LiveMap, LiveTeam } from '@/types/liveDetail';

const design = {
  radiant: '#34d399',
  dire: '#ff3b30',
  surface: '#111a27',
  faint: '#7a8ba1',
  fg: '#eaf2fb',
  border: 'rgba(148,178,214,0.14)',
  gold: '#facc15',
};

function formatClock(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatNetWorth(v: number): string {
  const abs = Math.abs(v);
  return `+${abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(Math.round(abs))}`;
}

function TeamCell({ team, side, lose }: {
  team: LiveTeam;
  side: 'Radiant' | 'Dire';
  lose: boolean;
}) {
  const name = team.name || 'TBD';
  const logo = resolveTeamLogo({ name, teamId: team.id }, [], team.logoUrl);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${design.border}` }}>
        <SafeImg src={logo || ''} alt={name} className="h-full w-full object-contain p-0.5" fallback={<TeamLogoFallback name={name} size={20} />} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold" style={{ color: lose ? design.faint : design.fg }}>{name}</span>
        <span className="block text-[9px] font-bold uppercase tracking-wider" style={{ color: side === 'Radiant' ? design.radiant : design.dire, opacity: lose ? 0.5 : 1 }}>
          {side}
        </span>
      </span>
    </div>
  );
}

/** 已结束地图历史卡：比分/时长/领先/获胜方；天辉在左、夜魇在右，输方置灰，不展示 Match ID。队标镜像优先。 */
export function MapHistoryCards({ maps, team1, team2 }: {
  maps: LiveMap[];
  team1: LiveTeam;
  team2: LiveTeam;
}) {
  const finished = maps.filter((m) => m.status === 'completed');
  if (!finished.length) {
    return <div className="py-6 text-center text-xs" style={{ color: design.faint }}>暂无已结束地图</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {finished.map((m) => {
        const isTeam1Radiant = m.isTeam1Radiant;
        const radiant = isTeam1Radiant ? team1 : team2;
        const dire = isTeam1Radiant ? team2 : team1;
        const radiantSideKey = isTeam1Radiant ? 'team1' : 'team2';
        const direSideKey = isTeam1Radiant ? 'team2' : 'team1';
        const radiantScore = isTeam1Radiant ? m.team1Score : m.team2Score;
        const direScore = isTeam1Radiant ? m.team2Score : m.team1Score;
        const radiantLose = m.winner !== radiantSideKey;
        const direLose = m.winner !== direSideKey;
        const wTeam = m.winner === radiantSideKey ? radiant : dire;
        const wSide = m.winner === radiantSideKey ? 'Radiant' : 'Dire';
        const lead = m.team1NetWorthLead != null
          ? `${formatNetWorth(Math.abs(m.team1NetWorthLead))} ${team1.name}`
          : m.team2NetWorthLead != null
            ? `${formatNetWorth(Math.abs(m.team2NetWorthLead))} ${team2.name}`
            : null;

        return (
          <div
            key={m.number}
            className="rounded-2xl p-3.5 transition-colors"
            style={{ backgroundColor: design.surface, border: `1px solid ${design.border}` }}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold" style={{ fontFamily: "'Exo2', sans-serif", color: design.fg }}>
                地图 {m.number}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <TeamCell team={radiant} side="Radiant" lose={radiantLose} />

              <div className="flex items-baseline gap-1.5 font-black text-lg" style={{ fontFamily: "'Exo2', sans-serif" }}>
                <span style={{ color: radiantLose ? design.faint : '#fff' }}>{radiantScore ?? '—'}</span>
                <span className="text-xs font-bold" style={{ color: design.faint }}>:</span>
                <span style={{ color: direLose ? design.faint : '#fff' }}>{direScore ?? '—'}</span>
              </div>

              <div className="flex min-w-0 flex-row-reverse items-center gap-2 text-right">
                <TeamCell team={dire} side="Dire" lose={direLose} />
              </div>
            </div>

            <div className="mt-2.5 flex flex-col items-center gap-1 border-t border-dashed pt-2.5" style={{ borderColor: design.border }}>
              <span className="flex items-center gap-2.5 text-[10px]" style={{ color: design.faint }}>
                <b className="text-xs" style={{ color: design.fg }}>{formatClock(m.gameTime)}</b>
                {lead && <span>领先 {lead}</span>}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: design.gold }}>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: design.gold, boxShadow: `0 0 8px ${design.gold}88` }} />
                  {wTeam.name || 'TBD'} 获胜
                </span>
                <span style={{ color: design.faint }}>· {wSide}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
