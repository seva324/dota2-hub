import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { warmPlayerProfileCache } from '../../lib/server/player-profile-cache.js';
import { warmTeamFlyoutCache } from '../../lib/server/team-flyout-cache.js';
import { sendTelegramMessage } from './telegram-util.mjs';

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
      continue;
    }
    result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
  }
  return result;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = args.out || '/tmp/d2hub-refresh-derived-data.json';
  const playerLimit = args['player-limit'] ? Math.max(1, Number(args['player-limit'])) : null;
  const teamLimit = args['team-limit'] ? Math.max(1, Number(args['team-limit'])) : null;
  const matchLimit = Math.max(30, Math.min(240, Number(args['match-limit'] || 180)));
  const mode = String(args.mode || (args.incremental ? 'incremental' : 'full')).toLowerCase() === 'incremental' ? 'incremental' : 'full';
  const recentDays = Math.max(1, Math.trunc(Number(args['recent-days'] || 7)));
  const upcomingDays = Math.max(1, Math.trunc(Number(args['upcoming-days'] || 3)));
  const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const startedAt = new Date().toISOString();

  const sharedOptions = {
    mode,
    incremental: mode === 'incremental',
    recentDays,
    upcomingDays,
  };

  const [playerProfiles, teamFlyouts] = await Promise.all([
    warmPlayerProfileCache(db, { ...sharedOptions, limit: playerLimit, matchLimit }),
    warmTeamFlyoutCache(db, { ...sharedOptions, limit: teamLimit }),
  ]);

  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    mode,
    recentDays,
    upcomingDays,
    matchLimit,
    playerProfiles,
    teamFlyouts,
  };

  ensureDir(out);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));

  await sendTelegramMessage(
    [
      `✅ derived cache refresh 已完成 (${mode})`,
      `player selected/refreshed/failed: ${playerProfiles.selected}/${playerProfiles.refreshed}/${playerProfiles.failed}`,
      `team selected/refreshed/failed: ${teamFlyouts.selected}/${teamFlyouts.refreshed}/${teamFlyouts.failed}`,
      mode === 'incremental' ? `window recent/upcoming days: ${recentDays}/${upcomingDays}` : 'window: full refresh',
      `log: ${out}`,
    ].join('\n')
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  try {
    await sendTelegramMessage(['❌ derived cache refresh 失败', message.slice(0, 3000)].join('\n'));
  } catch {}
  process.exit(1);
});
