import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTranslationGlossaryPrompt, normalizeGlossaryTranslations } from '../lib/translation-glossary.js';

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
