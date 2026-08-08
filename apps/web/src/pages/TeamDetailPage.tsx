import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import './team-detail.css';
import { apiFetch } from '@/lib/api-cache';

// ============================================================
// TeamDetailPage —— 忠实复刻 team-falcons.html 的 8 大模块设计
// 数据：/api/team-detail（DLTV 官方接口归一化）
// 样式：team-detail.css（由 team-falcons.html 样式作用域化生成）
// ============================================================

type TeamData = {
  meta?: { capturedAt?: string; source?: string };
  team?: {
    name?: string;
    slug?: string;
    tag?: string;
    logo?: string;
    countryCode?: string;
    countryZh?: string;
    rank?: number | null;
    rankLabel?: string;
    maps?: number | null;
    prize?: number | null;
    winrate3m?: number | null;
    locationNote?: string;
    socials?: Array<{ key: string; label: string; handle?: string; url: string }>;
  };
  quickStats?: Array<{ label: string; value: string; unit?: string; href?: string }>;
  statsOverview?: {
    aggregate?: {
      maps?: number;
      wins?: number;
      win_rate?: number;
      avg_kills?: number;
      avg_deaths?: number;
      avg_assists?: number;
      first_blood_rate?: number;
      first_ten_rate?: number;
      win_first_blood_rate?: number;
      win_first_ten_rate?: number;
      avg_time_min?: number;
    };
  };
  draftStats?: {
    firstPick?: { name: string; count: number; label?: string; img?: string } | null;
    firstBan?: { name: string; count: number; label?: string; img?: string } | null;
    topPicks?: Array<{ name: string; img?: string; maps: number; rate: string; wins: number; losses: number }>;
    topBans?: Array<{ name: string; img?: string; rate: string; mapsVs: number; winsVs?: number; losesVs?: number }>;
  };
  teamSignatureHeroes?: Array<{ name: string; img?: string; winrate?: string }>;
  h2h?: Array<{
    opponent: string;
    slug: string;
    logo?: string;
    series: number;
    seriesWins?: number;
    maps: number;
    mapsWon: number;
    mapsLost: number;
    last?: string;
    winRate?: string;
  }>;
  recentMatches?: Array<{
    date?: string;
    event?: string;
    opponent: string;
    oppSlug?: string;
    oppLogo?: string;
    score?: string;
    won: boolean;
    durationMin?: number;
    heroes?: string[];
    heroImgs?: string[];
    seriesId?: string | null;
    seriesSlug?: string;
  }>;
  squad?: Array<{
    nick?: string;
    playerId?: number;
    role?: string;
    roleKey?: string;
    rank?: number | null;
    flag?: string;
    flagCode?: string;
    country?: string;
    photo?: string;
    realName?: string;
    isCoach?: boolean;
    sig?: Array<{ name: string; img?: string; winrate?: string }>;
  }>;
  rosterHistory?: Array<{ nick: string; flag?: string; joined: string; left?: string | null }>;
  achievements?: Array<{ name: string; slug?: string; cup?: string; year?: number; img?: string }>;
  nextMatch?: {
    event?: string;
    stage?: string;
    opponent: string;
    opponentSlug?: string;
    opponentLogo?: string;
    format?: string;
    scheduledAt?: string;
  };
};

const FLAG_FILES: Record<string, string> = {
  sa: 'sa-133a16bff0.svg', ca: 'ca-d15aeab601.svg', sk: 'sk-289307db6d.svg', ru: 'ru-4193748dcc.svg',
  jo: 'jo-04a45a264c.svg', dk: 'dk-bd216d26aa.svg', us: 'us-56ffba7568.svg', nl: 'nl-5158c89844.svg',
  by: 'by-ddddc29eac6.svg', pk: 'pk-f69cea5578.svg', de: 'de-f98b0f0fc9.svg', cz: 'cz-59c7ea38d4.svg',
  ua: 'ua-e0e3d35a29.svg', cn: 'cn-6b70f22a52.svg', br: 'br-66161b20a6.svg', se: 'se-cd3c2e0e22.svg',
};

const FLAG_BASE = 'https://dltv.org/assets/plugins/flag-icon/flags/4x3/';

// DLTV 对国内出口可能返回中文版战队页,realName 变成中文(且部分翻译错误);
// 选手名字一律显示英文,中文真名不渲染。
const HAS_CJK = /[一-鿿]/;

