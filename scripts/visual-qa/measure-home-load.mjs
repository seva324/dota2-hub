import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });
await page.evaluateOnNewDocument(() => {
  const origFetch = window.fetch.bind(window);
  window.__api = [];
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const start = performance.now();
    return origFetch(input, init).then(async (res) => {
      const clone = res.clone();
      try { await clone.text(); } catch {}
      window.__api.push({ url, ms: Math.round(performance.now() - start), status: res.status });
      return res;
    }).catch((e) => { window.__api.push({ url, ms: Math.round(performance.now() - start), error: String(e) }); throw e; });
  };
});
await page.goto('https://dotahub.cn/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000));
const result = await page.evaluate(() => ({
  api: (window.__api || []).sort((a,b) => a.ms - b.ms),
  body: document.body.innerText.replace(/\s+/g,' ').slice(0, 400),
}));
console.log(JSON.stringify(result, null, 2));
await browser.close();
