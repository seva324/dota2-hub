import { Radio } from 'lucide-react';

const BLUE = '#2b55e8';
const RED = '#ff3b30';

/**
 * 统一的空状态：虚线框改为实线 + 微光晕，图标 + 主文案 + 引导副文案。
 */
export function EmptyState({ icon, label, hint, tone = 'default', children }: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  tone?: 'default' | 'live';
  children?: React.ReactNode;
}) {
  const IconComp = icon;
  const accent = tone === 'live' ? RED : BLUE;
  return (
    <div
      className="flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-8 text-center"
      style={{
        borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.02)',
        boxShadow: `inset 0 0 40px ${accent}0a`,
      }}
    >
      {IconComp && (
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ color: accent, backgroundColor: `${accent}14` }}
        >
          {IconComp}
        </div>
      )}
      <div className="text-sm font-semibold text-slate-200">{label}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
      {children}
    </div>
  );
}

/** Live 空状态专用：红色 Live 图标 */
export function LiveEmptyState({ label = '当前没有进行中的比赛' }: { label?: string }) {
  return (
    <EmptyState
      tone="live"
      label={label}
      hint="看看即将开始的比赛，或稍后再回来"
      icon={<Radio className="size-5" />}
    />
  );
}
