#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'public', 'images', 'mirror');
const TARGET_DIR = path.join(ROOT_DIR, 'apps', 'web', 'public', 'images', 'mirror');

async function main() {
  await fs.access(SOURCE_DIR);
  await fs.rm(TARGET_DIR, { recursive: true, force: true });
  await fs.mkdir(path.dirname(TARGET_DIR), { recursive: true });
  await fs.cp(SOURCE_DIR, TARGET_DIR, { recursive: true, force: true });
  console.log(`[sync-web-mirror-assets] synced ${SOURCE_DIR} -> ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error('[sync-web-mirror-assets] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
