import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

let sql = null;

export function getDb() {
  if (!sql && DATABASE_URL) {
    try {
      sql = neon(DATABASE_URL);
    } catch (error) {
      console.error('[MP API] Failed to create client:', error instanceof Error ? error.message : error);
      return null;
    }
  }
  return sql;
}
