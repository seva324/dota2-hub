import fs from 'node:fs';

const HERO_PATH = new URL('../resources/dota-glossary/heroes.json', import.meta.url);
const ITEM_PATH = new URL('../resources/dota-glossary/items.json', import.meta.url);
const ABILITY_PATH = new URL('../resources/dota-glossary/abilities.json', import.meta.url);
const TERM_PATH = new URL('../resources/dota-glossary/terms.json', import.meta.url);

let cache = null;

function normalizeAsciiTerm(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[’']/g, "'")
    .trim();
}

function normalizeKey(value = '') {
  return normalizeAsciiTerm(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function escapeRegExp(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeAsciiRegex(term, { caseSensitive = false } = {}) {
  const normalized = normalizeAsciiTerm(term);
  if (!normalized) return null;
  const flexible = escapeRegExp(normalized)
    .replace(/\\ /g, '[\\s\\-]+')
    .replace(/\\'/g, "['’]?");
  return new RegExp(`(^|[^A-Za-z0-9])(${flexible})(?=$|[^A-Za-z0-9])`, caseSensitive ? '' : 'i');
}

function makeAsciiRegexGlobal(term, { caseSensitive = false } = {}) {
  const normalized = normalizeAsciiTerm(term);
  if (!normalized) return null;
  const flexible = escapeRegExp(normalized)
    .replace(/\\ /g, '[\\s\\-]+')
    .replace(/\\'/g, "['’]?");
  return new RegExp(`(^|[^A-Za-z0-9])(${flexible})(?=$|[^A-Za-z0-9])`, caseSensitive ? 'g' : 'gi');
}

function isUpperAlias(term = '') {
  return /^[A-Z0-9]{2,6}$/.test(String(term || '').trim());
}

function loadJson(url) {
  if (!fs.existsSync(url)) return [];
  return JSON.parse(fs.readFileSync(url, 'utf8'));
}

function buildMatcher(entry, category) {
  const safeTerms = [
    entry.english_name,
    ...(Array.isArray(entry.english_aliases) ? entry.english_aliases : []),
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const matchers = safeTerms.map((term, index) => ({
    term,
    regex: makeAsciiRegex(term, { caseSensitive: isUpperAlias(term) }),
    caseSensitive: isUpperAlias(term),
    isOfficialName: index === 0,
  })).filter((item) => item.regex);

  const label = category === 'abilities'
    ? `${entry.hero_chinese_name}/${entry.hero_english_name}: ${entry.chinese_name}`
    : entry.chinese_name;

  return {
    category,
    entry,
    label,
    matchers,
  };
}

function isSingleWordAbilityName(value = '') {
  return /^[A-Za-z]+$/.test(String(value || '').trim());
}

function sourceMentionsHeroName(text = '', entry = {}) {
  const heroName = String(entry?.hero_english_name || '').trim();
  if (!heroName) return false;
  const regex = makeAsciiRegex(heroName, { caseSensitive: false });
  return Boolean(regex && regex.test(text));
}

function ensureCache() {
  if (cache) return cache;
  const terms = loadJson(TERM_PATH);
  const heroes = loadJson(HERO_PATH);
  const items = loadJson(ITEM_PATH);
  const abilities = loadJson(ABILITY_PATH);
  cache = {
    terms,
    heroes,
    items,
    abilities,
    matchers: [
      ...terms.map((entry) => buildMatcher(entry, 'terms')),
      ...heroes.map((entry) => buildMatcher(entry, 'heroes')),
      ...items.map((entry) => buildMatcher(entry, 'items')),
      ...abilities.map((entry) => buildMatcher(entry, 'abilities')),
    ],
  };
  return cache;
}

function findRelevantEntries(text = '') {
  const original = String(text || '');
  if (!original.trim()) {
    return { terms: [], heroes: [], items: [], abilities: [] };
  }

  const found = {
    terms: [],
    heroes: [],
    items: [],
    abilities: [],
  };
  const seen = {
    terms: new Set(),
    heroes: new Set(),
    items: new Set(),
    abilities: new Set(),
  };

  const { matchers } = ensureCache();
  for (const matcher of matchers) {
    for (const term of matcher.matchers) {
      const haystack = term.caseSensitive ? original : original;
      if (!term.regex.test(haystack)) continue;
      if (
        matcher.category === 'abilities' &&
        term.isOfficialName &&
        isSingleWordAbilityName(matcher.entry.english_name) &&
        !sourceMentionsHeroName(original, matcher.entry)
      ) {
        continue;
      }
      const key = matcher.category === 'items'
        ? `${normalizeKey(matcher.entry.english_name)}|${normalizeKey(matcher.entry.chinese_name)}`
        : normalizeKey(matcher.entry.internal_name || matcher.entry.english_name);
      if (seen[matcher.category].has(key)) break;
      seen[matcher.category].add(key);
      found[matcher.category].push(matcher.entry);
      break;
    }
  }

  return found;
}

function renderEntry(entry, category) {
  const aliasBits = [];
  if (Array.isArray(entry.english_aliases) && entry.english_aliases.length) {
    aliasBits.push(`英文别名：${entry.english_aliases.join(' / ')}`);
  }
  if (Array.isArray(entry.chinese_aliases) && entry.chinese_aliases.length) {
    aliasBits.push(`中文别名：${entry.chinese_aliases.join(' / ')}`);
  }
  const suffix = aliasBits.length ? `（${aliasBits.join('；')}）` : '';
  if (category === 'abilities') {
    return `- ${entry.english_name} -> ${entry.chinese_name}${suffix}；所属英雄：${entry.hero_chinese_name}/${entry.hero_english_name}`;
  }
  return `- ${entry.english_name} -> ${entry.chinese_name}${suffix}`;
}

function collectRelevantEntries(source = {}) {
  const title = String(source?.title || '');
  const summary = String(source?.summary || '');
  const content = String(source?.content || '');
  const text = [title, summary, content].filter(Boolean).join('\n');
  return findRelevantEntries(text);
}

function replacementPriority(value = '') {
  return normalizeAsciiTerm(value).length;
}

function replaceChineseAliases(text = '', entries = []) {
  let output = String(text || '');
  const replacements = [];

  for (const entry of entries) {
    const official = String(entry?.chinese_name || '').trim();
    if (!official) continue;
    const aliases = Array.isArray(entry?.chinese_aliases) ? entry.chinese_aliases : [];
    for (const alias of aliases) {
      const candidate = String(alias || '').trim();
      if (!candidate || candidate === official) continue;
      replacements.push({ from: candidate, to: official });
    }
  }

  replacements.sort((left, right) => replacementPriority(right.from) - replacementPriority(left.from));

  for (const item of replacements) {
    output = output.replace(new RegExp(escapeRegExp(item.from), 'g'), item.to);
  }

  return output;
}

function replaceAsciiAliases(text = '', entries = []) {
  let output = String(text || '');
  const replacements = [];

  for (const entry of entries) {
    const official = String(entry?.chinese_name || '').trim();
    if (!official) continue;
    const aliases = [
      entry.english_name,
      ...(Array.isArray(entry.english_aliases) ? entry.english_aliases : []),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const alias of aliases) {
      replacements.push({
        from: alias,
        to: official,
        caseSensitive: isUpperAlias(alias),
      });
    }
  }

  replacements.sort((left, right) => replacementPriority(right.from) - replacementPriority(left.from));

  for (const item of replacements) {
    const regex = makeAsciiRegexGlobal(item.from, { caseSensitive: item.caseSensitive });
    if (!regex) continue;
    output = output.replace(regex, (_, prefix = '') => `${prefix}${item.to}`);
  }

  return output;
}

const GENERIC_DESCRIPTOR_SUFFIXES = [
  '英雄',
  '物品',
  '技能',
  '大招',
  '招式',
  '招',
  '法术',
  '魔法',
  '药水',
  '补给',
  '道具',
];

const DUPLICATE_ENDING_SUFFIXES = [
  '匕首',
  '斧',
  '杖',
  '鞋',
  '刀',
  '盾',
  '锤',
  '弓',
  '书',
  '宝石',
  '斗篷',
  '头盔',
  '手套',
  '球',
  '法球',
  '面具',
];

function squashHybridGlossarySuffixes(text = '', entries = []) {
  let output = String(text || '');

  for (const entry of entries) {
    const official = String(entry?.chinese_name || '').trim();
    if (!official) continue;

    for (const suffix of GENERIC_DESCRIPTOR_SUFFIXES) {
      output = output.replace(new RegExp(`${escapeRegExp(official)}\\s*${escapeRegExp(suffix)}`, 'g'), official);
    }

    for (const suffix of DUPLICATE_ENDING_SUFFIXES) {
      if (!official.endsWith(suffix)) continue;
      output = output.replace(new RegExp(`${escapeRegExp(official)}\\s*${escapeRegExp(suffix)}`, 'g'), official);
    }
  }

  return output;
}

export function buildTranslationGlossaryPrompt(source = {}, options = {}) {
  const { terms, heroes, items, abilities } = collectRelevantEntries(source);

  const termLimit = Number.isFinite(Number(options.termLimit)) ? Number(options.termLimit) : 10;
  const heroLimit = Number.isFinite(Number(options.heroLimit)) ? Number(options.heroLimit) : 8;
  const itemLimit = Number.isFinite(Number(options.itemLimit)) ? Number(options.itemLimit) : 10;
  const abilityLimit = Number.isFinite(Number(options.abilityLimit)) ? Number(options.abilityLimit) : 12;

  const sections = [];
  if (terms.length) {
    sections.push('通用术语：');
    sections.push(...terms.slice(0, termLimit).map((entry) => renderEntry(entry, 'terms')));
  }
  if (heroes.length) {
    sections.push('英雄名：');
    sections.push(...heroes.slice(0, heroLimit).map((entry) => renderEntry(entry, 'heroes')));
  }
  if (items.length) {
    sections.push('物品名：');
    sections.push(...items.slice(0, itemLimit).map((entry) => renderEntry(entry, 'items')));
  }
  if (abilities.length) {
    sections.push('技能名：');
    sections.push(...abilities.slice(0, abilityLimit).map((entry) => renderEntry(entry, 'abilities')));
  }

  if (!sections.length) return '';

  return [
    '术语表（强约束）：如果原文命中以下英文正式名、英文简称或旧称，翻译时必须统一使用指定中文名；不要把英雄、物品、技能翻成其他条目。',
    ...sections,
  ].join('\n');
}

export function normalizeGlossaryTranslations(text = '', source = {}) {
  const input = String(text || '');
  if (!input.trim()) return input;

  const { terms, heroes, items, abilities } = collectRelevantEntries(source);
  const entries = [...terms, ...heroes, ...items, ...abilities];
  if (!entries.length) return input;

  const withChineseAliases = replaceChineseAliases(input, entries);
  const withAsciiAliases = replaceAsciiAliases(withChineseAliases, entries);
  return squashHybridGlossarySuffixes(withAsciiAliases, entries);
}

export function getTranslationGlossaryCounts() {
  const current = ensureCache();
  return {
    terms: current.terms.length,
    heroes: current.heroes.length,
    items: current.items.length,
    abilities: current.abilities.length,
  };
}
