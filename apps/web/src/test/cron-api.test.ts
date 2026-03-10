import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = { tag: 'db' };
const neonMock = vi.fn(() => db);
const warmPlayerProfileCacheMock = vi.fn();
const warmTeamFlyoutCacheMock = vi.fn();
const runSyncOpenDotaMock = vi.fn();
const runSyncLiquipediaMock = vi.fn();
const syncNewsToDbMock = vi.fn();

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
    neonMock.mockClear();
    warmPlayerProfileCacheMock.mockReset();
    warmTeamFlyoutCacheMock.mockReset();
    runSyncOpenDotaMock.mockReset();
    runSyncLiquipediaMock.mockReset();
    syncNewsToDbMock.mockReset();

    warmPlayerProfileCacheMock.mockResolvedValue({ selected: 12, refreshed: 12, failed: 0, mode: 'incremental' });
    warmTeamFlyoutCacheMock.mockResolvedValue({ selected: 8, refreshed: 8, failed: 0, mode: 'incremental' });
    runSyncOpenDotaMock.mockResolvedValue({ success: true });
    runSyncLiquipediaMock.mockResolvedValue({ success: true });
    syncNewsToDbMock.mockResolvedValue({ success: true });
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
    }));
    expect(warmTeamFlyoutCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'incremental',
      incremental: true,
      recentDays: 5,
      upcomingDays: 2,
      limit: 20,
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
    }));
    expect(warmTeamFlyoutCacheMock).toHaveBeenCalledWith(db, expect.objectContaining({
      mode: 'full',
      incremental: false,
      recentDays: 7,
      upcomingDays: 3,
      limit: null,
    }));
  });
});
