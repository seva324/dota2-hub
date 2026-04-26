import test from 'node:test';
import assert from 'node:assert/strict';
import { __test__ as newsTest } from '../api/news.js';

test('taverna sitemap parser keeps only recent dota2 news URLs', () => {
  const recentIso = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  const oldIso = new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
    <url>
      <loc>https://taverna.gg/dota2/news/blackarxangel-test/</loc>
      <news:news>
        <news:publication_date>${recentIso}</news:publication_date>
        <news:title>BLACKARXANGEL test</news:title>
      </news:news>
    </url>
    <url>
      <loc>https://taverna.gg/cs2/news/should-be-ignored/</loc>
      <news:news>
        <news:publication_date>${recentIso}</news:publication_date>
        <news:title>Ignore me</news:title>
      </news:news>
    </url>
    <url>
      <loc>https://taverna.gg/dota2/news/too-old/</loc>
      <news:news>
        <news:publication_date>${oldIso}</news:publication_date>
        <news:title>Too old</news:title>
      </news:news>
    </url>
  </urlset>`;

  const items = newsTest.parseTavernaNewsSitemap(xml, 7);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://taverna.gg/dota2/news/blackarxangel-test/');
  assert.equal(items[0].title, 'BLACKARXANGEL test');
});

test('taverna sitemap parser accepts /dota2/articles/ URLs', () => {
  const recentIso = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
    <url>
      <loc>https://taverna.gg/dota2/articles/some-article/</loc>
      <news:news>
        <news:publication_date>${recentIso}</news:publication_date>
        <news:title>Some Article Title</news:title>
      </news:news>
    </url>
  </urlset>`;

  const items = newsTest.parseTavernaNewsSitemap(xml, 7);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://taverna.gg/dota2/articles/some-article/');
  assert.equal(items[0].title, 'Some Article Title');
});

test('taverna body extractor keeps article content and strips trailing noise', () => {
  const html = `
    <div class="entry-content post__container wp-block-post-content is-layout-flow wp-block-post-content-is-layout-flow">
      <p>Spirit проиграла матч против <a href="https://taverna.gg/dota2/tags/gamerlegion/">GamerLegion</a>.</p>
      <figure class="wp-block-image size-large">
        <img src="https://cdn.example.com/image.webp" alt="cover" />
      </figure>
      <blockquote><p>Это важный результат для серии.</p></blockquote>
      <p>Следить за расписанием можно <a href="https://taverna.gg/dota2/news/premier-series/">по ссылке</a>.</p>
    </div>
    <div class="post__tags_wrapper post__container"></div>
    <section class="popular__news_wrapper">
      <h3 class="section__title">Последние новости</h3>
    </section>
  `;

  const body = newsTest.extractTavernaBodyData(html, 'https://taverna.gg');
  assert.match(body.contentMarkdown, /Spirit проиграла матч против \[GamerLegion\]\(https:\/\/taverna\.gg\/dota2\/tags\/gamerlegion\/\)\./);
  assert.match(body.contentMarkdown, /> Это важный результат для серии\./);
  assert.match(body.contentMarkdown, /\[по ссылке\]\(https:\/\/taverna\.gg\/dota2\/news\/premier-series\/\)/);
  assert.doesNotMatch(body.contentMarkdown, /Последние новости/);
  assert.deepEqual(body.contentImages, ['https://cdn.example.com/image.webp']);
});

test('taverna feed parser extracts title, body, and image from rss content', () => {
  const recentRssDate = new Date(Date.now() - (90 * 60 * 1000)).toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
      <item>
        <title>NS: test headline</title>
        <link>https://taverna.gg/dota2/news/ns-test/</link>
        <pubDate>${recentRssDate}</pubDate>
        <description><![CDATA[Короткое описание новости.]]></description>
        <content:encoded><![CDATA[
          <p>Первый абзац новости.</p>
          <figure><img src="https://cdn.example.com/feed-image.webp" alt="feed" /></figure>
          <p>Второй абзац новости.</p>
        ]]></content:encoded>
      </item>
    </channel>
  </rss>`;

  const items = newsTest.parseTavernaFeedItems(xml, 'https://taverna.gg', 7);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://taverna.gg/dota2/news/ns-test/');
  assert.equal(items[0].title, 'NS: test headline');
  assert.equal(items[0].imageUrl, 'https://cdn.example.com/feed-image.webp');
  assert.match(items[0].content_markdown, /Первый абзац новости/);
  assert.match(items[0].content_markdown, /Второй абзац новости/);
});
