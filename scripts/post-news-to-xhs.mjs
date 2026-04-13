import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';
import { buildTranslationGlossaryPrompt } from '../lib/translation-glossary.js';
import { callLlmJson } from '../lib/openrouter.mjs';
import { hasCompleteTranslatedNewsRow } from '../lib/news-posting-guards.js';
import {
  buildArticleDrivenBody,
  buildArticleDrivenTitle,
  clipText,
  normalizeWhitespace,
  sanitizeArticleBody,
  stripMarkdown,
  truncateTitle,
  inferTopic,
} from '../lib/xhs-news-draft.js';

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
if (!DB_URL) {
  console.error('Missing DATABASE_URL/POSTGRES_URL');
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name, fallback = null) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1) return fallback;
  if (idx === args.length - 1) return fallback;
  return args[idx + 1];
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}
function getArgs(name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === `--${name}` && i < args.length - 1) values.push(args[i + 1]);
  }
  return values;
}

const LIMIT = Math.max(1, Number(getArg('limit', '10')) || 10);
const DRY_RUN = hasFlag('dry-run');
const FORCE = hasFlag('force');
const IDS = getArgs('id');
const STATE_FILE = getArg('state-file', path.join(os.homedir(), '.dota2-hub', 'xhs-posted-news.json'));
const PREFERRED_XHS_CLI = getArg('xhs-cli', process.env.XHS_REVERSE_CLI || '');
const TEMP_PREFIX = path.join(os.tmpdir(), 'dota2hub-xhs-');
const CUSTOM_TITLE = getArg('custom-title', null);
const CUSTOM_BODY = getArg('custom-body', null);
const CUSTOM_TITLE_FILE = getArg('title-file', null);
const CUSTOM_BODY_FILE = getArg('body-file', null);
const CUSTOM_TOPIC = getArg('topic', null);
const PRESET = getArg('preset', process.env.XHS_POST_PRESET || 'default');
const AI_REWRITE = !['0', 'false', 'no', 'off'].includes(String(getArg('ai-rewrite', process.env.XHS_AI_REWRITE || 'true')).toLowerCase());
const REWRITE_MODEL = getArg('rewrite-model', process.env.XHS_REWRITE_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash');
const REWRITE_TIMEOUT_MS = Math.max(5000, Number(getArg('ai-timeout-ms', process.env.XHS_REWRITE_TIMEOUT_MS || '60000')) || 60000);
const XHS_POST_TIMEOUT_MS = Math.max(10000, Number(getArg('post-timeout-ms', process.env.XHS_POST_TIMEOUT_MS || '180000')) || 180000);
const LOCK_STALE_MS = Math.max(60000, Number(getArg('lock-stale-ms', process.env.XHS_POST_LOCK_STALE_MS || '900000')) || 900000);
const LOCK_FILE = getArg('lock-file', process.env.XHS_POST_LOCK_FILE || path.join(os.homedir(), '.dota2-hub', 'xhs-post.lock'));
const WECHAT_AUTO_DRAFT = !['0', 'false', 'no', 'off'].includes(String(getArg('wechat-auto-draft', process.env.WECHAT_AUTO_DRAFT || 'true')).toLowerCase());
const REQUIRE_COMPLETE_TRANSLATION = hasFlag('require-complete-translation')
  || !['0', 'false', 'no', 'off'].includes(String(process.env.XHS_REQUIRE_COMPLETE_TRANSLATION || 'false').toLowerCase());
const REWRITE_PROMPT_FILE = getArg(
  'prompt-file',
  process.env.XHS_REWRITE_PROMPT_FILE || path.resolve(process.cwd(), 'docs/xhs-community-post-prompt.md')
);

const sql = neon(DB_URL);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function maybeReadText(filePath) {
  if (!filePath) return '';
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function removeCodeFence(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
}

function extractJsonObject(text = '') {
  const cleaned = removeCodeFence(text);
  const direct = cleaned.match(/\{[\s\S]*\}/);
  return direct ? direct[0] : cleaned;
}

function cleanTopicToken(value = '') {
  return normalizeWhitespace(String(value || '').replace(/^#+/, '').trim());
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function readOptionalFile(filePath) {
  if (!filePath) return null;
  return fs.readFileSync(path.resolve(filePath), 'utf8').trim();
}

function buildBody(row) {
  const overrideBody = CUSTOM_BODY || readOptionalFile(CUSTOM_BODY_FILE);
  if (overrideBody) return normalizeWhitespace(overrideBody);
  const limit = PRESET === 'concise-news' ? 300 : 400;
  return buildArticleDrivenBody(row, { maxLen: limit });
}

function buildTitle(row) {
  const overrideTitle = CUSTOM_TITLE || readOptionalFile(CUSTOM_TITLE_FILE);
  if (overrideTitle) return truncateTitle(normalizeWhitespace(overrideTitle), 20, 60);
  return buildArticleDrivenTitle(row);
}

function buildTopic(row) {
  if (CUSTOM_TOPIC) return CUSTOM_TOPIC;
  return inferTopic(row);
}

const REWRITE_PROMPT_REFERENCE = maybeReadText(REWRITE_PROMPT_FILE);

function glossaryPromptForRow(row = {}) {
  return buildTranslationGlossaryPrompt({
    title: row?.title_en || '',
    summary: row?.summary_en || '',
    content: row?.content_markdown_en || row?.content_en || '',
  });
}

function buildRewritePrompt(row, draft) {
  const articleBody = clipText(sanitizeArticleBody(row), 1800);
  const glossaryPrompt = glossaryPromptForRow(row);
  return [
    REWRITE_PROMPT_REFERENCE,
    '',
    glossaryPrompt,
    glossaryPrompt ? '' : '',
    '请基于下面新闻素材直接输出最终 JSON。',
    '只输出 JSON，不要解释，不要 Markdown 代码块。',
    '',
    `草稿标题（仅供参考）: ${draft.title}`,
    `草稿正文（仅供参考）: ${draft.body}`,
    `中文标题: ${normalizeWhitespace(row.title_zh || '')}`,
    `中文摘要: ${clipText(row.summary_zh || '', 240)}`,
    `中文正文: ${articleBody}`,
    `英文标题: ${normalizeWhitespace(row.title_en || '')}`,
    `英文摘要: ${clipText(row.summary_en || '', 240)}`,
    `英文正文: ${clipText(stripMarkdown(row.content_en || row.content_markdown_en || ''), 1800)}`,
  ].join('\n');
}

async function callRewriteModel(prompt) {
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string' },
      topics: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['title', 'body', 'topics'],
    additionalProperties: false,
  };
  const result = await callLlmJson(prompt, schema, { model: REWRITE_MODEL, timeoutMs: REWRITE_TIMEOUT_MS });
  return JSON.stringify(result);
}

function parseRewritePayload(rawText, fallback) {
  const candidate = extractJsonObject(rawText);
  let parsed = null;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Invalid rewrite JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const title = truncateTitle(normalizeWhitespace(parsed?.title || fallback.title), 20, 60);
  const body = normalizeWhitespace(parsed?.body || fallback.body) || fallback.body;
  const topics = Array.isArray(parsed?.topics)
    ? parsed.topics.map((item) => cleanTopicToken(item)).filter(Boolean)
    : [];

  return {
    title: title || fallback.title,
    body: body || fallback.body,
    topic: topics[0] || fallback.topic,
    topics,
  };
}

async function maybeRewriteDraft(row, draft) {
  if (!AI_REWRITE) return { ...draft, rewritten: false };
  if (CUSTOM_TITLE || CUSTOM_BODY || CUSTOM_TITLE_FILE || CUSTOM_BODY_FILE) {
    return { ...draft, rewritten: false };
  }
  if (!REWRITE_PROMPT_REFERENCE) {
    throw new Error(`Missing rewrite prompt file: ${REWRITE_PROMPT_FILE}`);
  }

  try {
    const output = await callRewriteModel(buildRewritePrompt(row, draft));
    const result = parseRewritePayload(output, draft);
    return { ...result, rewritten: true };
  } catch (error) {
    console.warn(`[xhs] rewrite fallback for ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    return { ...draft, rewritten: false };
  }
}

async function loadState() {
  try {
    const text = await readFile(STATE_FILE, 'utf8');
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {}
  return {};
}

async function saveState(state) {
  ensureDir(STATE_FILE);
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function pidLooksAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function removeLockFile(filePath, token) {
  const current = readLockFile(filePath);
  if (current?.token !== token) return;
  safeUnlink(filePath);
}

function acquireProcessLock(filePath) {
  ensureDir(filePath);
  const startedAt = Date.now();
  const token = `${process.pid}-${startedAt}`;
  const payload = { pid: process.pid, startedAt, token };

  while (true) {
    try {
      fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', flag: 'wx' });
      return { filePath, token };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    const existing = readLockFile(filePath);
    const ageMs = existing?.startedAt ? Date.now() - Number(existing.startedAt) : Number.POSITIVE_INFINITY;
    const stale = !existing || !pidLooksAlive(Number(existing.pid)) || ageMs > LOCK_STALE_MS;
    if (!stale) {
      return null;
    }
    safeUnlink(filePath);
  }
}

function detectReverseXhsCli() {
  const which = spawnSync('bash', ['-lc', 'command -v xhs || true'], { encoding: 'utf8' });
  const onPath = String(which.stdout || '').trim();
  const candidates = [
    PREFERRED_XHS_CLI,
    path.join(os.homedir(), '.local', 'bin', 'xhs'),
    onPath,
    path.join(os.homedir(), '.local', 'share', 'xhs-api-cli-venv', 'bin', 'xhs'),
    path.join(os.tmpdir(), 'xhs-api-venv', 'bin', 'xhs'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['--help'], { encoding: 'utf8' });
    const text = `${probe.stdout || ''}\n${probe.stderr || ''}`;
    if (/xiaohongshu cli|reverse-engineered api/i.test(text)) return candidate;
  }

  return null;
}

async function fetchRows() {
  if (IDS.length) {
    return sql`
      SELECT id, source, url, image_url, published_at, title_en, summary_en, content_en, content_markdown_en,
             title_zh, summary_zh, content_zh, content_markdown_zh, translation_status
      FROM news_articles
      WHERE id = ANY(${IDS})
      ORDER BY published_at DESC NULLS LAST
    `;
  }

  return sql`
    SELECT id, source, url, image_url, published_at, title_en, summary_en, content_en, content_markdown_en,
           title_zh, summary_zh, content_zh, content_markdown_zh, translation_status
    FROM news_articles
    WHERE COALESCE(title_zh, title_en, '') <> ''
      AND COALESCE(translation_status, '') <> 'xhs_skip'
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${LIMIT}
  `;
}

function rowHasEnglishSource(row) {
  return Boolean(row?.title_en || row?.summary_en || row?.content_en || row?.content_markdown_en);
}

function rowHasAnySource(row) {
  return Boolean(
    row?.title_zh || row?.summary_zh || row?.content_zh || row?.content_markdown_zh || rowHasEnglishSource(row)
  );
}

function downloadImage(url, outPath) {
  const res = spawnSync('curl', ['-Lk', url, '-o', outPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`Failed to download image: ${url}\n${res.stderr || res.stdout}`);
  }
}

function parseXhsJson(stdout = '') {
  try {
    return JSON.parse(stdout || '{}');
  } catch {
    return null;
  }
}

function runXhsPublish(xhsCli, argv) {
  const res = spawnSync(
    xhsCli,
    argv,
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8, timeout: XHS_POST_TIMEOUT_MS }
  );
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  const responsePayload = parseXhsJson(res.stdout);
  return { res, combined, responsePayload };
}

function publishViaXhs(xhsCli, payload, imagePath) {
  const { title, body, topic } = payload;
  const standardArgv = ['post', '--title', title, '--body', body, '--images', imagePath, '--json'];
  if (topic) standardArgv.push('--topic', topic);
  const standardResult = runXhsPublish(xhsCli, standardArgv);
  if (standardResult.res.status === 0 && standardResult.responsePayload?.ok) {
    return { payload: standardResult.responsePayload, title, body, topic, method: 'post' };
  }
  throw new Error(standardResult.combined || `xhs exited with status ${standardResult.res.status}`);
}

function resolveWeChatDraftScript() {
  const candidates = [
    path.resolve(process.cwd(), 'scripts', 'post-news-to-wechat-drafts.mjs'),
    path.resolve(process.cwd(), 'scripts', 'post-news-to-wechat-drafts.js'),
    path.resolve(process.cwd(), 'scripts', 'post-news-to-wechat-draft.mjs'),
    path.resolve(process.cwd(), 'scripts', 'post-news-to-wechat-draft.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function syncWeChatDrafts(ids = []) {
  if (!WECHAT_AUTO_DRAFT || !ids.length) return null;
  const hasWechatCreds = Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
  if (!hasWechatCreds) {
    console.warn('[wechat] skip draft sync: missing WECHAT_APP_ID/WECHAT_APP_SECRET');
    return null;
  }

  const scriptPath = resolveWeChatDraftScript();
  if (!scriptPath) {
    console.warn('[wechat] skip draft sync: draft script not found');
    return { ok: false, skipped: true, reason: 'missing_draft_script' };
  }

  const argv = [scriptPath];
  for (const id of ids) {
    argv.push('--id', String(id));
  }
  const result = spawnSync(process.execPath, argv, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  if (result.status !== 0) {
    console.warn(`[wechat] draft sync failed: ${(result.stderr || result.stdout || '').trim()}`);
    return { ok: false, error: (result.stderr || result.stdout || '').trim() };
  }

  try {
    return JSON.parse(result.stdout || '{}');
  } catch {
    return { ok: true, raw: (result.stdout || '').trim() };
  }
}

async function main() {
  const lock = acquireProcessLock(LOCK_FILE);
  if (!lock) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'busy', lock_file: LOCK_FILE }, null, 2));
    return;
  }

  try {
    const xhsCli = detectReverseXhsCli();
    if (!xhsCli) {
      throw new Error('Could not find reverse-api xhs CLI. Set XHS_REVERSE_CLI or install xiaohongshu-cli into ~/.local/share/xhs-api-cli-venv.');
    }

    const rows = await fetchRows();
    const state = await loadState();
    const tempDir = await mkdtemp(TEMP_PREFIX);
    const results = [];
    const postedIds = [];

    try {
      for (const row of rows) {
        const already = state[row.id];
        if (!FORCE && already) {
          results.push({ id: row.id, status: 'skipped', reason: 'already_posted', note_id: already.note_id || '' });
          continue;
        }
        if (!rowHasAnySource(row)) {
          results.push({ id: row.id, status: 'skipped', reason: 'missing_source_content' });
          continue;
        }
        if (REQUIRE_COMPLETE_TRANSLATION && !hasCompleteTranslatedNewsRow(row)) {
          results.push({ id: row.id, status: 'skipped', reason: 'translation_incomplete' });
          continue;
        }
        if (!row.image_url) {
          results.push({ id: row.id, status: 'skipped', reason: 'missing_image_url' });
          continue;
        }

        const imagePath = path.join(tempDir, `${row.id}.jpg`);
        downloadImage(row.image_url, imagePath);
        const draft = {
          title: buildTitle(row),
          body: buildBody(row),
          topic: buildTopic(row),
        };
        const rewritten = await maybeRewriteDraft(row, draft);

        if (DRY_RUN) {
          results.push({
            id: row.id,
            status: 'dry_run',
            title: rewritten.title,
            body: rewritten.body,
            topic: rewritten.topic || '',
            rewritten: Boolean(rewritten.rewritten),
            image_url: row.image_url,
            url: row.url,
          });
          continue;
        }

        const { payload, topic, method } = publishViaXhs(xhsCli, rewritten, imagePath);
        const noteId = String(payload?.data?.id || '');
        state[row.id] = {
          note_id: noteId,
          posted_at: new Date().toISOString(),
          url: row.url,
          title: rewritten.title,
          topic: topic || '',
          method,
        };
        await saveState(state);
        results.push({ id: row.id, status: 'posted', note_id: noteId, title: rewritten.title, rewritten: Boolean(rewritten.rewritten), method });
        postedIds.push(row.id);
        console.log(`posted id=${row.id} note_id=${noteId} method=${method}`);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    const wechat = DRY_RUN ? null : syncWeChatDrafts(postedIds);
    console.log(JSON.stringify({ ok: true, count: results.length, results, wechat }, null, 2));
  } finally {
    removeLockFile(lock.filePath, lock.token);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
