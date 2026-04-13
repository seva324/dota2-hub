import { neon } from '@neondatabase/serverless';
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error('Missing DATABASE_URL/POSTGRES_URL');
const sql = neon(url);
const cutoff = Math.floor(Date.now()/1000) - 7*24*3600;
const rows = await sql`
  select id, source, title_zh, translation_status,
         left(coalesce(content_markdown_zh,''), 2500) as body
  from news_articles
  where published_at >= ${cutoff}
  order by published_at desc`;
const bad = rows.filter((row) => {
  const body = String(row.body || '');
  const titleBodyCount = (body.match(/标题[:：]|正文[:：]|总结[:：]|点评[:：]/g) || []).length;
  const h1Count = (body.match(/^#\s+/gm) || []).length;
  const h2Count = (body.match(/^###\s+/gm) || []).length;
  return titleBodyCount > 0 || h1Count > 1 || h2Count > 2;
}).map((row) => ({
  id: row.id,
  source: row.source,
  title_zh: row.title_zh,
  translation_status: row.translation_status,
  titleBodyCount: (String(row.body || '').match(/标题[:：]|正文[:：]|总结[:：]|点评[:：]/g) || []).length,
  h1Count: (String(row.body || '').match(/^#\s+/gm) || []).length,
  h2Count: (String(row.body || '').match(/^###\s+/gm) || []).length,
  preview: String(row.body || '').slice(0, 900),
}));
console.log(JSON.stringify(bad.slice(0, 20), null, 2));
