#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { callLlmJson } from '../lib/openrouter.mjs';
import { buildTranslationGlossaryPrompt, normalizeGlossaryTranslations } from '../lib/translation-glossary.js';

const USER_AGENT = process.env.REDDIT_USER_AGENT || 'Mozilla/5.0 (compatible; d2hub-bot/1.0)';
const SUBREDDIT = process.env.REDDIT_SUBREDDIT || 'DotA2';
const TEMP_PREFIX = path.join(os.tmpdir(), 'd2hub-reddit-xhs-');

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx === args.length - 1) return fallback;
  return args[idx + 1];
};
const hasFlag = (name) => args.includes(`--${name}`);
const pickBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const toInt = (value, fallback, min = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.trunc(parsed));
};

const LIMIT = toInt(getArg('limit', process.env.REDDIT_XHS_LIMIT || '1'), 1, 1);
const DAYS = toInt(getArg('days', process.env.REDDIT_XHS_DAYS || '10'), 10, 1);
const FETCH_LIMIT = toInt(getArg('fetch-limit', process.env.REDDIT_XHS_FETCH_LIMIT || '100'), 100, 5);
const COMMENT_LIMIT = toInt(getArg('comment-limit', process.env.REDDIT_XHS_COMMENT_LIMIT || '8'), 8, 1);
const FORCE = hasFlag('force') || pickBool(process.env.REDDIT_XHS_FORCE, false);
const DRY_RUN = hasFlag('dry-run');
const MODEL = getArg('model', process.env.REDDIT_XHS_MODEL || process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it');
const STATE_FILE = getArg('state-file', path.join(os.homedir(), '.dota2-hub', 'xhs-posted-reddit.json'));
const PROMPT_FILE = getArg('prompt-file', path.resolve(process.cwd(), 'docs/xhs-reddit-hotpost-prompt.md'));
const POST_TIMEOUT_MS = toInt(getArg('post-timeout-ms', process.env.REDDIT_XHS_POST_TIMEOUT_MS || '240000'), 240000, 10000);
const XHS_CDP_URL = getArg('cdp-url', process.env.XHS_REAL_CDP_URL || 'http://127.0.0.1:9222');
const XHS_PUBLISH_URL = getArg('publish-url', process.env.XHS_REAL_PUBLISH_URL || 'https://creator.xiaohongshu.com/publish/publish');
const PREFERRED_XHS_CLI = getArg('xhs-cli', process.env.XHS_REDDIT_CLI || '');
const TARGET_IDS = String(getArg('ids', process.env.REDDIT_XHS_IDS || '') || '')
  .split(/[\s,]+/)
  .map((x) => x.trim())
  .filter(Boolean);

function normalizeWhitespace(text = '') {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtml(text = '') {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'');
}

function safeUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function clipText(text = '', maxLen = 1800) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function countHanChars(text = '') {
  const matches = String(text || '').match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function truncateTitle(title = '', maxHan = 20, maxTotal = 60) {
  const clean = normalizeWhitespace(title);
  if (!clean) return '';
  if (countHanChars(clean) <= maxHan && clean.length <= maxTotal) return clean;
  let han = 0;
  let total = 0;
  let out = '';
  for (const ch of clean) {
    const nextHan = /[\u4e00-\u9fff]/.test(ch) ? han + 1 : han;
    if (nextHan > maxHan || total + 1 > maxTotal) break;
    out += ch;
    han = nextHan;
    total += 1;
  }
  return out.trim().replace(/[，。！？、；：,.!?;:\s]+$/g, '');
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

async function fetchJson(url) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT },
    });
    if (response.ok) {
      return response.json();
    }
    const text = await response.text().catch(() => '');
    const error = new Error(`Reddit request failed ${response.status}: ${text.slice(0, 240)}`);
    lastError = error;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw error;
    }
    if (response.status === 429) {
      const resetSec = Number(response.headers.get('x-ratelimit-reset') || '0');
      const waitMs = Number.isFinite(resetSec) && resetSec > 0
        ? Math.min(Math.max(resetSec * 1000, 2000), 15000)
        : 5000;
      await wait(waitMs);
    } else {
      await wait(1200 * (attempt + 1));
    }
  }
  throw lastError || new Error('Reddit request failed');
}

