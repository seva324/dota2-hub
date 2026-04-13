import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { spawnSync } from 'node:child_process';
import { buildTranslationGlossaryPrompt } from '../lib/translation-glossary.js';
import { callLlmJson, callLlmText } from '../lib/openrouter.mjs';
import { countHanChars, sanitizeTranslatedChunkMarkdown } from '../lib/news-translation-cleanup.js';
import { evaluateAutoPostSafety, isGemma4Model, TRANSLATION_STATUS_COMPLETED } from '../lib/news-posting-guards.js';

const DB_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
const CODEX_BIN = process.env.NEWS_TRANSLATE_CODEX_BIN || process.env.CODEX_BIN || 'codex';
const REQUESTED_MODEL =
  process.env.NEWS_TRANSLATE_MODEL ||
  process.env.NEWS_TRANSLATE_OPENROUTER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  process.env.NEWS_TRANSLATE_CODEX_MODEL ||
  'google/gemma-4-31b-it';
const CODEX_TIMEOUT_MS = Math.max(5000, Number(process.env.NEWS_TRANSLATE_CODEX_TIMEOUT_MS || '45000') || 45000);
const OPENROUTER_TIMEOUT_MS = Math.max(5000, Number(process.env.OPENROUTER_TIMEOUT_MS || '60000') || 60000);
const MODEL_ALIASES = {
  gemma4: 'google/gemma-4-31b-it',
  'gemma-4': 'google/gemma-4-31b-it',
  'gemma-4-31b': 'google/gemma-4-31b-it',
  'google/gemma-4': 'google/gemma-4-31b-it',
};
const MODEL = MODEL_ALIASES[String(REQUESTED_MODEL || '').trim().toLowerCase()] || REQUESTED_MODEL;
const USE_OPENROUTER = /gemma|google\/|anthropic\/|openai\/|deepseek\/|qwen\//i.test(String(MODEL || ''));
const TRANSLATION_PROVIDER = USE_OPENROUTER ? 'openrouter' : 'codex';
const TRANSLATION_STATUS_PENDING = 'pending';
const TRANSLATION_STATUS_PARTIAL = 'partial';
const XHS_REWRITE_PROMPT_FILE = path.resolve(process.cwd(), 'docs/xhs-community-post-prompt.md');

function loadTranslationGuidance() {
  const fallback = [
    '你现在是一个 Dota2 中文社区内容编辑，擅长把英文电竞新闻改写成自然、完整、可读的简体中文内容。',
    '语言要像懂比赛的人在复述消息，不要翻译腔，不要官方通稿腔。',
    '保留事实准确性与信息密度，专有名词保留原文。',
  ].join('\n');

  let base = fallback;
  try {
    const raw = fs.readFileSync(XHS_REWRITE_PROMPT_FILE, 'utf8').trim();
    if (raw) base = raw;
  } catch {}

  return [
    base,
    '',
    '---',
    '下面的任务是“站内新闻翻译”，不是直接生成小红书发帖 JSON。',
    '请复用上面提示词里的中文风格、叙事方式、信息取舍原则和 Dota2 观众视角。',
    '但忽略其中这些限制：',
    '- 忽略必须输出 JSON / topics 的要求',
    '- 忽略 title 不超过 20 个中文字的要求',
    '- 忽略 body 150 到 380 字的要求',
    '- 忽略“超过 380 字必须压缩”的要求',
    '标题、摘要、正文都不设字数上限。',
    '以“自然、完整、准确、信息清楚”为第一优先，不要为了控字数而压缩掉关键事实。',
    '本任务会分别单独生成标题、摘要、正文，不要把“标题：”“正文：”“总结：”“点评：”“话题：”“topics：”之类字段标签写进输出。',
    '生成正文时，只输出网站文章正文本身，不要输出多段候选，不要附带额外标题、摘要、点评、话题。',
  ].join('\n');
}

const NEWS_TRANSLATION_GUIDANCE = loadTranslationGuidance();

if (!DB_URL) {
  console.error('Missing DATABASE_URL/POSTGRES_URL');
  process.exit(1);
}

const sql = neon(DB_URL);
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
};
const getArgs = (name) => args
  .map((value, index) => (value === `--${name}` && index < args.length - 1 ? args[index + 1] : null))
  .filter(Boolean);

const TOTAL_LIMIT = Math.max(1, Number(arg('limit', '120')) || 120);
const BATCH_SIZE = Math.max(1, Math.min(30, Number(arg('batch', '12')) || 12));
const CHUNK_MAX = Math.max(500, Number(arg('chunkMax', '650')) || 650);
const RECENT_DAYS = Math.max(1, Number(arg('recentDays', '3')) || 3);
const FORCE = ['1', 'true', 'yes', 'on'].includes(String(arg('force', 'false')).toLowerCase());
const XHS_AUTO_POST = ['1', 'true', 'yes', 'on'].includes(String(process.env.XHS_AUTO_POST || '').toLowerCase());
const TARGET_IDS = Array.from(new Set(getArgs('id').map((x) => String(x).trim()).filter(Boolean)));
const RECENT_CUTOFF_SECONDS = Math.floor(Date.now() / 1000) - (RECENT_DAYS * 24 * 60 * 60);
const AUTO_POST_REQUIRES_GEMMA4 = isGemma4Model(MODEL);

