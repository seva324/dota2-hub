/**
 * Storage Diagnostic API - Check Neon database and local files
 * Useful for debugging data sync issues
 */

import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function getLocalData(key) {
  try {
    const localPath = path.join(process.cwd(), 'public', 'data', `${key}.json`);
    const data = fs.readFileSync(localPath, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      exists: true,
      type: Array.isArray(parsed) ? 'array' : 'object',
      length: Array.isArray(parsed) ? parsed.length : 'N/A',
      sample: Array.isArray(parsed) ? parsed.slice(0, 2) : null
    };
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const result = {
    neon: {
      available: false,
      error: null,
      tables: {}
    },
    local: {},
    timestamp: new Date().toISOString()
  };

  // Check Neon
  if (DATABASE_URL) {
    try {
      const db = neon(DATABASE_URL);

      // Check upcoming_matches table
      try {
        const upcoming = await db`SELECT COUNT(*) as count FROM upcoming_matches`;
        result.neon.tables.upcoming_matches = {
          exists: true,
          count: upcoming[0]?.count || 0
        };
      } catch (e) {
        result.neon.tables.upcoming_matches = { error: e.message };
      }

      // Check matches table
      try {
        const matches = await db`SELECT COUNT(*) as count FROM matches`;
        const sample = await db`SELECT match_id, league_id, radiant_team_name, dire_team_name FROM matches LIMIT 5`;
        result.neon.tables.matches = {
          exists: true,
          count: matches[0]?.count || 0,
          sample: sample
        };
      } catch (e) {
        result.neon.tables.matches = { error: e.message };
      }

      // Check tournaments table
      try {
        const tournaments = await db`SELECT COUNT(*) as count FROM tournaments`;
        result.neon.tables.tournaments = {
          exists: true,
          count: tournaments[0]?.count || 0
        };
      } catch (e) {
        result.neon.tables.tournaments = { error: e.message };
      }

      // Check tournament_series table
      try {
        const series = await db`SELECT COUNT(*) as count FROM tournament_series`;
        result.neon.tables.tournament_series = {
          exists: true,
          count: series[0]?.count || 0
        };
      } catch (e) {
        result.neon.tables.tournament_series = { error: e.message };
      }

      result.neon.available = true;
    } catch (e) {
      result.neon.error = e.message;
    }
  } else {
    result.neon.error = 'DATABASE_URL not configured';
  }

  // Check local files
  const localFiles = ['matches', 'tournaments', 'upcoming', 'teams'];
  for (const file of localFiles) {
    result.local[file] = getLocalData(file);
  }

  return res.status(200).json(result);
}
