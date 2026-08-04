import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callLlmTextMock } = vi.hoisted(() => ({ callLlmTextMock: vi.fn() }));

vi.mock('../../../../lib/openrouter.mjs', () => ({
  callLlmText: callLlmTextMock,
}));

import { __test__ as newsTest } from '../../../../api/news.js';

describe('translateLongMarkdown', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    callLlmTextMock.mockReset();
    callLlmTextMock.mockResolvedValue('这是翻译后的中文新闻正文。'.repeat(40));
  });

  it('translates long markdown bodies across chunks without throwing', async () => {
    const longEnglish = Array.from(
      { length: 20 },
      (_, index) => `Paragraph ${index + 1}: Team Spirit defeated Gaimin Gladiators in a decisive series that thrilled fans around the world.`,
    ).join('\n\n');

    const result = await newsTest.translateLongMarkdown('test-key', longEnglish, '');

    expect(result).toContain('这是翻译后的中文新闻正文');
    expect(result).not.toContain('Paragraph 1:');
    expect(callLlmTextMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('returns the input unchanged when the text is already Chinese', async () => {
    const result = await newsTest.translateLongMarkdown('test-key', '这是一段中文正文。', '');

    expect(result).toBe('这是一段中文正文。');
    expect(callLlmTextMock).not.toHaveBeenCalled();
  });

  it('applies the glossary markdown normalization to the translated output', async () => {
    callLlmTextMock.mockResolvedValue('翻译包含 Night Stalker 的段落。'.repeat(20));
    const longEnglish = Array.from(
      { length: 12 },
      () => 'The Night Stalker hero played a key role in the series.',
    ).join('\n\n');

    const result = await newsTest.translateLongMarkdown('test-key', longEnglish, '');

    expect(result).toContain('翻译包含');
    expect(callLlmTextMock).toHaveBeenCalled();
  });
});