function isTransientDbError(error) {
  const message = String(error?.message || '');
  const source = String(error?.sourceError?.message || '');
  const code = String(error?.sourceError?.code || error?.code || '');
  return /fetch failed|ECONNRESET|UND_ERR_SOCKET|socket|ENOTFOUND|ETIMEDOUT|ECONNREFUSED/i.test(`${message} ${source} ${code}`);
}

async function withDbRetry(run, label = 'db', maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const delayMs = 400 * attempt;
      console.warn(`[db-retry] ${label} failed attempt ${attempt}/${maxAttempts}: ${error?.message || error}. retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function glossaryPromptForSource(source = {}) {
  return buildTranslationGlossaryPrompt({
    title: source?.title_en || source?.title || '',
    summary: source?.summary_en || source?.summary || '',
    content: source?.content_markdown_en || source?.content_en || source?.content || '',
  });
}

function maybeAutoPostXhs(row, context = {}) {
  if (!row?.id) return;
  const safety = evaluateAutoPostSafety({
    autoPostEnabled: XHS_AUTO_POST,
    translationCompleted: context.translationCompleted,
    gemmaTranslationTriggered: context.gemmaTranslationTriggered,
  });
  if (!safety.ok) {
    console.log(`[xhs] auto post skipped for ${row.id}: ${safety.reason}`);
    return;
  }
  const scriptPath = fileURLToPath(new URL('./post-news-to-xhs.mjs', import.meta.url));
  const preset = process.env.XHS_POST_PRESET || 'concise-news';
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--id', String(row.id), '--preset', preset, '--require-complete-translation'],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    }
  );
  if (result.status !== 0) {
    console.warn(`[xhs] auto post failed for ${row.id}: ${(result.stderr || result.stdout || '').trim()}`);
    return;
  }
  console.log(`[xhs] auto post done for ${row.id}`);
}

function sleep(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function looksLikeTranslationRefusal(text = '') {
  return /抱歉|请提供|请把完整|无法保证|没有看到正文|只看到了标题|not enough|provide the full|由于.*没有提供.*(?:英文|正文|素材)|请发送.*(?:英文|内容|正文)|没有提供需要翻译|缺乏具体.*(?:正文|新闻)|无法为您翻译完整/i.test(String(text));
}

function looksLikeStructuredArticle(text = '') {
  return /标题[:：]|正文[:：]|总结[:：]|点评[:：]/.test(String(text));
}

function looksLikeWrappedJsonText(text = '') {
  return /```json|^\s*\{\s*"text"\s*:|^\s*"text"\s*:/im.test(String(text || '').trim());
}

function unwrapModelText(text = '', depth = 0) {
  if (depth > 3) return String(text || '').trim();
  let value = String(text || '').trim();
  if (!value) return value;

  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    return unwrapModelText(fenced[1], depth + 1);
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.text === 'string') {
      return unwrapModelText(parsed.text, depth + 1);
    }
  } catch {}

  const textField = value.match(/^\s*"text"\s*:\s*([\s\S]+)$/i);
  if (textField) {
    const candidate = textField[1].trim().replace(/^,|,$/g, '').trim();
    try {
      return unwrapModelText(JSON.parse(candidate), depth + 1);
    } catch {
      return unwrapModelText(candidate.replace(/^"(.*)"$/s, '$1'), depth + 1);
    }
  }

  return value;
}

function hasChineseTitle(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeWrappedJsonText(zh) || looksLikeStructuredArticle(zh) || looksLikeTranslationRefusal(zh)) return false;
  return !fallbackEn || zh !== String(fallbackEn || '').trim();
}

function hasChineseSummary(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeWrappedJsonText(zh) || looksLikeStructuredArticle(zh) || looksLikeTranslationRefusal(zh)) return false;
  return !fallbackEn || zh !== String(fallbackEn || '').trim();
}

