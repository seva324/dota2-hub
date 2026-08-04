import puppeteer from 'puppeteer';

const BASE = 'https://dotahub.cn';
const SERIES_ID = '427573'; // OG vs Nigma Galaxy — the case that previously 404'd
const SLUG = 'nigma-vs-og-1win-essence-2';

function headerValue(headers, name) {
  const h = headers.raw ? headers.raw() : {};
  return (h[String(name).toLowerCase()] || [])[0] || null;
}

async function probe(browser, label, url, cacheBuster = false) {
  const page = await browser.newPage();
  const target = `${BASE}${url}${cacheBuster ? `&_cb=${Date.now()}-${Math.random().toString(16).slice(2)}` : ''}`;
  const t0 = Date.now();
  const res = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const ms = Date.now() - t0;
  const body = await res.text();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  const out = {
    label,
    url: target.replace(BASE, ''),
    status: res.status(),
    ms,
    bytes: body.length,
    cacheStatus: headerValue(res.headers(), 'eo-cache-status'),
    dlTVSource: headerValue(res.headers(), 'x-dltv-source'),
    cacheControl: headerValue(res.headers(), 'cache-control'),
    maps: json?.maps?.length ?? null,
    radiantWins: json?.radiantWins ?? null,
    direWins: json?.direWins ?? null,
    teams: json?.teams
      ? `${json.teams.radiant?.name ?? '?'} ${json.radiantWins ?? '?'}:${json.direWins ?? '?'} ${json.teams.dire?.name ?? '?'}`
      : null,
    error: json?.error ?? null,
  };
  console.log(`[${label}] status=${out.status} ${out.ms}ms ${out.bytes}B cache=${out.cacheStatus} src=${out.dlTVSource} maps=${out.maps} teams=${out.teams}${out.error ? ` ERROR="${out.error}"` : ''}`);
  await page.close();
  return out;
}

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// 1. Warm the cache with a plain request first (deploy just landed, edge cache may be cold).
await probe(browser, 'warm-up', `/api/match-page?series_id=${SERIES_ID}&slug=${SLUG}`);

// 2. Warm/cache-hit measurement on the SAME URL (no cache buster).
await probe(browser, 'cache-hit', `/api/match-page?series_id=${SERIES_ID}&slug=${SLUG}`);

// 3. Cache miss (cache buster) — should still come from origin quickly and return 200.
await probe(browser, 'cache-miss', `/api/match-page?series_id=${SERIES_ID}&slug=${SLUG}`, true);

// 4. No-slug variant — previously the case that poisoned the edge with a cached 404.
//    Now should NOT be edge-cached (no-store on 404) and the slug-rebuild path should
//    reconstruct the slug and fetch the real page.
await probe(browser, 'no-slug', `/api/match-page?series_id=${SERIES_ID}`);

await browser.close();
console.log('done');