const SOCIAL_ICONS: Record<string, string> = {
  twitter: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  tiktok: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
  twitch: '<svg fill="currentColor" viewBox="0 0 24 24"><path d="M4 1L1.5 4.5v15H6V22h3.5l3-3h4l5-5V1H4zm15 12l-3 3h-4.5L9 19v-3H6V3h13v10zM12 6v5h1.5V6H12zm4 0v5h1.5V6H16z"/></svg>',
};

function stamp(t?: string): string {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—';
}

/** 站内战队详情页 hash：#/team/<name>?slug=<DLTV slug>（有 slug 时精确匹配）。 */
function teamDetailHash(name?: string | null, slug?: string | null): string {
  const base = `#/team/${encodeURIComponent(String(name || ''))}`;
  return slug ? `${base}?slug=${encodeURIComponent(String(slug))}` : base;
}

export interface TeamDetailPageProps {
  teamName: string;
  teamId?: string;
  teamSlug?: string;
  onBack: () => void;
}

export function TeamDetailPage({ teamName, teamId, teamSlug, onBack }: TeamDetailPageProps) {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState('');

  const buildApiUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (teamSlug) params.set('slug', teamSlug);
    if (teamId) params.set('teamId', teamId);
    if (teamName) params.set('name', teamName);
    return `/api/team-detail?${params.toString()}`;
  }, [teamSlug, teamId, teamName]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    (async () => {
      try {
        const payload = await apiFetch<TeamData>(buildApiUrl(), { ttlMs: 60_000, cacheEmpty: false });
        if (cancelled) return;
        setData(payload);
      } catch (e) {
        if (cancelled) return;
        console.error('[TeamDetailPage] failed:', e instanceof Error ? e.message : String(e));
        setError('战队数据暂时无法获取，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildApiUrl]);

  // 倒计时
  useEffect(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    const scheduledAt = data?.nextMatch?.scheduledAt;
    if (!scheduledAt) {
      setCountdown('');
      return;
    }
    const tick = () => {
      const target = new Date(scheduledAt).getTime();
      const diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor(diff / 3600000) % 24;
      const m = Math.floor(diff / 60000) % 60;
      const s = Math.floor(diff / 1000) % 60;
      if (diff <= 0) {
        setCountdown('<span class="cd-box"><b>开赛</b></span>');
        return;
      }
      setCountdown(
        `<span class="cd-box"><b>${d}</b><span>天</span></span>` +
        `<span class="cd-box"><b>${String(h).padStart(2, '0')}</b><span>时</span></span>` +
        `<span class="cd-box"><b>${String(m).padStart(2, '0')}</b><span>分</span></span>` +
        `<span class="cd-box"><b>${String(s).padStart(2, '0')}</b><span>秒</span></span>`
      );
    };
    tick();
    countdownTimer.current = setInterval(tick, 1000);
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [data?.nextMatch?.scheduledAt]);

  // 近 10 场胜负趋势 canvas：柱状图（胜正坐标绿色 / 负负坐标红色）
  useEffect(() => {
    const cv = chartRef.current;
    if (!cv || !data?.recentMatches?.length || data.recentMatches.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 540;
    const H = cv.clientHeight || 230;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const marks = data.recentMatches.map((m) => (m.won ? 1 : 0));
    const n = marks.length;
    const pad = { t: 18, r: 16, b: 26, l: 16 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    // 中轴线（0 坐标）在垂直中部
    const zeroY = pad.t + ih * 0.5;
    const halfH = ih * 0.46; // 柱最大高度（正/负各占半区）

    // 柔和横向网格
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g += 1) {
      const gy = pad.t + (ih / 4) * g;
      ctx.beginPath();
      ctx.moveTo(pad.l, gy);
      ctx.lineTo(pad.l + iw, gy);
      ctx.stroke();
    }
    ctx.restore();

    // 0 轴（中轴线）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(pad.l, zeroY);
    ctx.lineTo(pad.l + iw, zeroY);
    ctx.stroke();
    ctx.restore();

    // 柱状图：胜 → 正坐标（向上绿柱），负 → 负坐标（向下红柱）
    const slot = iw / n;
    const barW = Math.min(slot * 0.55, 42);
    marks.forEach((m, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const bx = cx - barW / 2;
      const color = m ? '#66BB6A' : '#F44336';
      const height = halfH;
      // 渐变柱
      const grad = ctx.createLinearGradient(0, zeroY - (m ? height : 0), 0, zeroY + (m ? 0 : height));
      grad.addColorStop(0, m ? 'rgba(102,187,106,0.95)' : 'rgba(244,67,54,0.95)');
      grad.addColorStop(1, m ? 'rgba(102,187,106,0.45)' : 'rgba(244,67,54,0.45)');
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (m) {
        ctx.roundRect(bx, zeroY - height, barW, height, [4, 4, 0, 0]);
      } else {
        ctx.roundRect(bx, zeroY, barW, height, [0, 0, 4, 4]);
      }
      ctx.fill();
      ctx.restore();
      // 柱顶/柱底小亮点
      ctx.beginPath();
      ctx.arc(cx, m ? zeroY - height : zeroY + height, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    });

    // 日期标注
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = "600 10.5px 'Exo2',sans-serif";
    ctx.textAlign = 'center';
    marks.forEach((_, i) => {
      const d = (data.recentMatches?.[i]?.date || '').slice(5).replace('-', '/');
      if (i % 2 === 0) {
        const cx = pad.l + slot * i + slot / 2;
        ctx.fillText(d, cx, pad.t + ih + 18);
      }
    });
  }, [data]);

  const D = data;
  const T = D?.team || {};
  const AGG = D?.statsOverview?.aggregate;

  const emptyNote = (msg: string) => (
    <div className="empty-note" style={{ gridColumn: '1/-1', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 12, padding: '16px 18px', fontSize: 13, background: 'var(--bg-soft)' }}>
      {msg}
    </div>
  );

  return (
    <div className="team-detail-scope" style={{
      '--bg': '#121212', '--surface': '#212121', '--surface-2': '#282828', '--surface-hover': '#2C2C2C',
      '--fg': '#F9F9F9', '--muted': '#999999', '--border': '#444444', '--bg-soft': '#2A2A2A', '--bg-deep': '#161616',
      '--accent': '#F44336', '--accent-2': '#B71C1C', '--accent-deep': '#641717', '--on-accent': '#FFFFFF',
      '--link': '#F9F9F9', '--win': '#66BB6A', '--gold': '#F5C849', '--silver': '#B9C0CC', '--bronze': '#C98E5A',
      '--footer': '#282828', '--font-display': "'Exo2','Segoe UI',sans-serif", '--font-body': "'Exo2','Segoe UI',sans-serif",
      '--shadow': '0 2px 6px rgba(0,0,0,.4)', '--shadow-lg': '0 12px 34px rgba(0,0,0,.55)',
      background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh',
    } as CSSProperties}>
      <main className="container" style={{ paddingTop: 72 }}>
        <ol className="breadcrumbs">
          <li><a href="#/" onClick={(e) => { e.preventDefault(); onBack(); }}>首页</a></li>
          <li><a href="#/" onClick={(e) => { e.preventDefault(); onBack(); }}>战队</a></li>
          <li>{T.name || teamName}</li>
        </ol>

        {loading && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)' }}>
            加载战队数据…
          </div>
        )}

        {error && !loading && (
          <div className="card card-pad" style={{ marginTop: 24, textAlign: 'center', color: 'var(--muted)' }}>
            {error}
          </div>
        )}

        {!loading && !error && D && (
          <>
            {/* ===== 战队档案 ===== */}
            <section className="profile-card">
              <div className="profile-top">
                <div className="profile-left">
                  <a className="profile-logo" href="#/" onClick={(e) => { e.preventDefault(); onBack(); }} title="点击返回">
                    {T.logo ? (
                      <img src={T.logo} alt={`${T.name || teamName} 队标`} />
                    ) : (
                      <span style={{ fontSize: 40, fontWeight: 900, color: 'var(--accent)' }}>{T.tag?.[0] || 'D2'}</span>
                    )}
                  </a>
                  {typeof T.winrate3m === 'number' && (
                    <div className="winrate-block">
                      <div className="winrate-label">近 3 个月胜率</div>
                      <div className="winrate-track"><div className="winrate-fill" style={{ width: `${T.winrate3m}%` }}></div></div>
                      <div className="winrate-num">{T.winrate3m}%</div>
                    </div>
                  )}
                </div>
                <div className="profile-right">
                  {(T.countryCode || T.countryZh) && (
                    <div className="flag-chip">
                      {T.countryCode && FLAG_FILES[T.countryCode] && (
                        <img src={`${FLAG_BASE}${FLAG_FILES[T.countryCode]}`} alt="" />
                      )}
                      <span>{[T.countryZh, T.countryCode].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                  <h1 id="team-name">{T.name || teamName}</h1>
                  {T.tag && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{T.tag} · DOTA 2</div>}
                  {T.socials && T.socials.length > 0 && (
                    <div className="socials">
                      {T.socials.map((s) => (
                        <a key={s.key} href={s.url} target="_blank" rel="noopener" title={`${s.label} ${s.handle || ''}`} aria-label={s.label}
                          dangerouslySetInnerHTML={{ __html: SOCIAL_ICONS[s.key] || '' }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="quick-stats">
                {(D.quickStats || []).slice(0, 5).map((s, i) => (
                  <div className="qstat" key={i}>
                    <div className="q-label">{s.label}</div>
                    <div className="q-value">
                      {s.href ? <a href={s.href} target="_blank" rel="noopener">{s.value}</a> : s.value}
                      {s.unit && <span className="q-unit">{s.unit}</span>}
                    </div>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 5 - (D.quickStats || []).length) }).map((_, i) => (
                  <div className="qstat" key={`ph-${i}`}><div className="q-label">—</div><div className="q-value">—</div></div>
                ))}
              </div>
            </section>

            {/* ===== 区块锚点导航 ===== */}
            <nav className="section-nav">
              <div className="container section-nav-inner">
                <a href="#next-match">即将开赛</a>
                <a href="#stats">数据总览</a>
                <a href="#h2h">最近交手</a>
                <a href="#signature">招牌英雄</a>
                <a href="#heroes">常用英雄</a>
                <a href="#squad">成员</a>
                <a href="#matches">赛果</a>
                <a href="#achievements">成就</a>
              </div>
            </nav>

            {/* ===== 即将开赛：下一场比赛 ===== */}
            <section className="section" id="next-match">
              <h2 className="section-title">即将开赛 <small>下一场比赛</small></h2>
              {D.nextMatch ? (
                <div className="nextmatch">
                  <div className="nextmatch-band">
                    <div className="nm-label">
                      <span>{D.nextMatch.event || '—'}</span>
                      {D.nextMatch.stage && <span className="nm-event">{D.nextMatch.stage}</span>}
                    </div>
                    <div className="countdown" dangerouslySetInnerHTML={{ __html: countdown }} />
                  </div>
                  <div className="nextmatch-body">
                    <div className="nm-team">
                      {T.logo ? <img src={T.logo} alt={`${T.name} 队标`} /> : <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>{T.tag?.[0] || '?'}</span>}
                      <span className="nm-name">{T.name || teamName}</span>
                      <span className="nm-sub">{T.tag}</span>
                    </div>
                    <div className="nm-versus">
                      <span className="nm-vs-txt">VS</span>
                      <span className="nm-format">{D.nextMatch.format || 'BO3'}</span>
                    </div>
                    <a className="nm-team" href={teamDetailHash(D.nextMatch.opponent, D.nextMatch.opponentSlug)} title={`查看 ${D.nextMatch.opponent} 资料`}>
                      {D.nextMatch.opponentLogo ? <img src={D.nextMatch.opponentLogo} alt={`${D.nextMatch.opponent} 队标`} /> : <span style={{ fontSize: 32, fontWeight: 900, color: 'var(--muted)' }}>?</span>}
                      <span className="nm-name">{D.nextMatch.opponent}</span>
                      <span className="nm-sub">{D.nextMatch.format}</span>
                    </a>
                  </div>
                  <div className="nm-meta">
                    <span>赛事：<b>{D.nextMatch.event || '—'}</b></span>
                    <span>赛制：<b>{D.nextMatch.format || 'BO3'}</b></span>
                    <span>数据更新：<b>{stamp(D.meta?.capturedAt)}</b></span>
                  </div>
                </div>
              ) : (
                <div className="card card-pad" style={{ color: 'var(--muted)' }}>
                  暂无已排定的下一场比赛。
                </div>
              )}
            </section>

            {/* ===== 数据总览 ===== */}
            <section className="section" id="stats">
              <h2 className="section-title">数据总览 <small>近 3 个月</small></h2>
              {AGG ? (
                <>
                  <div className="stats-grid">
                    <div className="stat-tile"><div className="st-label">地图场次</div><div className="st-value">{AGG.maps}</div><div className="st-delta">近 3 个月</div></div>
                    <div className="stat-tile"><div className="st-label">胜率</div><div className="st-value good">{AGG.win_rate}%</div><div className="st-delta">胜 {AGG.wins} / 负 {Math.max(0, (AGG.maps || 0) - (AGG.wins || 0))}</div></div>
                    <div className="stat-tile"><div className="st-label">场均击杀</div><div className="st-value accent">{Number(AGG.avg_kills || 0).toFixed(1)}</div><div className="st-delta">场均击杀</div></div>
                    <div className="stat-tile"><div className="st-label">场均死亡</div><div className="st-value">{Number(AGG.avg_deaths || 0).toFixed(1)}</div><div className="st-delta">场均死亡</div></div>
                  </div>
                  <div className="stats-split">
                    <div className="card card-pad">
                      <div className="section-title" style={{ marginBottom: 8, fontSize: 16 }}>近 10 场胜负趋势</div>
                      <canvas ref={chartRef} className="trend-chart" width="540" height="230" aria-label="近 10 场胜负趋势折线图"></canvas>
                      <div className="trend-legend"><span><i style={{ background: 'var(--win)' }}></i>胜</span><span><i style={{ background: 'var(--accent)' }}></i>负</span></div>
                    </div>
                    <div className="card card-pad">
                      <div className="section-title" style={{ marginBottom: 8, fontSize: 16 }}>关键指标</div>
                      <div className="sub-list">
                        <div className="sub-item"><span>场均助攻</span><span className="sub-v">{AGG.avg_assists}</span></div>
                        <div className="sub-item"><span>一血率 FB</span><span className="sub-v">{AGG.first_blood_rate}%</span></div>
                        <div className="sub-item"><span>10杀率 F10</span><span className="sub-v">{AGG.first_ten_rate}%</span></div>
                        <div className="sub-item"><span>一血后胜率</span><span className="sub-v">{AGG.win_first_blood_rate}%</span></div>
                        <div className="sub-item"><span>10杀后胜率</span><span className="sub-v">{AGG.win_first_ten_rate}%</span></div>
                        <div className="sub-item"><span>平均时长</span><span className="sub-v">{AGG.avg_time_min} 分钟</span></div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="stats-grid">{emptyNote('暂无统计数据')}</div>
              )}
            </section>

            {/* ===== 最近交手 ===== */}
            <section className="section" id="h2h">
              <h2 className="section-title">最近交手 <small>近 3 个月 · 地图胜率与交手记录</small></h2>
              <div className="h2h-grid">
                {D.h2h && D.h2h.length ? D.h2h.slice(0, 5).map((h) => {
                  const won = h.mapsWon > h.mapsLost;
                  return (
                    <a key={h.slug} className={`h2h-card ${won ? 'win' : 'lose'}`} href={teamDetailHash(h.opponent, h.slug)} title={`查看 ${h.opponent} 资料`}>
                      {h.logo ? <img src={h.logo} alt={`${h.opponent} 队标`} /> : <div style={{ height: 48 }} />}
                      <div className="h-name">{h.opponent}</div>
                      <div className="h-sub">{h.series} 系列赛{h.last ? ` · 最近 ${h.last}` : ''}</div>
                      <div className={`h2h-result ${won ? 'good' : 'bad'}`}>{h.mapsWon} : {h.mapsLost}</div>
                      <div className="h2h-bar"><i style={{ width: `${(h.mapsWon / Math.max(h.mapsWon + h.mapsLost, 1)) * 100}%` }}></i></div>
                      <div className="h-sub">地图胜率 {h.winRate}</div>
                    </a>
                  );
                }) : emptyNote('暂无对标记录')}
              </div>
            </section>

            {/* ===== 招牌英雄 Signature heroes ===== */}
            <section className="section" id="signature">
              <h2 className="section-title">招牌英雄 <small>Signature heroes · 战队招牌英雄与胜率</small></h2>
              {D.teamSignatureHeroes && D.teamSignatureHeroes.length ? (
                <div className="sig-grid">
                  {D.teamSignatureHeroes.map((h) => (
                    <div className="sig-hero-card" key={h.name}>
                      {h.img ? <img src={h.img} alt={h.name} /> : <span className="sig-hero-ph-lg">{h.name?.[0] || '?'}</span>}
                      <span className="sig-hero-name">{h.name}</span>
                      <span className="sig-hero-wr">{h.winrate || ''}</span>
                      <div className="sig-wr-bar">
                        <i style={{ width: `${Math.min(100, Number.parseFloat(h.winrate || '0') || 0)}%` }}></i>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sig-grid">{emptyNote('暂无招牌英雄数据')}</div>
              )}
            </section>

            {/* ===== 常用英雄 ===== */}
            <section className="section" id="heroes">
              <h2 className="section-title">常用英雄 <small>选人 / 禁用 · 近 3 个月</small></h2>
              {D.draftStats && D.draftStats.topPicks && D.draftStats.topPicks.length ? (
                <div className="hero-split">
                  <div>
                    <div className="first-tag">
                      {(D.draftStats.firstPick?.img || D.draftStats.topPicks[0].img) && <img src={D.draftStats.firstPick?.img || D.draftStats.topPicks[0].img} alt={D.draftStats.firstPick?.name || D.draftStats.topPicks[0].name} />}
                      <div>
                        <small>首选最多</small>
                        <b>{D.draftStats.firstPick?.name || D.draftStats.topPicks[0].name}</b>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}> · {D.draftStats.firstPick?.count || D.draftStats.topPicks[0].maps} 次首选</span>
                      </div>
                    </div>
                    <div className="card card-pad">
                      <div className="section-title" style={{ marginBottom: 8, fontSize: 16 }}>Top 5 战队首选</div>
                      <table className="hero-table">
                        <thead><tr><th>英雄</th><th className="num">场次</th><th className="num">选用率</th><th className="num">胜 / 负</th></tr></thead>
                        <tbody>
                          {D.draftStats.topPicks.map((h) => (
                            <tr key={h.name}>
                              <td><div className="hero-cell">{h.img && <img src={h.img} alt={h.name} />}<b>{h.name}</b></div></td>
                              <td className="num">{h.maps}</td>
                              <td className="num">{h.rate}</td>
                              <td className="num"><span className="wl-bar"><span className="wl"><i style={{ width: `${(h.wins / Math.max(h.wins + h.losses, 1)) * 100}%` }}></i></span>{h.wins} / {h.losses}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="first-tag">
                      {(D.draftStats.firstBan?.img || D.draftStats.topBans?.[0]?.img) && <img src={D.draftStats.firstBan?.img || D.draftStats.topBans?.[0]?.img || ''} alt={D.draftStats.firstBan?.name || D.draftStats.topBans?.[0]?.name || '—'} />}
                      <div>
                        <small>首禁最多</small>
                        <b>{D.draftStats.firstBan?.name || D.draftStats.topBans?.[0]?.name || '—'}</b>
                        {D.draftStats.firstBan && <span style={{ fontSize: 12, color: 'var(--muted)' }}> · {D.draftStats.firstBan.count} 次首禁</span>}
                      </div>
                    </div>
                    <div className="card card-pad">
                      <div className="section-title" style={{ marginBottom: 8, fontSize: 16 }}>Top 5 战队禁用</div>
                      <table className="hero-table">
                        <thead><tr><th>英雄</th><th className="num">禁用率</th><th className="num">遇</th><th className="num">胜 / 负</th></tr></thead>
                        <tbody>
                          {(D.draftStats.topBans || []).map((h) => (
                            <tr key={h.name}>
                              <td><div className="hero-cell">{h.img && <img src={h.img} alt={h.name} />}<b>{h.name}</b></div></td>
                              <td className="num">{h.rate}</td>
                              <td className="num">{h.mapsVs}</td>
                              <td className="num">{h.winsVs ?? '—'} / {h.losesVs ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hero-split">{emptyNote('暂无英雄数据')}</div>
              )}
            </section>

            {/* ===== 成员 ===== */}
            <section className="section" id="squad">
              <h2 className="section-title">成员 <small>现役首发</small></h2>
              {D.squad && D.squad.length ? (
                <div className="squad-grid">
                  {D.squad.map((p, i) => (
                    <div className="squad-card" key={`${p.playerId ?? p.nick}-${i}`}>
                      <div className="ph">
                        <span className={`role-badge ${p.isCoach ? 'coach' : ''}`}>{p.role || '选手'}</span>
                        {p.photo ? (
                          <img src={p.photo} alt={`${p.nick} 照片`} />
                        ) : (
                          <span style={{ fontSize: 34, fontWeight: 900, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                            {String(p.playerId || '?').slice(0, 3)}
                          </span>
                        )}
                      </div>
                      <div className="info">
                        <div className="nick">
                          {p.flag ? (
                            <img src={p.flag} alt="" />
                          ) : p.flagCode && FLAG_FILES[p.flagCode] ? (
                            <img src={`${FLAG_BASE}${FLAG_FILES[p.flagCode]}`} alt="" />
                          ) : null}
                          {p.nick}
                          {p.isCoach ? <span className="coach-tag">教练</span> : null}
                        </div>
                        <div className="full">{p.realName && !HAS_CJK.test(p.realName) ? p.realName : p.nick || '—'}</div>
                        <div className="rank-line">
                          <span>天梯排名 {p.rank || '—'}</span>
                        </div>
                        {p.sig && p.sig.length > 0 && (
                          <div className="sig-row">
                            {p.sig.map((s) => s.img && <img key={s.name} src={s.img} alt={s.name} title={s.name} />)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="squad-grid">{emptyNote('暂无成员名单')}</div>
              )}
            </section>

            {/* ===== 赛果：最近比赛 ===== */}
            <section className="section" id="matches">
              <h2 className="section-title">赛果 <small>最近比赛</small></h2>
              <div className="card">
                <table className="match-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>对阵</th>
                      <th className="num">比分</th>
                      <th>结果</th>
                      <th className="hide-m">使用英雄</th>
                      <th className="hide-m">时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.recentMatches && D.recentMatches.length ? D.recentMatches.map((m, i) => (
                      <tr key={i} className={m.won ? '' : 'losing'}>
                        <td>{(m.date || '').slice(5).replace('-', '/')}</td>
                        <td>
                          <a className="opp-cell" href={teamDetailHash(m.opponent, m.oppSlug)} title={`查看 ${m.opponent} 资料`}>
                            {m.oppLogo && <img src={m.oppLogo} alt="" />}
                            <b>{m.opponent}</b>
                          </a>
                        </td>
                        <td className="num">
                          {m.seriesId ? (
                            <a className="score-link" href={`#/match/${m.seriesId}${m.seriesSlug ? `?slug=${encodeURIComponent(m.seriesSlug)}` : ''}`} title={`查看 ${m.opponent} 比赛详情`}>
                              <span className={`score-num ${m.won ? 'good' : 'bad'}`}>{m.score}</span>
                            </a>
                          ) : (
                            <span className={`score-num ${m.won ? 'good' : 'bad'}`}>{m.score}</span>
                          )}
                        </td>
                        <td><span className={`wl-chip ${m.won ? 'win' : 'lose'}`}>{m.won ? '胜' : '负'}</span></td>
                        <td className="hide-m">
                          <div className="hero-chips">
                            {(m.heroImgs && m.heroImgs.length ? m.heroImgs : []).map((img, hi) => (
                              <img key={hi} src={img} alt={m.heroes?.[hi] || ''} title={m.heroes?.[hi] || ''} />
                            ))}
                          </div>
                        </td>
                        <td className="hide-m">{m.durationMin} 分钟</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} style={{ color: 'var(--muted)', textAlign: 'center', padding: 18 }}>暂无比赛记录</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ===== 成就 ===== */}
            <section className="section" id="achievements">
              <h2 className="section-title">成就 <small>历届赛事荣誉 · 金 / 银 / 铜</small></h2>
              <div className="achieve-grid">
                {D.achievements && D.achievements.length ? D.achievements.map((a) => (
                  <a key={a.name} className="achieve-card" href={`https://dltv.org/events/${a.slug || ''}`} target="_blank" rel="noopener" title={a.name}>
                    {a.cup && <span className={`cup ${a.cup}`}></span>}
                    {a.img && <img src={a.img} alt={a.name} />}
                    <div className="a-name">{a.name}</div>
                    {a.year && <div className="a-year">{a.year}</div>}
                  </a>
                )) : emptyNote('暂无成就数据')}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
