#!/usr/bin/env node
/**
 * 数据更新主脚本
 * 每天早上8点运行，更新所有数据
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPTS_DIR = __dirname;

function runScript(scriptName) {
  console.log(`\n=== Running ${scriptName} ===`);
  try {
    execSync(`node ${path.join(SCRIPTS_DIR, scriptName)}`, {
      stdio: 'inherit',
      timeout: 300000,
    });
    console.log(`✓ ${scriptName} completed`);
  } catch (error) {
    console.error(`✗ ${scriptName} failed:`, error.message);
  }
}

async function main() {
  console.log('========================================');
  console.log('DOTA2 Hub - Daily Data Update');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');

  runScript('fetch-opendota.js');

  console.log('\n========================================');
  console.log('Update completed!');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');
}

main();
