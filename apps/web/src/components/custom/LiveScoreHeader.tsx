import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import type { LiveDetailPayload, LiveMap } from '@/types/liveDetail';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#1a1d24',
  pip: '#facc15',
  text: '#71717a',
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

/** Live 详情比分头：系列比分 + 地图切换 + 当前局比分/时长/经济领先 */
export function LiveScoreHeader({ payload, activeMap, onSelectMap }: {
  payload: LiveDetailPayload;
  activeMap: LiveMap;
  onSelectMap: (number: number) => void;
}) {
  const t1 = payload.team1.name || 'TBD';
  const t2 = payload.team2.name || 'TBD';
  const lead = activeMap.team1NetWorthLead;
  const leadTeam = lead != null && lead > 0 ? 1 : lead != null && lead < 0 ? 2 : null;

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: design.card }}>
      {/* 地图切换 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {payload.maps.map((map) => {
          const isActive = map.number === activeMap.number;
          const isFinished = map.status === 'completed';
          return (
            <button
              key={map.number}
              type="button"
              onClick={() => onSelectMap(map.number)}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                isActive ? 'text-black' : 'text-slate-300 hover:text-white'
              }`}
              style={{ backgroundColor: isActive ? design.pip : 'rgba(255,255,255,0.06)' }}
            >
              Map {map.number}
              {isFinished && <span style={{ color: isActive ? 'rgba(0,0,0,0.5)' : '#71717a' }}>{map.winner === 'team1' ? '·R' : '·D'}</span>}
              {map.status === 'live' && <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: isActive ? '#ff3b30' : design.red }} />}
            </button>
          );
        })}
      </div>

      {/* 队伍 + 系列比分 */}
      <div className="flex items-center justify-center gap-3 md:gap-6">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-sm font-bold text-white">{t1}</span>
          <SafeImg
            src={payload.team1.logoUrl}
            alt={t1}
            className="size-9 shrink-0 object-contain"
            fallback={<TeamLogoFallback name={t1} size={36} />}
          />
          {leadTeam === 1 && (
            <span className="shrink-0 text-[11px] font-bold" style={{ color: design.blue }}>{formatNetWorth(lead!)}</span>
          )}
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black tabular-nums text-white">{activeMap.team1Score ?? '—'}</span>
            <span className="text-lg font-bold text-slate-500">:</span>
            <span className="text-3xl font-black tabular-nums text-white">{activeMap.team2Score ?? '—'}</span>
          </div>
          <span className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: design.text, backgroundColor: 'rgba(255,255,255,0.06)' }}>
            Series {payload.team1Wins} : {payload.team2Wins} · {formatClock(activeMap.gameTime)}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {leadTeam === 2 && (
            <span className="shrink-0 text-[11px] font-bold" style={{ color: design.red }}>{formatNetWorth(lead!)}</span>
          )}
          <SafeImg
            src={payload.team2.logoUrl}
            alt={t2}
            className="size-9 shrink-0 object-contain"
            fallback={<TeamLogoFallback name={t2} size={36} />}
          />
          <span className="truncate text-sm font-bold text-white">{t2}</span>
        </div>
      </div>
    </div>
  );
}
