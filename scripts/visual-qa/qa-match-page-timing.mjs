import puppeteer from 'puppeteer';

const URL = 'https://dotahub.cn/#/match/427573?slug=nigma-vs-og-1win-essence-2';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });
await page.evaluateOnNewDocument(() => {
  window.__api = [];
  window.__contentMs = null;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const start = performance.now();
    return origFetch(input, init).then(async (res) => {
      const clone = res.clone();
      try { await clone.text(); } catch {}
      window.__api.push({ url, ms: Math.round(performance.now() - start), status: res.status });
      if (url.includes('/api/match-page')) {
        window.__matchMs = Math.round(performance.now() - start);
      }
      return res;
    }).catch((e) => { window.__api.push({ url, ms: Math.round(performance.now() - start), error: String(e) }); throw e; });
  };
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
// Wait until the score header "Nigma Galaxy 1 : 1 OG" is visible → match content rendered
await page.waitForFunction(
  () => document.body.innerText.includes('1 : 1') && document.body.innerText.includes('Nigma Galaxy'),
  { timeout: 30000 },
).then(() => console.log('content visible at +', Date.now() - t0, 'ms'))
  .catch(() => console.log('content wait TIMEOUT'));
await page.waitForFunction(
  () => document.querySelectorAll('div[class*="rounded-2xl"]').length >= 2,
  { timeout: 30000 },
).then(() => console.log('game blocks rendered at +', Date.now() - t0, 'ms'))
  .catch(() => console.log('blocks wait timeout'));
await new Promise((r) => setTimeout(r, 1000));

const result = await page.evaluate(() => ({
  api: (window.__api || []).sort((a, b) => a.ms - b.ms),
  matchMs: window.__matchMs ?? null,
  navStartToContent: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
}));
console.log('match-page fetch ms:', result.matchMs);
console.log('all API calls:', JSON.stringify(result.api, null, 2));
await browser.close();
