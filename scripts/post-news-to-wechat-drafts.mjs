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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.vercel'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || process.env.WX_APPID || process.env.WEIXIN_APP_ID;
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || process.env.WX_APPSECRET || process.env.WEIXIN_APP_SECRET;
const AUTHOR = process.env.WECHAT_AUTHOR || '';
const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
}

function getArgs(name) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === `--${name}` && i < args.length - 1) values.push(args[i + 1]);
  }
  return values;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const IDS = getArgs('id');
const LIMIT = Math.max(1, Number(getArg('limit', '5')) || 5);
const STATE_FILE = getArg('state-file', path.join(os.homedir(), '.dota2-hub', 'wechat-drafted-news.json'));
const FORCE = hasFlag('force');
const DRY_RUN = hasFlag('dry-run');

if (!DB_URL) {
  console.error('Missing DATABASE_URL/POSTGRES_URL');
  process.exit(1);
}
if (!WECHAT_APP_ID || !WECHAT_APP_SECRET) {
  console.error('Missing WECHAT_APP_ID/WECHAT_APP_SECRET');
  process.exit(1);
}

const sql = neon(DB_URL);

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(text = '') {
  return String(text).replace(/\r/g, '').trim();
}

function buildArticleHtml(row, articleImageUrl) {
  const lines = normalizeText(row.content_zh || '')
    .split('\n')
    .map((line) => line.trimEnd());

  const body = [];
  body.push('<section>');
  if (articleImageUrl) {
    body.push(`<p><img src="${escapeHtml(articleImageUrl)}" alt="${escapeHtml(row.title_zh || '')}"></p>`);
  }

  for (const line of lines) {
    if (!line.trim()) {
      body.push('<p><br></p>');
      continue;
    }
    body.push(`<p>${escapeHtml(line)}</p>`);
  }

  body.push('</section>');
  return body.join('');
}

async function fetchLatestRows() {
  if (IDS.length) {
    return sql.query(`
      SELECT id, source, url, image_url, published_at, title_zh, content_zh
      FROM news_articles
      WHERE id = ANY($1) AND COALESCE(title_zh, '') <> '' AND COALESCE(content_zh, '') <> ''
      ORDER BY published_at DESC NULLS LAST
    `, [IDS]);
  }

  return sql.query(`
    SELECT id, source, url, image_url, published_at, title_zh, content_zh
    FROM news_articles
    WHERE COALESCE(title_zh, '') <> '' AND COALESCE(content_zh, '') <> ''
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${LIMIT}
  `);
}

async function getAccessToken() {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', WECHAT_APP_ID);
  url.searchParams.set('secret', WECHAT_APP_SECRET);

  const res = await fetch(url, { method: 'GET' });
  const json = await res.json();
  if (!res.ok || json.errcode) {
    throw new Error(`Failed to get access_token: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

function detectFileExtension(url = '', contentType = '') {
  const pathname = new URL(url).pathname.toLowerCase();
  const pathExt = path.extname(pathname);
  if (pathExt) return pathExt;

  if (/png/i.test(contentType)) return '.png';
  if (/webp/i.test(contentType)) return '.webp';
  if (/gif/i.test(contentType)) return '.gif';
  return '.jpg';
}

function detectMimeType(filePath = '') {
  const ext = path.extname(String(filePath)).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

async function downloadImageWithExtension(url, destBasePath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const ext = detectFileExtension(url, res.headers.get('content-type') || '');
  const outPath = `${destBasePath}${ext}`;
  const arrayBuffer = await res.arrayBuffer();
  await writeFile(outPath, Buffer.from(arrayBuffer));
  return outPath;
}

function runSips(args) {
  const res = spawnSync('sips', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || `sips failed: ${args.join(' ')}`);
  }
}

async function createThumbImage(inputPath, outputPath) {
  const attempts = [
    { size: 360, quality: 60 },
    { size: 300, quality: 45 },
    { size: 240, quality: 35 },
    { size: 200, quality: 25 },
  ];

  for (const attempt of attempts) {
    runSips([
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', String(attempt.quality),
      '-Z', String(attempt.size),
      inputPath,
      '--out', outputPath,
    ]);
    const stat = fs.statSync(outputPath);
    if (stat.size <= 64 * 1024) return outputPath;
  }

  throw new Error(`Failed to compress thumb under 64KB: ${inputPath}`);
}

async function createArticleImage(inputPath, outputPath) {
  runSips([
    '-s', 'format', 'jpeg',
    '-s', 'formatOptions', '80',
    inputPath,
    '--out', outputPath,
  ]);
  return outputPath;
}

async function uploadMaterial(accessToken, url, filePath, type) {
  const form = new FormData();
  const fileBuffer = await readFile(filePath);
  form.append(
    'media',
    new File([fileBuffer], path.basename(filePath), { type: detectMimeType(filePath) })
  );
  const res = await fetch(`${url}?access_token=${encodeURIComponent(accessToken)}${type ? `&type=${encodeURIComponent(type)}` : ''}`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!res.ok || json.errcode) {
    throw new Error(`Upload failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function uploadThumb(accessToken, filePath) {
  return uploadMaterial(accessToken, 'https://api.weixin.qq.com/cgi-bin/material/add_material', filePath, 'thumb');
}

async function uploadArticleImage(accessToken, filePath) {
  return uploadMaterial(accessToken, 'https://api.weixin.qq.com/cgi-bin/media/uploadimg', filePath, '');
}

async function addDraft(accessToken, article) {
  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ articles: [article] }),
  });
  const json = await res.json();
  if (!res.ok || json.errcode) {
    throw new Error(`Add draft failed: ${JSON.stringify(json)}`);
  }
  return json;
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
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function main() {
  const rows = await fetchLatestRows();
  if (!rows.length) {
    throw new Error('No Chinese news rows found');
  }

  const state = await loadState();
  const accessToken = await getAccessToken();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'wechat-drafts-'));
  const results = [];

  try {
    for (const row of rows) {
      const already = state[row.id];
      if (!FORCE && already?.media_id) {
        results.push({
          id: row.id,
          title: row.title_zh,
          status: 'skipped',
          reason: 'already_drafted',
          media_id: already.media_id,
        });
        continue;
      }

      const originalBasePath = path.join(tempDir, `${row.id}-orig`);
      const thumbPath = path.join(tempDir, `${row.id}-thumb.jpg`);
      const articleImagePath = path.join(tempDir, `${row.id}-article.jpg`);

      const originalPath = await downloadImageWithExtension(row.image_url, originalBasePath);
      await createThumbImage(originalPath, thumbPath);
      await createArticleImage(originalPath, articleImagePath);

      if (DRY_RUN) {
        results.push({
          id: row.id,
          title: row.title_zh,
          status: 'dry_run',
          image_url: row.image_url,
          url: row.url,
        });
        continue;
      }

      const thumbResult = await uploadThumb(accessToken, thumbPath);
      const articleImageResult = await uploadArticleImage(accessToken, articleImagePath);
      const content = buildArticleHtml(row, articleImageResult.url);

      const draftResult = await addDraft(accessToken, {
        title: row.title_zh,
        author: AUTHOR,
        digest: '',
        content,
        content_source_url: row.url || '',
        thumb_media_id: thumbResult.media_id,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      });

      state[row.id] = {
        media_id: draftResult.media_id,
        drafted_at: new Date().toISOString(),
        title: row.title_zh,
        url: row.url || '',
      };
      await saveState(state);

      results.push({
        id: row.id,
        title: row.title_zh,
        status: 'drafted',
        media_id: draftResult.media_id,
      });
    }

    console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
