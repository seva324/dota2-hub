#!/usr/bin/env node
/**
 * 从官方中英文章抽取 Dota2 通用/电竞术语对，供人工审核后并入 glossary。
 *
 * 数据源：news_articles 表 source='Dota2 Official' 的中英对齐文章（Valve 官方本地化）。
 * 方法：按段落索引对齐 EN/ZH → LLM 结构化抽取术语对 → 去重 + 过滤已有词表 → 输出 candidates.json。
 *
 * 用法：
 *   node scripts/extract-glossary-from-official-news.mjs
 *   node scripts/extract-glossary-from-official-news.mjs --limit 10 --offset 0
 *   node scripts/extract-glossary-from-official-news.mjs --model google/gemini-2.5-flash --concurrency 4
 *   node scripts/extract-glossary-from-official-news.mjs --min-confidence 0.7 --dry-run
 *
 * 输出：resources/dota-glossary/candidates.json（审核后手动并入 terms.json / manual-aliases.mjs）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../lib/db.js';
import { callLlmJson } from '../lib/openrouter.mjs';
import { mapWithConcurrency } from '../lib/server/derived-refresh-utils.js';
import manualAliases from '../resources/dota-glossary/manual-aliases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLOSSARY_DIR = path.join(ROOT, 'resources', 'dota-glossary');
const CANDIDATES_PATH = path.join(GLOSSARY_DIR, 'candidates.json');

const OFFICIAL_SOURCE = 'Dota2 Official';
const DEFAULT_MODEL =
  process.env.NEWS_TRANSLATE_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  'google/gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 120000;
const ALLOWED_CATEGORIES = ['general', 'esports', 'mechanic', 'event'];
const MAX_BLOCKS_PER_ARTICLE = 30;
const MAX_BLOCK_CHARS = 800;

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
      continue;
    }
    result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
  }
  return result;
}

function pickPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function pickNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeKey(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

const IMAGE_LINE_RE = /^!\[[^\]]*]\(https?:\/\/[^)]+\)/;

function isImageLine(block = '') {
  return IMAGE_LINE_RE.test(block);
}

function splitBlocks(markdown = '') {
  return String(markdown || '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/**
 * 官方中英文章结构一致，按段落索引对齐；相同内容行（图片 URL）确认对齐，
 * 一侧多余图片行时先跳过以保持后续内容对齐。
 */
export function alignArticle(mdEn = '', mdZh = '') {
  const en = splitBlocks(mdEn);
  const zh = splitBlocks(mdZh);
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < en.length && j < zh.length) {
    if (en[i] === zh[j]) {
      pairs.push({ en: en[i], zh: zh[j] });
      i += 1;
      j += 1;
      continue;
    }
    if (isImageLine(en[i]) && !isImageLine(zh[j])) {
      i += 1;
      continue;
    }
    if (isImageLine(zh[j]) && !isImageLine(en[i])) {
      j += 1;
      continue;
    }
    pairs.push({ en: en[i], zh: zh[j] });
    i += 1;
    j += 1;
  }
  return pairs;
}

function loadExistingGlossaryKeys() {
  const keys = new Set();
  const addNames = (englishName = '', aliases = []) => {
    for (const name of [englishName, ...aliases]) {
      const key = normalizeKey(name);
      if (key) keys.add(key);
    }
  };
  for (const file of ['heroes.json', 'items.json', 'abilities.json', 'terms.json']) {
    const rows = JSON.parse(fs.readFileSync(path.join(GLOSSARY_DIR, file), 'utf8'));
    for (const row of rows) {
      addNames(row.english_name, row.english_aliases);
    }
  }
  const manual = manualAliases || {};
  for (const group of [manual.custom_items, manual.custom_terms]) {
    for (const row of group || []) {
      addNames(row.english_name, row.english_aliases);
    }
  }
  for (const row of Object.values(manual.heroes || {})) {
    if (row && Array.isArray(row.chinese_aliases)) addNames('', row.chinese_aliases);
  }
  return keys;
}

export function buildExtractionPrompt(article, pairs, maxBlocks = MAX_BLOCKS_PER_ARTICLE) {
  const blocks = pairs
    .slice(0, maxBlocks)
    .map((pair, index) => `[EN-${index}]\n${String(pair.en).slice(0, MAX_BLOCK_CHARS)}\n[ZH-${index}]\n${String(pair.zh).slice(0, MAX_BLOCK_CHARS)}`)
    .join('\n\n');

  return [
    `抽取以下官方 Dota2 文章中英对齐文本里的通用/电竞术语对。`,
    `文章标题 EN: ${article.title_en}`,
    `文章标题 ZH: ${article.title_zh || ''}`,
    ``,
    `要求：`,
    `- 提取游戏/电竞通用概念（如 The International、MMR、Compendium、Immortal、Collector's Cache）和机制术语。`,
    `- en 为英文原文词，zh 为官方中文译名，两者必须都出现在文本中。`,
    `- 优先提取在文中反复出现的稳定译法；多词短语优先。`,
    `- 不要提取：已有官方标准译名的英雄/物品/技能名、普通常见词、纯数字/版本号、单个泛指名词。`,
    `- 若中英无法对应（结构错位），跳过该块，不要臆造对齐。`,
    ``,
    `对齐段落：`,
    blocks,
  ].join('\n');
}

