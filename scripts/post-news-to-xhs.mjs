import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

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

const sql = neon(DB_URL);

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function stripMarkdown(text = '') {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeWhitespace(text = '') {
  return String(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clipText(text = '', maxLen = 420) {
  const plain = normalizeWhitespace(stripMarkdown(text));
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen - 1).trim()}…`;
}

function readOptionalFile(filePath) {
  if (!filePath) return null;
  return fs.readFileSync(path.resolve(filePath), 'utf8').trim();
}

function sanitizeArticleBody(row) {
  const title = normalizeWhitespace(row.title_zh || row.title_en || '');
  let text = normalizeWhitespace(stripMarkdown(row.content_zh || row.content_markdown_zh || row.summary_zh || row.content_en || ''));
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^作者[:：]/.test(line))
    .filter((line) => !/^更新时间[:：]/.test(line))
    .filter((line) => !/^来源[:：]/.test(line))
    .filter((line) => !/^原文链接[:：]/.test(line))
    .filter((line) => !/^[-—]{3,}$/.test(line));

  if (title && lines[0] && normalizeWhitespace(lines[0]) === title) {
    lines.shift();
  }
  text = normalizeWhitespace(lines.join('\n'));
  return text;
}

function pickCommunityHook(row, articleBody) {
  const summary = normalizeWhitespace(row.summary_zh || '');
  if (summary) return summary;
  const firstSentence = String(articleBody || '').split(/[。！？!?]/)[0]?.trim();
  if (firstSentence) return `${firstSentence}。`;
  return '这条消息看完之后，第一反应就是后续讨论肯定不会少。';
}

function pickExcerptParagraphs(articleBody) {
  const paragraphs = normalizeWhitespace(articleBody)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const picked = [];
  let total = 0;
  for (const paragraph of paragraphs) {
    if (total >= 360) break;
    if (paragraph.length < 18) continue;
    const clipped = paragraph.length > 180 ? `${paragraph.slice(0, 179).trim()}…` : paragraph;
    picked.push(clipped);
    total += clipped.length;
    if (picked.length >= 3) break;
  }
  return picked;
}

function buildBody(row) {
  const overrideBody = CUSTOM_BODY || readOptionalFile(CUSTOM_BODY_FILE);
  if (overrideBody) return normalizeWhitespace(overrideBody);

  const articleBody = sanitizeArticleBody(row);
  const hook = pickCommunityHook(row, articleBody);
  const paragraphs = pickExcerptParagraphs(articleBody);
  const lines = [
    hook,
    '',
    ...paragraphs,
    '',
    '这条我先记一笔，后面如果还有队伍/选手回应，应该还会继续发酵。',
  ];
  return normalizeWhitespace(lines.filter(Boolean).join('\n'));
}

function buildTitle(row) {
  const overrideTitle = CUSTOM_TITLE || readOptionalFile(CUSTOM_TITLE_FILE);
  const raw = normalizeWhitespace(overrideTitle || row.title_zh || row.title_en || 'DOTA2 新闻速递');
  return raw.length <= 80 ? raw : `${raw.slice(0, 79).trim()}…`;
}

function buildTopic(row) {
  if (CUSTOM_TOPIC) return CUSTOM_TOPIC;
  const sourceText = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.content_zh || ''}`;
  if (/PGL Wallachia/i.test(sourceText)) return 'PGL Wallachia';
  if (/Team Spirit/i.test(sourceText)) return 'Team Spirit';
  if (/Dota 2|DOTA2|刀塔/i.test(sourceText)) return 'DOTA2';
  return null;
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

function detectReverseXhsCli() {
  const candidates = [
    PREFERRED_XHS_CLI,
    path.join(os.homedir(), '.local', 'share', 'xhs-api-cli-venv', 'bin', 'xhs'),
    path.join(os.tmpdir(), 'xhs-api-venv', 'bin', 'xhs'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const which = spawnSync('bash', ['-lc', 'command -v xhs || true'], { encoding: 'utf8' });
  const onPath = String(which.stdout || '').trim();
  if (!onPath) return null;

  const probe = spawnSync(onPath, ['--help'], { encoding: 'utf8' });
  const text = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  if (/reverse-engineered API/i.test(text)) return onPath;
  return null;
}

async function fetchRows() {
  if (IDS.length) {
    return sql`
      SELECT id, source, url, image_url, published_at, title_en, summary_en, content_en, content_markdown_en,
             title_zh, summary_zh, content_zh, content_markdown_zh
      FROM news_articles
      WHERE id = ANY(${IDS})
      ORDER BY published_at DESC NULLS LAST
    `;
  }

  return sql`
    SELECT id, source, url, image_url, published_at, title_en, summary_en, content_en, content_markdown_en,
           title_zh, summary_zh, content_zh, content_markdown_zh
    FROM news_articles
    WHERE COALESCE(title_zh, title_en, '') <> ''
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${LIMIT}
  `;
}

function rowNeedsZh(row) {
  return Boolean(row?.title_zh || row?.summary_zh || row?.content_zh || row?.content_markdown_zh);
}

function downloadImage(url, outPath) {
  const res = spawnSync('curl', ['-Lk', url, '-o', outPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`Failed to download image: ${url}\n${res.stderr || res.stdout}`);
  }
}

function publishViaXhs(xhsCli, row, imagePath) {
  const title = buildTitle(row);
  const body = buildBody(row);
  const topic = buildTopic(row);
  const argv = ['post', '--title', title, '--body', body, '--images', imagePath, '--json'];
  if (topic) argv.push('--topic', topic);
  const res = spawnSync(
    xhsCli,
    argv,
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 }
  );
  const combined = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
  let payload = null;
  try {
    payload = JSON.parse(res.stdout || '{}');
  } catch {}
  if (res.status !== 0 || !payload?.ok) {
    throw new Error(combined || `xhs exited with status ${res.status}`);
  }
  return { payload, title, body, topic };
}

async function main() {
  const xhsCli = detectReverseXhsCli();
  if (!xhsCli) {
    console.error('Could not find reverse-api xhs CLI. Set XHS_REVERSE_CLI or install xiaohongshu-cli into ~/.local/share/xhs-api-cli-venv.');
    process.exit(1);
  }

  const rows = await fetchRows();
  const state = await loadState();
  const tempDir = await mkdtemp(TEMP_PREFIX);
  const results = [];

  try {
    for (const row of rows) {
      const already = state[row.id];
      if (!FORCE && already) {
        results.push({ id: row.id, status: 'skipped', reason: 'already_posted', note_id: already.note_id || '' });
        continue;
      }
      if (!rowNeedsZh(row)) {
        results.push({ id: row.id, status: 'skipped', reason: 'missing_zh_translation' });
        continue;
      }
      if (!row.image_url) {
        results.push({ id: row.id, status: 'skipped', reason: 'missing_image_url' });
        continue;
      }

      const imagePath = path.join(tempDir, `${row.id}.jpg`);
      downloadImage(row.image_url, imagePath);
      const title = buildTitle(row);
      const body = buildBody(row);

      if (DRY_RUN) {
        results.push({ id: row.id, status: 'dry_run', title, body, image_url: row.image_url, url: row.url });
        continue;
      }

      const { payload, topic } = publishViaXhs(xhsCli, row, imagePath);
      const noteId = String(payload?.data?.id || '');
      state[row.id] = {
        note_id: noteId,
        posted_at: new Date().toISOString(),
        url: row.url,
        title: title,
        topic: topic || '',
      };
      await saveState(state);
      results.push({ id: row.id, status: 'posted', note_id: noteId, title });
      console.log(`posted id=${row.id} note_id=${noteId}`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
