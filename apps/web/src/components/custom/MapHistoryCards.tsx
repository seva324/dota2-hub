import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import type { LiveMap, LiveTeam } from '@/types/liveDetail';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  surface: '#111a27',
  faint: '#7a8ba1',
  fg: '#eaf2fb',
  border: 'rgba(148,178,214,0.14)',
  green: '#4ade80',
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

/** 已结束地图历史卡：比分/时长/领先/获胜方；输方队名与比分置灰，不展示 Match ID。 */
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
        const t1Side = m.isTeam1Radiant ? 'Radiant' : 'Dire';
        const t2Side = m.isTeam1Radiant ? 'Dire' : 'Radiant';
        const t1Lose = m.winner !== 'team1';
        const t2Lose = m.winner !== 'team2';
        const wTeam = m.winner === 'team1' ? team1 : team2;
        const wSide = m.isTeam1Radiant ? (m.winner === 'team1' ? 'Radiant' : 'Dire') : (m.winner === 'team1' ? 'Dire' : 'Radiant');
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
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${design.border}` }}>
                  <SafeImg src={team1.logoUrl} alt={team1.name || '1'} className="h-full w-full object-contain p-0.5" fallback={<TeamLogoFallback name={team1.name || '1'} size={20} />} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold" style={{ color: t1Lose ? design.faint : design.fg }}>{team1.name || 'TBD'}</span>
                  <span className="block text-[9px] font-bold uppercase tracking-wider" style={{ color: t1Side === 'Radiant' ? design.blue : design.red, opacity: t1Lose ? 0.5 : 1 }}>
                    {t1Side}
                  </span>
                </span>
              </div>

              <div className="flex items-baseline gap-1.5 font-black text-lg" style={{ fontFamily: "'Exo2', sans-serif" }}>
                <span style={{ color: t1Lose ? design.faint : '#fff' }}>{m.team1Score ?? '—'}</span>
                <span className="text-xs font-bold" style={{ color: design.faint }}>:</span>
                <span style={{ color: t2Lose ? design.faint : '#fff' }}>{m.team2Score ?? '—'}</span>
              </div>

              <div className="flex min-w-0 flex-row-reverse items-center gap-2 text-right">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${design.border}` }}>
                  <SafeImg src={team2.logoUrl} alt={team2.name || '2'} className="h-full w-full object-contain p-0.5" fallback={<TeamLogoFallback name={team2.name || '2'} size={20} />} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold" style={{ color: t2Lose ? design.faint : design.fg }}>{team2.name || 'TBD'}</span>
                  <span className="block text-[9px] font-bold uppercase tracking-wider" style={{ color: t2Side === 'Radiant' ? design.blue : design.red, opacity: t2Lose ? 0.5 : 1 }}>
                    {t2Side}
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex flex-col items-center gap-1 border-t border-dashed pt-2.5" style={{ borderColor: design.border }}>
              <span className="flex items-center gap-2.5 text-[10px]" style={{ color: design.faint }}>
                <b className="text-xs" style={{ color: design.fg }}>{formatClock(m.gameTime)}</b>
                {lead && <span>领先 {lead}</span>}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[10px]">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: design.green }}>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: design.green, boxShadow: `0 0 8px ${design.green}88` }} />
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