export const extractSchema = {
  type: 'object',
  properties: {
    terms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string' },
          zh: { type: 'string' },
          category: { type: 'string', enum: ['general', 'esports', 'mechanic', 'event', 'other'] },
          confidence: { type: 'number' },
          aliases_en: { type: 'array', items: { type: 'string' } },
          aliases_zh: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
        required: ['en', 'zh', 'category', 'confidence', 'aliases_en', 'aliases_zh', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['terms'],
  additionalProperties: false,
};

export async function extractTermsForArticle(article, opts = {}) {
  const pairs = alignArticle(article.content_markdown_en, article.content_markdown_zh);
  if (pairs.length === 0) {
    return { articleId: article.id, title: article.title_en, terms: [], error: 'no aligned blocks' };
  }
  // gemini 偶发返回截断/重复的坏 JSON；用减半的样本块重试一次，失败成本可控
  const baseMaxBlocks = opts.maxBlocks || MAX_BLOCKS_PER_ARTICLE;
  const maxBlocksOptions = [baseMaxBlocks, Math.max(6, Math.floor(baseMaxBlocks / 2))];
  let lastError = '';
  for (const maxBlocks of maxBlocksOptions) {
    try {
      const prompt = buildExtractionPrompt(article, pairs, maxBlocks);
      const data = await callLlmJson(prompt, extractSchema, {
        model: opts.model || DEFAULT_MODEL,
        timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
        maxTokens: 4096,
      });
      const terms = Array.isArray(data?.terms) ? data.terms : [];
      return { articleId: article.id, title: article.title_en, terms, error: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    articleId: article.id,
    title: article.title_en,
    terms: [],
    error: lastError,
  };
}

/** 聚合所有文章抽取结果：过滤类别/置信度/已有词表/噪音，按归一化 EN 去重并统计出现次数。 */
export function aggregateCandidates(rawResults, existingKeys, opts = {}) {
  const minConfidence = pickNumber(opts.minConfidence, 0.6);
  const allowedCategories = new Set(opts.allowedCategories || ALLOWED_CATEGORIES);
  const byKey = new Map();

  for (const result of rawResults) {
    if (!result || !Array.isArray(result.terms)) continue;
    for (const term of result.terms) {
      const en = String(term?.en || '').trim();
      const zh = String(term?.zh || '').trim();
      const category = String(term?.category || 'other').trim();
      const confidence = pickNumber(term?.confidence, 0);
      const key = normalizeKey(en);
      if (!key) continue;
      if (en.length < 2 || !/[A-Za-z]/i.test(en)) continue;
      if (zh.length < 1 || zh === en) continue;
      if (!allowedCategories.has(category)) continue;
      if (confidence < minConfidence) continue;
      if (existingKeys.has(key)) continue;

      const entry = byKey.get(key);
      if (!entry) {
        byKey.set(key, {
          en,
          zh,
          category,
          confidence,
          aliases_en: Array.isArray(term.aliases_en) ? term.aliases_en.filter(Boolean) : [],
          aliases_zh: Array.isArray(term.aliases_zh) ? term.aliases_zh.filter(Boolean) : [],
          note: String(term.note || '').trim(),
          occurrences: 1,
          sources: new Set([result.title || result.articleId]),
        });
      } else {
        entry.occurrences += 1;
        entry.sources.add(result.title || result.articleId);
        if (confidence > entry.confidence) {
          entry.en = en;
          entry.zh = zh;
          entry.category = category;
          entry.confidence = confidence;
          entry.note = String(term.note || '').trim();
        }
      }
    }
  }

  const candidates = Array.from(byKey.values())
    .map((entry) => ({ ...entry, sources: Array.from(entry.sources) }))
    .sort((a, b) => b.occurrences - a.occurrences || b.confidence - a.confidence);
  return candidates;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = pickPositiveInt(args.limit, Infinity);
  const offset = pickPositiveInt(args.offset, 0);
  const concurrency = pickPositiveInt(args.concurrency, 3);
  const minConfidence = pickNumber(args['min-confidence'], 0.6);
  const model = String(args.model || '') || DEFAULT_MODEL;
  const dryRun = Boolean(args['dry-run']);
  const maxBlocks = pickPositiveInt(args['max-blocks'], MAX_BLOCKS_PER_ARTICLE);

  const db = getDb();
  if (!db) {
    console.error('DATABASE_URL 未配置，无法读取官方文章');
    process.exit(1);
  }

  const articles = await db`
    SELECT id, title_en, title_zh, content_markdown_en, content_markdown_zh
    FROM news_articles
    WHERE source = ${OFFICIAL_SOURCE}
    ORDER BY published_at DESC
  `;
  const subset = articles.slice(offset, limit === Infinity ? undefined : offset + limit);
  console.log(`官方文章总数 ${articles.length}，本次处理 ${subset.length}（offset=${offset} limit=${limit === Infinity ? 'all' : limit}）model=${model}`);

  const results = [];
  await mapWithConcurrency(subset, concurrency, async (article) => {
    results.push(await extractTermsForArticle(article, { model, maxBlocks }));
  });

  const errors = results.filter((r) => r.error).map((r) => ({ title: r.title, error: r.error }));
  const rawCount = results.reduce((sum, r) => sum + (r.terms ? r.terms.length : 0), 0);
  if (errors.length > 0) {
    console.warn(`抽取失败 ${errors.length}/${subset.length} 篇：`);
    for (const e of errors.slice(0, 10)) console.warn(`  - ${e.title}: ${e.error}`);
  }

  const existingKeys = loadExistingGlossaryKeys();
  const candidates = aggregateCandidates(results, existingKeys, { minConfidence });

  const payload = {
    generated_at: new Date().toISOString(),
    model,
    scope: 'general terms from official bilingual Dota2 articles',
    articles_processed: results.length,
    articles_with_errors: errors.length,
    raw_terms_count: rawCount,
    candidates_count: candidates.length,
    candidates,
  };

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  fs.writeFileSync(CANDIDATES_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`\n已写入 ${CANDIDATES_PATH}`);
  console.log(`候选术语 ${candidates.length} 条（原始抽取 ${rawCount} 条）。请人工审核后并入 terms.json。`);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
