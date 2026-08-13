/**
 * upcoming 富化：把 DLTV 赛事页（/events/<slug>）的 upcoming 比赛并入 /api/upcoming。
 *
 * 背景：DLTV /matches 只列出最近一天的少量 upcoming（曾出现 TI2026 只显示 4 场，
 * 而赛事页 matches 表有完整的 8 场），主列表/首页 upcoming 只吃 /matches，数量偏少。
 * 这里按 base upcoming 里的 event_slug 拉赛事页合并，按 seriesId/matchUrl 去重。
 */

import { parseDltvEventDetailPage } from './dltv-event-detail-parser.js';
import { parseUtcDateTimeToUnixSeconds } from './dltv-upcoming.js';

const EVENT_PAGE_DIRECT_TIMEOUT_MS = 6000;
const EVENT_PAGE_JINA_TIMEOUT_MS = 10000;
const ENRICH_CACHE_TTL_MS = 5 * 60 * 1000;

/** 从 DLTV 赛事 URL（/matches/<id>/...）提取 seriesId。 */
export function seriesIdFromMatchUrl(url) {
  const match = String(url || '').match(/\/matches\/(\d+)/);
  return match ? match[1] : null;
}

/** 从赛事页 HTML 解析 upcoming 比赛行（纯函数，可测）。 */
export function parseEventPageUpcomingRows(html, slug, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Math.floor(Date.now() / 1000);
  const maxStartTime = Number.isFinite(options.maxStartTime)
    ? options.maxStartTime
    : now + 7 * 24 * 60 * 60;
  const parsed = parseDltvEventDetailPage(html, slug);
  const rows = [];
  for (const match of parsed.matches?.matches || []) {
    if (match.isLive) continue;
    const timestamp = parseUtcDateTimeToUnixSeconds(match.center);
    if (!timestamp || timestamp < now || timestamp > maxStartTime) continue;
    rows.push({
      seriesId: seriesIdFromMatchUrl(match.url),
      matchUrl: match.url,
      radiantName: match.left,
      direName: match.right,
      tournament: parsed.title || slug,
      eventUrl: `https://dltv.org/events/${slug}`,
      stage: null,
      bestOf: 'BO3',
      timestamp,
    });
  }
  rows.sort((left, right) => left.timestamp - right.timestamp);
  return rows;
}

function buildTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
    },
  };
}

async function fetchEventPageHtml(slug, fetchImpl) {
  const attempts = [
    { url: `https://dltv.org/events/${slug}`, type: 'direct', timeoutMs: EVENT_PAGE_DIRECT_TIMEOUT_MS },
    { url: `https://r.jina.ai/http://dltv.org/events/${slug}`, type: 'jina', timeoutMs: EVENT_PAGE_JINA_TIMEOUT_MS },
  ];
  for (const attempt of attempts) {
    const timeout = buildTimeoutSignal(attempt.timeoutMs);
    try {
      const res = await fetchImpl(attempt.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Dota2Hub/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain',
          ...(attempt.type === 'jina' ? { 'X-Return-Format': 'html', 'X-No-Cache': 'true' } : {}),
        },
        signal: timeout.signal,
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (String(text || '').trim().length >= 500) return text;
    } catch {
      // Ignore individual attempts and continue to the next source.
    } finally {
      timeout.dispose();
    }
  }
  return null;
}

// 进程内缓存：避免每次 /api/upcoming 都回源赛事页。
const eventUpcomingCache = new Map();

function readEventCache(slug) {
  const cached = eventUpcomingCache.get(slug);
  if (cached && Date.now() - cached.at < ENRICH_CACHE_TTL_MS) return cached.rows;
  return null;
}

function writeEventCache(slug, rows) {
  eventUpcomingCache.set(slug, { at: Date.now(), rows });
}

/**
 * 用赛事页 upcoming 富化 base upcoming（去重 + 按时间排序）。
 * 任何环节失败都不抛错，回退 base 数据。
 */
export async function enrichUpcomingWithEventMatches(upcoming, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const base = Array.isArray(upcoming) ? upcoming : [];
  if (base.length === 0) return base;

  const slugs = [...new Set(
    base
      .map((row) => String(row.eventUrl || '').match(/\/events\/([^/?#]+)/i)?.[1])
      .map((slug) => (slug ? decodeURIComponent(slug) : null))
      .filter(Boolean),
  )];
  if (slugs.length === 0) return base;

  const extra = [];
  for (const slug of slugs) {
    let rows = readEventCache(slug);
    if (!rows) {
      const html = await fetchEventPageHtml(slug, fetchImpl);
      if (!html) continue; // 抓取失败不缓存，下次重试
      rows = parseEventPageUpcomingRows(html, slug);
      writeEventCache(slug, rows);
    }
    for (const row of rows) {
      const dup = base.some(
        (existing) =>
          (existing.seriesId && row.seriesId && existing.seriesId === row.seriesId) ||
          (existing.matchUrl && row.matchUrl && existing.matchUrl === row.matchUrl),
      );
      if (!dup) extra.push(row);
    }
  }

  if (extra.length === 0) return base;
  return [...base, ...extra].sort((left, right) => left.timestamp - right.timestamp);
}
