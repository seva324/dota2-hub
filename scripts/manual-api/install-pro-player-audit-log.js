#!/usr/bin/env node

import { createDbWithAppName, ensureProPlayerAuditLog } from '../../lib/server/pro-player-audit.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL or POSTGRES_URL is required');
  process.exit(1);
}

const db = createDbWithAppName(DATABASE_URL, 'scripts/manual-api/install-pro-player-audit-log.js');

await ensureProPlayerAuditLog(db);

console.log('[install-pro-player-audit-log] pro_players audit trigger is installed');
console.log('[install-pro-player-audit-log] logs table: pro_players_audit_log');
