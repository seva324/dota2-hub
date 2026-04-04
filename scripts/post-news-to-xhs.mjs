import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';
import { callLlmJson } from '../lib/openrouter.mjs';

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
const TEMPLATE = getArg('template', 'auto');
const PRESET = getArg('preset', process.env.XHS_POST_PRESET || 'default');
const AI_REWRITE = !['0', 'false', 'no', 'off'].includes(String(getArg('ai-rewrite', process.env.XHS_AI_REWRITE || 'true')).toLowerCase());
const REWRITE_MODEL = getArg('rewrite-model', process.env.XHS_REWRITE_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash');
const REWRITE_TIMEOUT_MS = Math.max(5000, Number(getArg('ai-timeout-ms', process.env.XHS_REWRITE_TIMEOUT_MS || '60000')) || 60000);
const XHS_POST_TIMEOUT_MS = Math.max(10000, Number(getArg('post-timeout-ms', process.env.XHS_POST_TIMEOUT_MS || '180000')) || 180000);
const LOCK_STALE_MS = Math.max(60000, Number(getArg('lock-stale-ms', process.env.XHS_POST_LOCK_STALE_MS || '900000')) || 900000);
const LOCK_FILE = getArg('lock-file', process.env.XHS_POST_LOCK_FILE || path.join(os.homedir(), '.dota2-hub', 'xhs-post.lock'));
const WECHAT_AUTO_DRAFT = !['0', 'false', 'no', 'off'].includes(String(getArg('wechat-auto-draft', process.env.WECHAT_AUTO_DRAFT || 'true')).toLowerCase());
const REWRITE_PROMPT_FILE = getArg(
  'prompt-file',
  process.env.XHS_REWRITE_PROMPT_FILE || path.resolve(process.cwd(), 'docs/xhs-community-post-prompt.md')
);

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

function trimTrailingPunctuation(text = '') {
  return String(text || '').replace(/[\s，。！？、；：,.!?;:]+$/g, '').trim();
}

function clipTextComplete(text = '', maxLen = 420) {
  const plain = normalizeWhitespace(stripMarkdown(text));
  if (plain.length <= maxLen) return plain;

  const slice = plain.slice(0, maxLen).trim();
  const breakpoints = ['\n\n', '。', '！', '？', '；', '\n', '，', '、', ' '];
  for (const breakpoint of breakpoints) {
    const idx = slice.lastIndexOf(breakpoint);
    if (idx >= Math.max(8, Math.floor(maxLen * 0.45))) {
      const candidate = trimTrailingPunctuation(slice.slice(0, idx));
      if (candidate) return candidate;
    }
  }

  return trimTrailingPunctuation(slice);
}

function countHanChars(text = '') {
  const matches = String(text || '').match(/[\u4e00-\u9fff]/g);
  return matches ? matches.length : 0;
}

function truncateTitle(text = '', maxHanChars = 20, maxTotalChars = 60) {
  const clean = normalizeWhitespace(text);
  if (!clean) return '';
  if (countHanChars(clean) <= maxHanChars && clean.length <= maxTotalChars) return clean;

  let han = 0;
  let total = 0;
  let slice = '';
  for (const ch of clean) {
    const nextHan = /[\u4e00-\u9fff]/.test(ch) ? han + 1 : han;
    const nextTotal = total + 1;
    if (nextHan > maxHanChars || nextTotal > maxTotalChars) break;
    slice += ch;
    han = nextHan;
    total = nextTotal;
  }
  if (!slice) return clean.slice(0, Math.min(clean.length, maxTotalChars));

  // Break at natural points instead of mid-word
  const breakpoints = ['：', ':', '，', ',', '。', ' '];
  for (const bp of breakpoints) {
    const idx = slice.lastIndexOf(bp);
    if (idx >= Math.floor(slice.length * 0.5)) {
      return trimTrailingPunctuation(slice.slice(0, idx));
    }
  }
  return trimTrailingPunctuation(slice);
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

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeWhitespace(value || '');
    if (normalized) return normalized;
  }
  return '';
}

