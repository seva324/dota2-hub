import puppeteer from 'puppeteer';

// QA Part 2: the deployed home page polls /api/live-hero every ~30s (no reload).
// We count live-hero fetches via the resource timing / request tracking and
// confirm at least two happen within ~65s.
const BASE = 'https://dotahub.cn/';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });

// Track live-hero requests from the start.
const liveRequests = [];
page.on('request', (req) => {
  if (req.url().includes('/api/live-hero')) {
    liveRequests.push({ t: Date.now(), url: req.url(), ts: req.headers()['cache-control'] || '' });
  }
});

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });

// Wait for content shell, then observe polling for ~65s.
await new Promise((r) => setTimeout(r, 5000));
const tStart = Date.now();
const firstCount = liveRequests.length;
console.log('live-hero requests at t+5s:', firstCount);

// Sample live section text at ~28s and ~75s to confirm it re-renders.
await new Promise((r) => setTimeout(r, 23000));
const at28 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').match(/LIVE BO\d[\s\S]{0,80}/)?.[0]?.slice(0, 80) || '(none)');

await new Promise((r) => setTimeout(r, 47000));
const at75 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').match(/LIVE BO\d[\s\S]{0,80}/)?.[0]?.slice(0, 80) || '(none)');

const finalCount = liveRequests.length;
console.log('live-hero requests at t+75s:', finalCount);
console.log('delta:', finalCount - firstCount);
console.log('live section @28s:', at28);
console.log('live section @75s:', at75);
console.log('polling works:', finalCount - firstCount >= 2 ? 'YES (>=2 polls in 75s)' : 'NO');
await browser.close();
