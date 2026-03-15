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
const TEMPLATE = getArg('template', 'auto');

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

function detectPostType(row) {
  const text = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.content_zh || ''}\n${row.content_en || ''}`;
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
    const plain = normalizeWhitespace(sentence).replace(/[。！？!?]+$/, '');
    if (!plain || plain.length < 8) continue;
    const clipped = plain.length > maxLen ? `${plain.slice(0, maxLen - 1).trim()}…` : plain;
    items.push(`- ${clipped}`);
    if (items.length >= limit) break;
  }
  return items;
}

function buildLead(row, articleBody, postType) {
  const summary = normalizeWhitespace(row.summary_zh || '');
  if (summary) return clipText(summary, 52);
  const firstSentence = extractSentences(articleBody)[0];
  if (firstSentence) return clipText(firstSentence, 52);
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
  const text = `${row.title_zh || ''}\n${row.title_en || ''}\n${row.summary_zh || ''}\n${row.content_zh || ''}`;
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
  const summary = normalizeWhitespace(row.summary_zh || '');
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
      '- 外界此前对“已经离队”的判断并不准确',
      '',
      '这说明他和现有队伍的关系还没有真正画上句号。',
      '',
      '后面会不会有新去向，估计还得继续看。',
    ].join('\n'));
  }
  if (template === 'postmatch') {
    const lead = summary || '赛后复盘已经把问题点得比较直接。';
    return normalizeWhitespace([
      clipText(lead, 52),
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
  return clipText(buildBodyFromTemplate(row, template), 220);
}

function buildTitle(row) {
  const overrideTitle = CUSTOM_TITLE || readOptionalFile(CUSTOM_TITLE_FILE);
  if (overrideTitle) return clipText(normalizeWhitespace(overrideTitle), 32);
  return buildTemplateTitle(row, resolveTemplate(row));
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