function extractMediaCandidates(post) {
  const candidates = [];
  const push = (type, url) => {
    if (!url) return;
    candidates.push({ type, url: decodeHtml(url) });
  };

  const secureMedia = post?.secure_media || post?.media || {};
  const redditVideo = secureMedia?.reddit_video || {};
  if (redditVideo?.fallback_url) push('video', redditVideo.fallback_url);

  if (post?.is_gallery && post?.gallery_data?.items && post?.media_metadata) {
    for (const item of post.gallery_data.items) {
      const media = post.media_metadata[item.media_id];
      const imageUrl = media?.s?.u || media?.p?.[0]?.u;
      push('image', imageUrl);
    }
  }

  const previewImages = post?.preview?.images || [];
  for (const image of previewImages) {
    push('image', image?.source?.url);
  }

  const externalUrl = post?.url_overridden_by_dest || post?.url || '';
  if (/\.mp4(\?|$)/i.test(externalUrl) || /v\.redd\.it/i.test(externalUrl)) {
    push('video', externalUrl);
  } else if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(externalUrl)) {
    push('image', externalUrl);
  }

  const canonicalMediaKey = (type, rawUrl) => {
    const text = String(rawUrl || '').trim();
    if (!text) return `${type}:`;
    try {
      const u = new URL(text);
      const protocol = (u.protocol || '').toLowerCase();
      const host = (u.host || '').toLowerCase();
      const pathname = u.pathname || '';
      // For images, query strings are often just resize/transcode params.
      // For reddit videos, query strings are often auth/variant params.
      if (type === 'image' || host.includes('redd.it') || host.includes('redditmedia.com')) {
        return `${type}:${protocol}//${host}${pathname}`;
      }
      return `${type}:${protocol}//${host}${pathname}${u.search || ''}`;
    } catch {
      return `${type}:${text.split('?')[0]}`;
    }
  };

  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = canonicalMediaKey(item.type, item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

async function rewritePost(promptReference, post, comments) {
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string' },
      topics: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 5,
      },
    },
    required: ['title', 'body', 'topics'],
    additionalProperties: false,
  };

  const inputPayload = {
    title: post.title || '',
    content: post.content || '',
    comments: comments.map((item) => item.body),
  };

  const glossarySource = {
    title: post.title || '',
    summary: comments.map((item) => item.body).join('\n'),
    content: post.content || '',
  };
  const glossaryPrompt = buildTranslationGlossaryPrompt(glossarySource);

  const prompt = [
    promptReference,
    '',
    glossaryPrompt,
    glossaryPrompt ? '' : '',
    '如果命中术语表，标题、正文、话题里都必须统一使用术语表指定中文名，不要保留英文名、旧称或社区绰号。',
    '不要写“英文名+中文通用品类”的混搭词，例如：Tango药水、Blink匕首、Black Hole技能；命中术语表后必须直接写对应中文正式名。',
    '',
    '输入：',
    JSON.stringify(inputPayload, null, 2),
    '',
    '请直接输出 JSON。',
  ].join('\n');

  try {
    const result = await callLlmJson(prompt, schema, {
      model: MODEL,
      timeoutMs: 60000,
    });
    const title = truncateTitle(normalizeGlossaryTranslations(result?.title || '', glossarySource));
    const body = normalizeWhitespace(normalizeGlossaryTranslations(result?.body || '', glossarySource));
    const topics = Array.isArray(result?.topics)
      ? result.topics
        .map((x) => normalizeGlossaryTranslations(String(x || '').trim(), glossarySource))
        .map((x) => `#${String(x || '').replace(/^#+/, '').trim()}`)
        .filter((x) => x.length > 1)
      : [];
    if (!title || !body || topics.length < 3) {
      return {
        rewritten: false,
        rewrite_error: 'model returned incomplete payload',
      };
    }
    return {
      title,
      body,
      topics: topics.slice(0, 5),
      rewritten: true,
    };
  } catch (error) {
    return {
      rewritten: false,
      rewrite_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveXhsClients() {
  const which = spawnSync('bash', ['-lc', 'command -v xhs || true'], { encoding: 'utf8' });
  const onPath = String(which.stdout || '').trim();
  const candidates = [
    PREFERRED_XHS_CLI,
    onPath,
    path.resolve('/Users/ein/xhs-cli/.venv/bin/xhs'),
  ].filter(Boolean);

  let reverseApiCli = null;
  let legacyCli = null;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['--help'], { encoding: 'utf8' });
    const text = `${probe.stdout || ''}\n${probe.stderr || ''}`;
    if (!/xhs|xiaohongshu/i.test(text)) continue;
    const mode = detectXhsMode(candidate);
    if (mode === 'reverse-api' && !reverseApiCli) reverseApiCli = candidate;
    if (mode === 'legacy' && !legacyCli) legacyCli = candidate;
  }

  const anyCli = reverseApiCli || legacyCli || null;
  return { reverseApiCli, legacyCli, anyCli };
}

