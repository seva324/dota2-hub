import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import type { LiveDetailPayload, LiveMap } from '@/types/liveDetail';

const design = {
  blue: '#2b55e8',
  red: '#ff3b30',
  card: '#0d141e',
  surface: '#111a27',
  pip: '#facc15',
  gold: '#facc15',
  text: '#93a4b8',
  faint: '#7a8ba1',
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WinChips({ wins }: { wins: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full transition-colors"
          style={{
            backgroundColor: i < wins ? design.gold : 'rgba(255,255,255,0.16)',
            boxShadow: i < wins ? `0 0 8px ${design.gold}66` : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Live 详情比分头：地图切换 + 系列比分/当前局比分 + 阵营标识 + 胜场点 + 实时领先条 */
export function LiveScoreHeader({ payload, activeMap, onSelectMap }: {
  payload: LiveDetailPayload;
  activeMap: LiveMap;
  onSelectMap: (number: number) => void;
}) {
  const t1 = payload.team1.name || 'TBD';
  const t2 = payload.team2.name || 'TBD';
  const lead = activeMap.team1NetWorthLead;
  const leadTeam = lead != null && lead > 0 ? 1 : lead != null && lead < 0 ? 2 : null;
  const t1Side = activeMap.isTeam1Radiant ? 'Radiant' : 'Dire';
  const t2Side = activeMap.isTeam1Radiant ? 'Dire' : 'Radiant';
  const isLive = activeMap.status === 'live';

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: design.card, border: `1px solid ${design.border}` }}>
      {/* 地图切换 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {payload.maps.map((map) => {
          const isActive = map.number === activeMap.number;
          const isFinished = map.status === 'completed';
          return (
            <button
              key={map.number}
              type="button"
              onClick={() => onSelectMap(map.number)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors"
              style={{
                backgroundColor: isActive ? `${design.pip}29` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? 'rgba(250,204,21,0.5)' : design.border}`,
                color: isActive ? design.pip : design.text,
              }}
              aria-selected={isActive}
            >
              Map {map.number}
              {isFinished && (
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: design.green, boxShadow: `0 0 8px ${design.green}88` }}
                />
              )}
              {map.status === 'live' && (
                <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: design.red }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 队伍 + 比分 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
        {/* 天辉/夜魇：team1 */}
        <div className="flex min-w-0 flex-col items-center gap-2">
          <SafeImg
            src={payload.team1.logoUrl}
            alt={t1}
            className="size-14 shrink-0 object-contain md:size-16"
            fallback={<TeamLogoFallback name={t1} size={56} />}
          />
          <span className="w-full truncate text-center text-sm font-bold text-white md:text-base">{t1}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: activeMap.isTeam1Radiant ? design.blue : design.red }}>
            {t1Side}
          </span>
          <WinChips wins={payload.team1Wins} />
        </div>

        {/* 中央比分 */}
        <div className="flex flex-col items-center px-2">
          <span className="mb-1 text-[11px] text-slate-500">{formatDate(payload.startAt)}</span>
          <div className="flex items-baseline gap-2 font-black leading-none text-white" style={{ fontFamily: "'Exo2', sans-serif" }}>
            <span className="text-4xl md:text-5xl">{activeMap.team1Score ?? '—'}</span>
            <span className="text-xl font-bold text-slate-500">:</span>
            <span className="text-4xl md:text-5xl">{activeMap.team2Score ?? '—'}</span>
          </div>
          <span
            className="mt-2 rounded-md px-2 py-1 text-[10px] font-bold"
            style={{ color: design.text, backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            Series {payload.team1Wins} : {payload.team2Wins} · {formatClock(activeMap.gameTime)}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: design.text, backgroundColor: 'rgba(255,255,255,0.05)' }}>
              Best of {payload.bestOf || 3}
            </span>
            {isLive && (
              <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: design.red, boxShadow: `0 0 16px ${design.red}66` }}>
                <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </span>
            )}
          </div>
        </div>

        {/* 天辉/夜魇：team2 */}
        <div className="flex min-w-0 flex-col items-center gap-2">
          <SafeImg
            src={payload.team2.logoUrl}
            alt={t2}
            className="size-14 shrink-0 object-contain md:size-16"
            fallback={<TeamLogoFallback name={t2} size={56} />}
          />
          <span className="w-full truncate text-center text-sm font-bold text-white md:text-base">{t2}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: activeMap.isTeam1Radiant ? design.red : design.blue }}>
            {t2Side}
          </span>
          <WinChips wins={payload.team2Wins} />
        </div>
      </div>

      {/* 实时领先条（仅直播局） */}
      {isLive && (
        <div
          className="mt-4 flex items-center gap-3 rounded-xl px-3.5 py-2.5"
          style={{ backgroundColor: 'rgba(255,59,48,0.14)', border: '1px solid rgba(255,59,48,0.28)' }}
        >
          <span className="text-xs font-bold text-white">第 {activeMap.number} 局 · 进行中</span>
          <span className="text-[13px] font-bold text-white" style={{ fontFamily: "'Exo2', sans-serif", letterSpacing: '0.03em' }}>
            {formatClock(activeMap.gameTime)}
          </span>
          {leadTeam != null && (
            <span className="ml-auto rounded-md bg-black/30 px-2.5 py-1 text-xs font-bold text-[#4ade80]">
              {formatNetWorth(Math.abs(lead!))} {leadTeam === 1 ? t1 : t2}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