function sanitizeArticleBody(row) {
  const title = normalizeWhitespace(row.title_zh || row.title_en || '');
  let text = normalizeWhitespace(stripMarkdown(
    row.content_zh || row.content_markdown_zh || row.summary_zh || row.content_en || row.content_markdown_en || row.summary_en || ''
  ));
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

function detectPostType(row) {
  const text = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.summary_en || ''}\n${row.content_zh || ''}\n${row.content_en || ''}`;
  if (/赛程|schedule|standings|results|开打|奖金池|grand final|group stage/i.test(text)) return 'event';
  if (/回应|谈|表示|explained|spoke|said|commented|发声/i.test(text)) return 'postmatch';
  if (/离开|离队|转会|合同|inactive|return|didn.?t leave/i.test(text)) return 'transfer';
  if (/排名|best mid|top 5|评选|评出|名单/i.test(text)) return 'ranking';
  return 'news';
}

function resolveTemplate(row) {
  if (TEMPLATE && TEMPLATE !== 'auto') return TEMPLATE;
  return detectPostType(row);
}

function resolvePreset() {
  return PRESET || 'default';
}

function extractSentences(text = '') {
  return normalizeWhitespace(text)
    .replace(/\n/g, ' ')
    .split(/(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBulletLines(sentences, limit = 3, maxLen = 34) {
  const items = [];
  for (const sentence of sentences) {
    const plain = normalizeWhitespace(sentence).replace(/[。！？!?]+$/g, '');
    if (!plain || plain.length < 8) continue;
    const clipped = plain.length > maxLen ? `${plain.slice(0, maxLen - 1).trim()}…` : plain;
    items.push(`- ${clipped}`);
    if (items.length >= limit) break;
  }
  return items;
}

function buildLead(row, articleBody, postType) {
  const summary = normalizeWhitespace(row.summary_zh || row.summary_en || '');
  if (summary) return clipTextComplete(summary, 52);
  const firstSentence = extractSentences(articleBody)[0];
  if (firstSentence) return clipTextComplete(firstSentence, 52);
  if (postType === 'event') return '这站比赛信息已经出来了，先看重点。';
  if (postType === 'transfer') return '这条阵容动态和外界之前的判断不太一样。';
  if (postType === 'postmatch') return '这场赛后复盘已经把问题点得很直接。';
  if (postType === 'ranking') return '这份排名已经出来了，先看最核心的信息。';
  return '这条新闻的重点，先直接放前面。';
}

function buildInfoBullets(row, articleBody, postType) {
  const sentences = extractSentences(articleBody);
  const withoutLead = sentences.slice(1);
  const bullets = toBulletLines(withoutLead, postType === 'event' ? 4 : 3, 32);
  if (bullets.length) return bullets;

  if (postType === 'event') {
    return [
      '- 比赛时间和赛制已经确定',
      '- 热门队伍基本都在',
      '- 这站前期就会有高强度对局',
    ];
  }
  if (postType === 'ranking') {
    return [
      '- 排名核心信息已经给出',
      '- 前几位基本是本次赛事讨论焦点',
      '- 这类榜单更容易引发选手表现讨论',
    ];
  }
  return ['- 关键信息已经明确', '- 后续走势还值得继续看'];
}

function buildImpactLine(row, postType) {
  const text = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.summary_en || ''}\n${row.content_zh || ''}\n${row.content_en || ''}`;
  if (postType === 'event') return '看点基本集中在赛制、热门队状态和强强对话。';
  if (postType === 'transfer') return '这说明他和现有队伍的关系还没有真正画上句号。';
  if (postType === 'postmatch') return '这场最可惜的不是完全打不过，而是关键决策把机会送掉了。';
  if (postType === 'ranking') return '这种榜单本身不算定论，但很容易带起一波选手表现讨论。';
  if (/版本|patch/i.test(text)) return '真正有讨论度的还是版本变化会不会影响后面比赛。';
  return '这条消息本身不算长，但后续讨论空间还挺大。';
}

function buildCommentLine(postType) {
  if (postType === 'event') return '最近只想追一站比赛的，可以先把这站记上。';
  if (postType === 'transfer') return '后面会不会再有新动向，估计还得继续看。';
  if (postType === 'postmatch') return '上限还在，但关键局稳定性确实得再观察。';
  if (postType === 'ranking') return '你要是自己排这份榜，前几位大概率也绕不开这些名字。';
  return '这条先记下，后面大概率还会有后续。';
}

function buildTemplateTitle(row, template) {
  const titleZh = normalizeWhitespace(row.title_zh || '');
  const titleEn = normalizeWhitespace(row.title_en || '');
  const sourceText = `${titleZh}\n${titleEn}`;
  const base = titleZh || titleEn || 'DOTA2新闻';
  if (template === 'event') {
    if (/PGL Wallachia/i.test(sourceText)) return 'PGL Wallachia S7赛程公布';
    return clipText(base
      .replace(/将于2026年3月在布加勒斯特举行，16队争夺100万美元奖金池/g, '赛程公布：16队争100万美元奖金')
      .replace(/赛程公布：3月7日罗马尼亚开打，16队争夺100万美元奖金/g, '赛程公布：16队争100万美元奖金'), 26);
  }
  if (template === 'postmatch') {
    if (/Panto|Team Spirit/i.test(sourceText)) return 'Panto复盘Spirit失利';
    return clipText(base
      .replace(/Team Spirit 队长 /g, '')
      .replace(/谈队伍在 PGL Wallachia Season 7 季后赛不敌 BetBoom Team 的原因/g, '复盘失利：问题出在BP和Roshan团'), 26);
  }
  if (template === 'transfer') {
    if (/TORONTOTOKYO/i.test(sourceText)) return 'TORONTOTOKYO回应去向';
    return clipText(base
      .replace(/澄清：其实没有离开Aurora，还在领工资/g, '回应去向：目前仍在Aurora合同中'), 26);
  }
  if (template === 'ranking') {
    if (/Larl/i.test(sourceText)) return 'Larl评S7中单：Nisha第一';
    return clipText(base
      .replace(/评选PGL瓦拉几亚赛季7最佳中单/g, '评PGL瓦拉几亚S7中单：Nisha排第一')
      .replace(/Larl Names the Best Mid Laners at PGL Wallachia Season 7/g, 'Larl评PGL瓦拉几亚S7中单：Nisha排第一'), 26);
  }
  return clipText(base, 26);
}

