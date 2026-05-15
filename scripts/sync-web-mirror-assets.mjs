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
  // Only sync manifest.json — mirror PNGs (347MB+) exhaust EdgeOne build
  // disk space when Vite copies public/ to dist/.  EdgeOne CDN serves them
  // from the repo-root public/ directory.
  for (const entry of ['manifest.json']) {
    const src = path.join(SOURCE_DIR, entry);
    const dst = path.join(TARGET_DIR, entry);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.cp(src, dst, { force: true });
  }
  console.log(`[sync-web-mirror-assets] synced manifest.json ${SOURCE_DIR} -> ${TARGET_DIR}`);
}

main().catch((error) => {
  console.error('[sync-web-mirror-assets] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
