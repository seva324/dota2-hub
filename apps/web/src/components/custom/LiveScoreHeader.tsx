import { SafeImg } from '@/components/custom/SafeImg';
import { TeamLogoFallback } from '@/components/custom/TeamLogoFallback';
import { resolveTeamLogo } from '@/lib/teams';
import type { LiveDetailPayload, LiveMap } from '@/types/liveDetail';

const design = {
  radiant: '#34d399',
  dire: '#ff3b30',
  card: '#0d141e',
  surface: '#111a27',
  pip: '#facc15',
  gold: '#facc15',
  text: '#93a4b8',
  faint: '#8ea1b7',
  border: 'rgba(148,178,214,0.14)',
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

function TeamBlock({ team, side, wins }: {
  team: { name?: string | null; id?: string | null; logoUrl?: string | null };
  side: 'Radiant' | 'Dire';
  wins: number;
}) {
  const name = team.name || 'TBD';
  const logo = resolveTeamLogo({ name, teamId: team.id }, [], team.logoUrl);
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <SafeImg
        src={logo || ''}
        alt={name}
        className="size-14 shrink-0 object-contain md:size-16"
        fallback={<TeamLogoFallback name={name} size={56} />}
      />
      <span className="w-full truncate text-center text-sm font-bold text-white md:text-base">{name}</span>
      <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: side === 'Radiant' ? design.radiant : design.dire }}>
        {side}
      </span>
      <WinChips wins={wins} />
    </div>
  );
}

/** Live 详情比分头：地图切换 + 比分 + 天辉在左/夜魇在右 + 胜场点 + 实时领先条。队标走镜像、兜底 hawk.live。 */
export function LiveScoreHeader({ payload, activeMap, onSelectMap }: {
  payload: LiveDetailPayload;
  activeMap: LiveMap;
  onSelectMap: (number: number) => void;
}) {
  const isTeam1Radiant = activeMap.isTeam1Radiant;
  const radiantTeam = isTeam1Radiant ? payload.team1 : payload.team2;
  const direTeam = isTeam1Radiant ? payload.team2 : payload.team1;
  const radiantWins = isTeam1Radiant ? payload.team1Wins : payload.team2Wins;
  const direWins = isTeam1Radiant ? payload.team2Wins : payload.team1Wins;
  const radiantScore = isTeam1Radiant ? activeMap.team1Score : activeMap.team2Score;
  const direScore = isTeam1Radiant ? activeMap.team2Score : activeMap.team1Score;
  const isLive = activeMap.status === 'live';

  // team1NetWorthLead 为 team1 视角；换算为 radiant 视角（正值 = radiant 领先）
  const lead1 = activeMap.team1NetWorthLead;
  const radiantLead = lead1 != null ? (isTeam1Radiant ? lead1 : -lead1) : null;
  const leadTeam = radiantLead != null && radiantLead > 0 ? radiantTeam : radiantLead != null && radiantLead < 0 ? direTeam : null;
  const leadAbs = radiantLead != null ? Math.abs(radiantLead) : null;

  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: design.card, border: `1px solid ${design.border}` }}>
      {/* 地图切换 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {payload.maps.map((map) => {
          const isActive = map.number === activeMap.number;
          const isFinished = map.status === 'completed';
          const finishedScore = isFinished
            ? `${map.isTeam1Radiant ? map.team1Score : map.team2Score} - ${map.isTeam1Radiant ? map.team2Score : map.team1Score}`
            : null;
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
                  style={{ backgroundColor: design.gold, boxShadow: `0 0 8px ${design.gold}88` }}
                />
              )}
              {map.status === 'live' && (
                <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: design.dire }} />
              )}
              {finishedScore && <span className="text-[10px] font-semibold tabular-nums" style={{ color: isActive ? 'rgba(250,204,21,0.75)' : design.text }}>{finishedScore}</span>}
            </button>
          );
        })}
      </div>

      {/* 天辉（左）| 比分 | 夜魇（右） */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
        <TeamBlock team={radiantTeam} side="Radiant" wins={radiantWins} />

        {/* 中央比分 */}
        <div className="flex flex-col items-center px-2">
          <span className="mb-1 text-[11px] text-slate-500">{formatDate(payload.startAt)}</span>
          <div className="flex items-baseline gap-2 font-black leading-none text-white tabular-nums" style={{ fontFamily: "'Exo2', sans-serif" }}>
            <span className="text-4xl md:text-5xl">{radiantScore ?? '—'}</span>
            <span className="text-xl font-bold text-slate-500">:</span>
            <span className="text-4xl md:text-5xl">{direScore ?? '—'}</span>
          </div>
          <span
            className="mt-2 rounded-md px-2 py-1 text-[10px] font-bold"
            style={{ color: design.text, backgroundColor: 'rgba(255,255,255,0.05)' }}
          >
            Series {radiantWins} : {direWins} · {formatClock(activeMap.gameTime)}
          </span>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: design.text, backgroundColor: 'rgba(255,255,255,0.05)' }}>
              Best of {payload.bestOf || 3}
            </span>
            {isLive && (
              <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: design.dire, boxShadow: `0 0 16px ${design.dire}66` }}>
                <span className="size-1.5 animate-pulse rounded-full bg-white" /> LIVE
              </span>
            )}
          </div>
        </div>

        <TeamBlock team={direTeam} side="Dire" wins={direWins} />
      </div>

      {/* 实时领先条（仅直播局） */}
      {isLive && (
        <div
          className="mt-4 flex items-center gap-3 rounded-xl px-3.5 py-2.5"
          style={{ backgroundColor: design.surface, border: `1px solid ${design.border}` }}
        >
          <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: design.dire, boxShadow: `0 0 8px ${design.dire}88` }} />
          <span className="text-xs font-bold text-white">第 {activeMap.number} 局 · 进行中</span>
          <span className="text-[13px] font-bold text-white tabular-nums" style={{ fontFamily: "'Exo2', sans-serif", letterSpacing: '0.03em' }}>
            {formatClock(activeMap.gameTime)}
          </span>
          {leadTeam != null && leadAbs != null && (
            <span className="ml-auto rounded-md bg-black/30 px-2.5 py-1 text-xs font-bold" style={{ color: design.gold }}>
              {formatNetWorth(leadAbs)} {leadTeam.name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
