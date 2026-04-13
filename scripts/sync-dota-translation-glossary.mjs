import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import manualAliases from '../resources/dota-glossary/manual-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'resources', 'dota-glossary');
const CACHE_DIR = path.join(DATA_DIR, 'source-cache');
const DOC_PATH = path.join(ROOT, 'docs', 'dota-translation-glossary.md');

const OFFICIAL_BASE = 'https://www.dota2.com/datafeed';
const HERO_ABBR_URL = 'https://liquipedia.net/dota2/List_of_Abbreviations';

const OFFICIAL_SOURCES = {
  heroes: [
    `${OFFICIAL_BASE}/herolist?language=english`,
    `${OFFICIAL_BASE}/herolist?language=schinese`,
  ],
  items: [
    `${OFFICIAL_BASE}/itemlist?language=english`,
    `${OFFICIAL_BASE}/itemlist?language=schinese`,
  ],
  abilities: [
    `${OFFICIAL_BASE}/abilitylist?language=english`,
    `${OFFICIAL_BASE}/abilitylist?language=schinese`,
  ],
  heroAbbreviations: [HERO_ABBR_URL],
};

const OLD_HERO_NAME_MAP = {
  windrunner: 'Windranger',
  necrolyte: 'Necrophos',
  antimage: 'Anti-Mage',
  obsidiandestroyer: 'Outworld Destroyer',
  outworlddevourer: 'Outworld Destroyer',
  skeletonking: 'Wraith King',
  lifebreaker: 'Lifestealer',
};

function fetchText(url) {
  const cachePath = path.join(CACHE_DIR, `${cacheFileName(url)}.txt`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, 'utf8');
  }

  const result = spawnSync('curl', ['-L', '--fail', url], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
  if (result.status !== 0) {
    throw new Error(`curl failed for ${url}: ${(result.stderr || result.stdout || '').trim()}`);
  }
  const text = String(result.stdout || '');
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath, text, 'utf8');
  return text;
}

function fetchJson(url) {
  return JSON.parse(fetchText(url));
}

