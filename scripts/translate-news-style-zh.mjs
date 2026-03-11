import { neon } from '@neondatabase/serverless';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const API_KEY = process.env.MINIMAX_API_KEY || process.env.MINIMAX_TEXT_API_KEY || '';
const API_URL = process.env.MINIMAX_API_URL || 'https://api.minimax.io/anthropic/v1/messages';
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
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
if (!API_KEY) {
  console.error('Missing MINIMAX_API_KEY/MINIMAX_TEXT_API_KEY');
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
const FORCE = ['1', 'true', 'yes', 'on'].includes(String(arg('force', 'false')).toLowerCase());

function looksChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function looksLikeTranslationRefusal(text = '') {
  return /抱歉|请提供|请把完整|无法保证|没有看到正文|只看到了标题|not enough|provide the full/i.test(String(text));
}

function looksLikeStructuredArticle(text = '') {
  return /标题[:：]|正文[:：]|总结[:：]|点评[:：]/.test(String(text));
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

function extractText(data) {
  const txt = data?.choices?.[0]?.message?.content;
  if (Array.isArray(txt)) {
    return txt.map((x) => (typeof x?.text === 'string' ? x.text : '')).join('').trim();
  }
  if (typeof txt === 'string') return txt.trim();
  return '';
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function shortPrompt(text, tone) {
  const style = tone === 'gossip'
    ? '语气偏电竞八卦，轻松有梗但克制，不夸张不造谣。'
    : '语气偏新闻快讯，客观、准确、简洁。';
  return [
    NEWS_TRANSLATION_GUIDANCE,
    '',
    '将下列英文内容翻译为简体中文。',
    style,
    '要求：保留战队名、选手ID、赛事名等专有名词原文；不要添加原文没有的信息；只输出译文。',
    text,
  ].join('\n');
}

function markdownPrompt(text, tone) {
  const style = tone === 'gossip'
    ? '整体语气偏电竞八卦，轻松有梗但克制，不夸张不造谣。'
    : '整体语气偏新闻报道，客观、准确、简洁。';
  return [
    NEWS_TRANSLATION_GUIDANCE,
    '',
    '将下列 Dota2 新闻正文翻译为简体中文。',
    style,
    '要求：保留 markdown 链接、图片、列表、标题等语法；保留专有名词原文；保持段落结构；不要额外解释。',
    text,
  ].join('\n');
}

async function callMiniMax(prompt, maxTokens = 1400, timeoutMs = 25000) {
  const res = await fetchWithTimeout(
    API_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }),
    },
    timeoutMs
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MiniMax ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const out = extractText(data);
  if (!out) throw new Error('MiniMax empty response');
  return out;
}

async function translateTitle(row, tone) {
  if (!row?.title_en || looksChinese(row.title_en)) return row?.title_en || null;
  try {
    let out = await callMiniMax(shortPrompt(`${row.title_en}\n${row.summary_en || ''}`, tone), 700, 18000);
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callMiniMax([
        '把下面英文 Dota2 新闻标题改写成一个中文社区传播标题。',
        '要求：必须输出简体中文；保留专有名词原文；不能输出英文整句；不能输出标题/正文/总结标签；只输出一行标题。',
        row.title_en,
      ].join('\n'), 400, 15000);
    }
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callMiniMax([
        '将下面英文 Dota2 新闻标题直接翻译为简体中文标题。',
        '要求：必须输出中文；保留专有名词原文；只输出一行标题；不要解释。',
        row.title_en,
      ].join('\n'), 400, 15000);
    }
    return out;
  } catch {
    return row.title_en;
  }
}

async function translateSummary(row) {
  const seed = row?.summary_en || row?.content_en || row?.content_markdown_en || row?.title_en;
  if (!seed || looksChinese(seed)) return row?.summary_en || seed || null;
  try {
    let out = await callMiniMax([
      NEWS_TRANSLATION_GUIDANCE,
      '',
      '请基于下面英文 Dota2 新闻信息，写一句简短点评/总结。',
      '要求：',
      '- 20 到 50 字',
      '- 口语化，但不要乱玩梗',
      '- 只输出一句中文，不要标题，不要正文，不要解释',
      '',
      `英文标题：${row.title_en || ''}`,
      row.summary_en ? `英文摘要：${row.summary_en}` : '',
      row.content_en ? `英文正文：${String(row.content_en).slice(0, 1600)}` : '',
    ].join('\n'), 800, 18000);
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callMiniMax([
        '基于下面英文 Dota2 新闻信息，写一句中文总结。',
        '要求：必须输出简体中文；20到50字；不能道歉；不能要求补充材料；不能输出标题/正文/总结标签；只输出一句话。',
        `标题：${row.title_en || ''}`,
        row.summary_en ? `摘要：${row.summary_en}` : '',
        row.content_en ? `正文：${String(row.content_en).slice(0, 1200)}` : '',
      ].join('\n'), 400, 15000);
    }
    if (!looksChinese(out) || looksLikeStructuredArticle(out) || looksLikeTranslationRefusal(out)) {
      out = await callMiniMax([
        '把下面英文 Dota2 新闻摘要翻译并压缩成一句简体中文总结。',
        '要求：必须输出中文；20到50字；只输出一句话；不要解释。',
        `标题：${row.title_en || ''}`,
        row.summary_en ? `摘要：${row.summary_en}` : '',
        row.content_en ? `正文：${String(row.content_en).slice(0, 1200)}` : '',
      ].join('\n'), 400, 15000);
    }
    return out;
  } catch {
    return row.summary_en || row.title_en || null;
  }
}