function buildBodyFromTemplate(row, template) {
  const articleBody = sanitizeArticleBody(row);
  const summary = normalizeWhitespace(row.summary_zh || row.summary_en || '');
  const text = `${row.title_zh || ''}\n${row.title_en || ''}\n${articleBody}`;
  if (template === 'event') {
    const lead = summary || '这站比赛信息已经出来了，先看最核心的部分。';
    return normalizeWhitespace([
      clipText(lead, 52),
      '',
      '- 比赛时间和赛制已经确定',
      '- 小组赛采用瑞士轮',
      '- 季后赛为双败淘汰赛',
      '- 热门队伍基本都在这站出战',
      '',
      '这站前几天就会有高强度对局，赛制本身也比较有看点。',
      '',
      '最近想认真追一站比赛的，可以先把这站记上。',
    ].join('\n'));
  }
  if (template === 'transfer') {
    const lead = summary || '这条阵容动态和外界之前的判断不太一样。';
    return normalizeWhitespace([
      clipText(lead, 52),
      '',
      '- 选手目前仍在原队合同期内',
      '- 当前处于不活跃 / 预备名单状态',
      '- 工资或合同关系没有完全中断',
      '- 外界此前对"已经离队"的判断并不准确',
      '',
      '这说明他和现有队伍的关系还没有真正画上句号。',
      '',
      '后面会不会有新去向，估计还得继续看。',
    ].join('\n'));
  }
  if (template === 'postmatch') {
    const lead = summary || '赛后复盘已经把问题点得比较直接。';
    return normalizeWhitespace([
      clipTextComplete(lead, 52),
      '',
      '- 主要问题集中在BP处理',
      '- 系列赛中段一度还能咬住局势',
      '- 关键转折点出现在Roshan附近',
      '- 决策失误直接把机会送掉了',
      '',
      '这场最可惜的不是完全打不过，而是关键决策把机会白给了。',
      '',
      '上限还在，但关键局稳定性确实得再观察。',
    ].join('\n'));
  }
  if (template === 'ranking') {
    const lead = summary || '这份排名已经出来了，重点看前几位。';
    return normalizeWhitespace([
      clipText(lead, 52),
      '',
      '- 排名核心信息已经给出',
      '- 第一梯队基本就是这次赛事热议人选',
      '- 排名里也带出了选手近期状态讨论',
      '- 这种榜单本身就容易引发对比',
      '',
      '这种榜单本身不算定论，但很容易带起一波选手表现讨论。',
      '',
      '你要是自己排这份榜，前几位大概率也绕不开这些名字。',
    ].join('\n'));
  }

  const lead = buildLead(row, articleBody, template);
  const bullets = buildInfoBullets(row, articleBody, template);
  const impact = buildImpactLine(row, template);
  const comment = buildCommentLine(template);
  return normalizeWhitespace([
    lead,
    '',
    ...bullets,
    '',
    impact,
    '',
    comment,
  ].join('\n'));
}

function buildBody(row) {
  const overrideBody = CUSTOM_BODY || readOptionalFile(CUSTOM_BODY_FILE);
  if (overrideBody) return normalizeWhitespace(overrideBody);
  const template = resolveTemplate(row);
  const preset = resolvePreset();
  const limit = preset === 'concise-news' ? 300 : 400;
  return clipTextComplete(buildBodyFromTemplate(row, template), limit);
}

function buildTitle(row) {
  const overrideTitle = CUSTOM_TITLE || readOptionalFile(CUSTOM_TITLE_FILE);
  if (overrideTitle) return truncateTitle(normalizeWhitespace(overrideTitle), 20, 60);
  return truncateTitle(buildTemplateTitle(row, resolveTemplate(row)), 20, 60);
}

function buildTopic(row) {
  if (CUSTOM_TOPIC) return CUSTOM_TOPIC;
  const sourceText = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.summary_en || ''}\n${row.content_zh || ''}\n${row.content_en || ''}`;
  if (/PGL Wallachia/i.test(sourceText)) return 'PGL Wallachia';
  if (/Team Spirit/i.test(sourceText)) return 'Team Spirit';
  if (/Dota 2|DOTA2|刀塔/i.test(sourceText)) return 'DOTA2';
  return null;
}

const REWRITE_PROMPT_REFERENCE = maybeReadText(REWRITE_PROMPT_FILE);

function buildRewritePrompt(row, draft) {
  const articleBody = clipText(sanitizeArticleBody(row), 1800);
  return [
    REWRITE_PROMPT_REFERENCE,
    '',
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
