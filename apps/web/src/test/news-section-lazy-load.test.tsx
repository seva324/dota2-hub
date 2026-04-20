import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewsSection } from '@/sections/NewsSection';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly callback: IntersectionObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([
      {
        isIntersecting,
        target: document.createElement('div'),
        boundingClientRect: {} as DOMRectReadOnly,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      } as IntersectionObserverEntry,
    ], this as unknown as IntersectionObserver);
  }
}

describe('NewsSection lazy loading', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ([
        {
          id: '1',
          title: 'DreamLeague Finals Locked',
          source: 'BO3.gg',
          url: 'https://example.com/news/1',
          published_at: 1_700_000_000,
          category: 'tournament',
          summary: 'A grand final is set.'
        }
      ])
    } as Response));
  });

  it('waits until in view before requesting news', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<NewsSection news={[]} />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('DreamLeague Finals Locked')).not.toBeInTheDocument();

    await act(async () => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/news');
    });

    expect(await screen.findByText('DreamLeague Finals Locked')).toBeInTheDocument();
  });

  it('does not re-request news in a render loop when props are omitted', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<NewsSection />);

    await act(async () => {
      MockIntersectionObserver.instances[0]?.trigger(true);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/news');
  });
});
