import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-cache';
import { SafeImg } from '@/components/custom/SafeImg';
import { resolveTeamLogo } from '@/lib/teams';
import { seriesIdAndSlugFromMatchUrl } from '@/lib/matchUrl';
import { LiveMatchCard, type LiveHeroPayload } from '@/components/custom/LiveMatchCard';
import './event-detail.css';

/* ------------------------------------------------------------------ */
/* 类型（与后端 /api/event-detail 契约一致）                             */
/* ------------------------------------------------------------------ */

interface EventOverview {
  Dates?: string;
  Country?: string;
  'Event tier'?: string;
  'Event type'?: string;
  'Prize pool'?: string;
  Participants?: string;
}

interface AboutSection {
  heading: string;
  body: string;
}

interface AboutData {
  intro: string;
  sections: AboutSection[];
  prizeBreakdown: [string, string][];
}

interface GroupStanding {
  teamUrl?: string;
  team: string;
  country?: string;
  logo?: string | null;
  position?: string;
  record?: string;
  maps?: string;
  points?: string;
  advance?: boolean;
}

interface EventGroup {
  name: string;
  heads: string[];
  rows: GroupStanding[];
}

interface PlayoffTeam {
  logo?: string | null;
  name: string;
  slug?: string | null;
  score?: string;
  winner?: boolean;
}

interface PlayoffMatch {
  url?: string;
  date?: string;
  teams: PlayoffTeam[];
}

interface PlayoffRound {
  round: string;
  matches: PlayoffMatch[];
}

interface MatchRow {
  url?: string;
  left: string;
  leftSlug?: string | null;
  leftLogo?: string | null;
  center: string;
  isLive?: boolean;
  right: string;
  rightSlug?: string | null;
  rightLogo?: string | null;
}

interface Participant {
  name: string;
  teamUrl?: string | null;
  logo?: string | null;
  invite?: string;
  players: string[];
}

/** 战队跳转目标（name 必填；slug 来自 DLTV teamUrl，缺失时后端按 name 启发式解析） */
export interface TeamLinkTarget {
  name: string;
  slug?: string | null;
}

interface PrizeEntry {
  tone: string;
  team?: string;
  prize: string;
  place: string;
}

interface EventDetailPayload {
  slug: string;
  title: string;
  live?: boolean;
  heroImage?: string | null;
  overview?: EventOverview;
  about?: AboutData;
  groups?: EventGroup[];
  playoffRounds?: PlayoffRound[];
  matches?: { matches?: MatchRow[]; finishedMatches?: MatchRow[] };
  participants?: Participant[];
  prizePool?: PrizeEntry[];
  source?: string;
  empty?: boolean;
}

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

const FLAG_MAP: Record<string, string> = {
  Europe: 'https://dltv.org/assets/plugins/flag-icon/flags/4x3/eu.svg',
  China: 'https://dltv.org/assets/plugins/flag-icon/flags/4x3/cn.svg',
};

function formatDateRange(value?: string): string {
  if (!value) return 'TBD';
  const [start, end] = value.split(' - ').map((part) => part.trim());
  const fmt = (raw: string) => {
    const date = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };
  if (!end) return fmt(start);
  return `${fmt(start)} - ${fmt(end)}`;
}

