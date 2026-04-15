#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';
import { backfillDltvTeamLogos } from '../../lib/server/dltv-team-logo-backfill.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    limit: Number.parseInt((argv[argv.indexOf('--limit') + 1] || ''), 10) || null,
  };
}

async function main() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL or POSTGRES_URL is required');
  }

  const options = parseArgs(process.argv);
  const db = neon(DATABASE_URL);
  const result = await backfillDltvTeamLogos(db, options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
