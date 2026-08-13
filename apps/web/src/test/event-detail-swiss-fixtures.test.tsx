import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventDetailPage, fixturesForTeam, type MatchRow } from '@/pages/EventDetailPage';
import { __resetApiCache } from '@/lib/api-cache';

/* ------------------------------------------------------------------ */
/* 工具函数 tests：fixturesForTeam 按时间排序 + 对齐轮名                 */
/* ------------------------------------------------------------------ */

describe('fixturesForTeam', () => {
  const finished: MatchRow[] = [
    { url: 'https://dltv.org/matches/1/bb-vs-og-ti', left: 'BoomBoys', right: 'OG', center: '2 - 0', time: '2026-08-13 03:12:32' },
    { url: 'https://dltv.org/matches/2/nigma-vs-og-ti', left: 'Nigma Galaxy', right: 'OG', center: '2 - 0', time: '2026-08-11 02:00:00' },
  ];

  it('只取涉及该队的已结束比赛，并按时间升序排列，比分相对于本队，补齐到轮数', () => {
    const rows = fixturesForTeam('OG', finished, ['R1', 'R2', 'R3']);
    expect(rows.length).toBe(3); // 2 场 + 补齐 1 个空格
    // 时间早的在前面（Nigma 08-11 在 BoomBoys 08-13 之前）
    expect(rows[0].opponent).toBe('Nigma Galaxy');
    expect(rows[0].won).toBe(false);
    // 相对本队比分：Nigma 2-0 OG → OG 视角为 0-2
    expect(rows[0].score).toBe('0 - 2');
    expect(rows[0].round).toBe('R1');
    expect(rows[1].opponent).toBe('BoomBoys');
    expect(rows[1].won).toBe(false);
    expect(rows[1].score).toBe('0 - 2');
    expect(rows[1].round).toBe('R2');
    expect(rows[2].opponent).toBe('');
  });

  it('本队获胜时相对比分在前', () => {
    const winRows: MatchRow[] = [
      { url: 'https://dltv.org/matches/3/og-vs-x-ti', left: 'OG', right: 'X', center: '2 - 1', time: '2026-08-13 03:00:00' },
      { url: 'https://dltv.org/matches/4/y-vs-og-ti', left: 'Y', right: 'OG', center: '1 - 2', time: '2026-08-12 03:00:00' },
    ];
    const rows = fixturesForTeam('OG', winRows, ['R1', 'R2']);
    expect(rows[0].score).toBe('2 - 1'); // OG 在左
    expect(rows[0].won).toBe(true);
    expect(rows[1].score).toBe('2 - 1'); // OG 在右，原始 1-2 → 相对 2-1
    expect(rows[1].won).toBe(true);
  });

  it('不涉及的队伍返回补齐空格', () => {
    const rows = fixturesForTeam('Team Liquid', finished, ['R1']);
    expect(rows[0].opponent).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/* 组件渲染 tests                                                       */
/* ------------------------------------------------------------------ */

describe('EventDetailPage 瑞士轮积分榜对阵结果', () => {
  beforeEach(() => {
    __resetApiCache();
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/event-detail')) {
        return {
          ok: true,
          json: async () => ({
            slug: 'ti26',
            title: 'The International 2026',
            participants: [],
            groups: [
              {
                name: 'Group Stage',
                heads: ['Team', 'Matches'],
                rounds: ['R1', 'R2'],
                rows: [
                  { team: 'BoomBoys', country: 'Russia', logo: null, position: '1', record: '2 - 0', advance: true },
                  { team: 'OG', country: 'Philippines', logo: null, position: '16', record: '0 - 2', advance: false },
                ],
              },
            ],
            matches: {
              matches: [],
              finishedMatches: [
                { url: 'https://dltv.org/matches/427635/boomboys-vs-og-the-international-2026', left: 'BoomBoys', right: 'OG', center: '2 - 0', time: '2026-08-13 03:12:32' },
                { url: 'https://dltv.org/matches/427646/nigma-vs-og-the-international-2026', left: 'Nigma Galaxy', right: 'OG', center: '2 - 0', time: '2026-08-11 02:00:00' },
              ],
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }));
  });

  it('渲染 R1/R2 轮头，每格用对手 logo + 相对本队比分展示对阵结果', async () => {
    render(
      <EventDetailPage slug="ti26" onBack={() => {}} onOpenTeam={() => {}} onOpenMatch={() => {}} onOpenLive={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('R1').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('R2').length).toBeGreaterThan(0);
    const swiss = document.querySelector('.swiss-table');
    expect(swiss).toBeTruthy();
    // OG 行（rank 16）对阵结果：两场都是 0-2 输（相对本队比分），用 logo 而非队名
    const ogRow = document.querySelectorAll('.swiss-row')[1] as HTMLElement | undefined;
    expect(ogRow).toBeTruthy();
    // 每个有比分的格子渲染成 logo（.fx-logo）+ 比分（相对本队）
    const logos = ogRow?.querySelectorAll('.swiss-fx:not(.empty) .fx-logo') ?? [];
    expect(logos.length).toBeGreaterThan(0);
    expect(ogRow?.textContent ?? '').toContain('0-2');
    // 队名不应作为阵地文本出现（改用 logo + title）
    expect(ogRow?.querySelector('.fx-team')).toBeNull();
    // title 里带对手名
    const firstFx = ogRow?.querySelector('.swiss-fx:not(.empty)') as HTMLElement | undefined;
    expect(firstFx?.getAttribute('title')).toContain('Nigma Galaxy');
  });
});