/** 从 DLTV 战队 URL（/teams/<slug>）提取 slug。 */
function slugFromTeamUrl(url?: string | null): string | null {
  const match = String(url || '').match(/\/teams\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 可点击战队跳转（logo + 名字整块点击）。 */
function TeamLink({
  team,
  children,
  onOpenTeam,
  className = '',
}: {
  team: TeamLinkTarget;
  children: React.ReactNode;
  onOpenTeam?: (team: TeamLinkTarget) => void;
  className?: string;
}) {
  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenTeam?.({ name: team.name, slug: team.slug });
  };
  return (
    <button type="button" className={`team-link ${className}`.trim()} onClick={handleClick} title={`查看 ${team.name} 战队资料`}>
      {children}
    </button>
  );
}

function TeamLogo({ src, name, size = 24 }: { src?: string | null; name: string; size?: number }) {
  const logo = resolveTeamLogo({ name }, [], src);
  return (
    <span className="logo" style={{ width: size, height: size }}>
      <SafeImg
        src={logo || ''}
        alt={name}
        fallback={
          <span style={{ fontSize: Math.round(size * 0.42), fontWeight: 900, color: '#8b96a5' }}>
            {(name || '?').slice(0, 2).toUpperCase()}
          </span>
        }
      />
    </span>
  );
}

function SectionHead({ title, eyebrow, bar }: { title: string; eyebrow?: string; bar?: 'blue' | 'slate' }) {
  return (
    <div className="section-head">
      <h2 className="section-title">
        <span className={`bar ${bar || ''}`.trim()} aria-hidden="true" />
        {title}
      </h2>
      {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：Hero                                                           */
/* ------------------------------------------------------------------ */

function HeroSection({ payload }: { payload: EventDetailPayload }) {
  const m = payload.overview || {};
  const tier = m['Event tier'];
  const flag = FLAG_MAP[m.Country || ''] || null;
  const typeZh = m['Event type'] === 'Online' ? '线上' : m['Event type'] === 'Offline' ? '线下' : m['Event type'] || '';
  return (
    <section className="hero" aria-label="赛事概览">
      {payload.heroImage ? (
        <div className="hero-bg" aria-hidden="true">
          <img src={payload.heroImage} alt="" />
        </div>
      ) : null}
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-main">
        <div className="hero-eyebrow">
          {payload.live ? (
            <span className="chip chip-live">
              <span className="dot" aria-hidden="true" />
              LIVE
            </span>
          ) : null}
          {tier ? <span className="chip chip-tier">{tier}</span> : null}
          {m.Country ? (
            <span className="chip chip-region">
              {flag ? (
                <span className="flag">
                  <img src={flag} alt={`${m.Country} 国旗`} />
                </span>
              ) : null}
              {m.Country}
              {typeZh ? ` · ${typeZh}` : ''}
            </span>
          ) : null}
        </div>
        <h1 className="hero-title">{payload.title}</h1>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="k">日期</div>
            <div className="v">{formatDateRange(m.Dates)}</div>
          </div>
          <div className="hero-stat">
            <div className="k">奖金池</div>
            <div className="v red">{m['Prize pool'] || 'TBD'}</div>
          </div>
          <div className="hero-stat">
            <div className="k">参赛队伍</div>
            <div className="v">{m.Participants || 'TBD'}</div>
          </div>
          <div className="hero-stat">
            <div className="k">赛事级别</div>
            <div className="v">{tier || 'TBD'}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：简介（intro + 编号小卡片 · 默认折叠）                            */
/* ------------------------------------------------------------------ */

function AboutSection({ about }: { about?: AboutData }) {
  const [collapsed, setCollapsed] = useState(true);
  if (!about || !about.intro) return null;
  return (
    <section className={`section ${collapsed ? 'collapsed' : ''}`} aria-label="赛事简介">
      <div className="section-head">
        <h2 className="section-title">
          <span className="bar" aria-hidden="true" />
          赛事简介
        </h2>
        <button
          type="button"
          className="collapse-toggle"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span className="t-label">{collapsed ? '展开赛事详情' : '收起赛事详情'}</span>
        </button>
      </div>
      <div className="about-body">
        <div className="card about-grid">
          <p className="about-intro">{about.intro}</p>
          {about.sections.map((s, i) => (
            <div className="about-item" key={s.heading}>
              <h4>
                <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                {s.heading}
              </h4>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：关联直播 / 即将开赛（横向滑动卡片）                              */
/* ------------------------------------------------------------------ */

function matchStage(rounds: PlayoffRound[] | undefined, url?: string): { stage: string; bo: string } {
  if (rounds && url) {
    for (const r of rounds) {
      if (r.matches.some((mm) => mm.url === url)) {
        return {
          stage: r.round.replace(/\s*\(bo\d+\)\s*/i, '').trim(),
          bo: (r.round.match(/bo\d+/i) || ['BO3'])[0].toUpperCase(),
        };
      }
    }
  }
  return { stage: 'Playoffs', bo: 'BO3' };
}

function MatchCard({
  match,
  live,
  rounds,
  onOpenTeam,
  onOpenMatch,
  teamSlugMap,
}: {
  match: MatchRow;
  live?: boolean;
  rounds?: PlayoffRound[];
  onOpenTeam?: (team: TeamLinkTarget) => void;
  onOpenMatch?: (nav: { matchId: string; slug?: string }) => void;
  teamSlugMap?: Record<string, string>;
}) {
  const parts = match.center.replace(/\s+/g, ' ').split('-').map((x) => x.trim());
  const { stage, bo } = matchStage(rounds, match.url);
  const matchNav = seriesIdAndSlugFromMatchUrl(match.url);
  return (
    <article className="match-card">
      <div className="match-card-top">
        <span>{stage}</span>
        {live ? (
          <span className="live-badge">
            <span className="dot" aria-hidden="true" />
            LIVE
          </span>
        ) : (
          <span>未开赛</span>
        )}
      </div>
      <div className="match-card-body">
        <TeamLink
          className="match-team"
          team={{ name: match.left, slug: match.leftSlug ?? teamSlugMap?.[match.left] ?? null }}
          onOpenTeam={onOpenTeam}
        >
          <TeamLogo src={match.leftLogo} name={match.left} size={34} />
          <span className="name">{match.left}</span>
        </TeamLink>
        {live ? (
          <div className="match-score">
            <div className="s">
              <span className={Number(parts[0]) >= Number(parts[1]) ? 'win' : ''}>{parts[0]}</span>
              <span> - </span>
              <span className={Number(parts[0]) >= Number(parts[1]) ? '' : 'win'}>{parts[1]}</span>
            </div>
            <span className="bo">{bo}</span>
          </div>
        ) : (
          <div className="match-score">
            <div className="clock">
              {match.center.match(/\d{2}:\d{2}$/)?.[0] || match.center}
            </div>
            <span className="bo">{bo}</span>
          </div>
        )}
        <TeamLink
          className="match-team right"
          team={{ name: match.right, slug: match.rightSlug ?? teamSlugMap?.[match.right] ?? null }}
          onOpenTeam={onOpenTeam}
        >
          <span className="name">{match.right}</span>
          <TeamLogo src={match.rightLogo} name={match.right} size={34} />
        </TeamLink>
      </div>
      <div className="match-card-foot">
        <span>{live ? '直播进行中' : '未开赛'}</span>
        {matchNav && onOpenMatch ? (
          <button type="button" onClick={() => onOpenMatch(matchNav)}>
            查看详情 →
          </button>
        ) : (
          <span>查看详情 →</span>
        )}
      </div>
    </article>
  );
}

/** 关联直播里的 LiveMatchCard 固定宽度，与 match-card（340px）在 matches-scroll 里对齐。 */
const LIVE_CARD_SNAP = { flex: '0 0 340px', scrollSnapAlign: 'start' as const };

function MatchesSection({
  payload,
  relatedLive,
  onOpenTeam,
  onOpenMatch,
  onOpenLive,
  teamSlugMap,
}: {
  payload: EventDetailPayload;
  relatedLive: LiveHeroPayload[];
  onOpenTeam?: (team: TeamLinkTarget) => void;
  onOpenMatch?: (nav: { matchId: string; slug?: string }) => void;
  onOpenLive?: (hero: LiveHeroPayload) => void;
  teamSlugMap?: Record<string, string>;
}) {
  // 关联直播优先用 hawk.live 的实时卡片（可进 live detail）；hawk.live 未覆盖时回退 DLTV 页面的 isLive 行。
  const dltvLiveRows = (payload.matches?.matches || []).filter((m) => m.isLive);
  const hasRelatedLive = relatedLive.length > 0 || dltvLiveRows.length > 0;
  const upcomingMatches = (payload.matches?.matches || []).filter((m) => !m.isLive);
  const hasUpcoming = upcomingMatches.length > 0;
  if (!hasRelatedLive && !hasUpcoming) return null;
  return (
    <>
      {hasRelatedLive ? (
        <section className="section" aria-label="关联直播">
          <SectionHead title="关联直播" eyebrow="Live Now" />
          <div className="matches-scroll">
            {relatedLive.length > 0
              ? relatedLive.map((hero) => (
                  <div key={`${hero.sourceSeriesId}-${hero.teams?.[0]?.name}-${hero.teams?.[1]?.name}`} style={LIVE_CARD_SNAP}>
                    <LiveMatchCard hero={hero} onOpen={() => onOpenLive?.(hero)} />
                  </div>
                ))
              : dltvLiveRows.map((m) => (
                  <MatchCard key={`${m.left}-${m.right}-${m.center}`} match={m} live rounds={payload.playoffRounds} onOpenTeam={onOpenTeam} onOpenMatch={onOpenMatch} teamSlugMap={teamSlugMap} />
                ))}
          </div>
        </section>
      ) : null}
      {hasUpcoming ? (
        <section className="section" aria-label="即将开赛">
          <SectionHead title="即将开赛" eyebrow="Upcoming" bar="blue" />
          <div className="matches-scroll">
            {upcomingMatches.map((m) => (
              <MatchCard key={`${m.left}-${m.right}`} match={m} rounds={payload.playoffRounds} onOpenTeam={onOpenTeam} onOpenMatch={onOpenMatch} teamSlugMap={teamSlugMap} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：小组赛积分榜（双栏表格 · 晋级/淘汰色）                           */
/* ------------------------------------------------------------------ */

function GroupStageSection({ groups, onOpenTeam }: { groups?: EventGroup[]; onOpenTeam?: (team: TeamLinkTarget) => void }) {
  if (!groups || groups.length === 0) return null;
  return (
    <section className="section" aria-label="小组赛">
      <SectionHead title="小组赛积分榜" eyebrow="Group Stage" />
      <div className="group-grid">
        {groups.map((group) => (
          <div className="card group-table" key={group.name}>
            <div className="group-table-head">
              <h4>{group.name}</h4>
              <span className="g-legend">
                <span className="legend-dot adv" aria-hidden="true" />
                晋级
                <span className="legend-dot out" aria-hidden="true" />
                淘汰
              </span>
            </div>
            <div className="stand-col-head">
              <span>#</span>
              <span>队伍</span>
              <span>战绩</span>
              <span>图分</span>
              <span>积分</span>
            </div>
            {group.rows.map((row) => (
              <div className={`stand-row ${row.advance ? 'adv' : 'out'}`} key={`${group.name}-${row.position}-${row.team}`}>
                <span className="stand-rank">{row.position}</span>
                <TeamLink
                  className="stand-team"
                  team={{ name: row.team, slug: slugFromTeamUrl(row.teamUrl) }}
                  onOpenTeam={onOpenTeam}
                >
                  <TeamLogo src={row.logo} name={row.team} size={28} />
                  <div className="meta">
                    <div className="t">{row.team}</div>
                    {row.country ? <div className="c">{row.country}</div> : null}
                  </div>
                </TeamLink>
                <span className="stand-cell dim">{row.record || '—'}</span>
                <span className="stand-cell dim">{row.maps || '—'}</span>
                <span className="stand-cell pts">{row.points || '—'}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：淘汰赛 bracket（动态赛制布局：单败/双败 · 任意轮数）             */
/* ------------------------------------------------------------------ */

const GF_RE = /grand final/i;
const UB_RE = /(?:upper|winners|ub)\s*bracket|winners'|winner bracket/i;
const LB_RE = /(?:lower|losers|lb)\s*bracket|losers'|loser bracket/i;
const QUALIFIER_RE = /^\s*qualified\s*$/i;
const BO_RE = /\(bo\d+\)/i;

function roundHead(name: string): string {
  return name.replace(BO_RE, '').trim() || '待定';
}

function roundBo(name: string): string {
  return (name.match(/bo\d+/i) || [''])[0].toUpperCase();
}

/** 轮次名 → 组内序号（R 数字优先，SF=2、QF=1、Final=最大） */
function roundOrder(name: string): number {
  const m = name.match(/\bR(\d+)\b/i);
  if (m) return Number(m[1]);
  if (/quarterfinal/i.test(name)) return 1;
  if (/semifinal/i.test(name)) return 2;
  if (/final/i.test(name)) return 99;
  return 0;
}

/** 组内排序：序号优先，同序号按 DOM 顺序。 */
function sortRounds(items: { round: string; matches: PlayoffMatch[]; domOrder: number }[]) {
  return [...items].sort((a, b) => roundOrder(a.round) - roundOrder(b.round) || a.domOrder - b.domOrder);
}

function makeCell(
  item: { round: string; matches: PlayoffMatch[] },
  key: string,
  col: number,
  row: string,
  center: boolean,
  isFinal: boolean
): BracketCell {
  return { key, head: roundHead(item.round), bo: roundBo(item.round), col, row, center, isFinal, matches: item.matches || [] };
}

/** 等比映射晋级线：上轮第 k 场 → 下轮第 floor(k*next/cur) 场。 */
function addProgressionConns(
  conns: { from: string; to: string }[],
  fromKey: string,
  fromMatches: PlayoffMatch[],
  toKey: string,
  toMatches: PlayoffMatch[]
) {
  const fromCount = fromMatches.length;
  const toCount = Math.max(1, toMatches.length);
  if (fromCount === 0 || toCount === 0) return;
  for (let k = 0; k < fromCount; k += 1) {
    const target = Math.min(toCount - 1, Math.floor((k * toCount) / fromCount));
    conns.push({ from: `${fromKey}-${k}`, to: `${toKey}-${target}` });
  }
}

interface BracketLayout {
  cols: number;
  cells: BracketCell[];
  conns: { from: string; to: string }[];
}

/**
 * 通用 bracket 构建：
 * - 双败（存在 Upper/Lower/Winners/Losers 轮）：UB 行 1 从左向右、LB 行 2 左对齐、GF 最右跨行；
 * - 单败（无 UB/LB 轮）：所有轮次单列链式排布，GF 在末列；
 * - 头部附加轮（Round of N / Quarterfinals 等无前缀轮）置于 UB 之前作前置赛段；
 * - 占位轮（Qualified）跳过。
 */
function buildBracket(rounds: PlayoffRound[]): BracketLayout {
  const items = (rounds || []).map((r, domOrder) => ({
    round: r.round || '',
    matches: r.matches || [],
    domOrder,
  }));
  const isDouble = items.some((x) => UB_RE.test(x.round) || LB_RE.test(x.round));
  const gf = items.filter((x) => GF_RE.test(x.round));
  const ub = sortRounds(items.filter((x) => !GF_RE.test(x.round) && UB_RE.test(x.round)));
  const lb = sortRounds(items.filter((x) => !GF_RE.test(x.round) && LB_RE.test(x.round)));
  const singles = sortRounds(
    items.filter((x) => !GF_RE.test(x.round) && !UB_RE.test(x.round) && !LB_RE.test(x.round) && !QUALIFIER_RE.test(x.round))
  );

  const conns: { from: string; to: string }[] = [];
  const cells: BracketCell[] = [];
  let cols = 0;

  if (!isDouble) {
    const sequence = [...singles, ...gf];
    sequence.forEach((item, i) => {
      const isFinal = GF_RE.test(item.round);
      cells.push(makeCell(item, isFinal ? 'gf' : `s${i}`, i + 1, '1', true, isFinal));
    });
    for (let i = 0; i < sequence.length - 1; i += 1) {
      addProgressionConns(conns, isFinalKey(sequence[i]) ? 'gf' : `s${i}`, sequence[i].matches, isFinalKey(sequence[i + 1]) ? 'gf' : `s${i + 1}`, sequence[i + 1].matches);
    }
    cols = Math.max(1, sequence.length);
    return { cols, cells, conns };
  }

  // 多个 Grand Final 轮（DLTV 占位 + 赛果）时取有赛果的；否则取第一个
  const gfRound = gf.find((x) => (x.matches || []).length > 0) || gf[0] || null;
  const ubCount = ub.length;
  const lbCount = lb.length;

  // 前置赛段（无前缀轮）放在最左；UB 右移使其与 LB 右端对齐。
  const leadCount = singles.length;
  const ubOffset = Math.max(0, lbCount - ubCount);

  singles.forEach((item, i) => {
    cells.push(makeCell(item, `lead${i}`, i + 1, '1', true, false));
  });
  ub.forEach((item, i) => {
    cells.push(makeCell(item, `ub${i}`, leadCount + i + 1 + ubOffset, '1', false, false));
  });
  lb.forEach((item, j) => {
    cells.push(makeCell(item, `lb${j}`, leadCount + j + 1, '2', false, false));
  });
  if (gfRound) {
    cols = leadCount + Math.max(ubCount + ubOffset, lbCount) + 1;
    cells.push(makeCell(gfRound, 'gf', cols, '1 / 3', true, true));
  } else {
    cols = Math.max(1, leadCount + Math.max(ubCount + ubOffset, lbCount));
  }

  // 组内晋级线
  for (let i = 0; i < ub.length - 1; i += 1) {
    addProgressionConns(conns, `ub${i}`, ub[i].matches, `ub${i + 1}`, ub[i + 1].matches);
  }
  for (let j = 0; j < lb.length - 1; j += 1) {
    addProgressionConns(conns, `lb${j}`, lb[j].matches, `lb${j + 1}`, lb[j + 1].matches);
  }
  // 胜者组/败者组决赛 → 总决赛
  if (gfRound) {
    if (ub.length > 0) addProgressionConns(conns, `ub${ub.length - 1}`, ub[ub.length - 1].matches, 'gf', gfRound.matches);
    if (lb.length > 0) addProgressionConns(conns, `lb${lb.length - 1}`, lb[lb.length - 1].matches, 'gf', gfRound.matches);
  }
  return { cols, cells, conns };
}

function isFinalKey(item: { round: string }): boolean {
  return GF_RE.test(item.round);
}

function BracketMatchCard({
  match,
  mid,
  isFinal,
  onOpenTeam,
  teamSlugMap,
}: {
  match: PlayoffMatch;
  mid: string;
  isFinal: boolean;
  onOpenTeam?: (team: TeamLinkTarget) => void;
  teamSlugMap?: Record<string, string>;
}) {
  if (!match.teams || match.teams.length === 0) {
    return (
      <div className="bmatch-card bmatch-empty" data-mid={mid}>
        待定{isFinal ? ' · BO5' : ''}
      </div>
    );
  }
  const [a, b] = match.teams;
  const teamLink = (team: PlayoffTeam, win: boolean) => (
    <TeamLink
      className={`bmatch-team ${win ? 'win' : ''}`}
      team={{ name: team.name, slug: team.slug ?? teamSlugMap?.[team.name] ?? null }}
      onOpenTeam={onOpenTeam}
    >
      <TeamLogo src={team.logo} name={team.name} size={22} />
      <span className="nm">{team.name}</span>
      <span className="sc">{team.score ?? '-'}</span>
    </TeamLink>
  );
  return (
    <div className="bmatch-card" data-mid={mid}>
      <div className="bmatch-date">{match.date || ''}</div>
      {teamLink(a, Boolean(a.winner))}
      {teamLink(b, Boolean(b.winner))}
    </div>
  );
}

interface BracketCell {
  key: string;
  head: string;
  bo: string;
  col: number;
  row: string;
  center: boolean;
  isFinal: boolean;
  matches: PlayoffMatch[];
}

function BracketCellBox({
  cell,
  prizes,
  onOpenTeam,
  teamSlugMap,
}: {
  cell: BracketCell;
  prizes?: PrizeEntry[];
  onOpenTeam?: (team: TeamLinkTarget) => void;
  teamSlugMap?: Record<string, string>;
}) {
  return (
    <div className={`bracket-cell ${cell.center ? 'center' : ''}`} style={{ gridColumn: cell.col, gridRow: cell.row }}>
      <div className="round-head">
        <span className="rn">{cell.head}</span>
        <span className="rb">{cell.bo}</span>
      </div>
      {cell.matches.length === 0 ? (
        <BracketMatchCard match={{ teams: [], date: '' }} mid={`${cell.key}-0`} isFinal={cell.isFinal} onOpenTeam={onOpenTeam} teamSlugMap={teamSlugMap} />
      ) : (
        cell.matches.map((m, i) => (
          <BracketMatchCard key={`${cell.key}-${i}`} match={m} mid={`${cell.key}-${i}`} isFinal={cell.isFinal} onOpenTeam={onOpenTeam} teamSlugMap={teamSlugMap} />
        ))
      )}
      {cell.isFinal && cell.key === 'gf' ? (
        <>
          <div className="bmatch-final-prize">
            <span className="medal gold" aria-hidden="true">
              1
            </span>
            {prizes?.[0]?.prize || ''} · 冠军
          </div>
          <div className="bmatch-final-prize">
            <span className="medal silver" aria-hidden="true">
              2
            </span>
            {prizes?.[1]?.prize || ''} · 亚军
          </div>
        </>
      ) : null}
    </div>
  );
}

function BracketConnectors({
  boxRef,
  conns,
}: {
  boxRef: React.RefObject<HTMLDivElement | null>;
  conns: { from: string; to: string }[];
}) {
  const [lines, setLines] = useState<{ d: string; arrow: boolean }[]>([]);

  useEffect(() => {
    const draw = () => {
      const box = boxRef.current;
      if (!box) return;
      const boxRect = box.getBoundingClientRect();
      const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
      box.querySelectorAll<HTMLElement>('.bmatch-card[data-mid]').forEach((el) => {
        const r = el.getBoundingClientRect();
        rects[el.dataset.mid || ''] = { x: r.left - boxRect.left, y: r.top - boxRect.top, w: r.width, h: r.height };
      });
      if (Object.keys(rects).length === 0) return;
      const portOf = (id: string, port: 'right' | 'left') => {
        const r = rects[id];
        if (!r) return null;
        return port === 'right' ? { x: r.x + r.w, y: r.y + r.h / 2 } : { x: r.x, y: r.y + r.h / 2 };
      };
      const winTo: Record<string, string[]> = {};
      for (const c of conns) (winTo[c.to] = winTo[c.to] || []).push(c.from);
      const out: { d: string; arrow: boolean }[] = [];
      for (const [to, froms] of Object.entries(winTo)) {
        const t = portOf(to, 'left');
        if (!t) continue;
        if (froms.length === 1) {
          const s = portOf(froms[0], 'right');
          if (!s) continue;
          const hx = (s.x + t.x) / 2;
          out.push({ d: `M ${s.x} ${s.y} L ${hx} ${s.y} L ${hx} ${t.y} L ${t.x} ${t.y}`, arrow: true });
        } else {
          const srcs = froms.map((f) => portOf(f, 'right')).filter((v): v is { x: number; y: number } => Boolean(v));
          if (srcs.length < 2) continue;
          const railX = Math.max(...srcs.map((s) => s.x)) + 18;
          const ys = srcs.map((s) => s.y);
          const yA = Math.min(...ys);
          const yB = Math.max(...ys);
          const midY = (yA + yB) / 2;
          srcs.forEach((s) => out.push({ d: `M ${s.x} ${s.y} L ${railX} ${s.y}`, arrow: false }));
          if (yB - yA > 2) out.push({ d: `M ${railX} ${yA} L ${railX} ${yB}`, arrow: false });
          out.push({ d: `M ${railX} ${midY} L ${t.x} ${midY}`, arrow: false });
          if (Math.abs(t.y - midY) > 4) out.push({ d: `M ${t.x} ${midY} L ${t.x} ${t.y}`, arrow: false });
        }
      }
      setLines(out);
    };
    draw();
    const timer = setTimeout(draw, 60);
    window.addEventListener('resize', draw);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', draw);
    };
  }, [boxRef, conns]);

  return (
    <svg className="bracket-svg" aria-hidden="true">
      <defs>
        <marker id="arrowWin" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(150,180,255,0.9)" />
        </marker>
      </defs>
      {lines.map((l, i) => (
        <path
          key={i}
          d={l.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="bracket-line-win"
          {...(l.arrow ? { markerEnd: 'url(#arrowWin)' } : {})}
        />
      ))}
    </svg>
  );
}

function PlayoffsSection({
  rounds,
  prizes,
  onOpenTeam,
  teamSlugMap,
}: {
  rounds?: PlayoffRound[];
  prizes?: PrizeEntry[];
  onOpenTeam?: (team: TeamLinkTarget) => void;
  teamSlugMap?: Record<string, string>;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  if (!rounds || rounds.length === 0) return null;

  const layout = buildBracket(rounds);

  return (
    <section className="section" aria-label="淘汰赛">
      <SectionHead title="淘汰赛" eyebrow="Playoffs" />
      <div className="card">
        <div className="bracket-scroll">
          <div className="bracket" ref={boxRef} style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
            {layout.cells.map((c) => (
              <BracketCellBox key={c.key} cell={c} prizes={prizes} onOpenTeam={onOpenTeam} teamSlugMap={teamSlugMap} />
            ))}
            <BracketConnectors boxRef={boxRef} conns={layout.conns} />
          </div>
          <div className="bracket-legend">
            <span>
              <i className="win" aria-hidden="true" />
              实线 · 胜者晋级
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：奖金池（前三卡片 + 明细行）                                      */
/* ------------------------------------------------------------------ */

const PRIZE_PLACE: Record<string, string> = { '1': '冠军', '2': '亚军', '3': '季军' };

function PrizePoolSection({ prizes, breakdown }: { prizes?: PrizeEntry[]; breakdown?: [string, string][] }) {
  if (!prizes || prizes.length === 0) return null;
  return (
    <section className="section" aria-label="奖金池">
      <div className="prize-grid">
        {prizes.slice(0, 3).map((prize) => (
          <div key={`${prize.place}-${prize.prize}`} className={`prize-card ${prize.tone}`}>
            <div className="prize-place">{prize.place}</div>
            <div className="prize-label">{PRIZE_PLACE[prize.place] || `${prize.place} 名`}</div>
            <div className="prize-amount">{prize.prize}</div>
            <div className="prize-team">{prize.team === 'TBD' ? '待定' : prize.team}</div>
          </div>
        ))}
      </div>
      {breakdown && breakdown.length > 0 ? (
        <div className="prize-breakdown">
          {breakdown.map(([pl, pa], i) => (
            <div className="prize-break-row" key={`${pl}-${i}`}>
              <span className="pl">{pl}</span>
              <span className="pa">{pa}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：赛事数据（空态）                                                */
/* ------------------------------------------------------------------ */

function StatsSection() {
  return (
    <section className="section" aria-label="赛事数据">
      <SectionHead title="赛事数据" eyebrow="Event Stats" bar="blue" />
      <div className="card stats-grid">
        <div className="stats-empty">
          <div className="icon" aria-hidden="true">
            📊
          </div>
          该赛事暂未发布聚合统计数据。
          <br />
          比赛进行中 / 结束后，将自动补充地图统计、阵营胜率与英雄出场数据。
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：参赛队伍                                                       */
/* ------------------------------------------------------------------ */

const ROLE_COLORS = ['#ff6b5f', '#ff9f43', '#5f7fff', '#34d17b', '#b183ff'];

function ParticipantsSection({
  participants,
  onOpenTeam,
}: {
  participants?: Participant[];
  onOpenTeam?: (team: TeamLinkTarget) => void;
}) {
  if (!participants || participants.length === 0) return null;
  return (
    <section className="section" aria-label="参赛队伍">
      <SectionHead title="参赛队伍" eyebrow={`Participants · ${participants.length}`} />
      <div className="team-grid">
        {participants.map((team) => (
          <article className="team-card" key={team.name}>
            <TeamLink
              className="team-head"
              team={{ name: team.name, slug: slugFromTeamUrl(team.teamUrl) }}
              onOpenTeam={onOpenTeam}
            >
              <TeamLogo src={team.logo} name={team.name} size={42} />
              <div className="tt">
                <div className="tn">{team.name}</div>
                <span className="tag">{team.invite === 'Direct invite' || team.invite === 'Direct Invite' ? '直接邀请' : team.invite || '参赛队伍'}</span>
              </div>
            </TeamLink>
            <div className="team-roster">
              {team.players.map((player, j) => (
                <span className="roster-item" key={player}>
                  <span className="role" style={{ background: ROLE_COLORS[j % ROLE_COLORS.length] }}>
                    {j + 1}
                  </span>
                  {player}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 区块：已结束比赛（结果卡片 · 默认 2 行 + load more）                    */
/* ------------------------------------------------------------------ */

const FINISHED_ROW_STEP = 2;
const FINISHED_CARD_MIN = 244;

function FinishedSection({
  finished,
  onOpenTeam,
  onOpenMatch,
  teamSlugMap,
}: {
  finished: MatchRow[];
  onOpenTeam?: (team: TeamLinkTarget) => void;
  onOpenMatch?: (nav: { matchId: string; slug?: string }) => void;
  teamSlugMap?: Record<string, string>;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [rows, setRows] = useState(2);
  const [perRow, setPerRow] = useState(5);

  useEffect(() => {
    const measure = () => {
      const el = listRef.current;
      if (!el) return;
      setPerRow(Math.max(1, Math.floor((el.clientWidth + 12) / FINISHED_CARD_MIN)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  if (!finished || finished.length === 0) return null;
  const all = [...finished].reverse();
  const shown = Math.min(all.length, perRow * rows);
  const hasMore = shown < all.length;
  const canCollapse = all.length > perRow * 2;

  const scoreOf = (mm: MatchRow) => {
    const parts = mm.center.replace(/\s+/g, ' ').split('-').map((x) => x.trim());
    const p1 = parts[0];
    const p2 = parts[1];
    let lw = false;
    let rw = false;
    if (/^W$/i.test(p1)) lw = true;
    else if (/^(FF|W)$/i.test(p2)) rw = true;
    else {
      const n1 = Number(p1);
      const n2 = Number(p2);
      lw = n1 > n2;
      rw = n2 > n1;
    }
    return { p1, p2, lw, rw };
  };

  return (
    <section className="section" aria-label="已结束比赛">
      <SectionHead title="已结束比赛" eyebrow="Finished" bar="slate" />
      <div className="finished-cards" ref={listRef}>
        {all.slice(0, shown).map((mm) => {
          const { p1, p2, lw, rw } = scoreOf(mm);
          const nav = seriesIdAndSlugFromMatchUrl(mm.url);
          return (
            <div
              className={`finished-card ${nav && onOpenMatch ? 'clickable' : ''}`}
              key={`${mm.left}-${mm.right}-${mm.center}`}
              role={nav && onOpenMatch ? 'button' : undefined}
              tabIndex={nav && onOpenMatch ? 0 : undefined}
              onClick={nav && onOpenMatch ? () => onOpenMatch(nav) : undefined}
              onKeyDown={nav && onOpenMatch ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenMatch(nav); } } : undefined}
            >
              <div className="fc-head">
                <span className="done">已结束</span>
              </div>
              <div className="fc-teams">
                <TeamLink
                  className={`fc-team ${lw ? 'win' : ''}`}
                  team={{ name: mm.left, slug: mm.leftSlug ?? teamSlugMap?.[mm.left] ?? null }}
                  onOpenTeam={onOpenTeam}
                >
                  <TeamLogo src={mm.leftLogo} name={mm.left} size={24} />
                  <span className="nm">{mm.left}</span>
                  <span className="sc">{p1}</span>
                </TeamLink>
                <TeamLink
                  className={`fc-team ${rw ? 'win' : ''}`}
                  team={{ name: mm.right, slug: mm.rightSlug ?? teamSlugMap?.[mm.right] ?? null }}
                  onOpenTeam={onOpenTeam}
                >
                  <TeamLogo src={mm.rightLogo} name={mm.right} size={24} />
                  <span className="nm">{mm.right}</span>
                  <span className="sc">{p2}</span>
                </TeamLink>
              </div>
            </div>
          );
        })}
        {hasMore ? (
          <button className="load-more" type="button" onClick={() => setRows((r) => r + FINISHED_ROW_STEP)}>
            加载更多比赛
            <span className="lm-count">
              每次 +{FINISHED_ROW_STEP} 行 · 剩余 {all.length - shown} 场
            </span>
          </button>
        ) : canCollapse ? (
          <button className="load-more" type="button" onClick={() => setRows(2)}>
            收起
            <span className="lm-count">回到前 2 行</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 页面主体                                                             */
/* ------------------------------------------------------------------ */

function Skeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-[360px] animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
    </div>
  );
}

export function EventDetailPage({
  slug,
  onBack,
  onOpenTeam,
  onOpenMatch,
  onOpenLive,
}: {
  slug: string;
  onBack?: () => void;
  onOpenTeam?: (team: TeamLinkTarget) => void;
  onOpenMatch?: (nav: { matchId: string; slug?: string }) => void;
  onOpenLive?: (hero: LiveHeroPayload) => void;
}) {
  const [payload, setPayload] = useState<EventDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveHeroes, setLiveHeroes] = useState<LiveHeroPayload[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPayload(null);
    // cache-buster：按 5 分钟桶翻转，绕开 CDN 对精确 URL 的陈旧缓存（详情数据易变）。
    const cacheBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    apiFetch<EventDetailPayload>(`/api/event-detail?slug=${encodeURIComponent(slug)}&_cb=${cacheBucket}`, {
      ttlMs: 5 * 60 * 1000,
      cacheEmpty: false,
    })
      .then((data) => {
        if (cancelled) return;
        if (!data || data.empty) {
          setError('赛事详情暂不可用，请稍后重试');
          return;
        }
        setPayload(data);
      })
      .catch(() => {
        if (!cancelled) setError('赛事详情加载失败，请稍后重试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // 关联直播数据源与首页一致（/api/live-hero，hawk.live）。短缓存，返回赛事详情时命中即显。
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ liveMatches?: LiveHeroPayload[]; live?: LiveHeroPayload }>('/api/live-hero', {
      ttlMs: 20_000,
      cacheEmpty: false,
    })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.liveMatches) ? data.liveMatches : data?.live ? [data.live] : [];
        setLiveHeroes(list);
      })
      .catch(() => { /* 保留空态，不阻塞赛事详情 */ });
    return () => {
      cancelled = true;
    };
  }, []);

  // name → DLTV slug 映射：bracket/已结束/直播卡片只有队名没有 teamUrl，用此映射补充精确 slug。
  const teamSlugMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of payload?.participants || []) {
      const slug = slugFromTeamUrl(p.teamUrl);
      if (slug) map[p.name] = slug;
    }
    for (const g of payload?.groups || []) {
      for (const r of g.rows) {
        const slug = slugFromTeamUrl(r.teamUrl);
        if (slug && !map[r.team]) map[r.team] = slug;
      }
    }
    return map;
  }, [payload]);

  // 本赛事涉及的全部战队名（participants + 关联直播/已结束行的对阵），用于把 hawk.live 的实时场次归属到本赛事。
  const eventTeams = useMemo(() => {
    const names = new Set<string>();
    const add = (value?: string | null) => {
      const normalized = String(value || '').trim().toLowerCase();
      if (normalized) names.add(normalized);
    };
    for (const p of payload?.participants || []) add(p.name);
    for (const m of payload?.matches?.matches || []) {
      add(m.left);
      add(m.right);
    }
    for (const m of payload?.matches?.finishedMatches || []) {
      add(m.left);
      add(m.right);
    }
    return names;
  }, [payload]);

  // 关联直播：hawk.live 实时场次中，两队都属于本赛事 → 展示为首页同款 LiveMatchCard（点击进 live detail）。
  const relatedLive = useMemo(() => {
    if (eventTeams.size === 0) return [];
    return liveHeroes.filter((hero) => {
      const teams = (hero.teams || [])
        .map((t) => String(t.name || '').trim().toLowerCase())
        .filter(Boolean);
      return teams.length >= 2 && teams.every((t) => eventTeams.has(t));
    });
  }, [liveHeroes, eventTeams]);

  return (
    <div className="event-detail-root mx-auto w-full max-w-[1280px] px-4 pb-16 pt-24 lg:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ color: '#2b55e8' }}
      >
        <ArrowLeft className="size-4" />
        返回赛事列表
      </button>

      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="rounded-2xl border border-white/10 bg-[#1a1d24] px-6 py-14 text-center">
          <p className="text-sm text-slate-300">{error}</p>
        </div>
      ) : payload ? (
        <>
          <HeroSection payload={payload} />
          <AboutSection about={payload.about} />
          <MatchesSection payload={payload} relatedLive={relatedLive} onOpenTeam={onOpenTeam} onOpenMatch={onOpenMatch} onOpenLive={onOpenLive} teamSlugMap={teamSlugMap} />
          <GroupStageSection groups={payload.groups} onOpenTeam={onOpenTeam} />
          <PlayoffsSection rounds={payload.playoffRounds} prizes={payload.prizePool} onOpenTeam={onOpenTeam} teamSlugMap={teamSlugMap} />
          <PrizePoolSection prizes={payload.prizePool} breakdown={payload.about?.prizeBreakdown} />
          <StatsSection />
          <ParticipantsSection participants={payload.participants} onOpenTeam={onOpenTeam} />
          <FinishedSection finished={payload.matches?.finishedMatches || []} onOpenTeam={onOpenTeam} onOpenMatch={onOpenMatch} teamSlugMap={teamSlugMap} />
          {payload.source ? (
            <p className="text-center text-[11px] text-slate-600">数据来源 DLTV · {payload.source}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default EventDetailPage;
