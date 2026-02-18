#!/usr/bin/env node

/**
 * Fetch upcoming matches from Liquipedia
 * Run: node scripts/fetch-liquipedia.js
 * Or use OpenClaw cron to run daily
 */

const fs = require('fs');
const path = require('path');

const LIQUIPEDIA_URLS = [
  'https://liquipedia.net/dota2/DreamLeague/Season_28',
  'https://liquipedia.net/dota2/BLAST/Premier',
  'https://liquipedia.net/dota2/PGL/Major/2026',
  'https://liquipedia.net/dota2/ESL One/',
];

async function fetchLiquipedia() {
  console.log('Fetching from Liquipedia...');
  
  // Use web_fetch which should work through OpenClaw
  const matches = [];
  
  for (const url of LIQUIPEDIA_URLS) {
    try {
      const response = await fetch(`https://r.jina.ai/${url}`);
      const text = await response.text();
      
      // Parse match info from text
      // This is simplified - real implementation would parse HTML
      console.log(`Fetched ${url}: ${text.length} chars`);
    } catch (e) {
      console.error(`Error fetching ${url}:`, e.message);
    }
  }
  
  return matches;
}

async function main() {
  console.log('Starting Liquipedia fetch...');
  
  // Load existing home.json
  const homePath = path.join(__dirname, '..', 'public', 'data', 'home.json');
  let homeData = { upcoming: [] };
  
  try {
    homeData = JSON.parse(fs.readFileSync(homePath, 'utf8'));
  } catch (e) {
    console.log('Using existing data');
  }
  
  // Keep future matches
  const now = Math.floor(Date.now() / 1000);
  const existingUpcoming = (homeData.upcoming || []).filter(m => m.start_time > now);
  
  // For now, just keep existing data
  // Real implementation would add new matches from Liquipedia
  homeData.upcoming = existingUpcoming.sort((a, b) => a.start_time - b.start_time);
  
  fs.writeFileSync(homePath, JSON.stringify(homeData, null, 2));
  console.log(`Updated: ${homeData.upcoming.length} upcoming matches`);
}

main().catch(console.error);
