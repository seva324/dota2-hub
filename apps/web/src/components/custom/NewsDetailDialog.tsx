import { useEffect, useMemo, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { SafeImg } from '@/components/custom/SafeImg';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { categoryInfo } from '@/lib/newsCategory';

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  content_markdown?: string;
  content_images?: string[];
  source: string;
  url: string;
  image_url?: string;
  published_at: number;
  category: string;
}

const design = {
  bg: '#0f1115',
  card: '#1a1d24',
  card2: '#20242e',
  blue2: '#5b7cff',
  red: '#ff3b30',
  text: '#eef2f7',
  text2: '#a1a1aa',
  text3: '#71717a',
};

function normalizeUrl(url?: string) {
  if (!url) return '';
  return url.replace(/&amp;/g, '&');
}

function formatNewsDate(timestamp: number) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractImageUrlsFromText(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+?\.(?:png|jpe?g|webp|gif|avif)(?:\?[^\s)]*)?/gi) || [];
  return Array.from(new Set(matches.map(normalizeUrl))).slice(0, 6);
}

/** 行内解析：链接 + 加粗 */
function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+?\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s]+)/g;
  let last = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));

    if (match[1]) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${match.index}`} className="font-bold text-white">
          {match[1].slice(2, -2)}
        </strong>
      );
    } else if (match[2] && match[3]) {
      const label = match[2].match(/^\[([^\]]+)\]/)?.[1] || match[3];
      nodes.push(
        <a
          key={`${keyPrefix}-a-${match.index}`}
          href={normalizeUrl(match[3])}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#5b7cff] underline hover:text-[#7d97ff]"
        >
          {label}
        </a>
      );
    } else if (match[4]) {
      const url = normalizeUrl(match[4]);
      nodes.push(
        <a
          key={`${keyPrefix}-u-${match.index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-[#5b7cff] underline hover:text-[#7d97ff]"
        >
          {url}
        </a>
      );
    }

    last = pattern.lastIndex;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 正文渲染：段落、章节标题、拉页引文、插图（含图注）、列表项 */
function RichContent({ raw }: { raw: string }) {
  const lines = (raw || '').split('\n');
  const blocks: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    const imageMatch = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/i);
    if (imageMatch) {
      const caption = imageMatch[1]?.trim();
      blocks.push(
        <figure key={`img-${i}`} className="my-7">
          <img
            src={normalizeUrl(imageMatch[2])}
            alt={caption || '新闻配图'}
            className="w-full rounded-xl border border-white/[0.06] object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).closest('figure')?.remove();
            }}
          />
          {caption && (
            <figcaption className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: design.text3 }}>
              {caption}
            </figcaption>
          )}
        </figure>
      );
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) {
      blocks.push(
        <h2
          key={`h-${i}`}
          className="mb-4 mt-10 text-[22px] font-extrabold leading-snug tracking-[-0.01em] text-white first:mt-0"
        >
          {parseInline(heading[1], `h${i}`)}
        </h2>
      );
      continue;
    }

    const quote = line.match(/^>\s?(.+)/);
    if (quote) {
      blocks.push(
        <aside
          key={`q-${i}`}
          className="my-9 ps-6"
          style={{ borderInlineStart: `3px solid ${design.red}` }}
        >
          <p className="text-[20px] font-medium leading-[1.6] text-white sm:text-[24px] sm:leading-[1.5]">
            {parseInline(quote[1], `q${i}`)}
          </p>
        </aside>
      );
      continue;
    }

    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} className="my-8 border-white/[0.08]" />);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)/);
    if (bullet) {
      blocks.push(
        <p key={`li-${i}`} className="py-1 ps-5 text-[16px] leading-[1.85]" style={{ color: '#d5dce8' }}>
          <span className="me-2.5" style={{ color: design.blue2 }}>•</span>
          {parseInline(bullet[1], `li${i}`)}
        </p>
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="text-[16px] leading-[1.85]" style={{ color: '#d5dce8' }}>
        {parseInline(line, `p${i}`)}
      </p>
    );
  }

  return <div className="space-y-6">{blocks}</div>;
}

