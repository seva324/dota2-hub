import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 仓库约定：vi.mock 工厂 + 每个测试动态 await import()，避免 hoisting 问题。
// 这里只 stub 热缓存与解析器，让 service 的 stale-while-revalidate / single-flight /
// 超时逻辑在隔离状态下被测，不依赖真实 DLTV HTML 解析器。

const mockRead = vi.fn();
const mockWrite = vi.fn();
const mockLock = vi.fn();
const mockParseLive = vi.fn();
const mockParseFinished = vi.fn();
const mockParseUpcomingWithLogos = vi.fn();
const mockParseUpcomingPage = vi.fn();

vi.mock('../../../../lib/server/dltv-matches-hot-cache.js', () => ({
  readDltvMatchesHotCache: mockRead,
  writeDltvMatchesHotCache: mockWrite,
  tryAcquireDltvMatchesRefreshLock: mockLock,
}));

vi.mock('../../../../lib/server/dltv-matches-parser.js', () => ({
  parseDltvLiveMatches: mockParseLive,
  parseDltvFinishedMatches: mockParseFinished,
  parseDltvUpcomingMatchesWithLogos: mockParseUpcomingWithLogos,
}));

vi.mock('../../../../lib/server/dltv-upcoming.js', () => ({
  parseDltvUpcomingMatchesPage: mockParseUpcomingPage,
}));

type ServiceModule = {
  getDltvLive: (options?: { fetchImpl?: typeof fetch }) => Promise<{ live: unknown[]; source: string }>;
  getDltvUpcoming: (options?: { fetchImpl?: typeof fetch }) => Promise<{ upcoming: unknown[]; source: string }>;
  getDltvResults: (options?: { fetchImpl?: typeof fetch }) => Promise<{ results: unknown[]; source: string }>;
};

async function importService(): Promise<ServiceModule> {
  return await import('../../../../lib/server/dltv-matches-service.js');
}

function createFetchImpl(calls: string[]) {
  return (async (input: unknown) => {
    calls.push(String(input));
    // fetchText 要求文本长度 >= 80 才算有效抓取；填充到足够长
    return { ok: true, text: async () => '<div class="matches-list">' + 'x'.repeat(120) + '</div>' };
  }) as unknown as typeof fetch;
}

describe('dltv-matches-service (Part 1a speedups)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRead.mockReset();
    mockWrite.mockReset();
    mockLock.mockReset();
    mockLock.mockResolvedValue(true);
    mockParseLive.mockReturnValue([{ id: 'l1' }]);
    mockParseFinished.mockReturnValue([{ id: 'f1' }]);
    mockParseUpcomingWithLogos.mockReturnValue([{ id: 'u1' }]);
    mockParseUpcomingPage.mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fresh cached data with source=cache and does not refetch', async () => {
    const { getDltvLive } = await importService();
    mockRead.mockResolvedValue({ payload: [{ id: 1 }], refreshedAt: Date.now() });
    const calls: string[] = [];
    const fetchImpl = createFetchImpl(calls);

    const { live, source } = await getDltvLive({ fetchImpl });

    expect(source).toBe('cache');
    expect(live).toEqual([{ id: 1 }]);
    expect(calls).toHaveLength(0);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns stale data immediately (source=stale) while a background refresh writes the hot cache', async () => {
    const { getDltvLive } = await importService();
    mockRead.mockResolvedValue({ payload: [{ id: 'stale' }], refreshedAt: Date.now() - 20_000 });
    const calls: string[] = [];
    const fetchImpl = createFetchImpl(calls);

    const { live, source } = await getDltvLive({ fetchImpl });

    expect(source).toBe('stale');
    expect(live).toEqual([{ id: 'stale' }]);
    expect(calls).toHaveLength(1); // 后台刷新发起了抓取（不阻塞返回值）

    await vi.waitFor(() => expect(mockWrite).toHaveBeenCalled());
  });

  it('shares a single /matches fetch between concurrent live and upcoming cold calls (single-flight)', async () => {
    const { getDltvLive, getDltvUpcoming } = await importService();
    const calls: string[] = [];
    const fetchImpl = createFetchImpl(calls);

    const [liveResult, upcomingResult] = await Promise.all([
      getDltvLive({ fetchImpl }),
      getDltvUpcoming({ fetchImpl }),
    ]);

    expect(calls.filter((url) => url.includes('dltv.org/matches'))).toHaveLength(1);
    expect(liveResult.source).toBe('dltv');
    expect(upcomingResult.source).toBe('dltv');
    expect(liveResult.live).toEqual([{ id: 'l1' }]);
  });

  it('times out a cold miss after 8s and returns empty payload with source=failed', async () => {
    vi.useFakeTimers();
    const { getDltvLive } = await importService();
    mockRead.mockResolvedValue(null);
    const neverResolving = (async () => new Promise(() => {})) as unknown as typeof fetch;

    const promise = getDltvLive({ fetchImpl: neverResolving });
    await vi.advanceTimersByTimeAsync(8000);

    const result = await promise;
    expect(result).toEqual({ live: [], source: 'failed' });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('returns dltv source with parsed payload on a successful cold miss', async () => {
    const { getDltvLive } = await importService();
    mockRead.mockResolvedValue(null);
    const calls: string[] = [];
    const fetchImpl = createFetchImpl(calls);

    const { live, source } = await getDltvLive({ fetchImpl });

    expect(source).toBe('dltv');
    expect(live).toEqual([{ id: 'l1' }]);
    expect(mockWrite).toHaveBeenCalled();
  });

  it('acquires the refresh lock before refreshing and releases it', async () => {
    const { getDltvLive } = await importService();
    mockRead.mockResolvedValue(null);
    const calls: string[] = [];
    const fetchImpl = createFetchImpl(calls);

    await getDltvLive({ fetchImpl });

    expect(mockLock).toHaveBeenCalledWith('live', 8000);
  });

  it('returns failed with empty results on a cold miss that produces no payload', async () => {
    const { getDltvResults } = await importService();
    mockRead.mockResolvedValue(null);
    mockParseFinished.mockReturnValue([]);
    const fetchImpl = createFetchImpl([]);

    const { results, source } = await getDltvResults({ fetchImpl });

    expect(source).toBe('failed');
    expect(results).toEqual([]);
  });
});
