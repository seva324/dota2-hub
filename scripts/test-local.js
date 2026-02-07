#!/usr/bin/env node
/**
 * 本地测试脚本 - 验证数据抓取和网站构建
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('DOTA2 Hub - Local Test');
console.log('========================================\n');

// 1. 初始化数据库
console.log('1. Initializing database...');
try {
  execSync('node scripts/init-db.js', { stdio: 'inherit' });
  console.log('✓ Database initialized\n');
} catch (e) {
  console.error('✗ Database init failed:', e.message);
  process.exit(1);
}

// 2. 抓取数据
console.log('2. Fetching data from OpenDota...');
try {
  execSync('node scripts/fetch-opendota.js', { stdio: 'inherit' });
  console.log('✓ Data fetched\n');
} catch (e) {
  console.error('✗ Data fetch failed:', e.message);
  process.exit(1);
}

// 3. 导出静态数据
console.log('3. Exporting static data...');
try {
  execSync('node scripts/export-static-data.js', { stdio: 'inherit' });
  console.log('✓ Static data exported\n');
} catch (e) {
  console.error('✗ Export failed:', e.message);
  process.exit(1);
}

// 4. 检查数据文件
console.log('4. Checking data files...');
const dataDir = path.join(__dirname, '..', 'public', 'data');
const files = ['home.json', 'matches.json', 'cn-matches.json', 'upcoming.json'];

for (const file of files) {
  const filePath = path.join(dataDir, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const count = Array.isArray(data) ? data.length : (data.cnMatches?.length || 0);
    console.log(`✓ ${file}: ${count} records, ${Math.round(stats.size / 1024)}KB`);
  } else {
    console.log(`✗ ${file}: NOT FOUND`);
  }
}

// 5. 显示中国战队比赛样例
console.log('\n5. Sample China Team Matches:');
const homeData = JSON.parse(fs.readFileSync(path.join(dataDir, 'home.json'), 'utf8'));
if (homeData.cnMatches && homeData.cnMatches.length > 0) {
  homeData.cnMatches.slice(0, 3).forEach((match, i) => {
    console.log(`   ${i + 1}. ${match.radiant_team_name_cn || match.radiant_team_name} ${match.radiant_game_wins}:${match.dire_game_wins} ${match.dire_team_name_cn || match.dire_team_name}`);
  });
} else {
  console.log('   No China team matches found!');
}

// 6. 显示即将开始的比赛
console.log('\n6. Upcoming Matches:');
if (homeData.upcoming && homeData.upcoming.length > 0) {
  homeData.upcoming.slice(0, 3).forEach((match, i) => {
    const time = new Date(match.start_time * 1000).toLocaleString('zh-CN');
    console.log(`   ${i + 1}. ${match.radiant_team_name} vs ${match.dire_team_name} (${time})`);
  });
} else {
  console.log('   No upcoming matches found!');
}

console.log('\n========================================');
console.log('Test completed!');
console.log('Run "npm run build" to build the site.');
console.log('========================================');