async function translateMarkdown(text, tone) {
  if (!text || looksChinese(text)) return text || null;
  const chunks = splitTextChunks(text, CHUNK_MAX);
  const out = [];
  for (const chunk of chunks) {
    try {
      let translated = await callMiniMax(markdownPrompt(chunk, tone), 1800, 26000);
      if (!looksChinese(translated) || looksLikeTranslationRefusal(translated)) {
        translated = await callMiniMax([
          '把下面英文 Dota2 新闻正文翻译成简体中文社区搬运帖风格。',
          '要求：必须输出中文正文；保留 markdown 结构；保留专有名词原文；不要道歉；不要要求补充材料；不要输出标题/总结标签。',
          chunk,
        ].join('\n'), 1800, 22000);
      }
      if (!looksChinese(translated) || looksLikeTranslationRefusal(translated)) {
        translated = await callMiniMax([
          '将下面英文 Dota2 新闻正文完整翻译为简体中文。',
          '要求：必须输出中文正文；保留 markdown 结构；保留专有名词原文；不要解释。',
          chunk,
        ].join('\n'), 1800, 22000);
      }
      out.push(translated);
    } catch {
      out.push(chunk);
    }
  }
  return out.join('\n\n');
}

async function loadPending(limit, force = false) {
  if (force) {
    return sql`
      SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh
      FROM news_articles
      WHERE (
        COALESCE(title_en, '') <> ''
        OR COALESCE(summary_en, '') <> ''
        OR COALESCE(content_en, '') <> ''
        OR COALESCE(content_markdown_en, '') <> ''
      )
      ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
      LIMIT ${limit}
    `;
  }

  return sql`
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh
    FROM news_articles
    WHERE (
      COALESCE(title_en, '') <> ''
      OR COALESCE(summary_en, '') <> ''
      OR COALESCE(content_en, '') <> ''
      OR COALESCE(content_markdown_en, '') <> ''
    )
    AND (
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
    SELECT id, url, title_en, summary_en, content_en, content_markdown_en, title_zh, summary_zh, content_zh, content_markdown_zh
    FROM news_articles
    WHERE (
      COALESCE(title_en, '') <> ''
      OR COALESCE(summary_en, '') <> ''
      OR COALESCE(content_en, '') <> ''
      OR COALESCE(content_markdown_en, '') <> ''
    )
    ORDER BY published_at DESC NULLS LAST, updated_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

async function updateRow(row, zh) {
  await sql`
    UPDATE news_articles
    SET
      title_zh = ${zh.title_zh || null},
      summary_zh = ${zh.summary_zh || null},
      content_markdown_zh = ${zh.content_markdown_zh || null},
      content_zh = ${zh.content_zh || null},
      updated_at = NOW()
    WHERE id = ${row.id}
  `;
}

async function translateOne(row, force = false) {
  const tone = detectTone(row);
  const title_zh = force ? await translateTitle(row, tone) : (row.title_zh || await translateTitle(row, tone));
  const summary_zh = force ? await translateSummary(row) : (row.summary_zh || await translateSummary(row));
  const content_markdown_zh = force
    ? await translateMarkdown(row.content_markdown_en, tone)
    : (row.content_markdown_zh || await translateMarkdown(row.content_markdown_en, tone));
  const content_zh = content_markdown_zh ? stripMarkdown(content_markdown_zh) : (row.content_en || null);

  await updateRow(row, { title_zh, summary_zh, content_markdown_zh, content_zh });
}

async function main() {
  let done = 0;

  if (FORCE) {
    const rows = await loadForceRows(TOTAL_LIMIT);
    for (const row of rows) {
      await translateOne(row, true);
      done += 1;
      console.log(`translated ${done}/${rows.length} id=${row.id}`);
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
    `;
    console.log(JSON.stringify({ translated: done, target: rows.length, total_with_en: left?.[0]?.c ?? null }, null, 2));
    return;
  }

  while (done < TOTAL_LIMIT) {
    const need = Math.min(BATCH_SIZE, TOTAL_LIMIT - done);
    const rows = await loadPending(need, FORCE);
    if (!rows.length) break;

    for (const row of rows) {
      await translateOne(row, FORCE);
      done += 1;
      console.log(`translated ${done}/${TOTAL_LIMIT} id=${row.id}`);
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
