import { neon } from '@neondatabase/serverless';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.vercel'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const TRANSLATION_PROVIDER = 'codex';
const TRANSLATION_STATUS_PENDING = 'pending';
const TRANSLATION_STATUS_PARTIAL = 'partial';
const TRANSLATION_STATUS_COMPLETED = 'completed';
const NEWS_TRANSLATION_GUIDANCE = [
  '你现在是一个 Dota2 中文社区内容编辑，擅长把英文电竞新闻改写成中文论坛搬运帖风格。',
  '',
  '你的写作风格：',
  '- 像资深 Dota2 观众在复述消息',
  '- 轻松、自然、口语化',
  '- 不要官方通稿腔，不要逐字直译',
  '- 可以有一点互联网感，但不要乱玩梗',
  '- 重点突出比赛结果、队伍状态、选手发言和观众最关心的信息',
  '- 所有事实必须忠于原文，不能脑补',
  '',
  '每次我给你英文新闻时，请输出：',
  '1. 一个适合中文社区传播的标题',
  '2. 一段自然流畅的正文',
  '3. 一句简短点评/总结',
].join('\n');

if (!DB_URL) {
  console.error('Missing DATABASE_URL/POSTGRES_URL');
  process.exit(1);
}
if (spawnSync('codex', ['--version'], { encoding: 'utf8' }).status !== 0) {
  console.error('Missing codex CLI');
  process.exit(1);
}

const sql = neon(DB_URL);
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
};

const TOTAL_LIMIT = Math.max(1, Number(arg('limit', '120')) || 120);
const BATCH_SIZE = Math.max(1, Math.min(30, Number(arg('batch', '12')) || 12));
const CHUNK_MAX = Math.max(800, Number(arg('chunkMax', '1300')) || 1300);
const RECENT_DAYS = Math.max(1, Number(arg('recentDays', '3')) || 3);
const CODEX_MODEL = String(arg('codexModel', process.env.NEWS_TRANSLATE_CODEX_MODEL || 'gpt-5.1-codex-mini')).trim();
const FORCE = ['1', 'true', 'yes', 'on'].includes(String(arg('force', 'false')).toLowerCase());
const XHS_AUTO_POST = ['1', 'true', 'yes', 'on'].includes(String(process.env.XHS_AUTO_POST || '').toLowerCase());
const RECENT_CUTOFF_SECONDS = Math.floor(Date.now() / 1000) - (RECENT_DAYS * 86400);

function maybeAutoPostXhs(row) {
  if (!XHS_AUTO_POST || !row?.id) return;
  const scriptPath = fileURLToPath(new URL('./post-news-to-xhs.mjs', import.meta.url));
  const preset = process.env.XHS_POST_PRESET || 'concise-news';
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--id', String(row.id), '--preset', preset],
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

function looksChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function looksLikeTranslationRefusal(text = '') {
  return /抱歉|请提供|请把完整|无法保证|没有看到正文|只看到了标题|not enough|provide the full/i.test(String(text));
}

function looksLikeStructuredArticle(text = '') {
  return /标题[:：]|正文[:：]|总结[:：]|点评[:：]/.test(String(text));
}

function hasChineseTitle(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeStructuredArticle(zh) || looksLikeTranslationRefusal(zh)) return false;
  return !fallbackEn || zh !== String(fallbackEn || '').trim();
}

function hasChineseSummary(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeStructuredArticle(zh) || looksLikeTranslationRefusal(zh)) return false;
  return !fallbackEn || zh !== String(fallbackEn || '').trim();
}

