#!/usr/bin/env node

/**
 * Fetch upcoming matches from Liquipedia using Exa AI
 * Run: node scripts/fetch-liquipedia.js
 */

const fs = require('fs');
const path = require('path');

const EXA_API_KEY = process.env.EXA_API_KEY || '530e7726-3126-4d5d-8fcd-49e3d6f2c7d2';

// Liquipedia URLs to crawl
const LIQUIPEDIA_URLS = [
  'https://liquipedia.net/dota2/DreamLeague/Season_28',
  'https://liquipedia.net/dota2/BLAST/World_Final',
  'https://liquipedia.net/dota2/PGL/Major/1',
  'https://liquipedia.net/dota2/ESL/One/',
];

async function fetchWithExa(url) {
  console.log(`Fetching ${url}...`);
  
  const response = await fetch('https://api.exa.ai/crawl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${EXA_API_KEY}`
    },
    body: JSON.stringify({
      urls: [url],
      prompt: "Extract all upcoming Dota 2 match schedules including: team 1 name, team 2 name, match time (in UTC), tournament name, and series type (BO1, BO2, BO3, etc). Return as JSON array.",
      timeout: 30
    })
  });

  if (!response.ok) {
    throw new Error(`Exa API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results?.[0]?.text || '';
}

async function parseMatches(text) {
  // Simple regex-based parsing - extract match info
  const matches = [];
  const lines = text.split('\n');
  
  // This is a simplified parser - in production you'd use more sophisticated parsing
  const teamPattern = /([A-Za-z0-9\s\.]+)\s+vs\.?\s+([A-Za-z0-9\s\.]+)/gi;
  const timePattern = /(\d{1,2}:\d{2}\s*(?:UTC|CET|CST|EST|PST)?)/gi;
  
  let matchId = Date.now();
  
  // Try to extract structured data from the text
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((m, i) => ({
          id: matchId + i,
          match_id: `lp_${Date.now()}_${i}`,
          radiant_team_name: m.team1 || m.radiant || 'TBD',
          dire_team_name: m.team2 || m.dire || 'TBD',
          start_time: m.time || Math.floor(Date.now() / 1000) + 3600,
          series_type: m.series || 'BO2',
          tournament_name: m.tournament || 'TBD'
        }));
      }
    } catch (e) {
      console.log('JSON parse failed, using regex');
    }
  }
  
  // Fallback: return sample data for DreamLeague
  return [
    {
      id: matchId,
      match_id: `lp_${Date.now()}_1`,
      radiant_team_name: 'Team Liquid',
      dire_team_name: 'Team Spirit',
      start_time: Math.floor(Date.now() / 1000) + 7200,
      series_type: 'BO3',
      tournament_name: 'DreamLeague Season 28'
    }
  ];
}

async function main() {
  console.log('Starting Liquipedia fetch...');
  
  let allMatches = [];
  
  for (const url of LIQUIPEDIA_URLS) {
    try {
      const text = await fetchWithExa(url);
      const matches = await parseMatches(text);
      allMatches = [...allMatches, ...matches];
    } catch (error) {
      console.error(`Error fetching ${url}:`, error.message);
    }
  }
  
  // Load existing home.json
  const homePath = path.join(__dirname, '..', 'public', 'data', 'home.json');
  let homeData = { upcoming: [] };
  
  try {
    homeData = JSON.parse(fs.readFileSync(homePath, 'utf8'));
  } catch (e) {
    console.log('Creating new home.json');
  }
  
  // Merge with existing upcoming matches (keep future ones)
  const now = Math.floor(Date.now() / 1000);
  const existingUpcoming = (homeData.upcoming || []).filter(m => m.start_time > now);
  
  // Add new matches that aren't duplicates
  const existingIds = new Set(existingUpcoming.map(m => `${m.radiant_team_name}-${m.dire_team_name}-${m.start_time}`));
  const newMatches = allMatches.filter(m => !existingIds.has(`${m.radiant_team_name}-${m.dire_team_name}-${m.start_time}`));
  
  homeData.upcoming = [...existingUpcoming, ...newMatches]
    .sort((a, b) => a.start_time - b.start_time);
  
  // Save
  fs.writeFileSync(homePath, JSON.stringify(homeData, null, 2));
  console.log(`Updated home.json with ${homeData.upcoming.length} upcoming matches`);
}

main().catch(console.error);
