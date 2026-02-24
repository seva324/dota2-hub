#!/usr/bin/env node
/**
 * Fetch all team logos from OpenDota API and update teams.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const teamsJsonPath = path.join(__dirname, '..', 'public', 'data', 'teams.json');

// Fetch all teams from OpenDota
async function fetchAllTeams() {
  console.log('Fetching all teams from OpenDota API...');
  
  // OpenDota has a teams endpoint that returns teams with logo_url
  const response = await fetch('https://api.opendota.com/api/teams');
  if (!response.ok) {
    throw new Error(`Failed to fetch teams: ${response.status}`);
  }
  
  const teams = await response.json();
  console.log(`Found ${teams.length} teams from OpenDota`);
  
  return teams;
}

// Load existing teams.json
function loadTeams() {
  try {
    const data = fs.readFileSync(teamsJsonPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.log('No existing teams.json, starting fresh');
    return [];
  }
}

// Save teams.json
function saveTeams(teams) {
  const json = JSON.stringify(teams, null, 2);
  fs.writeFileSync(teamsJsonPath, json);
  console.log(`Saved ${teams.length} teams to teams.json`);
}

// Get or create team entry
function getOrCreateTeam(existingTeams, newTeam) {
  // Try to find by ID first
  let team = existingTeams.find(t => t.id === newTeam.team_id.toString() || t.id === newTeam.team_id);
  
  if (!team) {
    // Try to find by name (case insensitive)
    team = existingTeams.find(t => 
      t.name?.toLowerCase() === newTeam.name?.toLowerCase() ||
      t.name_cn?.toLowerCase() === newTeam.tag?.toLowerCase() ||
      t.tag?.toLowerCase() === newTeam.tag?.toLowerCase()
    );
  }
  
  if (!team) {
    // Create new team entry
    team = {
      id: newTeam.team_id.toString(),
      name: newTeam.name,
      name_cn: newTeam.tag || newTeam.name.substring(0, 3).toUpperCase(),
      tag: newTeam.tag || newTeam.name.substring(0, 3).toUpperCase(),
      logo_url: newTeam.logo_url || null,
      region: 'Unknown',
      is_cn_team: 0,
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000)
    };
  } else {
    // Update existing team with new data
    team.logo_url = newTeam.logo_url || team.logo_url;
    team.updated_at = Math.floor(Date.now() / 1000);
  }
  
  return team;
}

// Determine region based on team name or logo
function determineRegion(team) {
  const cnKeywords = ['xg', 'xtreme', 'yb', 'yakult', 'vg', 'vici', 'lgd', 'psg', 'azure', 'ray', 'ehome', 'newbee', 'invictus', 'royal', 'kg', 'lgd', 'aster', 'aries'];
  const cisKeywords = ['spirit', 'navi', 'virtus', 'vp', 'betboom', '1w', 'pari', 'punk'];
  const euKeywords = ['tundra', 'gaimin', 'gladiators', 'liquid', 'og', 'nigma', 'mouz', 'aurora', 'heroic', 'gamerlegion'];
  const saKeywords = ['pain', 'betz', 'hokm'];
  const seaKeywords = ['fnatic', 't1', 'execration', 'bleed', 'george'];
  
  const name = (team.name || '').toLowerCase();
  const tag = (team.tag || '').toLowerCase();
  
  if (cnKeywords.some(k => name.includes(k) || tag.includes(k))) return 'CN';
  if (cisKeywords.some(k => name.includes(k) || tag.includes(k))) return 'CIS';
  if (euKeywords.some(k => name.includes(k) || tag.includes(k))) return 'EU';
  if (saKeywords.some(k => name.includes(k) || tag.includes(k))) return 'SA';
  if (seaKeywords.some(k => name.includes(k) || tag.includes(k))) return 'SEA';
  
  return team.region || 'Unknown';
}

// Main function
async function main() {
  console.log('========================================');
  console.log('Fetching Team Logos from OpenDota API');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  // Load existing teams
  const existingTeams = loadTeams();
  console.log(`Loaded ${existingTeams.length} existing teams`);
  
  // Fetch all teams from OpenDota
  const opendotaTeams = await fetchAllTeams();
  
  // Filter to only teams with logos
  const teamsWithLogos = opendotaTeams.filter(t => t.logo_url && t.logo_url.length > 0);
  console.log(`Teams with logos: ${teamsWithLogos.length}`);
  
  // Create a map of existing team IDs for quick lookup
  const existingIds = new Set(existingTeams.map(t => t.id));
  
  // Add new teams from OpenDota
  let addedCount = 0;
  let updatedCount = 0;
  
  for (const ot of teamsWithLogos) {
    const teamId = ot.team_id.toString();
    
    // Check if team already exists
    const existingIndex = existingTeams.findIndex(t => t.id === teamId);
    
    if (existingIndex >= 0) {
      // Update existing team
      existingTeams[existingIndex].logo_url = ot.logo_url;
      existingTeams[existingIndex].name = ot.name;
      existingTeams[existingIndex].tag = ot.tag || ot.name.substring(0, 3).toUpperCase();
      existingTeams[existingIndex].region = determineRegion(existingTeams[existingIndex]);
      existingTeams[existingIndex].updated_at = Math.floor(Date.now() / 1000);
      updatedCount++;
    } else {
      // Add new team
      const newTeam = {
        id: teamId,
        name: ot.name,
        name_cn: ot.tag || ot.name.substring(0, 3).toUpperCase(),
        tag: ot.tag || ot.name.substring(0, 3).toUpperCase(),
        logo_url: ot.logo_url,
        region: determineRegion(ot),
        is_cn_team: determineRegion(ot) === 'CN' ? 1 : 0,
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      };
      existingTeams.push(newTeam);
      addedCount++;
    }
  }
  
  console.log(`\nAdded ${addedCount} new teams`);
  console.log(`Updated ${updatedCount} existing teams`);
  
  // Save updated teams
  saveTeams(existingTeams);
  
  // Summary
  console.log('\n========================================');
  console.log('Summary:');
  console.log(`- Total teams in database: ${existingTeams.length}`);
  console.log(`- Teams with logos: ${existingTeams.filter(t => t.logo_url).length}`);
  console.log('========================================');
  
  // Show some sample teams
  console.log('\nSample teams with logos:');
  existingTeams
    .filter(t => t.logo_url)
    .slice(0, 10)
    .forEach(t => console.log(`  - ${t.name} (${t.name_cn}): ${t.logo_url?.substring(0, 60)}...`));
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
