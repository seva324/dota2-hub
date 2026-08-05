import type { LiveState } from '@/types/liveDetail';

const design = {
  radiant: '#2b55e8',
  dire: '#ff3b30',
  zero: 'rgba(255,255,255,0.22)',
  line: 'rgba(255,255,255,0.85)',
};

const W = 600;
const H = 180;
const PAD = 10;

function formatTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function formatAdv(v: number): string {
  const abs = Math.abs(v);
  const num = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(Math.round(abs));
  return `${v >= 0 ? '+' : '-'}${num}`;
}

/** 经济优势曲线：states 快照 → 净财富优势折线（0 轴上方 = radiant 领先）。 */
export function NetWorthChart({ states }: { states: LiveState[] }) {
  if (!states.length) {
    return <div className="py-8 text-center text-xs" style={{ color: '#71717a' }}>暂无经济数据</div>;
  }

  const maxT = states.reduce((max, s) => Math.max(max, s.gameTime), 0) || 1;
  const maxAbs = states.reduce((max, s) => Math.max(max, Math.abs(s.radiantNetWorthAdvantage)), 1000);
  const x = (t: number) => PAD + (t / maxT) * (W - PAD * 2);
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - PAD);

  const points = states.map((s) => `${x(s.gameTime).toFixed(1)},${y(s.radiantNetWorthAdvantage).toFixed(1)}`);
  const areaPath = states.length > 1
    ? `M ${points[0]} L ${points.slice(1).join(' L ')} L ${x(states[states.length - 1].gameTime).toFixed(1)},${H / 2} L ${x(states[0].gameTime).toFixed(1)},${H / 2} Z`
    : '';
  const last = states[states.length - 1];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
        <span style={{ color: design.radiant }}>净财富优势（Radiant）</span>
        <span className="tabular-nums" style={{ color: last.radiantNetWorthAdvantage >= 0 ? design.radiant : design.dire }}>
          {formatAdv(last.radiantNetWorthAdvantage)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="净财富优势曲线">
        <defs>
          <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={design.radiant} stopOpacity="0.55" />
            <stop offset="50%" stopColor={design.radiant} stopOpacity="0.08" />
            <stop offset="50%" stopColor={design.dire} stopOpacity="0.08" />
            <stop offset="100%" stopColor={design.dire} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* 0 轴 */}
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke={design.zero} strokeDasharray="4 4" strokeWidth="1" />

        {areaPath && <path d={areaPath} fill="url(#nw-grad)" />}
        {points.length > 1 && <polyline points={points.join(' ')} fill="none" stroke={design.line} strokeWidth="1.6" strokeLinejoin="round" />}

        {/* 当前点 */}
        <circle cx={x(last.gameTime)} cy={y(last.radiantNetWorthAdvantage)} r="3.5" fill={last.radiantNetWorthAdvantage >= 0 ? design.radiant : design.dire} stroke="#fff" strokeWidth="1" />

        {/* 首末时间刻度 */}
        <text x={PAD} y={H - 3} fontSize="9" fill="#71717a">{formatTime(0)}</text>
        <text x={W - PAD} y={H - 3} fontSize="9" fill="#71717a" textAnchor="end">{formatTime(maxT)}</text>
      </svg>
    </div>
  );
}