function hasCompleteChineseBody(value = '', fallbackEn = '') {
  const zh = String(value || '').trim();
  if (!zh || !looksChinese(zh) || looksLikeTranslationRefusal(zh)) return false;
  const en = stripMarkdown(fallbackEn || '');
  const zhText = stripMarkdown(zh);
  if (!zhText) return false;
  if (en && zhText === en) return false;
  if (en && zhText.length < Math.min(120, Math.floor(en.length * 0.45))) return false;
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

function detectTone(item) {
  const text = `${item.title_en || ''}\n${item.summary_en || ''}\n${item.content_en || ''}`.toLowerCase();
  const gossipKeys = [
    'rumor', 'drama', 'beef', 'leak', 'insider', 'controvers', 'flame', 'trash talk', 'gossip',
    '爆料', '争议', '开撕', '内讧', '绯闻',
  ];
  return gossipKeys.some((k) => text.includes(k)) ? 'gossip' : 'news';
}

function buildCodexPrompt(row, tone) {
  const style = tone === 'gossip'
    ? '整体语气偏电竞八卦，轻松有梗但克制，不夸张不造谣。'
    : '整体语气偏新闻快讯，客观、准确、简洁。';
  const body = String(row.content_markdown_en || row.content_en || '').slice(0, 12000);
  return [
    NEWS_TRANSLATION_GUIDANCE,
    '',
    '请把下面英文 Dota2 新闻改写成中文社区搬运帖。',
    style,
    '输出必须满足这个 JSON 结构：{"title_zh":"...","summary_zh":"...","content_markdown_zh":"..."}',
    '要求：',
    '- 只输出合法 JSON，不要 markdown code fence，不要解释',
    '- title_zh 是一行中文标题',
    '- summary_zh 是一句 20 到 50 字的中文总结',
    '- content_markdown_zh 是完整中文正文，尽量保留原 markdown 结构',
    '- 保留战队名、选手ID、赛事名等专有名词原文',
    '- 所有事实忠于原文，不要脑补',
    '',
    `英文标题：${row.title_en || ''}`,
    row.summary_en ? `英文摘要：${row.summary_en}` : '',
    body ? `英文正文Markdown：\n${body}` : '',
  ].filter(Boolean).join('\n');
}

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeCodexJson(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    title_zh: typeof raw.title_zh === 'string' ? raw.title_zh.trim() : '',
    summary_zh: typeof raw.summary_zh === 'string' ? raw.summary_zh.trim() : '',
    content_markdown_zh: typeof raw.content_markdown_zh === 'string' ? raw.content_markdown_zh.trim() : '',
  };
}

function translateWithCodex(row, tone) {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'd2hub-codex-translate-'));
  const schemaPath = path.join(tmpDir, 'schema.json');
  const outputPath = path.join(tmpDir, 'output.json');
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['title_zh', 'summary_zh', 'content_markdown_zh'],
    properties: {
      title_zh: { type: 'string' },
      summary_zh: { type: 'string' },
      content_markdown_zh: { type: 'string' },
    },
  };

  writeFileSync(schemaPath, JSON.stringify(schema), 'utf8');
  const result = spawnSync(
    'codex',
    [
      'exec',
      '--skip-git-repo-check',
      '-C',
      process.cwd(),
      '--model',
      CODEX_MODEL,
      '--output-schema',
      schemaPath,
      '-o',
      outputPath,
      '-',
    ],
    {
      input: buildCodexPrompt(row, tone),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 16,
      timeout: 300000,
    }
  );

  const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });
  try {
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || 'codex exec failed').trim());
    }
    const parsed = normalizeCodexJson(readJsonFileSafe(outputPath));
    if (!parsed) throw new Error('codex output was not valid JSON');
    return parsed;
  } finally {
    cleanup();
  }
}

