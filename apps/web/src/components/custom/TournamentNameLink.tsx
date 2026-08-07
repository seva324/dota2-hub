import type { CSSProperties } from 'react';

/** 卡片上的赛事名 → 赛事详情页 (#/event/:slug)。
 *  卡片本体常是 <button>，这里 stopPropagation 避免点赛事名触发卡片跳比赛详情。 */
export function TournamentNameLink({ slug, name, className, style }: {
  slug?: string | null;
  name?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const label = name || '';
  if (!slug || !label) {
    return <span className={className} style={style}>{label}</span>;
  }
  return (
    <a
      href={`#/event/${encodeURIComponent(slug)}`}
      onClick={(e) => e.stopPropagation()}
      className={className}
      style={style}
      title={label}
    >
      {label}
    </a>
  );
}
