import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parseDltvEventsPageRawMock = vi.fn();
const readDltvCacheMock = vi.fn();
const writeDltvCacheMock = vi.fn();

vi.mock('../../../../lib/server/dltv-events-page-parser.js', () => ({
  parseDltvEventsPageRaw: parseDltvEventsPageRawMock,
}));

vi.mock('../../../../lib/server/dltv-neon-cache.js', () => ({
  readDltvCache: readDltvCacheMock,
  writeDltvCache: writeDltvCacheMock,
}));

vi.mock('../../../../lib/db.js', () => ({
  getDb: () => ({ fake: true }),
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

const FULL_PAYLOAD = {
  events: { ongoing: ONGOING_ENTRIES, upcoming: [], finished: FINISHED_ENTRIES },
  source: { ongoing: 'direct', finished: 'direct' },
  fetchedAt: '2026-01-01T00:00:00.000Z',
};

describe('/api/events Neon persistent cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700500000 * 1000));
    parseDltvEventsPageRawMock.mockReset();
    readDltvCacheMock.mockReset();
    writeDltvCacheMock.mockReset();
    parseDltvEventsPageRawMock.mockImplementation((raw: unknown, kind: string) => (
      kind === 'ongoing' ? ONGOING_ENTRIES : FINISHED_ENTRIES
    ));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves a fresh Neon entry on cold start without fetching dltv.org', async () => {
    readDltvCacheMock.mockResolvedValue({
      payload: FULL_PAYLOAD,
      refreshedAt: Date.now() - 1000,
    });
    const fetchMock = vi.fn() as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).source).toBe('cache');
    expect((res.payload as any).events.ongoing).toHaveLength(1);
    expect((res.payload as any).events.finished).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves a stale Neon entry with a background refresh instead of blocking', async () => {
    readDltvCacheMock.mockResolvedValue({
      payload: FULL_PAYLOAD,
      refreshedAt: Date.now() - 30 * 60 * 1000,
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'x'.repeat(600),
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).source).toBe('stale');
    expect((res.payload as any).events.ongoing).toHaveLength(1);

    // 后台刷新完成后把新 payload 写回 Neon。
    await vi.advanceTimersByTimeAsync(0);
    expect(writeDltvCacheMock).toHaveBeenCalledWith(
      { fake: true },
      'dltv:events:full',
      expect.objectContaining({ payload: expect.objectContaining({ events: expect.any(Object) }) }),
    );
  });

  it('writes a freshly built payload to Neon on a true cold start', async () => {
    readDltvCacheMock.mockResolvedValue(null);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => 'x'.repeat(600),
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/events.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).events.ongoing).toHaveLength(1);
    expect(writeDltvCacheMock).toHaveBeenCalledWith(
      { fake: true },
      'dltv:events:full',
      expect.objectContaining({
        payload: expect.objectContaining({
          events: expect.objectContaining({ ongoing: ONGOING_ENTRIES, finished: FINISHED_ENTRIES }),
        }),
      }),
    );
  });
});
