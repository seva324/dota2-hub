import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTextWithRetries } from '../../../../api/news.js';

describe('fetchTextWithRetries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries transient failures and returns the first successful body', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'final-body',
      });
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    const text = await fetchTextWithRetries('https://example.test/article', {
      attempts: 2,
      retryDelayMs: 0,
      timeout: 1000,
      label: 'test fetch',
    });

    expect(text).toBe('final-body');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws the last error when all retries fail', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('still failing'));
    vi.stubGlobal('fetch', fetchMock as typeof fetch);

    await expect(fetchTextWithRetries('https://example.test/article', {
      attempts: 2,
      retryDelayMs: 0,
      timeout: 1000,
      label: 'test fetch',
    })).rejects.toThrow('still failing');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
