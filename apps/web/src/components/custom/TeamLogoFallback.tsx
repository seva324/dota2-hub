/**
 * 战队 Logo 缺失时的优雅回退：渐变底 + 内边框 + 缩写。
 * 尺寸可变，视觉统一，不显廉价。
 */
export function TeamLogoFallback({ name, size = 40, className }: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${className || ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.28,
        fontWeight: 700,
        color: '#a1a1aa',
        background: 'linear-gradient(135deg, #2a2d35 0%, #1f2229 100%)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      {name.substring(0, 2).toUpperCase()}
    </div>
  );
}
