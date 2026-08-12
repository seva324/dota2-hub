import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bbcodeToMarkdown,
  stripBbcodeToText,
  extractLocalizedAnnouncement,
  extractFirstImageUrl,
  resolveSteamCdnTokens,
  unescapeHtmlEntities,
} from '../lib/steam-news-bbcode.js';

test('resolveSteamCdnTokens resolves clan images and collapses path double-slashes', () => {
  const out = resolveSteamCdnTokens('[img]{STEAM_CLAN_IMAGE}/3703047/abc.png[/img] https://x.com/a?b=1');
  assert.equal(out, '[img]https://clan.fastly.steamstatic.com/images/3703047/abc.png[/img] https://x.com/a?b=1');
});

test('unescapeHtmlEntities decodes entities in a single pass', () => {
  assert.equal(unescapeHtmlEntities('&quot;a&amp;b&quot;&amp;quot;'), '"a&b"&quot;');
  assert.equal(unescapeHtmlEntities('&#x6e38;&#25103;'), '游戏');
});

test('bbcodeToMarkdown converts images, links, bold, paragraphs', () => {
  const body = '[img]{STEAM_CLAN_IMAGE}/3703047/a.png[/img]\n\n[p]The [b]International[/b] is here, see [url=https://dota2.com/news]the post[/url].[/p]';
  const md = bbcodeToMarkdown(body);
  assert.match(md, /!\[img\]\(https:\/\/clan\.fastly\.steamstatic\.com\/images\/3703047\/a\.png\)/);
  assert.match(md, /\*\*International\*\*/);
  assert.match(md, /\[the post\]\(https:\/\/dota2\.com\/news\)/);
});

test('bbcodeToMarkdown converts headers and lists', () => {
  const md = bbcodeToMarkdown('[h2]Patch Notes[/h2]\n[list]\n[*] First\n[*] Second\n[/list]');
  assert.match(md, /^## Patch Notes/m);
  assert.match(md, /- First/);
  assert.match(md, /- Second/);
});

test('stripBbcodeToText removes tags and keeps text', () => {
  assert.equal(stripBbcodeToText('[b]hello[/b] world [url=https://x.com]link[/url]'), 'hello world link');
});

test('extractFirstImageUrl returns the first resolved image', () => {
  const body = '[img]{STEAM_CLAN_LOC_IMAGE}/3703047/a.png[/img]\n[img]https://media.steampowered.com/b.png[/img]';
  assert.equal(extractFirstImageUrl(body), 'https://clan.fastly.steamstatic.com/images/3703047/a.png');
});

test('extractLocalizedAnnouncement parses embedded localized headline/body', () => {
  const pageHtml = `<html><script>{"headline":"\\u6e38\\u620f\\u7248\\u672c7.41e","posttime":1785455895,"body":"[p]\\u56fd\\u9645\\u9080\\u8bf7\\u8d5b\\u5373\\u5c06\\u5230\\u6765\\uff0c\\u6211\\u4eec\\u5c06\\u53d1\\u5e03\\u66f4\\u65b0[/p]"}</script></html>`;
  const parsed = extractLocalizedAnnouncement(pageHtml);
  assert.ok(parsed);
  assert.equal(parsed.headline, '游戏版本7.41e');
  assert.match(parsed.body, /国际邀请赛即将到来，我们将发布更新/);
});

test('extractLocalizedAnnouncement returns null without an announcement', () => {
  assert.equal(extractLocalizedAnnouncement('<html><body>no announcement</body></html>'), null);
});

test('extractFirstImageUrl resolves self-closing img src token URL', () => {
  const body = '[img src="{STEAM_CLAN_LOC_IMAGE}/3703047/aa83bcaaafe7cd4d11a841ec381ec28ccb039d41.png"]';
  assert.equal(
    extractFirstImageUrl(body),
    'https://clan.fastly.steamstatic.com/images/3703047/aa83bcaaafe7cd4d11a841ec381ec28ccb039d41.png'
  );
});

test('extractFirstImageUrl resolves self-closing img src with already-resolved https URL', () => {
  const body = '[img src="https://media.steampowered.com/a.png"]';
  assert.equal(extractFirstImageUrl(body), 'https://media.steampowered.com/a.png');
});

test('bbcodeToMarkdown renders self-closing img src as markdown image', () => {
  const md = bbcodeToMarkdown('[img src="{STEAM_CLAN_LOC_IMAGE}/3703047/a.png"]');
  assert.equal(md, '![img](https://clan.fastly.steamstatic.com/images/3703047/a.png)');
});
