/**
 * Database connection module for Neon PostgreSQL
 *
 * Single shared Neon client — every module imports getDb() from here.
 * Uses DATABASE_URL_UNPOOLED for long-running syncs / cron, falling back
 * to the pooled DATABASE_URL for typical request-handler queries.
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

let sql = null;

/**
 * Get the shared Neon SQL client (singleton).
 */
export function getDb() {
  if (!sql && DATABASE_URL) {
    sql = neon(DATABASE_URL);
  }
  return sql;
}

/**
 * Check if database is available
 */
export async function isDbAvailable() {
  try {
    const db = getDb();
    if (!db) return false;
    await db`SELECT 1`;
    return true;
  } catch (error) {
    console.error('[DB] Connection failed:', error.message);
    return false;
  }
}

/**
 * Ensure core performance indexes exist (idempotent).
 * Call once on cold start — cheap IF NOT EXISTS DDL.
 */
export async function ensureCoreIndexes(db) {
  const statements = [
    `CREATE INDEX IF NOT EXISTS idx_matches_start_time ON matches(start_time DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_matches_league_id ON matches(league_id)`,
    `CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status)`,
    `CREATE INDEX IF NOT EXISTS idx_upcoming_start_time ON upcoming_matches(start_time)`,
    `CREATE INDEX IF NOT EXISTS idx_upcoming_status ON upcoming_matches(status)`,
    `CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles(published_at DESC)`,
  ];
  for (const sql of statements) {
    await db.query(sql);
  }
}
