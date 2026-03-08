import { neon } from '@neondatabase/serverless';
import { runLiveHeroMonitorCycle } from '../../lib/server/live-hero-service.js';
import { getCurrentHeroLiveScore, markHeroLiveScoreEnded, upsertHeroLiveScore } from '../../lib/server/hero-live-score-cache.js';
import { sendTelegramMessage } from './telegram-util.mjs';

function parseArgs(argv) {
  const result = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      result[body] = true;
    } else {
      result[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
    }
  }
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatStartMessage(payload) {
  return [
    '🟢 Live hero monitor started',
    `${payload.leagueName || 'Unknown league'}`,
    `${payload.teams?.[0]?.name || '?'} vs ${payload.teams?.[1]?.name || '?'}`,
    `Series: ${payload.seriesScore || '0 - 0'}`,
    payload.liveMap ? `${payload.liveMap.label}: ${payload.liveMap.score}` : null,
    payload.sourceUrl || null,
  ].filter(Boolean).join('\n');
}

function formatStopMessage(row) {
  const payload = row?.payload || {};
  return [
    '🔴 Live hero monitor ended',
    `${payload.leagueName || row?.league_name || 'Unknown league'}`,
    `${payload.teams?.[0]?.name || row?.team1_name || '?'} vs ${payload.teams?.[1]?.name || row?.team2_name || '?'}`,
    `Series: ${payload.seriesScore || 'n/a'}`,
    payload.sourceUrl || null,
  ].filter(Boolean).join('\n');
}

async function maybeNotifyStart(db, snapshot, notify) {
  if (!snapshot || !notify) return;
  const row = await getCurrentHeroLiveScore(db, 86400);
  if (row?.series_key !== snapshot.series_key || row?.notified_start_at) return;
  await sendTelegramMessage(formatStartMessage(snapshot.payload));
  await upsertHeroLiveScore({ ...snapshot, notified_start_at: new Date().toISOString() }, db);
}

async function maybeNotifyEnd(db, row, notify) {
  if (!row || !notify || row.notified_end_at) return;
  await sendTelegramMessage(formatStopMessage(row));
  await upsertHeroLiveScore({
    series_key: row.series_key,
    upcoming_series_id: row.upcoming_series_id,
    upcoming_source: row.upcoming_source,
    source_series_id: row.source_series_id,
    source_slug: row.source_slug,
    league_name: row.league_name,
    team1_name: row.team1_name,
    team2_name: row.team2_name,
    status: row.status,
    is_live: false,
    payload: row.payload,
    started_at: row.started_at,
    ended_at: row.ended_at || new Date().toISOString(),
    last_seen_at: row.last_seen_at || new Date().toISOString(),
    notified_start_at: row.notified_start_at,
    notified_end_at: new Date().toISOString(),
  }, db);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const intervalMs = Number(args['interval-sec'] || 60) * 1000;
  const notify = args.notify !== '0';
  const missThreshold = Math.max(1, Number(args['miss-threshold'] || 3));
  const db = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const missCounts = new Map();

  console.log(`[live-hero-monitor] started interval=${intervalMs}ms notify=${notify} missThreshold=${missThreshold}`);

  while (true) {
    try {
      const activeBefore = await getCurrentHeroLiveScore(db, 86400);
      const confirmedEndedSeriesKeys = [];
      if (activeBefore?.series_key) {
        const misses = (missCounts.get(activeBefore.series_key) || 0) + 1;
        missCounts.set(activeBefore.series_key, misses);
        if (misses >= missThreshold) {
          confirmedEndedSeriesKeys.push(activeBefore.series_key);
        }
      }

      const result = await runLiveHeroMonitorCycle(db, { confirmEndedSeriesKeys });

      if (result.live) {
        missCounts.set(result.live.series_key, 0);
        console.log(`[live-hero-monitor] live ${result.live.team1_name} vs ${result.live.team2_name} ${result.live.payload?.seriesScore || ''}`);
        await maybeNotifyStart(db, result.live, notify);
      }

      for (const row of result.missed || []) {
        const misses = missCounts.get(row.series_key) || 0;
        console.log(`[live-hero-monitor] miss ${row.team1_name} vs ${row.team2_name} count=${misses}`);
      }

      for (const row of result.ended || []) {
        missCounts.delete(row.series_key);
        const endedRow = await markHeroLiveScoreEnded(row.series_key, { status: 'ended', ended_at: new Date().toISOString() }, db);
        console.log(`[live-hero-monitor] ended ${row.team1_name} vs ${row.team2_name}`);
        await maybeNotifyEnd(db, endedRow || row, notify);
      }
    } catch (error) {
      console.error('[live-hero-monitor] cycle failed', error?.stack || error?.message || error);
    }

    await sleep(intervalMs);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
