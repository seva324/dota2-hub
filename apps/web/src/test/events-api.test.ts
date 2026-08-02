import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parseDltvEventsPageRawMock = vi.fn();

vi.mock('../../../../lib/server/dltv-events-page-parser.js', () => ({
  parseDltvEventsPageRaw: parseDltvEventsPageRawMock,
}));

function createRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 200,
    payload: null as unknown,
    setHeader(key: string, value: string) {
      headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

const ONGOING_ENTRIES = [
  {
    title: 'Blast Slam 7',
    sourceUrl: 'https://dltv.org/events/blast-slam-7',
    status: 'ongoing',
    startTime: 1700000000,
    endTime: 1701000000,
    live: true,
    image: null,
    locationFlagUrl: null,
  },
];

const FINISHED_ENTRIES = [
  {
    title: 'Finished Cup',
    sourceUrl: 'https://dltv.org/events/finished-cup',
    status: 'finished',
    startTime: 1690000000,
    endTime: 1691000000,
    live: false,
    image: null,
    locationFlagUrl: null,
  },
];

describe('/api/events cache + single-flight', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700500000 * 1000));
    parseDltvEventsPageRawMock.mockReset();
    parseDltvEventsPageRawMock.mockImplementation((raw: unknown, kind: string) => (
      kind === 'ongoing' ? ONGOING_ENTRIES : FINISHED_ENTRIES
    ));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds and groups the events payload on a cold start', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'x'.repeat(600),
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((res.payload as any).events.ongoing).toHaveLength(1);
    expect((res.payload as any).events.finished).toHaveLength(1);
    expect((res.payload as any).events.upcoming).toEqual([]);
  });

  it('quick mode returns ongoing/upcoming fast with empty finished, then full poll fills finished', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'x'.repeat(600),
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const req = { method: 'GET', query: { quick: '1' } };
    const res = createRes();
    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).partial).toBe(true);
    expect((res.payload as any).events.ongoing).toHaveLength(1);
    expect((res.payload as any).events.upcoming).toEqual([]);
    expect((res.payload as any).events.finished).toEqual([]);
    // quick 只等 /events 一页即返回；finished 页抓取已后台发起（fire-and-forget），
    // 响应不被它阻塞，所以此时只有 ongoing + 已发起的 finished 两次 fetch。
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 后台补齐 finished 后，全量请求直接命中缓存返回 finished，不再重复抓取。
    await vi.advanceTimersByTimeAsync(0);
    const resFull = createRes();
    await handler({ method: 'GET', query: {} } as never, resFull as never);
    expect(resFull.statusCode).toBe(200);
    expect((resFull.payload as any).events.finished).toHaveLength(1);
    expect((resFull.payload as any).source).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves cached events on repeat requests and stale-with-background-refresh after TTL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'x'.repeat(600),
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const req = { method: 'GET', query: {} };
    const res = createRes();
    await handler(req as never, res as never);
    expect(res.statusCode).toBe(200);

    // 立即第二次请求命中缓存，不再抓取。
    const res2 = createRes();
    await handler(req as never, res2 as never);
    expect(res2.statusCode).toBe(200);
    expect((res2.payload as any).source).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 超过 180s TTL（仍在 15min stale 上限内）：返回 stale + 后台刷新。
    await vi.advanceTimersByTimeAsync(181_000);
    const res3 = createRes();
    await handler(req as never, res3 as never);
    expect(res3.statusCode).toBe(200);
    expect((res3.payload as any).source).toBe('stale');
    expect((res3.payload as any).events.ongoing).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it('shares a single in-flight build across concurrent cold requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'x'.repeat(600),
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const req = { method: 'GET', query: {} };
    const [resA, resB] = [createRes(), createRes()];

    await Promise.all([
      handler(req as never, resA as never),
      handler(req as never, resB as never),
    ]);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    // 两个并发冷请求共享同一次 build（build 内部抓取两页），不会重复抓 4 次。
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
