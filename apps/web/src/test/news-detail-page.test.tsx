import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewsDetailPage } from '@/pages/NewsDetailPage';
import { __resetApiCache } from '@/lib/api-cache';

function makeItem(overrides: Partial<{ id: string; title: string; summary: string; content_markdown: string; category: string; source: string; image_url: string; published_at: number; url: string }> = {}) {
  return {
    id: overrides.id || 'a',
    title: overrides.title || 'DreamLeague Finals Locked',
    summary: overrides.summary || 'A grand final is set.',
    content_markdown: overrides.content_markdown || '## Opening\nA long body paragraph about the final.',
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

describe('NewsDetailPage', () => {
  const onBack = vi.fn();

  beforeEach(() => {
    vi.unstubAllGlobals();
    onBack.mockClear();
    __resetApiCache();
    window.location.hash = '';
    window.scrollTo = () => {};
  });

  it('renders the full article body when the news item is found', async () => {
    const items = [
      makeItem({ id: 'a', title: 'Feature Headline', content_markdown: '## Section One\nBody text here.' }),
      makeItem({ id: 'b', title: 'Second Story', category: 'takes' }),
      makeItem({ id: 'c', title: 'Third Update', category: 'patch' }),
    ];
    stubFetch(items);

    render(<NewsDetailPage newsId="a" onBack={onBack} />);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/news?limit=60');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /feature headline/i, level: 1 })).toBeInTheDocument();
    });
    // 正文渲染（markdown 标题 + 段落）
    expect(screen.getByRole('heading', { name: /section one/i })).toBeInTheDocument();
    expect(screen.getByText('Body text here.')).toBeInTheDocument();
    // 相关阅读列出同池其他条目
    expect(screen.getByText('Second Story')).toBeInTheDocument();
    expect(screen.getByText('Third Update')).toBeInTheDocument();
  });

  it('shows an empty state when the news id is not in the list', async () => {
    const items = [makeItem({ id: 'a', title: 'Only Item' })];
    stubFetch(items);

    render(<NewsDetailPage newsId="missing" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText(/未找到该新闻/)).toBeInTheDocument();
    });
  });

  it('navigates to the related article when clicking a related card', async () => {
    const items = [
      makeItem({ id: 'a', title: 'Feature Headline', category: 'esports' }),
      makeItem({ id: 'b', title: 'Second Story', category: 'takes' }),
      makeItem({ id: 'c', title: 'Third Update', category: 'patch' }),
    ];
    stubFetch(items);

    render(<NewsDetailPage newsId="a" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByText('Second Story')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Second Story'));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/news/b');
    });
  });

  it('calls onBack when the back button is clicked', async () => {
    const items = [makeItem({ id: 'a', title: 'Feature Headline' })];
    stubFetch(items);

    render(<NewsDetailPage newsId="a" onBack={onBack} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /返回新闻列表/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /返回新闻列表/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
