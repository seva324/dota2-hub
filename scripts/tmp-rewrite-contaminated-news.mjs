import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { buildTranslationGlossaryPrompt } from '../lib/translation-glossary.js';
import { callLlmJson } from '../lib/openrouter.mjs';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB_URL) throw new Error('Missing DATABASE_URL/POSTGRES_URL');
const sql = neon(DB_URL);
const promptDoc = fs.readFileSync(path.resolve(process.cwd(), 'docs/xhs-community-post-prompt.md'), 'utf8').trim();
const ids = [
  'cyberscore-liveennewsbestandworstlanersprodotanoxvillestats',
  'cyberscore-scyberscoreliveennewsdota2patch741bmainchanges',
  'hawk-livepostsvalveunexpectedlyreleasedpatch741bfordota2',
  'cyberscore-kkiwillreplaceboxionteamliquidforthepremierseries',
  'cyberscore-formeryellowsubmarineplayershaveunitedunderanewtag',
  'cyberscore-ilangotintoaconflictwithaukrainianstreamersketcher'
];
const rows = await sql`
  select id, title_en, summary_en, content_en, content_markdown_en
  from news_articles
  where id = any(${ids})
  order by id`;

const stripMarkdown = (text = '') => String(text || '')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/`[^`]*`/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^>\s?/gm, '')
  .replace(/^#+\s+/gm, '')
  .replace(/[\*_~]/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const results = [];
for (const row of rows) {
  const glossaryPrompt = buildTranslationGlossaryPrompt({
    title: row.title_en || '',
    summary: row.summary_en || '',
    content: row.content_markdown_en || row.content_en || '',
  });
  const prompt = [
    promptDoc,
    '',
    '---',
    '下面是站内新闻翻译任务，不是小红书发帖任务。',
    '请复用上面提示词里的中文风格、表达偏好、信息取舍原则和 Dota2 观众视角。',
    '但忽略其中关于 JSON/topics/标题字数/正文字数/压缩到380字的限制。',
    '只输出网站翻译字段，不要发帖话题，不要写“标题：”“正文：”“总结：”“点评：”“话题：”等字段标签。',
    '整篇文章要一次性完整翻译，不要拆成多个小节标题+总结，不要在正文里重复生成额外标题。',
    '',
    glossaryPrompt,
    glossaryPrompt ? '' : '',
    '请严格输出 JSON：',
    '{',
    '  "title_zh": "自然完整的中文标题，不限长度",',
    '  "summary_zh": "1到2句中文摘要，不限长度，但不要空话",',
    '  "content_markdown_zh": "完整中文正文，保留 markdown 图片、链接、段落结构"',
    '}',
    '',
    `英文标题：${row.title_en || ''}`,
    row.summary_en ? `英文摘要：${row.summary_en}` : '',
    '',
    '英文正文（markdown）：',
    row.content_markdown_en || row.content_en || '',
  ].filter(Boolean).join('\n');

  const result = await callLlmJson(prompt, {
    type: 'object',
    properties: {
      title_zh: { type: 'string' },
      summary_zh: { type: 'string' },
      content_markdown_zh: { type: 'string' },
    },
    required: ['title_zh', 'summary_zh', 'content_markdown_zh'],
    additionalProperties: false,
  }, {
    model: 'google/gemma-4-31b-it',
    timeoutMs: 120000,
    maxTokens: 4000,
  });

  await sql`
    update news_articles
    set title_zh = ${String(result.title_zh || '').trim() || null},
        summary_zh = ${String(result.summary_zh || '').trim() || null},
        content_markdown_zh = ${String(result.content_markdown_zh || '').trim() || null},
        content_zh = ${stripMarkdown(result.content_markdown_zh || '') || null},
        translation_status = ${'completed'},
        translation_provider = ${'openrouter'},
        title_zh_provider = ${'openrouter'},
        summary_zh_provider = ${'openrouter'},
        content_zh_provider = ${'openrouter'},
        translated_at = NOW(),
        updated_at = NOW()
    where id = ${row.id}`;

  results.push({ id: row.id, title_zh: result.title_zh });
}

console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
