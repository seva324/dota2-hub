import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { warmPlayerProfileCache } from '../../lib/server/player-profile-cache.js';
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
  const limit = Math.max(1, Math.min(200, Number(args.limit || 60)));
  const matchLimit = Math.max(30, Math.min(240, Number(args['match-limit'] || 180)));
  const out = args.out || '/tmp/d2hub-player-profile-warm.json';
  const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const startedAt = new Date().toISOString();

  const result = await warmPlayerProfileCache(db, { limit, matchLimit });
  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    limit,
    matchLimit,
    ...result,
  };

  ensureDir(out);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));

  const failedAccounts = Array.isArray(result.failedAccounts) ? result.failedAccounts : [];
  const failedText = failedAccounts.length ? failedAccounts.join(', ') : '无';
  await sendTelegramMessage(
    [
      '✅ player profile warm 已完成',
      `selected: ${result.selected}`,
      `refreshed: ${result.refreshed}`,
      `failed: ${result.failed}`,
      `failed accounts: ${failedText}`,
      `log: ${out}`,
    ].join('\n')
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  try {
    await sendTelegramMessage(['❌ player profile warm 失败', message.slice(0, 3000)].join('\n'));
  } catch {}
  process.exit(1);
});
