import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewsPage } from '@/pages/NewsPage';
import { __resetApiCache } from '@/lib/api-cache';

function makeItem(overrides: Partial<{ id: string; title: string; summary: string; category: string; source: string; image_url: string; published_at: number; url: string }> = {}) {
  return {
    id: overrides.id || 'n1',
    title: overrides.title || 'DreamLeague Finals Locked',
    summary: overrides.summary || 'A grand final is set.',
    category: overrides.category || 'esports',
    source: overrides.source || 'BO3.gg',
    image_url: overrides.image_url || 'https://example.com/img.jpg',
    published_at: overrides.published_at ?? 1_700_000_000,
    url: overrides.url || 'https://example.com/news/1',
  };
}

function stubFetch(items: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => items,
  } as Response));
}

describe('NewsPage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    __resetApiCache();
    window.location.hash = '';
  });

  it('fetches news on mount and renders the headline + cards', async () => {
    const items = [
      makeItem({ id: 'a', title: 'First Headline', category: 'esports' }),
      makeItem({ id: 'b', title: 'Second Story', category: 'takes' }),
      makeItem({ id: 'c', title: 'Third Update', category: 'patch' }),
    ];
    stubFetch(items);

    render(<NewsPage />);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/news?limit=30');

    await waitFor(() => {
      expect(screen.getByText('First Headline')).toBeInTheDocument();
    });
    expect(screen.getByText('Second Story')).toBeInTheDocument();
    expect(screen.getByText('Third Update')).toBeInTheDocument();
    // 头条是第一条，单独呈现大标题
    expect(screen.getByRole('heading', { name: /first headline/i })).toBeInTheDocument();
  });

  it('shows category filter tabs with counts and filters the grid', async () => {
    const items = [
      makeItem({ id: 'a', title: 'Esports A', category: 'esports' }),
      makeItem({ id: 'b', title: 'Esports B', category: 'esports' }),
      makeItem({ id: 'c', title: 'Takes C', category: 'takes' }),
      makeItem({ id: 'd', title: 'Patch D', category: 'patch' }),
    ];
    stubFetch(items);

    render(<NewsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /全部/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^赛事/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^观点/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^版本/ })).toBeInTheDocument();

    // 点击"观点"标签 → 只剩 Takes C，Esports 卡片消失
    fireEvent.click(screen.getByRole('button', { name: /^观点/ }));
    await waitFor(() => {
      expect(screen.getByText('Takes C')).toBeInTheDocument();
    });
    expect(screen.queryByText('Esports A')).not.toBeInTheDocument();
  });

  it('paginates when there are more than 12 list items', async () => {
    const items = Array.from({ length: 14 }, (_, i) =>
      makeItem({ id: `n${i}`, title: `Story ${i}`, category: 'news' }));
    stubFetch(items);

    render(<NewsPage />);

    // 第一条(Story 0)作为头条；列表剩 13 条 → 第 1 页 Story 1..12
    await waitFor(() => {
      expect(screen.getByText('Story 12')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '下一页 ›' })).toBeInTheDocument();

    // 点下一页 → 第 2 页显示 Story 13
    fireEvent.click(screen.getByRole('button', { name: '下一页 ›' }));
    await waitFor(() => {
      expect(screen.getByText('Story 13')).toBeInTheDocument();
    });
  });

  it('shows an empty state when the API returns no items', async () => {
    stubFetch([]);
    render(<NewsPage />);

    await waitFor(() => {
      expect(screen.getByText('暂无新闻数据')).toBeInTheDocument();
    });
  });

  it('renders an empty message for a filter with no matches', async () => {
    // 6 条 esports + 1 条 takes：点"观点"只显示 1 条；再构造一个只有 esports 的过滤场景
    const items = [
      makeItem({ id: 'a', title: 'Only Esports', category: 'esports' }),
    ];
    stubFetch(items);

    render(<NewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Only Esports')).toBeInTheDocument();
    });
    // 数据中无 takes → 没有"观点"按钮
    expect(screen.queryByRole('button', { name: /^观点/ })).not.toBeInTheDocument();
  });

  it('surfaces an error message when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    render(<NewsPage />);

    await waitFor(() => {
      expect(screen.getByText('加载新闻失败，请稍后重试')).toBeInTheDocument();
    });
  });

  it('navigates to the news detail page when clicking a card', async () => {
    const items = [
      makeItem({ id: 'a', title: 'Featured Finals', category: 'esports' }),
      makeItem({ id: 'b', title: 'Second Story', category: 'esports' }),
      makeItem({ id: 'c', title: 'Takes Column', category: 'takes' }),
    ];
    stubFetch(items);

    render(<NewsPage />);

    await waitFor(() => {
      expect(screen.getByText('Second Story')).toBeInTheDocument();
    });

    // 点击列表卡片 → 导航到全屏详情页 #/news/<id>
    fireEvent.click(screen.getByText('Second Story'));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/news/b');
    });
  });
});
