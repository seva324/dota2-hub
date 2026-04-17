import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = { tag: 'db' };
const neonMock = vi.fn(() => db);
const warmPlayerProfileCacheMock = vi.fn();
const warmTeamFlyoutCacheMock = vi.fn();
const runSyncOpenDotaMock = vi.fn();
const runSyncLiquipediaMock = vi.fn();
const syncNewsToDbMock = vi.fn();
const translateNewsBackfillMock = vi.fn();

vi.mock('@neondatabase/serverless', () => ({
  neon: neonMock,
}));

vi.mock('../../../../lib/server/player-profile-cache.js', () => ({
  warmPlayerProfileCache: warmPlayerProfileCacheMock,
}));

vi.mock('../../../../lib/server/team-flyout-cache.js', () => ({
  warmTeamFlyoutCache: warmTeamFlyoutCacheMock,
}));

vi.mock('../../../../lib/server/sync-opendota.js', () => ({
  runSyncOpenDota: runSyncOpenDotaMock,
}));

vi.mock('../../../../lib/server/sync-liquipedia.js', () => ({
  runSyncLiquipedia: runSyncLiquipediaMock,
}));

vi.mock('../../../../api/news.js', () => ({
  syncNewsToDb: syncNewsToDbMock,
  translateNewsBackfill: translateNewsBackfillMock,
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

describe('/api/cron incremental refresh actions', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DATABASE_URL = 'postgres://example.test/db';
    delete process.env.D2HUB_CRON_TOKEN;
    delete process.env.CRON_SECRET;
    delete process.env.D2HUB_CRON_MIN_INTERVAL_MIN;
    delete process.env.CRON_MIN_INTERVAL_MIN;
    neonMock.mockClear();
    warmPlayerProfileCacheMock.mockReset();
    warmTeamFlyoutCacheMock.mockReset();
    runSyncOpenDotaMock.mockReset();
    runSyncLiquipediaMock.mockReset();
    syncNewsToDbMock.mockReset();
    translateNewsBackfillMock.mockReset();

    warmPlayerProfileCacheMock.mockResolvedValue({ selected: 12, refreshed: 12, failed: 0, mode: 'incremental' });
    warmTeamFlyoutCacheMock.mockResolvedValue({ selected: 8, refreshed: 8, failed: 0, mode: 'incremental' });
    runSyncOpenDotaMock.mockResolvedValue({ success: true });
    runSyncLiquipediaMock.mockResolvedValue({ success: true });
    syncNewsToDbMock.mockResolvedValue({ success: true });
    translateNewsBackfillMock.mockResolvedValue({ translated: 5, completed: 5, pending: 0, provider: 'minimax' });
  });

  it('passes incremental windows to the derived-data refresh alias', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'refresh-derived-data-incremental',
        recentDays: '5',
        upcomingDays: '2',
        matchLimit: '120',
        playerLimit: '50',
        teamLimit: '20',
        playerConcurrency: '4',
        teamConcurrency: '3',
        teamOnly: '1',
      },
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.payload as any)?.ok).toBe(true);
    expect((res.payload as any)?.result?.mode).toBe('incremental');
    expect(warmPlayerProfileCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'incremental',
      incremental: true,
      recentDays: 5,
      upcomingDays: 2,
      matchLimit: 120,
      limit: 50,
      concurrency: 4,
      teamOnly: true,
    }));
    expect(warmTeamFlyoutCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'incremental',
      incremental: true,
      recentDays: 5,
      upcomingDays: 2,
      limit: 20,
      concurrency: 3,
    }));
  });

  it('keeps full refresh behavior when mode is omitted', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'refresh-derived-data',
      },
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(warmPlayerProfileCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'full',
      incremental: false,
      recentDays: 7,
      upcomingDays: 3,
      matchLimit: 180,
      limit: null,
      concurrency: 6,
      teamOnly: true,
    }));
    expect(warmTeamFlyoutCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'full',
      incremental: false,
      recentDays: 7,
      upcomingDays: 3,
      limit: null,
      concurrency: 6,
    }));
  });

  it('forwards team-only player warming options without constraining team flyout warming', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'refresh-derived-data-incremental',
        recentDays: '4',
        upcomingDays: '2',
        matchLimit: '90',
        playerLimit: '25',
        teamLimit: '12',
        teamOnly: '1',
      },
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(warmPlayerProfileCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'incremental',
      incremental: true,
      recentDays: 4,
      upcomingDays: 2,
      matchLimit: 90,
      limit: 25,
      teamOnly: true,
      concurrency: 6,
    }));
    expect(warmTeamFlyoutCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'incremental',
      incremental: true,
      recentDays: 4,
      upcomingDays: 2,
      limit: 12,
      concurrency: 6,
    }));
    expect(warmTeamFlyoutCacheMock).not.toHaveBeenCalledWith(db, expect.objectContaining({
      teamOnly: true,
    }));
  });

  it('passes team-only player warming through the player-only refresh action', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'refresh-player-profiles-incremental',
        recentDays: '6',
        upcomingDays: '1',
        matchLimit: '75',
        playerLimit: '18',
        teamOnly: 'true',
        playerConcurrency: '5',
      },
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(warmPlayerProfileCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'incremental',
      incremental: true,
      recentDays: 6,
      upcomingDays: 1,
      matchLimit: 75,
      limit: 18,
      teamOnly: true,
      concurrency: 5,
    }));
    expect(warmTeamFlyoutCacheMock).not.toHaveBeenCalled();
  });

  it('routes translate-news-backfill through the news translator action', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'translate-news-backfill',
        recentDays: '2',
        matchLimit: '15',
      },
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(translateNewsBackfillMock).toHaveBeenCalledWith({
      recentDays: 2,
      limit: 15,
    });
    expect((res.payload as any)?.result?.provider).toBe('minimax');
  });

  it('defaults sync-liquipedia to the fast phase for the public shortcut', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'sync-liquipedia',
      },
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(runSyncLiquipediaMock).toHaveBeenCalledWith({ phase: 'fast' });
  });

  it('exposes dedicated liquipedia metadata and upcoming actions', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const metadataReq = {
      method: 'POST',
      query: {
        action: 'sync-liquipedia-metadata',
      },
    };
    const upcomingReq = {
      method: 'POST',
      query: {
        action: 'sync-liquipedia-upcoming',
      },
    };
    const metadataRes = createRes();
    const upcomingRes = createRes();

    await handler(metadataReq as never, metadataRes as never);
    await handler(upcomingReq as never, upcomingRes as never);

    expect(metadataRes.statusCode).toBe(200);
    expect(upcomingRes.statusCode).toBe(200);
    expect(runSyncLiquipediaMock).toHaveBeenNthCalledWith(1, { phase: 'metadata' });
    expect(runSyncLiquipediaMock).toHaveBeenNthCalledWith(2, { phase: 'upcoming' });
  });

  it('rejects cron requests without token when D2HUB_CRON_TOKEN is configured', async () => {
    process.env.D2HUB_CRON_TOKEN = 'expected-token';
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'sync-opendota',
      },
      headers: {},
    };
    const res = createRes();

    await handler(req as never, res as never);

    expect(res.statusCode).toBe(401);
    expect((res.payload as any)?.ok).toBe(false);
    expect(runSyncOpenDotaMock).not.toHaveBeenCalled();
  });

  it('skips duplicate runs within min-interval window', async () => {
    const { default: handler } = await import('../../../../api/cron.js');
    const req = {
      method: 'POST',
      query: {
        action: 'sync-opendota',
        minIntervalMin: '60',
      },
      headers: {},
    };
    const firstRes = createRes();
    const secondRes = createRes();

    await handler(req as never, firstRes as never);
    await handler(req as never, secondRes as never);

    expect(firstRes.statusCode).toBe(200);
    expect((firstRes.payload as any)?.ok).toBe(true);
    expect(secondRes.statusCode).toBe(200);
    expect((secondRes.payload as any)?.ok).toBe(true);
    expect((secondRes.payload as any)?.skipped).toBe(true);
    expect((secondRes.payload as any)?.reason).toBe('min_interval_60m');
    expect(runSyncOpenDotaMock).toHaveBeenCalledTimes(1);
  });
});
