import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRequiredTranslationGlossaryPrompt,
  buildTranslationGlossaryPrompt,
  normalizeGlossaryTranslations,
  normalizeGlossaryTranslationsInMarkdown,
} from '../lib/translation-glossary.js';

test('translation glossary includes tormentor, shard, and facet/aspect mappings', () => {
  const prompt = buildTranslationGlossaryPrompt({
    title: 'Patch notes: Tormentor timing and Facet balance',
    summary: 'Teams are contesting the Tormentor while Aspect choices and Shard timings reshape drafts.',
    content: 'Aghanim\'s Shard is still a key pickup, and some sites incorrectly call Facets Aspects.',
  });

  assert.match(prompt, /Tormentor -> 痛苦魔方/);
  assert.match(prompt, /中文别名：魔方 \/ 焦哥/);
  assert.match(prompt, /Facet -> 命石/);
  assert.match(prompt, /英文别名：Facet \/ Facets \/ Aspect \/ Aspects/);
  assert.match(prompt, /Aghanim's Shard -> 魔晶/);
  assert.match(prompt, /英文别名：Aghanim's Shard \/ Shard \/ Shards/);
});

test('required translation glossary prompt still returns fallback guidance when no concrete term matches', () => {
  const prompt = buildRequiredTranslationGlossaryPrompt({
    title: 'Team update',
    summary: 'Roster news only',
    content: 'The coach spoke about practice.',
  });

  assert.match(prompt, /术语表（强约束）/);
  assert.match(prompt, /标题或正文翻译必须执行术语统一/);
});

test('translation glossary normalizes english aliases and community nicknames to official Chinese names', () => {
  const source = {
    title: 'Facet patch changed Tormentor and Aghanim\'s Shard fights',
    summary: 'Players still call it Aspect or 焦哥 in comments.',
    content: 'Some people also shorten Aghanim\'s Shard to Shard.',
  };

  const output = normalizeGlossaryTranslations(
    '这波 Aspect 改动之后，很多人还是会去打焦哥，拿 Shard 的节奏也更早了。',
    source,
  );

  assert.equal(output, '这波 命石 改动之后，很多人还是会去打痛苦魔方，拿 魔晶 的节奏也更早了。');
});

test('translation glossary collapses hybrid english-plus-chinese suffix phrases to official names', () => {
  const source = {
    title: 'Enigma players still buy Tango before Blink Dagger Black Hole fights',
    summary: 'Some commenters call Blink Dagger just Blink.',
    content: 'Landing Black Hole often depends on having Tango, Blink Dagger and good positioning.',
  };

  const output = normalizeGlossaryTranslations(
    '这波还是得先补Tango药水，再找Blink匕首的位置，团战里把Black Hole技能拉满。',
    source,
  );

  assert.equal(output, '这波还是得先补树之祭祀，再找闪烁匕首的位置，团战里把黑洞拉满。');
});

test('translation glossary normalizes markdown text without corrupting link targets', () => {
  const source = {
    title: 'Rubick and Batrider meta report',
    summary: 'Teams first-pick Rubick and keep banning Batrider.',
    content: 'Rubick appears in headings and links.',
  };

  const output = normalizeGlossaryTranslationsInMarkdown(
    '## Rubick 和 Batrider\n\n[Rubick 详细数据](https://example.com/Rubick-vs-Batrider)\n\n结论：Rubick 还是版本热门。',
    source,
  );

  assert.equal(
    output,
    '## 拉比克 和 蝙蝠骑士\n\n[拉比克 详细数据](https://example.com/Rubick-vs-Batrider)\n\n结论：拉比克 还是版本热门。',
  );
});

test('translation glossary does not duplicate official chinese names when aliases are substrings', () => {
  const source = {
    title: 'Batrider, Tusk and Doom stayed popular',
    summary: 'Players also call Tusk 海民 and Doom 末日.',
    content: 'Batrider remained common.',
  };

  const output = normalizeGlossaryTranslations(
    '蝙蝠骑士、巨牙海民和末日使者还是热门，海民和末日这两个简称也很常见。',
    source,
  );

  assert.equal(output, '蝙蝠骑士、巨牙海民和末日使者还是热门，巨牙海民和末日使者这两个简称也很常见。');
});