async function loadPending(limit, force = false) {
  if (force) {
    return sql`
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
    `;
  }

  return sql`
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
      OR
      COALESCE(title_zh, '') = ''
      OR COALESCE(summary_zh, '') = ''
      OR COALESCE(content_zh, '') = ''
      OR COALESCE(content_markdown_zh, '') = ''
    )
    ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function loadForceRows(limit) {
  return sql`
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
  `;
}

async function updateRow(row, zh) {
  const sourceBody = row.content_markdown_en || row.content_en || '';
  const titleDone = row.title_en ? hasChineseTitle(zh.title_zh, row.title_en) : true;
  const summaryDone = row.summary_en ? hasChineseSummary(zh.summary_zh, row.summary_en) : true;
  const bodyDone = sourceBody ? hasCompleteChineseBody(zh.content_markdown_zh || zh.content_zh || '', sourceBody) : true;
  const anyDone = titleDone || summaryDone || bodyDone;
  const status = titleDone && summaryDone && bodyDone
    ? TRANSLATION_STATUS_COMPLETED
    : anyDone
      ? TRANSLATION_STATUS_PARTIAL
      : TRANSLATION_STATUS_PENDING;

  await sql`
    UPDATE news_articles
    SET
      title_zh = ${titleDone ? zh.title_zh || null : null},
      summary_zh = ${summaryDone ? zh.summary_zh || null : null},
      content_markdown_zh = ${bodyDone ? zh.content_markdown_zh || null : null},
      content_zh = ${bodyDone ? zh.content_zh || null : null},
      translation_status = ${status},
      translation_provider = ${anyDone ? TRANSLATION_PROVIDER : null},
      title_zh_provider = ${titleDone ? TRANSLATION_PROVIDER : null},
      summary_zh_provider = ${summaryDone ? TRANSLATION_PROVIDER : null},
      content_zh_provider = ${bodyDone ? TRANSLATION_PROVIDER : null},
      translated_at = ${anyDone ? new Date().toISOString() : null},
      updated_at = NOW()
    WHERE id = ${row.id}
  `;

  return { status, titleDone, summaryDone, bodyDone, anyDone };
}

async function translateOne(row, force = false) {
  const tone = detectTone(row);
  const keepTitle = !force && hasChineseTitle(row.title_zh, row.title_en);
  const keepSummary = !force && (!row.summary_en || hasChineseSummary(row.summary_zh, row.summary_en));
  const keepBody = !force && hasCompleteChineseBody(row.content_markdown_zh || row.content_zh || '', row.content_markdown_en || row.content_en || '');
  let translated = null;
  if (!(keepTitle && keepSummary && keepBody)) {
    try {
      translated = translateWithCodex(row, tone);
    } catch (error) {
      console.warn(`[codex] translate failed for ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const title_zh = keepTitle ? row.title_zh : (translated?.title_zh || null);
  const summary_zh = keepSummary ? row.summary_zh : (translated?.summary_zh || null);
  const content_markdown_zh = keepBody ? row.content_markdown_zh : (translated?.content_markdown_zh || null);
  const content_zh = content_markdown_zh ? stripMarkdown(content_markdown_zh) : null;

  const result = await updateRow(row, { title_zh, summary_zh, content_markdown_zh, content_zh });
  maybeAutoPostXhs(row);
  return result;
}

async function main() {
  let done = 0;

  if (FORCE) {
    const rows = await loadForceRows(TOTAL_LIMIT);
    for (const row of rows) {
      const result = await translateOne(row, true);
      done += 1;
      console.log(
        `processed ${done}/${rows.length} id=${row.id} status=${result.status} title=${result.titleDone ? 1 : 0} summary=${result.summaryDone ? 1 : 0} body=${result.bodyDone ? 1 : 0}`
      );
    }

    const left = await sql`
      SELECT COUNT(*)::int AS c
      FROM news_articles
      WHERE (
        COALESCE(title_en, '') <> ''
        OR COALESCE(summary_en, '') <> ''
        OR COALESCE(content_en, '') <> ''
        OR COALESCE(content_markdown_en, '') <> ''
      )
      AND published_at >= ${RECENT_CUTOFF_SECONDS}
    `;
    console.log(JSON.stringify({ translated: done, target: rows.length, total_with_en: left?.[0]?.c ?? null }, null, 2));
    return;
  }

  while (done < TOTAL_LIMIT) {
    const need = Math.min(BATCH_SIZE, TOTAL_LIMIT - done);
    const rows = await loadPending(need, FORCE);
    if (!rows.length) break;

    for (const row of rows) {
      const result = await translateOne(row, FORCE);
      done += 1;
      console.log(
        `processed ${done}/${TOTAL_LIMIT} id=${row.id} status=${result.status} title=${result.titleDone ? 1 : 0} summary=${result.summaryDone ? 1 : 0} body=${result.bodyDone ? 1 : 0}`
      );
      if (done >= TOTAL_LIMIT) break;
    }
  }

  const left = await sql`
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
  `;

  console.log(JSON.stringify({ translated: done, remaining: left?.[0]?.c ?? null }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