function normalizeKey(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function uniqueAliases(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = normalizeKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
}

function parseHeroAbbreviations(html) {
  const matches = [...html.matchAll(/<li><a [^>]*title="([^"]+)"[^>]*>.*?<\/a>\s*-\s*([^<]+)<\/li>/g)];
  const output = new Map();

  for (const match of matches) {
    const rawName = String(match[1] || '').trim();
    const aliasText = String(match[2] || '')
      .replace(/&amp;/g, '&')
      .trim();
    if (!rawName || !aliasText) continue;
    const resolvedName = OLD_HERO_NAME_MAP[normalizeKey(rawName)] || rawName;
    const aliases = aliasText
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    output.set(resolvedName, aliases);
  }

  return output;
}

function resolveManualEntryKey(entryKey, list = [], type = 'entity') {
  const normalized = normalizeKey(entryKey);
  const resolved =
    list.find((item) => normalizeKey(item.internal_name) === normalized) ||
    list.find((item) => normalizeKey(item.english_name) === normalized);

  if (!resolved) {
    throw new Error(`Unable to resolve ${type} alias key: ${entryKey}`);
  }

  return resolved.internal_name;
}

function buildHeroAbilityMembership(heroListZh) {
  const memberships = new Map();

  for (const hero of heroListZh) {
    const detail = fetchJson(`${OFFICIAL_BASE}/herodata?language=schinese&hero_id=${hero.id}`);
    const heroData = detail?.result?.data?.heroes?.[0];
    const heroAbilities = [];

    for (const ability of heroData?.abilities || []) {
      const internalName = String(ability?.name || '');
      if (!internalName) continue;
      if (ability?.is_item) continue;
      if (String(internalName).startsWith('special_bonus_')) continue;
      if (internalName === 'attribute_bonus') continue;
      if (Number(ability?.type) === 2) continue;
      heroAbilities.push({
        id: Number(ability.id),
        internal_name: internalName,
      });
    }

    for (const ability of heroData?.facet_abilities || []) {
      const internalName = String(ability?.name || '');
      if (!internalName) continue;
      if (ability?.is_item) continue;
      if (String(internalName).startsWith('special_bonus_')) continue;
      if (internalName === 'attribute_bonus') continue;
      if (Number(ability?.type) === 2) continue;
      heroAbilities.push({
        id: Number(ability.id),
        internal_name: internalName,
      });
    }

    memberships.set(hero.id, uniqueBy(heroAbilities, (item) => `${item.id}:${item.internal_name}`));
  }

  return memberships;
}

function uniqueBy(items = [], getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyChinesePreference(baseChineseName = '', manual = null) {
  const preferredChineseName = String(manual?.preferred_chinese_name || '').trim();
  const chineseName = preferredChineseName || String(baseChineseName || '').trim();
  const chineseAliases = uniqueAliases([
    ...(preferredChineseName && baseChineseName && preferredChineseName !== baseChineseName ? [baseChineseName] : []),
    ...(manual?.chinese_aliases || []),
  ]);
  return { chineseName, chineseAliases };
}

function mergeDuplicateItems(items = []) {
  const grouped = new Map();
  for (const item of items) {
    const key = `${normalizeKey(item.english_name)}|${normalizeKey(item.chinese_name)}|${Number(item.neutral_tier)}`;
    const prev = grouped.get(key);
    if (!prev) {
      grouped.set(key, { ...item });
      continue;
    }
    grouped.set(key, {
      ...prev,
      internal_name: prev.deprecated ? prev.internal_name : item.internal_name,
      english_aliases: uniqueAliases([...(prev.english_aliases || []), ...(item.english_aliases || [])]),
      chinese_aliases: uniqueAliases([...(prev.chinese_aliases || []), ...(item.chinese_aliases || [])]),
      deprecated: Boolean(prev.deprecated || item.deprecated),
    });
  }
  return Array.from(grouped.values());
}

function cacheFileName(url = '') {
  return String(url)
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);
}

function loadOfficialData() {
  const heroListEn =
    fetchJson(`${OFFICIAL_BASE}/herolist?language=english`)?.result?.data?.heroes?.map((hero) => ({
      id: Number(hero.id),
      internal_name: hero.name,
      english_name: hero.name_loc || hero.name_english_loc || hero.name,
    })) || [];
  const heroListZh =
    fetchJson(`${OFFICIAL_BASE}/herolist?language=schinese`)?.result?.data?.heroes?.map((hero) => ({
      id: Number(hero.id),
      internal_name: hero.name,
      chinese_name: hero.name_loc || hero.name,
    })) || [];

  const itemListEn =
    fetchJson(`${OFFICIAL_BASE}/itemlist?language=english`)?.result?.data?.itemabilities?.map((item) => ({
      id: Number(item.id),
      internal_name: item.name,
      english_name: item.name_loc || item.name_english_loc || item.name,
      neutral_tier: Number(item.neutral_item_tier),
    })) || [];
  const itemListZh =
    fetchJson(`${OFFICIAL_BASE}/itemlist?language=schinese`)?.result?.data?.itemabilities?.map((item) => ({
      id: Number(item.id),
      internal_name: item.name,
      chinese_name: item.name_loc || item.name,
      neutral_tier: Number(item.neutral_item_tier),
    })) || [];

  const abilityListEn =
    fetchJson(`${OFFICIAL_BASE}/abilitylist?language=english`)?.result?.data?.itemabilities?.map((ability) => ({
      id: Number(ability.id),
      internal_name: ability.name,
      english_name: ability.name_loc || ability.name_english_loc || ability.name,
    })) || [];
  const abilityListZh =
    fetchJson(`${OFFICIAL_BASE}/abilitylist?language=schinese`)?.result?.data?.itemabilities?.map((ability) => ({
      id: Number(ability.id),
      internal_name: ability.name,
      chinese_name: ability.name_loc || ability.name,
    })) || [];

  return { heroListEn, heroListZh, itemListEn, itemListZh, abilityListEn, abilityListZh };
}

function buildGlossary() {
  const { heroListEn, heroListZh, itemListEn, itemListZh, abilityListEn, abilityListZh } = loadOfficialData();
  const heroAbbreviationHtml = fetchText(HERO_ABBR_URL);
  const heroEnglishAliases = parseHeroAbbreviations(heroAbbreviationHtml);
  const heroAbilityMembership = buildHeroAbilityMembership(heroListZh);

  const heroes = heroListEn
    .map((heroEn) => {
      const heroZh = heroListZh.find((item) => item.id === heroEn.id);
      const manualKey = resolveManualEntryKeySafe(heroEn, manualAliases.heroes);
      const manual = manualKey ? manualAliases.heroes[manualKey] : null;
      const englishAliases = uniqueAliases([
        ...(heroEnglishAliases.get(heroEn.english_name) || []),
        ...(manual?.english_aliases || []),
      ]);
      const { chineseName, chineseAliases } = applyChinesePreference(heroZh?.chinese_name || '', manual);

      return {
        id: heroEn.id,
        internal_name: heroEn.internal_name,
        english_name: heroEn.english_name,
        chinese_name: chineseName,
        english_aliases: englishAliases,
        chinese_aliases: chineseAliases,
      };
    })
    .sort((a, b) => a.english_name.localeCompare(b.english_name, 'en'));

  const items = mergeDuplicateItems(itemListEn
    .map((itemEn) => {
      const itemZh = itemListZh.find((item) => item.id === itemEn.id);
      if (!itemZh) return null;
      if (!itemEn.english_name || !itemZh.chinese_name) return null;
      if (String(itemEn.internal_name || '').startsWith('item_recipe_')) return null;
      const manualKey = resolveManualEntryKeySafe(itemEn, manualAliases.items);
      const manual = manualKey ? manualAliases.items[manualKey] : null;
      const { chineseName, chineseAliases } = applyChinesePreference(itemZh.chinese_name, manual);

      return {
        id: itemEn.id,
        internal_name: itemEn.internal_name,
        english_name: itemEn.english_name,
        chinese_name: chineseName,
        neutral_tier: itemEn.neutral_tier,
        english_aliases: uniqueAliases(manual?.english_aliases || []),
        chinese_aliases: chineseAliases,
      };
    })
    .filter(Boolean)
    .concat(
      (Array.isArray(manualAliases.custom_items) ? manualAliases.custom_items : []).map((item) => ({
        id: Number(item.id || 0),
        internal_name: item.internal_name,
        english_name: item.english_name,
        chinese_name: item.chinese_name,
        neutral_tier: Number.isFinite(Number(item.neutral_tier)) ? Number(item.neutral_tier) : -1,
        english_aliases: uniqueAliases(item.english_aliases || []),
        chinese_aliases: uniqueAliases(item.chinese_aliases || []),
        deprecated: Boolean(item.deprecated),
      }))
    )
  ).sort((a, b) => a.english_name.localeCompare(b.english_name, 'en'));

  const abilityByIdEn = new Map(abilityListEn.map((item) => [item.id, item]));
  const abilityByIdZh = new Map(abilityListZh.map((item) => [item.id, item]));
  const heroById = new Map(heroes.map((hero) => [hero.id, hero]));

  const abilities = [];
  for (const hero of heroes) {
    const abilityRefs = heroAbilityMembership.get(hero.id) || [];
    for (const ref of abilityRefs) {
      const abilityEn = abilityByIdEn.get(ref.id);
      const abilityZh = abilityByIdZh.get(ref.id);
      if (!abilityEn || !abilityZh) continue;
      const englishName = abilityEn.english_name;
      const chineseName = abilityZh.chinese_name;
      if (!englishName || !chineseName) continue;
      if (normalizeKey(englishName) === normalizeKey('Attribute Bonus')) continue;
      const manualKey = resolveManualEntryKeySafe(abilityEn, manualAliases.abilities);
      const manual = manualKey ? manualAliases.abilities[manualKey] : null;
      const preferredChinese = applyChinesePreference(chineseName, manual);

      abilities.push({
        id: ref.id,
        internal_name: ref.internal_name || abilityEn.internal_name,
        hero_id: hero.id,
        hero_internal_name: hero.internal_name,
        hero_english_name: hero.english_name,
        hero_chinese_name: hero.chinese_name,
        english_name: englishName,
        chinese_name: preferredChinese.chineseName,
        english_aliases: uniqueAliases(manual?.english_aliases || []),
        chinese_aliases: preferredChinese.chineseAliases,
      });
    }
  }

  const terms = (Array.isArray(manualAliases.custom_terms) ? manualAliases.custom_terms : [])
    .map((term) => {
      const preferredChinese = applyChinesePreference(term.chinese_name, term);
      return {
        id: Number(term.id || 0),
        internal_name: term.internal_name,
        english_name: term.english_name,
        chinese_name: preferredChinese.chineseName,
        english_aliases: uniqueAliases(term.english_aliases || []),
        chinese_aliases: preferredChinese.chineseAliases,
      };
    })
    .sort((a, b) => a.english_name.localeCompare(b.english_name, 'en'));

  return {
    terms,
    heroes,
    items,
    abilities: abilities.sort((a, b) => {
      const byHero = a.hero_english_name.localeCompare(b.hero_english_name, 'en');
      return byHero || a.english_name.localeCompare(b.english_name, 'en');
    }),
  };
}

function resolveManualEntryKeySafe(entity, manualGroup = {}) {
  const keys = Object.keys(manualGroup || {});
  for (const key of keys) {
    const normalizedKey = normalizeKey(key);
    if (normalizedKey === normalizeKey(entity.internal_name) || normalizedKey === normalizeKey(entity.english_name)) {
      return key;
    }
  }
  return null;
}

function renderTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.render(row) || '').replace(/\|/g, '\\|')).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function renderMarkdown(glossary) {
  const termRows = renderTable(glossary.terms, [
    { label: '中文正式名', render: (row) => row.chinese_name },
    { label: '英文正式名', render: (row) => row.english_name },
    { label: '英文别名/旧称', render: (row) => row.english_aliases.join(' / ') },
    { label: '中文别名', render: (row) => row.chinese_aliases.join(' / ') },
    { label: '内部名', render: (row) => row.internal_name },
  ]);

  const heroRows = renderTable(glossary.heroes, [
    { label: '中文正式名', render: (row) => row.chinese_name },
    { label: '英文正式名', render: (row) => row.english_name },
    { label: '英文别名/缩写', render: (row) => row.english_aliases.join(' / ') },
    { label: '中文别名', render: (row) => row.chinese_aliases.join(' / ') },
    { label: '内部名', render: (row) => row.internal_name },
  ]);

  const itemRows = renderTable(glossary.items, [
    { label: '中文正式名', render: (row) => row.chinese_name },
    { label: '英文正式名', render: (row) => row.english_name },
    { label: '英文别名/缩写', render: (row) => row.english_aliases.join(' / ') },
    { label: '中文别名', render: (row) => row.chinese_aliases.join(' / ') },
    { label: '内部名', render: (row) => row.internal_name },
  ]);

  const abilitySections = [];
  const heroGroups = new Map();
  for (const ability of glossary.abilities) {
    const key = `${ability.hero_english_name}|${ability.hero_chinese_name}`;
    if (!heroGroups.has(key)) heroGroups.set(key, []);
    heroGroups.get(key).push(ability);
  }

  for (const [key, rows] of heroGroups.entries()) {
    const [heroEn, heroZh] = key.split('|');
    abilitySections.push(`### ${heroZh} / ${heroEn}`);
    abilitySections.push(renderTable(rows, [
      { label: '中文正式名', render: (row) => row.chinese_name },
      { label: '英文正式名', render: (row) => row.english_name },
      { label: '英文别名/缩写', render: (row) => row.english_aliases.join(' / ') },
      { label: '中文别名', render: (row) => row.chinese_aliases.join(' / ') },
      { label: '内部名', render: (row) => row.internal_name },
    ]));
    abilitySections.push('');
  }

  return [
    '# Dota 2 翻译术语表',
    '',
    '> 机器可读源建议以结构化 JSON 为准；Markdown 只作为人工维护/查阅视图。',
    '',
    '## 推荐维护策略',
    '',
    '- **主数据源**：`resources/dota-glossary/*.json`（脚本可直接读取，适合喂给 LLM 或做后处理）',
    '- **人工查阅视图**：本 Markdown 文档（由脚本生成，方便肉眼检查）',
    '- **更新命令**：`node scripts/sync-dota-translation-glossary.mjs`',
    '',
    '## 数据来源',
    '',
    '- 官方名称：Dota 2 官方 datafeed（heroes / items / abilities，英文 + 简体中文）',
    '- 英文英雄简称：Liquipedia《List of Abbreviations》',
    '- 中文别名与社区优先叫法：仓库内人工维护的 `resources/dota-glossary/manual-aliases.mjs`',
    '',
    `## 通用术语（${glossary.terms.length}）`,
    '',
    termRows,
    '',
    `## 英雄（${glossary.heroes.length}）`,
    '',
    heroRows,
    '',
    `## 物品（${glossary.items.length}）`,
    '',
    itemRows,
    '',
    `## 技能（${glossary.abilities.length}）`,
    '',
    ...abilitySections,
  ].join('\n');
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(DATA_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const glossary = buildGlossary();
  const metadata = {
    generated_at: new Date().toISOString(),
    sources: OFFICIAL_SOURCES,
    counts: {
      terms: glossary.terms.length,
      heroes: glossary.heroes.length,
      items: glossary.items.length,
      abilities: glossary.abilities.length,
    },
  };

  writeJson('terms.json', glossary.terms);
  writeJson('heroes.json', glossary.heroes);
  writeJson('items.json', glossary.items);
  writeJson('abilities.json', glossary.abilities);
  writeJson('metadata.json', metadata);
  fs.writeFileSync(DOC_PATH, `${renderMarkdown(glossary)}\n`, 'utf8');

  console.log(`Wrote glossary: heroes=${glossary.heroes.length}, items=${glossary.items.length}, abilities=${glossary.abilities.length}`);
  console.log(`Docs: ${path.relative(ROOT, DOC_PATH)}`);
}

main();
