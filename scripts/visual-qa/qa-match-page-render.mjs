import puppeteer from 'puppeteer';

const URL = 'https://dotahub.cn/#/match/427573?slug=nigma-vs-og-1win-essence-2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });
await page.evaluateOnNewDocument(() => {
  window.__api = [];
  const origFetch = window.fetch.bind(window);
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
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
// wait for the page to render — either game blocks or an error
await page.waitForFunction(
  () => document.body.innerText.includes('正在加载比赛详情') === false
    && (document.body.innerText.includes('not found') || document.body.innerText.includes('暂无比赛数据') || document.querySelectorAll('div[class*="rounded-2xl"]').length >= 1),
  { timeout: 30000 },
).catch(() => console.log('wait timeout'));
await sleep(3000);
const totalMs = Date.now() - t0;

const result = await page.evaluate(() => {
  const text = document.body.innerText.replace(/\s+/g, ' ').slice(0, 800);
  const blocks = document.querySelectorAll('div[class*="rounded-2xl"]').length;
  const errorBox = [...document.querySelectorAll('div')].find((el) =>
    el.textContent && /加载失败|not found|暂无比赛数据|网络错误/.test(el.textContent) && el.children.length === 0
  );
  return { text, blocks, errorBoxText: errorBox ? errorBox.textContent.trim() : null, api: (window.__api || []) };
});
console.log('totalMs:', totalMs);
console.log('game blocks:', result.blocks);
console.log('errorBox:', result.errorBoxText);
console.log('API calls:', JSON.stringify(result.api, null, 2));
console.log('page text:', result.text.slice(0, 500));
await browser.close();
