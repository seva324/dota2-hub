import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchCyberScoreDetail,
  isCloudflareChallengePage,
  mergeCyberScoreDetail,
} from '../api/news.js';

const ARTICLE_URL = 'https://cyberscore.live/en/news/test-cyberscore-cover-image/';
const JINA_URL = 'https://r.jina.ai/http://cyberscore.live/en/news/test-cyberscore-cover-image/';
const COVER_IMAGE = 'https://media.cyberscore.live/static/posts/2026/4/cover-image.webp';
const BODY_IMAGE = 'https://media.cyberscore.live/static/content/2026/4/body-image.webp';

const DIRECT_HTML = `<!doctype html>
<html>
  <head>
    <title>Test CyberScore Cover Image | CyberScore</title>
    <meta property="og:title" content="Test CyberScore Cover Image | CyberScore">
    <meta property="og:description" content="Direct html description.">
    <meta property="og:image" content="${COVER_IMAGE}">
    <meta property="article:published_time" content="2026-04-13T10:00:00.000Z">
  </head>
  <body>
    <article>
      <p>This direct HTML body is intentionally long enough to be considered usable on its own, so the scraper must still fetch Jina markdown to preserve in-body images instead of returning plain text only.</p>
      <p>Another paragraph keeps the direct parser satisfied while the appended Cloudflare marker ensures the challenge detector does not wrongly discard a usable article page.</p>
    </article>
    <script>window.__cf_chl_opt = { token: 'present-but-page-is-usable' };</script>
  </body>
</html>`;

const JINA_MARKDOWN = `Title: Test CyberScore Cover Image

URL Source: ${ARTICLE_URL}

Published Time: 2026-04-13T10:00:00.000Z

Markdown Content:
# Test CyberScore Cover Image | CyberScore

# Test CyberScore Cover Image

13.04.2026

This is the first real paragraph from the Jina article body and it is deliberately long so the merged result prefers markdown content with inline assets over the plain-text direct HTML fallback that has no body images.

![Body image](${BODY_IMAGE})

This is the second article paragraph, also intentionally verbose, so the markdown body stays above the minimum usable length threshold while keeping the in-body image inside the final content.

Share
`;

test('isCloudflareChallengePage ignores appended challenge markers on usable CyberScore pages', () => {
  assert.equal(isCloudflareChallengePage(DIRECT_HTML), false);
  assert.equal(
    isCloudflareChallengePage('<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue __cf_chl_</body></html>'),
    true,
  );
});

test('mergeCyberScoreDetail keeps direct cover image while taking richer markdown body', () => {
  const merged = mergeCyberScoreDetail(
    {
      url: ARTICLE_URL,
      imageUrl: COVER_IMAGE,
      content: 'plain text direct body',
      summary: 'direct summary',
    },
    {
      url: ARTICLE_URL,
      imageUrl: BODY_IMAGE,
      content: 'markdown body text that is long enough '.repeat(12),
      content_markdown: `Paragraph\n\n![](${BODY_IMAGE})`,
      summary: 'jina summary',
    },
  );

  assert.equal(merged.imageUrl, COVER_IMAGE);
  assert.match(merged.content_markdown, new RegExp(BODY_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('fetchCyberScoreDetail returns HTML cover image and keeps Jina body images in markdown', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url === ARTICLE_URL) {
      return {
        ok: true,
        status: 200,
        text: async () => DIRECT_HTML,
      };
    }

    if (url === JINA_URL) {
      return {
        ok: true,
        status: 200,
        text: async () => JINA_MARKDOWN,
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const item = await fetchCyberScoreDetail(ARTICLE_URL, {
      id: 'cyberscore-test',
      source: 'CyberScore',
      category: 'community',
      summary: 'fallback summary',
      content: '正文抓取受限，请点击原文查看完整内容。',
      content_markdown: '正文抓取受限，请点击原文查看完整内容。',
      publishedAt: new Date('2026-04-13T10:00:00.000Z'),
    });

    assert.equal(item.imageUrl, COVER_IMAGE);
    assert.equal(item.title, 'Test CyberScore Cover Image');
    assert.match(item.content_markdown, new RegExp(BODY_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(item.content_markdown, new RegExp(COVER_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    global.fetch = originalFetch;
  }
});
