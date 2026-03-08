#!/usr/bin/env node

import { neon } from '@neondatabase/serverless';
import { ensurePlayerProfileDerivedIndexes } from '../../lib/server/player-profile-cache.js';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL or POSTGRES_URL is required');
  process.exit(1);
}

const db = neon(DATABASE_URL);

await ensurePlayerProfileDerivedIndexes(db);

console.log('[install-player-profile-derived-indexes] indexes installed');
console.log('[install-player-profile-derived-indexes] added: idx_player_stats_account_match_nonnull');
console.log('[install-player-profile-derived-indexes] added: idx_player_stats_match_slot_profile_cover');
