import { beforeEach, describe, expect, it, vi } from 'vitest';

const readCacheMock = vi.fn();
const writeCacheMock = vi.fn();
const lockMock = vi.fn();
const getDltvTeamRankingMock = vi.fn();

vi.mock('../../../../lib/server/dltv-neon-cache.js', () => ({
  readDltvCache: readCacheMock,
  writeDltvCache: writeCacheMock,
  tryAcquireDltvCacheLock: lockMock,
}));

vi.mock('../../../../lib/server/dltv-ranking-service.js', () => ({
  getDltvTeamRanking: getDltvTeamRankingMock,
}));

const EPT_HTML = `
  <a href="https://dltv.org/teams/tundra-esports" class="table__body-row">
    <div class="table__body-row__cell width-10"><div class="cell__num">01</div></div>
    <div class="table__body-row__cell width-60 width-m-65">
      <div class="cell__logo" data-theme-dark="https://cdn.example/tundra.png"></div>
      <div class="cell__name">Tundra Esports</div>
    </div>
    <div class="table__body-row__cell width-30 width-m-25 align-center">
      <div class="cell__text">14 510 pts.</div>
    </div>
  </a>
`;

async function loadService() {
  return import('../../../../lib/server/rankings-service.js');
}

describe('rankings-service (Neon-backed ranking cache)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    readCacheMock.mockReset();
    writeCacheMock.mockReset();
    lockMock.mockReset();
    getDltvTeamRankingMock.mockReset();
  });

  it('serves a fresh DB cache without touching the source', async () => {
    readCacheMock.mockResolvedValue({ payload: [{ rank: 1, name: 'Tundra Esports', points: 14510 }], refreshedAt: Date.now() });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { getRanking, RANKING_KEY_EPT } = await loadService();
    const result = await getRanking(RANKING_KEY_EPT);

    expect(result.source).toBe('cache');
    expect(result.teams).toEqual([{ rank: 1, name: 'Tundra Esports', points: 14510 }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCacheMock).not.toHaveBeenCalled();
  });

  it('refreshes and writes to DB when the cache is stale or empty', async () => {
    readCacheMock.mockResolvedValue(null);
    lockMock.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => EPT_HTML,
    })) as typeof fetch);

    const { getRanking, RANKING_KEY_EPT } = await loadService();
    const result = await getRanking(RANKING_KEY_EPT);

    expect(result.source).toBe('dltv');
    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({ rank: 1, name: 'Tundra Esports', points: 14510 });
    expect(writeCacheMock).toHaveBeenCalledTimes(1);
    const [dbArg, keyArg, entryArg] = writeCacheMock.mock.calls[0];
    expect(keyArg).toBe(RANKING_KEY_EPT);
    expect(entryArg).toEqual({
      payload: [{ rank: 1, name: 'Tundra Esports', logo: 'https://cdn.example/tundra.png', points: 14510 }],
    });
    expect(dbArg).toBeNull();
  });

  it('returns fallback data when refresh fails and no cache exists', async () => {
    readCacheMock.mockResolvedValue(null);
    lockMock.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }) as typeof fetch);

    const { getRanking, RANKING_KEY_EPT, FALLBACK_TEAMS } = await loadService();
    const result = await getRanking(RANKING_KEY_EPT);

    expect(result.source).toBe('fallback');
    expect(result.teams).toEqual(FALLBACK_TEAMS);
  });

  it('serves stale DB data when a refresh is locked by another instance', async () => {
    const staleAt = Date.now() - 25 * 60 * 60 * 1000;
    readCacheMock.mockResolvedValue({ payload: [{ rank: 1, name: 'Old Ranking', points: 100 }], refreshedAt: staleAt });
    lockMock.mockResolvedValue(false);

    const { getRanking, RANKING_KEY_EPT } = await loadService();
    const result = await getRanking(RANKING_KEY_EPT);

    expect(result.source).toBe('stale');
    expect(result.teams).toEqual([{ rank: 1, name: 'Old Ranking', points: 100 }]);
  });

  it('delegates team-ranking to the dltv ranking service when the DB cache is empty', async () => {
    readCacheMock.mockResolvedValue(null);
    lockMock.mockResolvedValue(true);
    getDltvTeamRankingMock.mockResolvedValue({ teams: [{ rank: 1, name: 'Team A' }], source: 'direct', refreshedAt: Date.now() });

    const { getRanking, RANKING_KEY_TEAM } = await loadService();
    const result = await getRanking(RANKING_KEY_TEAM);

    expect(getDltvTeamRankingMock).toHaveBeenCalled();
    expect(result.source).toBe('direct');
    expect(result.teams).toEqual([{ rank: 1, name: 'Team A' }]);
  });

  it('skips fresh kinds during sync and refreshes stale ones', async () => {
    const now = Date.now();
    readCacheMock.mockImplementation(async (_db, key) => {
      if (key === 'ept-ranking') {
        return { payload: [{ rank: 1, name: 'Fresh EPT' }], refreshedAt: now };
      }
      return null;
    });
    lockMock.mockResolvedValue(true);
    getDltvTeamRankingMock.mockResolvedValue({ teams: [{ rank: 1, name: 'Team B' }], source: 'direct', refreshedAt: now });

    const { syncRankingsToDb } = await loadService();
    const { results } = await syncRankingsToDb();

    const ept = results.find((r) => r.kind === 'ept-ranking');
    const team = results.find((r) => r.kind === 'team-ranking');
    expect(ept).toMatchObject({ status: 'skipped', reason: 'fresh' });
    expect(team).toMatchObject({ status: 'updated' });
  });
});
