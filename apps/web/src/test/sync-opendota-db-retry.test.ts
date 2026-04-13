import { describe, expect, it, vi } from 'vitest';
import { isTransientDbError, withOpenDotaDbRetry } from '../../../../lib/server/sync-opendota.js';

describe('sync-opendota db retry', () => {
  it('classifies transient Neon socket errors as retryable', () => {
    expect(isTransientDbError(new Error('fetch failed'))).toBe(true);
    expect(isTransientDbError({ message: 'db blew up', sourceError: { code: 'UND_ERR_SOCKET' } })).toBe(true);
    expect(isTransientDbError(new Error('syntax error at or near SELECT'))).toBe(false);
  });

  it('retries transient errors until the query succeeds', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce('ok');

    await expect(withOpenDotaDbRetry(run, 'test-retry', 2)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const run = vi.fn().mockRejectedValue(new Error('syntax error'));

    await expect(withOpenDotaDbRetry(run, 'test-no-retry', 3)).rejects.toThrow('syntax error');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
