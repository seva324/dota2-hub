import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import {
  buildRequiredTranslationGlossaryPrompt,
  normalizeGlossaryTranslations,
  normalizeGlossaryTranslationsInMarkdown,
} from '../lib/translation-glossary.js';
import { sanitizeTranslatedArticleMarkdown, stripMarkdownEmphasis } from '../lib/news-translation-cleanup.js';
import { callLlmJson } from '../lib/openrouter.mjs';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DB_URL) throw new Error('Missing DATABASE_URL/POSTGRES_URL');
const sql = neon(DB_URL);
const promptDoc = fs.readFileSync(path.resolve(process.cwd(), 'docs/网站翻译需求.md'), 'utf8').trim();
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
  const glossaryPrompt = buildRequiredTranslationGlossaryPrompt({
    title: row.title_en || '',
    summary: row.summary_en || '',
    content: row.content_markdown_en || row.content_en || '',
  });
  const prompt = [
    promptDoc,
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
  const glossarySource = {
    title: row.title_en || '',
    summary: row.summary_en || '',
    content: row.content_markdown_en || row.content_en || '',
  };
  result.title_zh = normalizeGlossaryTranslations(result.title_zh || '', glossarySource);
  result.summary_zh = normalizeGlossaryTranslations(result.summary_zh || '', glossarySource);
  result.content_markdown_zh = sanitizeTranslatedArticleMarkdown(
    stripMarkdownEmphasis(normalizeGlossaryTranslationsInMarkdown(result.content_markdown_zh || '', glossarySource)),
    result.title_zh || ''
  );

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