/** 新闻缩略图：真实图，失败时退回品牌渐变占位符 */
export function NewsThumb({ item, className }: { item: NewsItem; className?: string }) {
  const info = categoryInfo(item.category);
  return (
    <SafeImg
      src={item.image_url}
      alt={item.title}
      className={className}
      fallback={(
        <div
          className={`flex items-center justify-center ${className ?? ''}`}
          style={{ background: 'linear-gradient(135deg, #1b2440, #111728 55%, #26314f)' }}
        >
          <span
            className="text-[20px] uppercase tracking-widest"
            style={{ fontFamily: "'Anton', sans-serif", color: `${info.color}55` }}
          >
            Dota 2
          </span>
        </div>
      )}
    />
  );
}

function estimateReadMinutes(content: string) {
  const chars = content.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 400));
}

function pickRelated(item: NewsItem, pool: NewsItem[]): NewsItem[] {
  const others = pool.filter((n) => n.id !== item.id);
  const label = categoryInfo(item.category).label;
  const sameCategory = others
    .filter((n) => categoryInfo(n.category).label === label)
    .sort((a, b) => b.published_at - a.published_at);
  const rest = others
    .filter((n) => !sameCategory.some((s) => s.id === n.id))
    .sort((a, b) => b.published_at - a.published_at);
  return sameCategory.concat(rest).slice(0, 3);
}

interface NewsDetailDialogProps {
  item: NewsItem | null;
  pool: NewsItem[];
  onOpenChange: (open: boolean) => void;
  onSelect: (item: NewsItem) => void;
}