function hasCompleteChineseBody(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeWrappedJsonText(zh) || looksLikeTranslationRefusal(zh)) return false;
  if (looksLikeStructuredArticle(zh)) return false;
  if (/```json|^\s*["']?text["']?\s*:/im.test(zh)) return false;
  const en = stripMarkdown(fallbackEn || '');
  const zhText = stripMarkdown(zh);
  if (!zhText) return false;
  if (en && zhText === en) return false;
  if (en && zhText.length < Math.min(120, Math.floor(en.length * 0.45))) return false;
  const meaningfulLines = String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^([|:#>*`\-]|\d+\.)/.test(line))
    .filter((line) => !/^https?:\/\//i.test(line));
  const firstMeaningful = meaningfulLines.find((line) => line.length >= 12) || '';
  if (firstMeaningful && !looksChinese(firstMeaningful)) return false;
  const hanCount = (zhText.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (zhText.match(/[A-Za-z]/g) || []).length;
  if (hanCount < 20) return false;
  if (latinCount > 0 && hanCount < Math.max(20, Math.floor(latinCount * 0.45))) return false;
  return true;
}

function hasUsableChineseBody(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeWrappedJsonText(zh) || looksLikeTranslationRefusal(zh)) return false;
  if (looksLikeStructuredArticle(zh)) return false;
  const en = stripMarkdown(fallbackEn || '');
  const zhText = stripMarkdown(zh);
  if (!zhText) return false;
  if (en && zhText === en) return false;
  const hanCount = (zhText.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = (zhText.match(/[A-Za-z]/g) || []).length;
  if (hanCount < 40) return false;
  if (en && zhText.length < Math.min(80, Math.floor(en.length * 0.22))) return false;
  if (latinCount > 0 && hanCount < Math.max(40, Math.floor(latinCount * 0.3))) return false;
  return true;
}

function stripMarkdown(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[\*_~]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function prepareSourceMarkdown(text = '', titleEn = '') {
  const title = String(titleEn || '').trim();
  const lines = String(text || '')
    .split('\n')
    .map((line) => line.replace(/\r/g, ''));

  const cleaned = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!cleaned.length && title && line === title) continue;
    if (/^Author:\s+/i.test(line)) continue;
    if (/^Last updated:\s+/i.test(line)) continue;
    cleaned.push(rawLine);
  }

  return cleaned.join('\n').trim();
}

function countAsciiLetters(text = '') {
  const matches = String(text || '').match(/[A-Za-z]/g);
  return matches ? matches.length : 0;
}

function hasTooMuchResidualEnglish(text = '') {
  const ascii = countAsciiLetters(text);
  const han = countHanChars(text);
  return ascii > 120 && ascii > Math.max(80, han * 0.45);
}

function isMostlyEnglishLine(line = '') {
  const ascii = countAsciiLetters(line);
  const han = countHanChars(line);
  return ascii >= 6 && han === 0;
}

