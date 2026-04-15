import { neon } from '@neondatabase/serverless';
const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = neon(url);
const patterns = ['%PREMIER SERIES%', '%7.41%', '%英雄选用趋势分析%'];
const rows = await sql`
  SELECT id, title_en, title_zh, url, published_at
  FROM news_articles
  WHERE title_en ILIKE ANY(${patterns})
     OR title_zh ILIKE ANY(${patterns})
  ORDER BY published_at DESC NULLS LAST
  LIMIT 10
`;
console.log(JSON.stringify(rows, null, 2));
