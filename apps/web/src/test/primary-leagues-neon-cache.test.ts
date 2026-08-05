import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const parseDltvPrimaryLeaguesMock = vi.fn();
const readDltvCacheMock = vi.fn();
const writeDltvCacheMock = vi.fn();

vi.mock('../../../../lib/server/dltv-tournaments-parser.js', () => ({
  parseDltvPrimaryLeagues: parseDltvPrimaryLeaguesMock,
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

const TOURNAMENTS = [
  {
    name: 'DreamLeague 29',
    sourceUrl: 'https://dltv.org/events/dreamleague-season-29',
    startDate: 'May 13 - May 24, 2026',
    tier: 'S',
  },
];

const MOCK_HOME_HTML = '<html><body><div class="primary-league-item">DreamLeague 29 and more content here</div></body></html>';

const FULL_PAYLOAD = {
  tournaments: TOURNAMENTS,
  fetchedAt: '2026-01-01T00:00:00.000Z',
};

describe('/api/primary-leagues Neon persistent cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700500000 * 1000));
    parseDltvPrimaryLeaguesMock.mockReset();
    readDltvCacheMock.mockReset();
    writeDltvCacheMock.mockReset();
    parseDltvPrimaryLeaguesMock.mockReturnValue(TOURNAMENTS);
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

    const { default: handler } = await import('../../../../api/primary-leagues.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).source).toBe('cache');
    expect((res.payload as any).tournaments).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves a stale Neon entry with a background refresh instead of blocking', async () => {
    readDltvCacheMock.mockResolvedValue({
      payload: FULL_PAYLOAD,
      refreshedAt: Date.now() - 30 * 60 * 1000,
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => MOCK_HOME_HTML,
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/primary-leagues.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).source).toBe('stale');
    expect((res.payload as any).tournaments).toHaveLength(1);

    // 后台刷新完成后把新 payload 写回 Neon。
    await vi.advanceTimersByTimeAsync(0);
    expect(writeDltvCacheMock).toHaveBeenCalledWith(
      { fake: true },
      'dltv:primary-leagues:full',
      expect.objectContaining({ payload: expect.objectContaining({ tournaments: TOURNAMENTS }) }),
    );
  });

  it('writes a freshly parsed payload to Neon on a true cold start', async () => {
    readDltvCacheMock.mockResolvedValue(null);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => MOCK_HOME_HTML,
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../../api/primary-leagues.js');
    const res = createRes();
    await handler({ method: 'GET', query: {} } as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any).source).toBe('dltv');
    expect((res.payload as any).tournaments).toHaveLength(1);
    expect(writeDltvCacheMock).toHaveBeenCalledWith(
      { fake: true },
      'dltv:primary-leagues:full',
      expect.objectContaining({
        payload: expect.objectContaining({ tournaments: TOURNAMENTS }),
      }),
    );
  });
});