function trimTranslatedMarkdownNoise(markdown = '') {
  const lines = String(markdown || '').split('\n');
  const meaningful = lines.map((line) => line.trim());

  let start = 0;
  const firstChineseIndex = meaningful.findIndex((line) => countHanChars(line) >= 4);
  if (firstChineseIndex > 0) start = firstChineseIndex;

  const sliced = lines.slice(start);
  const cleaned = [];
  for (let i = 0; i < sliced.length; i += 1) {
    const line = sliced[i];
    const trimmed = line.trim();
    if (!trimmed) {
      cleaned.push(line);
      continue;
    }

    const lookahead = sliced.slice(i, i + 6).map((x) => x.trim()).filter(Boolean);
    const englishOnlyRun = lookahead.length >= 4 && lookahead.every((x) => isMostlyEnglishLine(x));
    if (cleaned.length >= 12 && englishOnlyRun) break;

    cleaned.push(line);
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function splitTextChunks(text, maxLen = 1300) {
  const parts = String(text || '').split('\n\n');
  const chunks = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (part.length <= maxLen) {
      current = part;
    } else {
      for (let i = 0; i < part.length; i += maxLen) {
        chunks.push(part.slice(i, i + maxLen));
      }
      current = '';
    }
  }

  if (current) chunks.push(current);
  return chunks.slice(0, 16);
}

function splitChunkForRetry(text = '') {
  const source = String(text || '').trim();
  if (!source) return [];
  const parts = source.split('\n\n');
  if (parts.length <= 1) {
    const mid = Math.floor(source.length / 2);
    return [source.slice(0, mid), source.slice(mid)].map((x) => x.trim()).filter(Boolean);
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  let acc = 0;
  let cut = 1;
  for (let i = 0; i < parts.length; i += 1) {
    acc += parts[i].length;
    if (acc >= total / 2) {
      cut = i + 1;
      break;
    }
  }
  return [
    parts.slice(0, cut).join('\n\n').trim(),
    parts.slice(cut).join('\n\n').trim(),
  ].filter(Boolean);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  const results = new Array(list.length);
  let cursor = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(list[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function detectTone(item) {
  const text = `${item.title_en || ''}\n${item.summary_en || ''}\n${item.content_en || ''}`.toLowerCase();
  const gossipKeys = [
    'rumor', 'drama', 'beef', 'leak', 'insider', 'controvers', 'flame', 'trash talk', 'gossip',
    '爆料', '争议', '开撕', '内讧', '绯闻',
  ];
  return gossipKeys.some((k) => text.includes(k)) ? 'gossip' : 'news';
}

function shortPrompt(text, tone, glossaryPrompt = '') {
  const style = tone === 'gossip'
    ? '语气偏电竞八卦，轻松有梗但克制，不夸张不造谣。'
    : '语气偏新闻快讯，客观、准确、简洁。';
  return [
    NEWS_TRANSLATION_GUIDANCE,
    '',
    glossaryPrompt,
    glossaryPrompt ? '' : '',
    '将下列英文内容翻译为简体中文。',
    style,
    '要求：保留战队名、选手ID、赛事名等专有名词原文；不要添加原文没有的信息；只输出译文。',
    text,
  ].join('\n');
}

function markdownPrompt(text, tone, glossaryPrompt = '') {
  const style = tone === 'gossip'
    ? '整体语气偏电竞八卦，轻松有梗但克制，不夸张不造谣。'
    : '整体语气偏新闻报道，客观、准确、简洁。';
  return [
    NEWS_TRANSLATION_GUIDANCE,
    '',
    glossaryPrompt,
    glossaryPrompt ? '' : '',
    '将下列 Dota2 新闻正文翻译为简体中文。',
    style,
    '要求：保留 markdown 链接、图片、列表、标题等语法；保留专有名词原文；保持段落结构；不要额外解释。',
    text,
  ].join('\n');
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function callModelJson(prompt, schema, timeoutMs = CODEX_TIMEOUT_MS) {
  if (USE_OPENROUTER) {
    return callLlmJson(prompt, schema, { model: MODEL, timeoutMs: Math.max(timeoutMs, OPENROUTER_TIMEOUT_MS) });
  }
  return callCodex(prompt, schema, timeoutMs);
}

function callModelText(prompt, timeoutMs = CODEX_TIMEOUT_MS) {
  if (USE_OPENROUTER) {
    return callLlmText(prompt, { model: MODEL, timeoutMs: Math.max(timeoutMs, OPENROUTER_TIMEOUT_MS) });
  }
  return callCodexText(prompt, timeoutMs);
}

async function callModelStructuredText(prompt, timeoutMs = CODEX_TIMEOUT_MS) {
  if (USE_OPENROUTER) {
    const out = unwrapModelText(await callModelText(prompt, timeoutMs));
    if (!out) throw new Error('model returned empty text');
    return out;
  }
  const payload = await callModelJson(prompt, {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
    additionalProperties: false,
  }, timeoutMs);
  const out = unwrapModelText(payload?.text || '');
  if (!out) throw new Error('model returned empty text');
  return out;
}

function callCodex(prompt, schema, timeoutMs = CODEX_TIMEOUT_MS) {
  const tempBase = path.join(os.tmpdir(), `d2hub-translate-codex-${process.pid}-${Date.now()}`);
  const schemaPath = `${tempBase}.schema.json`;
  const outputPath = `${tempBase}.out.json`;

  fs.writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  const argv = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--sandbox',
    'read-only',
    '--output-schema',
    schemaPath,
    '-o',
    outputPath,
  ];
  if (MODEL) argv.push('-m', MODEL);
  argv.push('-');

  const result = spawnSync(CODEX_BIN, argv, {
    cwd: process.cwd(),
    env: process.env,
    input: prompt,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 8,
  });

  const stderr = String(result.stderr || '').trim();
  const stdout = String(result.stdout || '').trim();
  let output = '';
  try {
    output = fs.readFileSync(outputPath, 'utf8').trim();
  } catch {}
  safeUnlink(schemaPath);
  safeUnlink(outputPath);

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(stderr || stdout || `codex exited with status ${result.status}`);
  if (!output) throw new Error(stderr || 'codex returned empty output');

  return JSON.parse(output);
}

function callCodexText(prompt, timeoutMs = CODEX_TIMEOUT_MS) {
  const payload = callCodex(prompt, {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
    required: ['text'],
    additionalProperties: false,
  }, timeoutMs);
  const out = String(payload?.text || '').trim();
  if (!out) throw new Error('codex returned empty text');
  return out;
}

async function translateTitle(row, tone) {
  if (!row?.title_en || looksChinese(row.title_en)) return row?.title_en || null;
  const glossaryPrompt = glossaryPromptForSource(row);
  try {
    let out = await callModelStructuredText([
      shortPrompt(`${row.title_en}\n${row.summary_en || ''}`, tone, glossaryPrompt),
      '',
      '只返回最终中文标题内容；不要再包 JSON、不要代码块、不要 text 字段标签。',
    ].join('\n'), 18000);
    out = String(out || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
    out = out.replace(/^#+\s*/, '').trim();
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callModelStructuredText([
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '把下面英文 Dota2 新闻标题改写成一个中文社区传播标题。',
        '要求：必须输出简体中文；保留专有名词原文；不能输出英文整句；不能输出标题/正文/总结标签；只输出一行标题。',
        row.title_en,
      ].join('\n'), 15000);
      out = String(out || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
      out = out.replace(/^#+\s*/, '').trim();
    }
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callModelStructuredText([
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '将下面英文 Dota2 新闻标题直接翻译为简体中文标题。',
        '要求：必须输出中文；保留专有名词原文；只输出一行标题；不要解释。',
        row.title_en,
      ].join('\n'), 15000);
      out = String(out || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
      out = out.replace(/^#+\s*/, '').trim();
    }
    return out;
  } catch {
    return row.title_en;
  }
}

async function translateSummary(row) {
  const seed = row?.summary_en || row?.content_en || row?.content_markdown_en || row?.title_en;
  if (!seed || looksChinese(seed)) return row?.summary_en || seed || null;
  const glossaryPrompt = glossaryPromptForSource(row);
  try {
    let out = await callModelStructuredText([
      NEWS_TRANSLATION_GUIDANCE,
      '',
      glossaryPrompt,
      glossaryPrompt ? '' : '',
      '请基于下面英文 Dota2 新闻信息，写一句简短点评/总结。',
      '要求：',
      '- 20 到 50 字',
      '- 口语化，但不要乱玩梗',
      '- 只输出一句中文，不要标题，不要正文，不要解释',
      '- 不要再包 JSON、不要代码块、不要 text 字段标签',
      '',
      `英文标题：${row.title_en || ''}`,
      row.summary_en ? `英文摘要：${row.summary_en}` : '',
      row.content_en ? `英文正文：${String(row.content_en).slice(0, 1600)}` : '',
    ].join('\n'), 18000);
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callModelStructuredText([
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '基于下面英文 Dota2 新闻信息，写一句中文总结。',
        '要求：必须输出简体中文；20到50字；不能道歉；不能要求补充材料；不能输出标题/正文/总结标签；只输出一句话。',
        `标题：${row.title_en || ''}`,
        row.summary_en ? `摘要：${row.summary_en}` : '',
        row.content_en ? `正文：${String(row.content_en).slice(0, 1200)}` : '',
      ].join('\n'), 15000);
    }
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callModelStructuredText([
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '把下面英文 Dota2 新闻摘要翻译并压缩成一句简体中文总结。',
        '要求：必须输出中文；20到50字；只输出一句话；不要解释。',
        `标题：${row.title_en || ''}`,
        row.summary_en ? `摘要：${row.summary_en}` : '',
        row.content_en ? `正文：${String(row.content_en).slice(0, 1200)}` : '',
      ].join('\n'), 15000);
    }
    return out;
  } catch {
    return row.summary_en || row.title_en || null;
  }
}

async function translateMarkdown(text, tone, glossaryPrompt = '') {
  if (!text || looksChinese(text)) return text || null;
  const chunks = splitTextChunks(text, CHUNK_MAX);
  async function translateChunk(chunk, depth = 0, chunkIndex = 0, chunkTotal = 1) {
    try {
      let translated = await callModelStructuredText([
        markdownPrompt(chunk, tone, glossaryPrompt),
        '',
        `你收到的是一篇长文章中的第 ${chunkIndex + 1}/${chunkTotal} 段正文，不是完整文章。`,
        '不要为这一段单独生成标题、摘要、总结、点评或话题。',
        '只返回最终中文 markdown 正文；不要再包 JSON、不要代码块、不要 text 字段标签。',
        '不要输出“标题：”“正文：”“总结：”“点评：”“话题：”“topics：”等字段标签。',
      ].join('\n'), 32000);
      translated = sanitizeTranslatedChunkMarkdown(translated, chunk);
      if (!looksChinese(translated) || looksLikeTranslationRefusal(translated)) {
        translated = await callModelStructuredText([
          NEWS_TRANSLATION_GUIDANCE,
          '',
          glossaryPrompt,
          glossaryPrompt ? '' : '',
          `下面内容只是长文章中的第 ${chunkIndex + 1}/${chunkTotal} 段正文。`,
          '把下面英文 Dota2 新闻正文翻译成简体中文社区搬运帖风格。',
          '要求：必须输出中文正文；保留 markdown 结构；保留专有名词原文；不要道歉；不要要求补充材料；不要输出标题/正文/总结/点评/话题标签；不要为分段单独起标题。',
          chunk,
        ].join('\n'), 28000);
        translated = sanitizeTranslatedChunkMarkdown(translated, chunk);
      }
      if (!looksChinese(translated) || looksLikeTranslationRefusal(translated)) {
        translated = await callModelStructuredText([
          NEWS_TRANSLATION_GUIDANCE,
          '',
          glossaryPrompt,
          glossaryPrompt ? '' : '',
          `下面内容只是长文章中的第 ${chunkIndex + 1}/${chunkTotal} 段正文。`,
          '将下面英文 Dota2 新闻正文完整翻译为简体中文。',
          '要求：必须输出中文正文；保留 markdown 结构；保留专有名词原文；不要解释；不要输出标题/正文/总结/点评/话题标签；不要为分段单独起标题。',
          chunk,
        ].join('\n'), 28000);
        translated = sanitizeTranslatedChunkMarkdown(translated, chunk);
      }
      if (hasTooMuchResidualEnglish(translated)) {
        translated = await callModelStructuredText([
          NEWS_TRANSLATION_GUIDANCE,
          '',
          glossaryPrompt,
          glossaryPrompt ? '' : '',
          '下面是一段已经初译过、但仍残留较多英文的 Dota2 新闻 markdown，请做二次清洗。',
          '要求：',
          '- 只保留战队名、选手ID、赛事名、英雄名、物品名、技能名等专有名词原文',
          '- 其余说明性英文、栏目名、表头、日期标签、赛制说明都改成简体中文',
          '- 保留 markdown 结构、表格、列表',
          '- 不要输出 JSON，不要解释，不要新增原文没有的信息',
          '',
          '英文原文：',
          chunk,
          '',
          '待清洗稿：',
          translated,
        ].join('\n'), 32000);
        translated = sanitizeTranslatedChunkMarkdown(translated, chunk);
      }
      if (hasCompleteChineseBody(translated, chunk) || hasUsableChineseBody(translated, chunk)) {
        return translated;
      }
    } catch {}

    if (depth >= 2 || chunk.length < 700) return null;
    const subchunks = splitChunkForRetry(chunk);
    if (subchunks.length < 2) return null;
    const translatedSubs = [];
    for (let i = 0; i < subchunks.length; i += 1) {
      const subchunk = subchunks[i];
      const sub = await translateChunk(subchunk, depth + 1, i, subchunks.length);
      if (!sub) return null;
      translatedSubs.push(sub);
    }
    const merged = translatedSubs.join('\n\n');
    return (hasCompleteChineseBody(merged, chunk) || hasUsableChineseBody(merged, chunk)) ? merged : null;
  }

  const out = await mapWithConcurrency(
    chunks,
    USE_OPENROUTER ? 1 : 2,
    async (chunk, index) => translateChunk(chunk, 0, index, chunks.length)
  );
  if (out.some((chunk) => !chunk)) return null;
  return trimTranslatedMarkdownNoise(out.join('\n\n'));
}

async function translatePlainBodyFallback(text, tone, glossaryPrompt = '') {
  const source = String(text || '').trim();
  if (!source || looksChinese(source)) return source || null;
  async function translateBlock(block) {
    try {
      let out = await callModelStructuredText([
        NEWS_TRANSLATION_GUIDANCE,
        '',
        glossaryPrompt,
        glossaryPrompt ? '' : '',
        '下面是一段 Dota2 新闻正文。',
        tone === 'gossip'
          ? '请用自然的中文论坛转述口吻翻译，保留专有名词原文。'
          : '请用自然的中文新闻转述口吻翻译，保留专有名词原文。',
        '如果 markdown 结构不好保留，可以退化成普通中文段落。',
        '只输出中文正文，不要标题，不要摘要，不要点评，不要 JSON，不要解释。',
        '',
        block,
      ].join('\n'), 32000);
      out = String(out || '').trim();
      return (hasUsableChineseBody(out, block) || hasCompleteChineseBody(out, block)) ? out : null;
    } catch {
      return null;
    }
  }

  const whole = await translateBlock(source);
  if (whole) return whole;

  const chunks = splitTextChunks(source, Math.max(CHUNK_MAX, 900));
  const translated = [];
  for (const chunk of chunks) {
    const out = await translateBlock(chunk);
    if (!out) return null;
    translated.push(out);
  }

  const merged = translated.join('\n\n').trim();
  return (hasCompleteChineseBody(merged, source) || hasUsableChineseBody(merged, source)) ? merged : null;
}

async function loadPending(limit, force = false) {
  if (TARGET_IDS.length) {
    return withDbRetry(() => sql`
      SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh, translation_status, translation_provider
      FROM news_articles
      WHERE id = ANY(${TARGET_IDS})
      ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
      LIMIT ${limit}
    `, 'loadPending(targetIds)');
  }

  if (force) {
    return withDbRetry(() => sql`
      SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh, translation_status, translation_provider
      FROM news_articles
      WHERE (
        COALESCE(title_en, '') <> ''
        OR COALESCE(summary_en, '') <> ''
        OR COALESCE(content_en, '') <> ''
        OR COALESCE(content_markdown_en, '') <> ''
      )
      AND published_at >= ${RECENT_CUTOFF_SECONDS}
      ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
      LIMIT ${limit}
    `, 'loadPending(force)');
  }

  return withDbRetry(() => sql`
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh, translation_status, translation_provider
    FROM news_articles
    WHERE (
      COALESCE(title_en, '') <> ''
      OR COALESCE(summary_en, '') <> ''
      OR COALESCE(content_en, '') <> ''
      OR COALESCE(content_markdown_en, '') <> ''
    )
    AND published_at >= ${RECENT_CUTOFF_SECONDS}
    AND (
      COALESCE(translation_status, ${TRANSLATION_STATUS_PENDING}) <> ${TRANSLATION_STATUS_COMPLETED}
      OR COALESCE(title_zh, '') = ''
      OR COALESCE(summary_zh, '') = ''
      OR COALESCE(content_zh, '') = ''
      OR COALESCE(content_markdown_zh, '') = ''
    )
    ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${limit}
  `, 'loadPending');
}

async function loadForceRows(limit) {
  if (TARGET_IDS.length) {
    return withDbRetry(() => sql`
      SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh, translation_status, translation_provider
      FROM news_articles
      WHERE id = ANY(${TARGET_IDS})
      ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
      LIMIT ${limit}
    `, 'loadForceRows(targetIds)');
  }

  return withDbRetry(() => sql`
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh, translation_status, translation_provider
    FROM news_articles
    WHERE (
      COALESCE(title_en, '') <> ''
      OR COALESCE(summary_en, '') <> ''
      OR COALESCE(content_en, '') <> ''
      OR COALESCE(content_markdown_en, '') <> ''
    )
    AND published_at >= ${RECENT_CUTOFF_SECONDS}
    ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${limit}
  `, 'loadForceRows');
}

function buildRowUpdateMeta(row, zh) {
  const sourceBody = row.content_markdown_en || row.content_en || '';
  const existingTitle = hasChineseTitle(row.title_zh, row.title_en) ? row.title_zh : null;
  const existingSummary = hasChineseSummary(row.summary_zh, row.summary_en) ? row.summary_zh : null;
  const existingBodyMarkdown = (hasCompleteChineseBody(row.content_markdown_zh || row.content_zh || '', sourceBody)
    || hasUsableChineseBody(row.content_markdown_zh || row.content_zh || '', sourceBody))
    ? (row.content_markdown_zh || row.content_zh || null)
    : null;
  const existingBody = existingBodyMarkdown
    ? ((hasCompleteChineseBody(row.content_zh || '', sourceBody) || hasUsableChineseBody(row.content_zh || '', sourceBody)) ? row.content_zh : stripMarkdown(existingBodyMarkdown))
    : null;
  const titleDone = row.title_en ? hasChineseTitle(zh.title_zh, row.title_en) : true;
  const summaryDone = row.summary_en ? hasChineseSummary(zh.summary_zh, row.summary_en) : true;
  const bodyDone = sourceBody
    ? (hasCompleteChineseBody(zh.content_markdown_zh || zh.content_zh || '', sourceBody)
      || hasUsableChineseBody(zh.content_markdown_zh || zh.content_zh || '', sourceBody))
    : true;
  const anyDone = titleDone || summaryDone || bodyDone;
  const status = titleDone && summaryDone && bodyDone
    ? TRANSLATION_STATUS_COMPLETED
    : anyDone
      ? TRANSLATION_STATUS_PARTIAL
      : TRANSLATION_STATUS_PENDING;

  return {
    titleDone,
    summaryDone,
    bodyDone,
    anyDone,
    status,
    titleZh: titleDone ? zh.title_zh || null : existingTitle,
    summaryZh: summaryDone ? zh.summary_zh || null : existingSummary,
    contentMarkdownZh: bodyDone ? zh.content_markdown_zh || null : existingBodyMarkdown,
    contentZh: bodyDone ? zh.content_zh || null : existingBody,
  };
}

async function updateRow(row, zh) {
  const meta = buildRowUpdateMeta(row, zh);

  await withDbRetry(() => sql`
    UPDATE news_articles
    SET
      title_zh = ${meta.titleZh},
      summary_zh = ${meta.summaryZh},
      content_markdown_zh = ${meta.contentMarkdownZh},
      content_zh = ${meta.contentZh},
      translation_status = ${meta.status},
      translation_provider = ${meta.anyDone ? TRANSLATION_PROVIDER : null},
      title_zh_provider = ${meta.titleDone ? TRANSLATION_PROVIDER : null},
      summary_zh_provider = ${meta.summaryDone ? TRANSLATION_PROVIDER : null},
      content_zh_provider = ${meta.bodyDone ? TRANSLATION_PROVIDER : null},
      translated_at = ${meta.anyDone ? new Date().toISOString() : null},
      updated_at = NOW()
    WHERE id = ${row.id}
  `, `updateRow:${row.id}`);

  return meta;
}

async function translateOne(row, force = false) {
  const tone = detectTone(row);
  const glossaryPrompt = glossaryPromptForSource(row);
  const keepTitle = !force && hasChineseTitle(row.title_zh, row.title_en);
  const keepSummary = !force && (!row.summary_en || hasChineseSummary(row.summary_zh, row.summary_en));
  const keepBody = !force && (
    hasCompleteChineseBody(row.content_markdown_zh || row.content_zh || '', row.content_markdown_en || row.content_en || '')
    || hasUsableChineseBody(row.content_markdown_zh || row.content_zh || '', row.content_markdown_en || row.content_en || '')
  );
  const preparedMarkdown = prepareSourceMarkdown(row.content_markdown_en || row.content_en || '', row.title_en || '');
  const gemmaTranslationTriggered = AUTO_POST_REQUIRES_GEMMA4 && Boolean(
    (!keepTitle && row.title_en)
      || (!keepSummary && (row.summary_en || row.content_en || row.content_markdown_en || row.title_en))
      || (!keepBody && preparedMarkdown)
  );

  const [title_zh, summary_zh, content_markdown_zh] = await Promise.all([
    keepTitle ? Promise.resolve(row.title_zh) : translateTitle(row, tone),
    keepSummary ? Promise.resolve(row.summary_zh) : translateSummary(row),
    force
      ? translateMarkdown(preparedMarkdown, tone, glossaryPrompt)
      : (keepBody ? Promise.resolve(row.content_markdown_zh) : translateMarkdown(preparedMarkdown, tone, glossaryPrompt)),
  ]);
  const content_zh = content_markdown_zh ? stripMarkdown(content_markdown_zh) : (row.content_en || null);

  let meta = await updateRow(row, { title_zh, summary_zh, content_markdown_zh, content_zh });
  const shouldRetryMissingBody =
    !force &&
    !meta.bodyDone &&
    Boolean(preparedMarkdown) &&
    !keepBody;

  if (shouldRetryMissingBody) {
    console.warn(`[translate] body retry for ${row.id} after incomplete first pass`);
    await sleep(300);
    let retriedBodyMarkdown = await translateMarkdown(preparedMarkdown, tone, glossaryPrompt).catch(() => null);
    const hasRetriedBody = retriedBodyMarkdown && (
      hasCompleteChineseBody(retriedBodyMarkdown, preparedMarkdown)
      || hasUsableChineseBody(retriedBodyMarkdown, preparedMarkdown)
    );
    if (!hasRetriedBody) {
      retriedBodyMarkdown = await translatePlainBodyFallback(preparedMarkdown, tone, glossaryPrompt).catch(() => null);
    }
    const retriedBodyText = retriedBodyMarkdown ? stripMarkdown(retriedBodyMarkdown) : (row.content_en || null);
    meta = await updateRow(row, {
      title_zh: meta.titleZh || title_zh,
      summary_zh: meta.summaryZh || summary_zh,
      content_markdown_zh: retriedBodyMarkdown,
      content_zh: retriedBodyText,
    });
  }

  if (!meta.anyDone) {
    console.warn(`[translate] no progress for ${row.id}; title=${row.title_en || ''}`);
  }

  maybeAutoPostXhs(row, {
    translationCompleted: meta.status === TRANSLATION_STATUS_COMPLETED,
    gemmaTranslationTriggered,
  });

  return meta;
}

async function main() {
  let done = 0;
  const processedIds = new Set();

  if (FORCE) {
    const rows = await loadForceRows(TOTAL_LIMIT);
    for (const row of rows) {
      console.log(`[translate] start ${done + 1}/${rows.length} id=${row.id}`);
      const meta = await translateOne(row, true);
      done += 1;
      console.log(`translated ${done}/${rows.length} id=${row.id} status=${meta.status}`);
    }

    const left = await withDbRetry(() => sql`
      SELECT COUNT(*)::int AS c
      FROM news_articles
      WHERE (
        COALESCE(title_en, '') <> ''
        OR COALESCE(summary_en, '') <> ''
        OR COALESCE(content_en, '') <> ''
        OR COALESCE(content_markdown_en, '') <> ''
      )
      AND published_at >= ${RECENT_CUTOFF_SECONDS}
    `, 'countForceRows');
    console.log(JSON.stringify({ translated: done, target: rows.length, total_with_en: left?.[0]?.c ?? null }, null, 2));
    return;
  }

  while (done < TOTAL_LIMIT) {
    const need = Math.min(BATCH_SIZE, TOTAL_LIMIT - done);
    const rows = (await loadPending(Math.max(need * 2, need), FORCE))
      .filter((row) => !processedIds.has(row.id))
      .slice(0, need);
    if (!rows.length) break;

    for (const row of rows) {
      console.log(`[translate] start ${done + 1}/${TOTAL_LIMIT} id=${row.id}`);
      const meta = await translateOne(row, FORCE);
      processedIds.add(row.id);
      done += 1;
      console.log(`translated ${done}/${TOTAL_LIMIT} id=${row.id} status=${meta.status}`);
      if (done >= TOTAL_LIMIT) break;
    }
  }

  const left = await withDbRetry(() => sql`
    SELECT COUNT(*)::int AS c
    FROM news_articles
    WHERE (
      COALESCE(title_en, '') <> ''
      OR COALESCE(summary_en, '') <> ''
      OR COALESCE(content_en, '') <> ''
      OR COALESCE(content_markdown_en, '') <> ''
    )
    AND published_at >= ${RECENT_CUTOFF_SECONDS}
    AND (
      COALESCE(title_zh, '') = ''
      OR COALESCE(summary_zh, '') = ''
      OR COALESCE(content_zh, '') = ''
      OR COALESCE(content_markdown_zh, '') = ''
    )
  `, 'countRemainingRows');

  console.log(JSON.stringify({ translated: done, remaining: left?.[0]?.c ?? null }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