export function NewsDetailDialog({ item, pool, onOpenChange, onSelect }: NewsDetailDialogProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node && typeof node.scrollTo === 'function') node.scrollTo({ top: 0 });
  }, [item?.id]);

  const content = item?.content_markdown || item?.content || item?.summary || '';
  const images = useMemo(() => {
    if (!item) return [];
    const fromField = item.content_images || [];
    const fromContent = extractImageUrlsFromText(content);
    return Array.from(new Set([...fromField, ...fromContent])).slice(0, 6);
  }, [item, content]);
  const relatedItems = useMemo(() => (item ? pickRelated(item, pool) : []), [item, pool]);

  const info = categoryInfo(item?.category);

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] w-[94vw] max-w-[760px] flex-col gap-0 overflow-hidden rounded-2xl border-white/[0.08] bg-[#0f1115] p-0 text-slate-100">
        {item && (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-6 pb-10 pt-7 sm:px-10">
              <DialogHeader className="space-y-0">
                {/* 面包屑 */}
                <div className="flex flex-wrap items-center gap-2 pe-8 text-[12.5px] font-medium" style={{ color: design.text3 }}>
                  <span>新闻</span>
                  <span style={{ color: '#3f4553' }}>/</span>
                  <span>{info.label}</span>
                  <span style={{ color: '#3f4553' }}>/</span>
                  <span>{item.source}</span>
                </div>

                <span className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">
                  <span className="size-1.5 rounded-[3px]" style={{ backgroundColor: info.color }} />
                  {info.label}
                </span>

                <DialogTitle className="mt-4 text-pretty text-[24px] font-extrabold leading-[1.32] tracking-[-0.015em] text-white sm:text-[30px]">
                  {item.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {item.source} · {formatNewsDate(item.published_at)}
                </DialogDescription>
                {item.summary && (
                  <p className="mt-3.5 max-w-[34em] text-[15.5px] leading-[1.75]" style={{ color: design.text2 }}>
                    {item.summary}
                  </p>
                )}

                {/* 署名栏 */}
                <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.06] pt-4 text-[12.5px]" style={{ color: design.text3 }}>
                  <span className="font-bold text-white">DotaHub 编辑部</span>
                  <span style={{ color: '#3f4553' }}>·</span>
                  <span>编译 / 整理自 {item.source}</span>
                  <span className="ms-auto flex gap-3">
                    <span>{formatNewsDate(item.published_at)}</span>
                    <span>阅读约 {estimateReadMinutes(content)} 分钟</span>
                  </span>
                </div>
              </DialogHeader>

              {/* 主图 */}
              <figure className="mt-6">
                <div className="aspect-video overflow-hidden rounded-xl border border-white/[0.06]">
                  <NewsThumb item={item} className="h-full w-full object-cover" />
                </div>
                <figcaption className="mt-2.5 text-[12.5px]" style={{ color: design.text3 }}>
                  封面图 · 来源 {item.source}
                </figcaption>
              </figure>

              {/* 正文 */}
              {content ? (
                <div className="mt-8">
                  <RichContent raw={content} />
                </div>
              ) : (
                <div className="mt-8 rounded-xl border border-white/[0.06] p-5 sm:p-6" style={{ backgroundColor: design.card }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: design.text3 }}>
                    编者注
                  </p>
                  <p className="mt-3 text-[14.5px] leading-[1.75]" style={{ color: design.text2 }}>
                    本篇暂无可展示的完整正文。DotaHub 以编译整理的方式呈现新闻摘要，完整内容可前往
                    {item.source} 阅读原文。
                  </p>
                </div>
              )}

              {/* 补充插图（正文图集） */}
              {images.length > 0 && (
                <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {images.slice(0, 4).map((img) => (
                    <img
                      key={img}
                      src={img}
                      alt="新闻配图"
                      className="w-full rounded-xl border border-white/[0.06] object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ))}
                </div>
              )}

              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 text-[14px] font-semibold text-[#5b7cff] hover:text-[#7d97ff]"
              >
                查看{item.source}原文 <ArrowRight className="size-4" />
              </a>

              {/* 作者署名 */}
              <div
                className="mt-9 flex items-start gap-4 rounded-xl border border-white/[0.06] p-5 sm:p-6"
                style={{ backgroundColor: design.card }}
              >
                <span
                  className="flex size-[52px] shrink-0 items-center justify-center rounded-full text-[17px] tracking-[0.05em] text-white"
                  style={{
                    fontFamily: "'Anton', 'Arial Narrow', sans-serif",
                    background: 'linear-gradient(135deg, #f43f3f, #c2261f)',
                  }}
                  aria-hidden="true"
                >
                  DH
                </span>
                <div>
                  <p className="text-[15.5px] font-bold text-white">DotaHub 编辑部</p>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: design.text3 }}>
                    电竞内容编译团队
                  </p>
                  <p className="mt-2.5 text-[14px] leading-[1.75]" style={{ color: design.text2 }}>
                    DotaHub 编辑部专注于 Dota 2 职业赛事资讯的编译与原创报道，每日从 Hawk Live、BO3.gg
                    等海外来源筛选、翻译并整理值得中文读者关注的新闻，同时提供赛程、战队与选手数据服务。
                  </p>
                </div>
              </div>

              {/* 相关阅读 */}
              {relatedItems.length > 0 && (
                <section className="mt-12" aria-label="相关阅读">
                  <div className="mb-5 flex items-baseline justify-between gap-4">
                    <h2 className="text-[19px] font-extrabold tracking-[-0.01em] text-white">相关阅读</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {relatedItems.map((rel) => {
                      const relInfo = categoryInfo(rel.category);
                      return (
                        <button
                          key={rel.id}
                          type="button"
                          onClick={() => onSelect(rel)}
                          className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.06] text-left transition-all hover:-translate-y-0.5 hover:border-white/[0.12]"
                          style={{ backgroundColor: design.card }}
                        >
                          <div className="relative aspect-[16/9] overflow-hidden" style={{ backgroundColor: '#0d1120' }}>
                            <NewsThumb item={rel} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                          </div>
                          <div className="flex flex-1 flex-col p-3.5">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                                <span className="size-1.5 rounded-[3px]" style={{ backgroundColor: relInfo.color }} />
                                {relInfo.label}
                              </span>
                              <span className="text-[12px] font-medium" style={{ color: design.text3 }}>
                                {formatNewsDate(rel.published_at)}
                              </span>
                            </div>
                            <span className="text-[14px] font-bold leading-snug tracking-[-0.01em] text-white line-clamp-2 group-hover:text-[#5b7cff]">
                              {rel.title}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
