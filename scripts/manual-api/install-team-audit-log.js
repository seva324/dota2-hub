#!/usr/bin/env node

import { createDbWithAppName, ensureTeamAuditLog } from '../../lib/server/team-audit.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL or POSTGRES_URL is required');
  process.exit(1);
}

const db = createDbWithAppName(DATABASE_URL, 'scripts/manual-api/install-team-audit-log.js');

await ensureTeamAuditLog(db);

console.log('[install-team-audit-log] teams audit trigger is installed');
console.log('[install-team-audit-log] logs table: teams_audit_log');
