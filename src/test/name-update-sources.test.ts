import { describe, expect, it, vi } from 'vitest';

describe('name update rules', () => {
  it('enrich-pro-players prefers fetched name over existing stored name', async () => {
    const { mergeEnrichment } = await import('../../scripts/manual-api/enrich-pro-players.js');

    expect(
      mergeEnrichment(
        { account_id: 9403474, name: 'yamich', source_urls: [] },
        { account_id: 9403474, name: 'mid two', source_urls: ['https://example.test/player'] }
      )
    ).toEqual(
      expect.objectContaining({
        account_id: 9403474,
        name: 'mid two',
      })
    );
  });

  it('backfill-hot-player-history preserves an existing non-empty team name', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const { upsertTeamFromDetail } = await import('../../scripts/manual-api/backfill-hot-player-history.js');

    await upsertTeamFromDetail({ query } as never, '9351740', 'Invictus Gaming');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(`name = COALESCE(NULLIF(teams.name, ''), NULLIF(EXCLUDED.name, ''))`);
    expect(params).toEqual(['9351740', 'Invictus Gaming']);
  });
});
