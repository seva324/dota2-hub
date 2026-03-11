#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { normalizeAssetUrl } from '../lib/asset-mirror.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public', 'images', 'mirror');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'manifest.json');
const DEFAULT_SITE_BASE_URL = 'https://dota2-hub.vercel.app';
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
const FETCH_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  return {
    force: argv.includes('--force'),
    writeDb: argv.includes('--write-db'),
    limit: Number.parseInt((argv[argv.indexOf('--limit') + 1] || ''), 10) || null,
    siteBaseUrl: (argv[argv.indexOf('--site-base-url') + 1] || process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || DEFAULT_SITE_BASE_URL).replace(/\/$/, ''),
  };
}

function extFromContentType(contentType = '') {
  const value = String(contentType).toLowerCase();
  if (value.includes('image/png')) return '.png';
  if (value.includes('image/jpeg')) return '.jpg';
  if (value.includes('image/webp')) return '.webp';
  if (value.includes('image/svg+xml')) return '.svg';
  if (value.includes('image/gif')) return '.gif';
  return '';
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
    return '';
  } catch {
    return '';
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function loadManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return { generatedAt: null, mappings: {}, items: [] };
  }
}

async function saveManifest(manifest) {
  await ensureDir(PUBLIC_DIR);
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function fetchRows(limit) {
  if (!sql) throw new Error('DATABASE_URL or POSTGRES_URL is required');
  const [teams, players, heroes] = await Promise.all([
    sql`SELECT team_id, logo_url FROM teams WHERE logo_url IS NOT NULL AND logo_url <> '' ORDER BY team_id ASC ${limit ? sql`LIMIT ${limit}` : sql``}`,
    sql`SELECT account_id, avatar_url FROM pro_players WHERE avatar_url IS NOT NULL AND avatar_url <> '' ORDER BY account_id ASC ${limit ? sql`LIMIT ${limit}` : sql``}`,
    sql`SELECT hero_id, img_url, img FROM heroes ORDER BY hero_id ASC ${limit ? sql`LIMIT ${limit}` : sql``}`,
  ]);

  const items = [];
  for (const row of teams) {
    const sourceUrl = normalizeAssetUrl(row.logo_url);
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) continue;
    items.push({ kind: 'teams', id: String(row.team_id), sourceUrl, table: 'teams', column: 'logo_url', key: 'team_id' });
  }
  for (const row of players) {
    const sourceUrl = normalizeAssetUrl(row.avatar_url);
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) continue;
    items.push({ kind: 'players', id: String(row.account_id), sourceUrl, table: 'pro_players', column: 'avatar_url', key: 'account_id' });
  }
  for (const row of heroes) {
    const sourceUrl = normalizeAssetUrl(row.img_url || (row.img ? `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/${row.img}_lg.png` : null));
    if (!sourceUrl || !/^https?:\/\//.test(sourceUrl)) continue;
    items.push({ kind: 'heroes', id: String(row.hero_id), sourceUrl, table: 'heroes', column: 'img_url', key: 'hero_id' });
  }
  return items;
}

async function downloadOne(item, options, manifest) {
  const existingPath = manifest.mappings[item.sourceUrl];
  if (existingPath && !options.force) {
    return { ...item, mirroredPath: existingPath, skipped: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(item.sourceUrl, { headers: { 'user-agent': 'dota2-hub-asset-mirror/1.0' }, signal: controller.signal }).finally(() => clearTimeout(timer));
  if (!response.ok) {
    throw new Error(`download failed ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const ext = extFromContentType(contentType) || extFromUrl(item.sourceUrl) || '.png';
  const relativePath = `/images/mirror/${item.kind}/${item.id}${ext}`;
  const outputPath = path.join(ROOT_DIR, 'public', relativePath.replace(/^\//, ''));
  await ensureDir(path.dirname(outputPath));
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outputPath, buffer);
  manifest.mappings[item.sourceUrl] = relativePath;
  return { ...item, mirroredPath: relativePath, bytes: buffer.length, skipped: false };
}

async function maybeWriteDb(entries, options) {
  if (!options.writeDb || !sql) return;
  for (const entry of entries) {
    if (!entry.mirroredPath) continue;
    const value = `${options.siteBaseUrl}${entry.mirroredPath}`;
    const table = entry.table;
    const column = entry.column;
    const key = entry.key;
    await sql.query(`UPDATE ${table} SET ${column} = $1 WHERE ${key} = $2`, [value, entry.id]);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const manifest = await loadManifest();
  const items = await fetchRows(options.limit);
  const results = [];

  for (const [index, item] of items.entries()) {
    try {
      results.push(await downloadOne(item, options, manifest));
      process.stdout.write(`mirrored ${item.kind}/${item.id}\n`);
    } catch (error) {
      results.push({ ...item, error: error instanceof Error ? error.message : String(error) });
      process.stderr.write(`failed ${item.kind}/${item.id}: ${results.at(-1).error}\n`);
    }
    if ((index + 1) % 25 === 0) {
      manifest.generatedAt = new Date().toISOString();
      manifest.items = results.filter((entry) => entry.mirroredPath).map((entry) => ({ kind: entry.kind, id: entry.id, sourceUrl: entry.sourceUrl, mirroredPath: entry.mirroredPath }));
      await saveManifest(manifest);
    }
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.items = results
    .filter((entry) => entry.mirroredPath)
    .map((entry) => ({ kind: entry.kind, id: entry.id, sourceUrl: entry.sourceUrl, mirroredPath: entry.mirroredPath }));
  await saveManifest(manifest);
  await maybeWriteDb(results.filter((entry) => entry.mirroredPath), options);

  const succeeded = results.filter((entry) => entry.mirroredPath).length;
  const failed = results.filter((entry) => entry.error).length;
  console.log(JSON.stringify({ succeeded, failed, writeDb: options.writeDb, manifest: MANIFEST_PATH }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
