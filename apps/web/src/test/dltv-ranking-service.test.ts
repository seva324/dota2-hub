import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseDltvRankingMock = vi.fn();

vi.mock('../../../../lib/server/dltv-ranking-parser.js', () => ({
  parseDltvRanking: parseDltvRankingMock,
}));

const RANKING_HTML = `
  <div class="ranking">
    <a class="table__body-row" href="https://dltv.org/teams/tundra-esports">
      <div class="cell__num">01</div><div class="cell__name">Tundra Esports</div>
      <div class="cell__text">14 510 pts.</div>
    </a>
  </div>
`;

describe('dltv-ranking-service single-flight + cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700500000 * 1000));
    parseDltvRankingMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares a single fetch across concurrent cold requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => RANKING_HTML,
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    parseDltvRankingMock.mockReturnValue([{ rank: 1, name: 'Tundra Esports', points: 14510 }]);

    const { getDltvTeamRanking } = await import('../../../../lib/server/dltv-ranking-service.js');
    const [a, b] = await Promise.all([
      getDltvTeamRanking({ fetchImpl: fetchMock }),
      getDltvTeamRanking({ fetchImpl: fetchMock }),
    ]);

    expect(a.teams).toHaveLength(1);
    expect(b.teams).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves fresh rankings from the memory cache on repeat requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => RANKING_HTML,
    })) as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);
    parseDltvRankingMock.mockReturnValue([{ rank: 1, name: 'Tundra Esports', points: 14510 }]);

    const { getDltvTeamRanking } = await import('../../../../lib/server/dltv-ranking-service.js');
    const first = await getDltvTeamRanking({ fetchImpl: fetchMock });
    const second = await getDltvTeamRanking({ fetchImpl: fetchMock });

    expect(first.source).toBe('direct');
    expect(second.source).toBe('cache');
    expect(second.teams).toEqual(first.teams);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to stale cached rankings when the refresh fails', async () => {
    const { getDltvTeamRanking } = await import('../../../../lib/server/dltv-ranking-service.js');

    const okFetch = vi.fn(async () => ({
      ok: true,
      text: async () => RANKING_HTML,
    })) as typeof fetch;
    parseDltvRankingMock.mockReturnValue([{ rank: 1, name: 'Tundra Esports', points: 14510 }]);

    const first = await getDltvTeamRanking({ fetchImpl: okFetch });
    expect(first.teams).toHaveLength(1);

    // 前进 10min（CACHE_TTL 10min 已过，仍在 30min stale 上限内），下一次抓取失败。
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    const failFetch = vi.fn(async () => ({
      ok: false,
      text: async () => '',
    })) as typeof fetch;

    const stale = await getDltvTeamRanking({ fetchImpl: failFetch });
    expect(stale.teams).toEqual(first.teams);
    expect(stale.source).toBe('stale');
  });
});
