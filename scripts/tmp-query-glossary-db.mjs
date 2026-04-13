import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8').split(/\n/).filter(Boolean);
for (const line of env) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] = v;
}

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
const tables = await sql`
  select table_schema, table_name
  from information_schema.tables
  where table_schema not in ('pg_catalog','information_schema')
  order by table_schema, table_name
`;
const cols = await sql`
  select table_schema, table_name, column_name
  from information_schema.columns
  where table_schema not in ('pg_catalog','information_schema')
    and (table_name ilike '%gloss%' or column_name ilike '%gloss%')
  order by table_schema, table_name, ordinal_position
`;
console.log(JSON.stringify({ tables, glossary_like_columns: cols }, null, 2));
