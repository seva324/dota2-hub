import { beforeEach, describe, expect, it, vi } from 'vitest';

const findHeroLiveScoreBySourceSeriesId = vi.fn();
const fetchHtml = vi.fn();
const parseHawkHomepageSeriesList = vi.fn(() => []);
const parseSeriesDetailPayload = vi.fn();
const readHawkLiveDetailCache = vi.fn();
const writeHawkLiveDetailCache = vi.fn();

vi.mock('../../../../lib/server/hero-live-score-cache.js', () => ({
  findHeroLiveScoreBySourceSeriesId,
}));

vi.mock('../../../../lib/server/hawk-live.js', () => ({
  buildHawkSeriesUrl: (champ: string, series: string) => (champ && series ? `https://hawk.live/dota-2/matches/${champ}/${series}` : null),
  fetchHtml,
  parseHawkHomepageSeriesList,
  parseSeriesDetailPayload,
}));

vi.mock('../../../../lib/server/hawk-live-detail-cache.js', () => ({
  readHawkLiveDetailCache,
  writeHawkLiveDetailCache,
}));

function freshPayload() {
  return { source: 'hawk.live', seriesId: '1', team1Wins: 0, team2Wins: 0, maps: [] };
}

describe('live detail service', () => {
  beforeEach(() => {
    vi.resetModules();
    findHeroLiveScoreBySourceSeriesId.mockReset();
    fetchHtml.mockReset();
    parseHawkHomepageSeriesList.mockReset();
    parseSeriesDetailPayload.mockReset();
    readHawkLiveDetailCache.mockReset();
    writeHawkLiveDetailCache.mockReset();
    parseHawkHomepageSeriesList.mockReturnValue([]);
    findHeroLiveScoreBySourceSeriesId.mockResolvedValue(null);
    readHawkLiveDetailCache.mockResolvedValue(null);
    writeHawkLiveDetailCache.mockResolvedValue(undefined);
  });

  it('returns cached payload within TTL without fetching', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    readHawkLiveDetailCache.mockResolvedValue({ payload: freshPayload(), refreshedAt: Date.now() });

    const result = await getLiveDetail({}, { seriesId: '1' });

    expect(result).toMatchObject({ seriesId: '1', cached: true });
    expect(findHeroLiveScoreBySourceSeriesId).not.toHaveBeenCalled();
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it('refetches stale cache via hero_live_scores URL discovery', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    readHawkLiveDetailCache.mockResolvedValue({ payload: freshPayload(), refreshedAt: Date.now() - 60_000 });
    findHeroLiveScoreBySourceSeriesId.mockResolvedValue({
      source_slug: 'team-a-vs-team-b',
      payload: JSON.stringify({ sourceChampionshipSlug: 'league-slug', sourceSeriesSlug: 'team-a-vs-team-b' }),
    });
    fetchHtml.mockResolvedValue('<html>series page</html>');
    parseSeriesDetailPayload.mockReturnValue(freshPayload());

    const result = await getLiveDetail({}, { seriesId: '1' });

    expect(fetchHtml).toHaveBeenCalledWith('https://hawk.live/dota-2/matches/league-slug/team-a-vs-team-b', fetch, expect.anything());
    expect(parseSeriesDetailPayload).toHaveBeenCalledWith('<html>series page</html>', expect.objectContaining({ url: 'https://hawk.live/dota-2/matches/league-slug/team-a-vs-team-b' }));
    expect(writeHawkLiveDetailCache).toHaveBeenCalledWith({}, '1', expect.objectContaining({ seriesId: '1' }));
    expect(result).toMatchObject({ seriesId: '1', cached: false });
  });

  it('falls back to homepage discovery when no live score row exists', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    parseHawkHomepageSeriesList.mockReturnValue([{ id: '1', url: 'https://hawk.live/dota-2/matches/c/s' }]);
    fetchHtml.mockResolvedValue('<html>');
    parseSeriesDetailPayload.mockReturnValue(freshPayload());

    const result = await getLiveDetail({}, { seriesId: '1' });

    expect(fetchHtml).toHaveBeenCalledWith('https://hawk.live/', fetch, expect.anything());
    expect(result?.source).toBe('hawk.live');
  });

  it('returns not_found when no URL can be discovered', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');

    const result = await getLiveDetail({}, { seriesId: '999' });

    expect(result).toMatchObject({ source: 'not_found', seriesId: '999' });
  });

  it('returns timeout when upstream page parses to nothing', async () => {
    const { getLiveDetail } = await import('../../../../lib/server/live-detail-service.js');
    findHeroLiveScoreBySourceSeriesId.mockResolvedValue({
      payload: JSON.stringify({ sourceChampionshipSlug: 'c', sourceSeriesSlug: 's' }),
    });
    fetchHtml.mockResolvedValue('<html>');
    parseSeriesDetailPayload.mockReturnValue(null);

    const result = await getLiveDetail({}, { seriesId: '1' });

    expect(result).toMatchObject({ source: 'timeout', seriesId: '1' });
  });

  it('resolves the detail URL from the persisted live score payload', async () => {
    const { resolveHawkSeriesDetailUrl } = await import('../../../../lib/server/live-detail-service.js');
    findHeroLiveScoreBySourceSeriesId.mockResolvedValue({
      source_slug: 'old-slug',
      payload: JSON.stringify({ sourceChampionshipSlug: 'champ', sourceSeriesSlug: 'series' }),
    });

    const url = await resolveHawkSeriesDetailUrl({}, '1');

    expect(url).toBe('https://hawk.live/dota-2/matches/champ/series');
  });
});
