#!/usr/bin/env node
/**
 * 数据更新主脚本
 * 每天早上8点运行，更新所有数据
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = __dirname;

function runScript(scriptName) {
  console.log(`\n=== Running ${scriptName} ===`);
  try {
    execSync(`node ${path.join(SCRIPTS_DIR, scriptName)}`, {
      stdio: 'inherit',
      timeout: 300000, // 5分钟超时
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

  // 1. 从 OpenDota 获取比赛数据
  runScript('fetch-opendota.js');

  // 2. 从 Liquidpedia 获取赛事和战队信息
  // runScript('scrape-liquipedia.js'); // 需要 Playwright，暂时跳过

  console.log('\n========================================');
  console.log('Update completed!');
  console.log('Time:', new Date().toISOString());
  console.log('========================================');
}

main();
