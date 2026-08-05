import type { LiveState } from '@/types/liveDetail';

const design = {
  radiant: '#34d399',
  dire: '#ff3b30',
  zero: 'rgba(255,255,255,0.22)',
  grid: 'rgba(255,255,255,0.06)',
  line: 'rgba(255,255,255,0.85)',
  label: '#8ea1b7',
};

const W = 660;
const H = 220;
const PL = 46; // 左侧纵轴刻度留白
const PR = 16;
const PT = 14;
const PB = 26;

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function formatAxis(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const num = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(Math.round(abs));
  return `${v > 0 ? '+' : '-'}${num}`;
}

function formatAbs(v: number): string {
  const abs = Math.abs(v);
  return abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(Math.round(abs));
}

/** 经济优势曲线：states 快照 → 净财富优势折线（0 轴上方 = radiant 领先，绿；下方 = dire 领先，红）。
 *  过滤 gameTime<0 的赛前快照并按时间排序，避免真实 hawk.live 数据把曲线画回纵轴左侧。 */
export function NetWorthChart({ states, radiantName, direName }: {
  states: LiveState[];
  radiantName?: string;
  direName?: string;
}) {
  const valid = states
    .filter((s) => Number.isFinite(s.gameTime) && Number.isFinite(s.radiantNetWorthAdvantage) && s.gameTime >= 0)
    .sort((a, b) => a.gameTime - b.gameTime);

  if (valid.length === 0) {
    return <div className="py-8 text-center text-xs" style={{ color: design.label }}>暂无经济数据</div>;
  }

  const maxT = valid.reduce((max, s) => Math.max(max, s.gameTime), 0) || 1;
  const maxAbs = valid.reduce((max, s) => Math.max(max, Math.abs(s.radiantNetWorthAdvantage)), 1000);
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const midY = PT + plotH / 2;
  const x = (t: number) => PL + (t / maxT) * plotW;
  const y = (v: number) => midY - (v / maxAbs) * (plotH / 2);

  const points = valid.map((s) => `${x(s.gameTime).toFixed(1)},${y(s.radiantNetWorthAdvantage).toFixed(1)}`);
  const areaPath = points.length > 1
    ? `M ${points[0]} L ${points.slice(1).join(' L ')} L ${x(valid[valid.length - 1].gameTime).toFixed(1)},${midY} L ${x(valid[0].gameTime).toFixed(1)},${midY} Z`
    : '';
  const last = valid[valid.length - 1];

  const ticks = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
  const gridLines = ticks.map((v) => (
    <g key={v}>
      <line
        x1={PL} y1={y(v)} x2={W - PR} y2={y(v)}
        stroke={v === 0 ? design.zero : design.grid}
        strokeDasharray={v === 0 ? '4 4' : '2 4'}
        strokeWidth="1"
      />
      <text x={PL - 8} y={y(v) + 3} fontSize="9" fill={design.label} textAnchor="end">{formatAxis(v)}</text>
    </g>
  ));

  const zeroPct = `${((midY / H) * 100).toFixed(2)}%`;
  const leadColor = last.radiantNetWorthAdvantage >= 0 ? design.radiant : design.dire;
  const leaderName = last.radiantNetWorthAdvantage >= 0 ? radiantName : direName;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="净财富优势曲线">
        <defs>
          <linearGradient id="nw-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
            <stop offset="0%" stopColor={design.radiant} stopOpacity="0.5" />
            <stop offset={zeroPct} stopColor={design.radiant} stopOpacity="0.03" />
            <stop offset={zeroPct} stopColor={design.dire} stopOpacity="0.03" />
            <stop offset="100%" stopColor={design.dire} stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {gridLines}
        {areaPath && <path d={areaPath} fill="url(#nw-grad)" />}
        {points.length > 1 && <polyline points={points.join(' ')} fill="none" stroke={design.line} strokeWidth="1.8" strokeLinejoin="round" />}

        {/* 当前点 */}
        <circle cx={x(last.gameTime)} cy={y(last.radiantNetWorthAdvantage)} r="4.5" fill={leadColor} stroke="#fff" strokeWidth="1.5" />

        {/* 首末时间刻度 */}
        <text x={PL} y={H - 7} fontSize="9" fill={design.label}>{formatTime(0)}</text>
        <text x={W - PR} y={H - 7} fontSize="9" fill={design.label} textAnchor="end">{formatTime(maxT)}</text>
      </svg>

      {/* 图例 + 领先值（与原型一致） */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold">
        <span className="flex items-center gap-1.5" style={{ color: design.radiant }}>
          <span className="size-2 rounded-[3px]" style={{ backgroundColor: design.radiant }} />
          {radiantName || 'Radiant'}（Radiant）
        </span>
        <span className="flex items-center gap-1.5" style={{ color: design.dire }}>
          <span className="size-2 rounded-[3px]" style={{ backgroundColor: design.dire }} />
          {direName || 'Dire'}（Dire）
        </span>
        <span className="ml-auto font-black tabular-nums" style={{ color: leadColor }}>
          +{formatAbs(last.radiantNetWorthAdvantage)}{leaderName ? ` ${leaderName}` : ''}
        </span>
      </div>
    </div>
  );
}