function detectXhsMode(xhsCli) {
  const help = spawnSync(xhsCli, ['post', '--help'], { encoding: 'utf8' });
  const text = `${help.stdout || ''}\n${help.stderr || ''}`;
  if (/--title\s+TEXT/i.test(text) && /--images/i.test(text)) return 'reverse-api';
  return 'legacy';
}

function hasPostReal(xhsCli) {
  const help = spawnSync(xhsCli, ['--help'], { encoding: 'utf8' });
  const text = `${help.stdout || ''}\n${help.stderr || ''}`;
  return /\bpost-real\b/i.test(text);
}

function canConnectTcpUrl(rawUrl, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      resolve(false);
      return;
    }

    const socket = net.connect({
      host: url.hostname || '127.0.0.1',
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function detectVideoPublishCapability(clients) {
  const videoCli = clients.legacyCli || clients.reverseApiCli;
  if (videoCli && hasPostReal(videoCli)) {
    return { ok: true, method: 'post-real' };
  }

  if (await canConnectTcpUrl(XHS_CDP_URL)) {
    return { ok: true, method: 'web-video' };
  }

  return {
    ok: false,
    method: null,
    reason: `video_publish_unavailable: no xhs post-real and CDP not reachable at ${XHS_CDP_URL}`,
  };
}

function runXhs(xhsCli, argv) {
  const result = spawnSync(xhsCli, argv, {
    encoding: 'utf8',
    timeout: POST_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 12,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const parseLooseJson = (text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {}
    const candidates = text.match(/\{[\s\S]*\}/g) || [];
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(candidates[i]);
      } catch {}
    }
    return null;
  };
  const parsed = parseLooseJson(stdout);
  return { result, stdout, stderr, parsed };
}

function resolvePlaywrightCoreEntries() {
  const out = [];
  const push = (candidate) => {
    if (!candidate) return;
    const full = path.resolve(String(candidate));
    if (fs.existsSync(full) && !out.includes(full)) out.push(full);
  };

  const explicit = process.env.PLAYWRIGHT_CORE_PATH || '';
  if (explicit) {
    if (/\.(mjs|js)$/i.test(explicit)) {
      push(explicit);
    } else {
      push(path.join(explicit, 'index.mjs'));
      push(path.join(explicit, 'index.js'));
    }
  }

  try {
    const npmRoot = String(spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout || '').trim();
    if (npmRoot) {
      push(path.join(npmRoot, 'openclaw', 'node_modules', 'playwright-core', 'index.mjs'));
      push(path.join(npmRoot, 'openclaw', 'node_modules', 'playwright-core', 'index.js'));
      push(path.join(npmRoot, 'playwright-core', 'index.mjs'));
      push(path.join(npmRoot, 'playwright-core', 'index.js'));
    }
  } catch {}

  return out;
}

async function loadPlaywrightCore() {
  try {
    const mod = await import('playwright-core');
    if (mod?.chromium || mod?.default?.chromium) return mod;
  } catch {}

  for (const entry of resolvePlaywrightCoreEntries()) {
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (mod?.chromium || mod?.default?.chromium) return mod;
    } catch {}
  }

  throw new Error(
    'playwright-core not found. Install playwright-core or set PLAYWRIGHT_CORE_PATH.'
  );
}

async function fillFirstInput(page, selectors, value) {
  for (const selector of selectors) {
    const nodes = page.locator(selector);
    const count = await nodes.count();
    if (!count) continue;
    const node = nodes.first();
    try {
      await node.click({ timeout: 1200 });
      await node.fill('');
      await node.fill(value);
      return true;
    } catch {}
  }
  return false;
}

async function fillContentEditable(page, value) {
  const nodes = page.locator('div[contenteditable="true"]');
  const count = await nodes.count();
  for (let i = 0; i < count; i += 1) {
    const node = nodes.nth(i);
    try {
      await node.click({ timeout: 1200 });
      await node.fill('');
      await node.type(value, { delay: 8 });
      const text = await node.innerText().catch(() => '');
      if (normalizeWhitespace(text).length > 10) return true;
    } catch {}
  }
  return false;
}

async function waitForAnyText(page, texts, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const body = await page.evaluate(() => document.body?.innerText || '');
    if (texts.some((text) => body.includes(text))) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

async function publishVideoViaWeb(payload, videoPath) {
  const playwright = await loadPlaywrightCore();
  const chromium = playwright?.chromium || playwright?.default?.chromium;
  if (!chromium) throw new Error('playwright chromium unavailable');

  const browser = await chromium.connectOverCDP(XHS_CDP_URL, { timeout: 15000 });
  let page = null;
  let createdPage = false;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('no chrome context available via CDP');

    page = context.pages().find((p) => /xiaohongshu\.com/i.test(p.url() || '')) || null;
    if (!page) {
      page = await context.newPage();
      createdPage = true;
    }

    await page.goto(XHS_PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.waitForSelector('input[type="file"]', { timeout: 30000 });
    await page.locator('input[type="file"]').first().setInputFiles(videoPath);

    await page.waitForTimeout(2000);
    await fillFirstInput(page, [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      'input[type="text"]',
    ], payload.title);

    const filledBody = await fillFirstInput(page, [
      'textarea[placeholder*="正文"]',
      'textarea[placeholder*="内容"]',
    ], payload.body);
    if (!filledBody) {
      await fillContentEditable(page, payload.body);
    }

    const buttons = [
      page.getByRole('button', { name: /^发布$/ }),
      page.getByRole('button', { name: /立即发布/ }),
      page.getByRole('button', { name: /发布笔记/ }),
      page.locator('button:has-text("发布")').first(),
    ];
    let clicked = false;
    for (const button of buttons) {
      try {
        await button.click({ timeout: 2500 });
        clicked = true;
        break;
      } catch {}
    }
    if (!clicked) {
      throw new Error('publish button not found');
    }

    const confirmed = await waitForAnyText(page, ['发布成功', '发布完成', '笔记发布成功'], 90000);
    if (!confirmed) {
      const body = await page.evaluate(() => document.body?.innerText || '');
      throw new Error(`web video publish not confirmed: ${body.slice(0, 260)}`);
    }

    return { method: 'web-video', response: { ok: true } };
  } finally {
    try {
      if (createdPage && page) await page.close({ runBeforeUnload: false });
    } catch {}
    try {
      await browser.close();
    } catch {}
  }
}

async function publishViaXhs(clients, payload, localMediaPaths, mediaType) {
  const preferredForVideo = clients.legacyCli || clients.reverseApiCli;
  const preferredForImage = clients.reverseApiCli || clients.legacyCli;

  if (mediaType === 'video') {
    const xhsCli = preferredForVideo;
    if (xhsCli && hasPostReal(xhsCli)) {
      const argv = ['post-real', payload.title, '--image', localMediaPaths[0], '--content', payload.body, '--json', '--cdp-url', XHS_CDP_URL];
      const run = runXhs(xhsCli, argv);
      if (run.result.status !== 0) {
        throw new Error(`xhs post-real failed (exit=${run.result.status})\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
      }
      if (run.parsed?.success !== true && run.parsed?.ok !== true) {
        throw new Error(run.stdout || run.stderr || 'xhs post-real returned unknown response');
      }
      return { method: 'post-real', response: run.parsed || {} };
    }
    return publishVideoViaWeb(payload, localMediaPaths[0]);
  }

  const xhsCli = preferredForImage;
  if (!xhsCli) {
    throw new Error('xhs cli not found for image publishing');
  }
  const mode = detectXhsMode(xhsCli);

  if (mode === 'reverse-api') {
    const argv = ['post', '--title', payload.title, '--body', payload.body, '--json'];
    for (const mediaPath of localMediaPaths) argv.push('--images', mediaPath);
    const topic = (payload.topics || []).find((x) => /^#/.test(String(x || '').trim()));
    if (topic) argv.push('--topic', topic);
    const run = runXhs(xhsCli, argv);
    if (run.result.status !== 0 || run.parsed?.ok !== true) {
      throw new Error(`xhs post failed (mode=reverse-api, exit=${run.result.status})\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
    }
    return { method: 'post', response: run.parsed || {} };
  }

  const argv = ['post', payload.title, '--content', payload.body, '--json'];
  for (const mediaPath of localMediaPaths) argv.push('--image', mediaPath);
  const run = runXhs(xhsCli, argv);
  if (run.result.status !== 0) {
    throw new Error(`xhs post failed (mode=legacy, exit=${run.result.status})\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
  }
  const lookedSuccessful = run.parsed?.success === true
    || run.parsed?.ok === true
    || /published successfully|note published successfully|发布成功/i.test(`${run.stdout}\n${run.stderr}`);
  if (!lookedSuccessful) {
    throw new Error(run.stdout || run.stderr || 'xhs post returned unknown response');
  }
  return { method: 'post', response: run.parsed || {} };
}

function mediaExtFromUrl(url = '', fallback = '.bin') {
  const pathname = String(url || '').split('?')[0];
  const ext = path.extname(pathname).toLowerCase();
  if (ext && ext.length <= 6) return ext;
  return fallback;
}

function downloadMedia(url, outPath) {
  const result = spawnSync('curl', ['-Lk', url, '-o', outPath], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`download failed: ${url}\n${result.stderr || result.stdout}`);
  }
}

function downloadAndDedupeMedia(postId, mediaItems, mediaType, tempDir, suffix = '') {
  const localMediaPaths = [];
  const mediaHashes = new Set();
  const namePrefix = suffix ? `${postId}-${suffix}` : postId;

  for (let i = 0; i < mediaItems.length; i += 1) {
    const item = mediaItems[i];
    const ext = mediaType === 'video' ? '.mp4' : mediaExtFromUrl(item.url, '.jpg');
    const outPath = path.join(tempDir, `${namePrefix}-${i}${ext}`);
    downloadMedia(item.url, outPath);
    try {
      const hash = crypto.createHash('sha1').update(fs.readFileSync(outPath)).digest('hex');
      if (mediaHashes.has(hash)) {
        safeUnlink(outPath);
        continue;
      }
      mediaHashes.add(hash);
    } catch {}
    localMediaPaths.push(outPath);
  }

  return localMediaPaths;
}

function extractTopComments(commentsListing, maxItems = 8) {
  const out = [];
  const children = commentsListing?.[1]?.data?.children || [];
  for (const item of children) {
    const data = item?.data || {};
    const body = normalizeWhitespace(data.body || '');
    if (!body || body === '[deleted]' || body === '[removed]') continue;
    out.push({
      score: Number(data.score || 0),
      body,
    });
    if (out.length >= maxItems) break;
  }
  return out;
}

function buildEnrichedPost(post, commentsPayload = null) {
  const data = post || {};
  return {
    id: data.id,
    title: String(data.title || ''),
    content: normalizeWhitespace(data.selftext || ''),
    score: Number(data.score || 0),
    comments_count: Number(data.num_comments || 0),
    created_utc: Number(data.created_utc || 0),
    permalink: `https://www.reddit.com${data.permalink || ''}`,
    media: extractMediaCandidates(data),
    top_comments: commentsPayload ? extractTopComments(commentsPayload, COMMENT_LIMIT) : [],
  };
}

async function fetchRedditPostsByIds(ids = []) {
  const posts = [];
  for (const id of ids) {
    const commentsPayload = await fetchJson(`https://www.reddit.com/comments/${id}.json?limit=25&sort=top&raw_json=1`);
    const post = commentsPayload?.[0]?.data?.children?.[0]?.data;
    if (!post?.id) continue;
    posts.push(buildEnrichedPost(post, commentsPayload));
  }
  return posts;
}

async function fetchTopRedditPosts() {
  const payload = await fetchJson(`https://www.reddit.com/r/${encodeURIComponent(SUBREDDIT)}/top.json?t=month&limit=${FETCH_LIMIT}&raw_json=1`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const cutoff = nowSeconds - DAYS * 24 * 3600;
  const children = payload?.data?.children || [];
  const rows = children
    .map((item) => item?.data || {})
    .filter((post) => post?.id && !post?.stickied && Number(post?.created_utc || 0) >= cutoff)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  return rows.map((post) => buildEnrichedPost(post));
}

async function main() {
  const promptReference = fs.existsSync(PROMPT_FILE)
    ? fs.readFileSync(PROMPT_FILE, 'utf8')
    : '';
  if (!promptReference) throw new Error(`Missing prompt file: ${PROMPT_FILE}`);

  const xhsClients = resolveXhsClients();
  const videoCapability = await detectVideoPublishCapability(xhsClients);

  const state = await loadState();
  const posts = TARGET_IDS.length > 0
    ? await fetchRedditPostsByIds(TARGET_IDS)
    : await fetchTopRedditPosts();
  const candidates = posts.filter((post) => post.media.length > 0);

  const tempDir = await mkdtemp(TEMP_PREFIX);
  const results = [];
  let posted = 0;
  try {
    for (const post of candidates) {
      if (posted >= LIMIT) break;
      if (!FORCE && state[post.id]) {
        results.push({ id: post.id, status: 'skipped', reason: 'already_posted', url: post.permalink });
        continue;
      }

      const videoMedia = post.media.filter((item) => item.type === 'video').slice(0, 1);
      const imageMedia = post.media.filter((item) => item.type === 'image').slice(0, 9);
      const mediaType = videoMedia.length > 0 && videoCapability.ok ? 'video' : 'image';
      const selectedMedia = mediaType === 'video' ? videoMedia : imageMedia;
      if (videoMedia.length > 0 && mediaType !== 'video' && imageMedia.length === 0) {
        results.push({
          id: post.id,
          status: 'skipped',
          reason: videoCapability.reason || 'video_publish_unavailable',
          media_type: 'video',
          url: post.permalink,
          score: post.score,
        });
        continue;
      }
      if (!selectedMedia.length) {
        results.push({ id: post.id, status: 'skipped', reason: 'no_media_after_filter', url: post.permalink });
        continue;
      }

      const localMediaPaths = downloadAndDedupeMedia(post.id, selectedMedia, mediaType, tempDir);
      if (!localMediaPaths.length) {
        results.push({ id: post.id, status: 'skipped', reason: 'duplicate_media_only', url: post.permalink });
        continue;
      }

      if (!Array.isArray(post.top_comments) || post.top_comments.length === 0) {
        try {
          const commentsPayload = await fetchJson(`https://www.reddit.com/comments/${post.id}.json?limit=25&sort=top&raw_json=1`);
          post.top_comments = extractTopComments(commentsPayload, COMMENT_LIMIT);
        } catch {}
      }

      const draft = await rewritePost(promptReference, post, post.top_comments || []);
      if (!draft?.rewritten) {
        results.push({
          id: post.id,
          status: 'failed',
          media_type: mediaType,
          permalink: post.permalink,
          score: post.score,
          error: `rewrite_failed: ${draft?.rewrite_error || 'unknown'}`,
        });
        continue;
      }
      const payload = {
        title: truncateTitle(draft.title || ''),
        body: clipText(draft.body || '', 1200),
        topics: Array.isArray(draft.topics) ? draft.topics.slice(0, 5) : [],
      };
      if (!payload.title || !payload.body || payload.topics.length < 3) {
        throw new Error('rewritten payload missing title/body');
      }

      if (DRY_RUN) {
        results.push({
          id: post.id,
          status: 'dry_run',
          media_type: mediaType,
          title: payload.title,
          permalink: post.permalink,
        });
        posted += 1;
        continue;
      }

      try {
        const published = await publishViaXhs(xhsClients, payload, localMediaPaths, mediaType);
        const noteId = String(
          published?.response?.note_id
          || published?.response?.data?.id
          || ''
        );
        state[post.id] = {
          posted_at: new Date().toISOString(),
          note_id: noteId,
          media_type: mediaType,
          score: post.score,
          permalink: post.permalink,
          title: payload.title,
        };
        await saveState(state);

        results.push({
          id: post.id,
          status: 'posted',
          media_type: mediaType,
          note_id: noteId,
          method: published.method,
          permalink: post.permalink,
          score: post.score,
        });
        posted += 1;
      } catch (error) {
        const primaryError = error instanceof Error ? error.message : String(error);

        results.push({
          id: post.id,
          status: 'failed',
          media_type: mediaType,
          permalink: post.permalink,
          score: post.score,
          error: primaryError,
        });
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    ok: true,
    subreddit: SUBREDDIT,
    model: MODEL,
    target_ids: TARGET_IDS,
    days: DAYS,
    video_publish: videoCapability,
    requested_limit: LIMIT,
    fetched: posts.length,
    candidates_with_media: candidates.length,
    posted_count: results.filter((item) => item.status === 'posted').length,
    results,
    state_file: STATE_FILE,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
