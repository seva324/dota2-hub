import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchHtml = vi.fn();
const parseHawkHomepageSeriesList = vi.fn(() => []);
const parseSeriesDetailPayload = vi.fn();

vi.mock('../../../../lib/server/hawk-live.js', () => ({
  buildHawkSeriesUrl: (champ: string, series: string) => (champ && series ? `https://hawk.live/dota-2/matches/${champ}/${series}` : null),
  fetchHtml,
  parseHawkHomepageSeriesList,
  parseSeriesDetailPayload,
}));

function freshPayload() {
  return { source: 'hawk.live', seriesId: '1', team1Wins: 0, team2Wins: 0, maps: [] };
}

describe('live detail service (Neon-free)', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchHtml.mockReset();
    parseHawkHomepageSeriesList.mockReset();
    parseSeriesDetailPayload.mockReset();
    parseHawkHomepageSeriesList.mockReturnValue([]);
    fetchHtml.mockResolvedValue('<html>series page</html>');
  });

  it('builds the detail URL from slug + champ without fetching the homepage', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    parseSeriesDetailPayload.mockReturnValue(freshPayload());

    const result = await getLiveDetail({ seriesId: '1', slug: 'team-a-vs-team-b', champ: 'league-slug' });

    expect(fetchHtml).toHaveBeenCalledWith('https://hawk.live/dota-2/matches/league-slug/team-a-vs-team-b', fetch, expect.anything());
    expect(parseSeriesDetailPayload).toHaveBeenCalledWith('<html>series page</html>', expect.objectContaining({ url: 'https://hawk.live/dota-2/matches/league-slug/team-a-vs-team-b' }));
    expect(result).toMatchObject({ seriesId: '1', source: 'hawk.live', cached: false });
    // 首页兜底不触发
    expect(parseHawkHomepageSeriesList).not.toHaveBeenCalled();
  });

  it('falls back to homepage discovery when no slug/champ is provided', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    parseHawkHomepageSeriesList.mockReturnValue([{ id: '1', url: 'https://hawk.live/dota-2/matches/c/s' }]);
    parseSeriesDetailPayload.mockReturnValue(freshPayload());

    const result = await getLiveDetail({ seriesId: '1' });

    expect(fetchHtml).toHaveBeenCalledWith('https://hawk.live/', fetch, expect.anything());
    expect(fetchHtml).toHaveBeenLastCalledWith('https://hawk.live/dota-2/matches/c/s', fetch, expect.anything());
    expect(result?.source).toBe('hawk.live');
  });

  it('dedupes concurrent fetches for the same series (single-flight)', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    parseSeriesDetailPayload.mockReturnValue(freshPayload());

    const [a, b] = await Promise.all([
      getLiveDetail({ seriesId: '1', slug: 's', champ: 'c' }),
      getLiveDetail({ seriesId: '1', slug: 's', champ: 'c' }),
    ]);

    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(a).toMatchObject({ seriesId: '1' });
    expect(b).toMatchObject({ seriesId: '1' });
  });

  it('returns not_found when no URL can be resolved', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');

    const result = await getLiveDetail({ seriesId: '999' });

    expect(result).toMatchObject({ source: 'not_found', seriesId: '999' });
  });

  it('returns timeout when upstream page parses to nothing', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    parseSeriesDetailPayload.mockReturnValue(null);

    const result = await getLiveDetail({ seriesId: '1', slug: 's', champ: 'c' });

    expect(result).toMatchObject({ source: 'timeout', seriesId: '1' });
  });

  it('returns error when the upstream fetch throws', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    fetchHtml.mockRejectedValueOnce(new Error('network down'));

    const result = await getLiveDetail({ seriesId: '1', slug: 's', champ: 'c' });

    expect(result).toMatchObject({ source: 'error', seriesId: '1' });
  });
});
