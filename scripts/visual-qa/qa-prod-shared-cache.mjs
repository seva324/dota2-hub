// 生产验证：首页 ↔ 比赛页共享缓存 —— 跨页面导航不应重复请求共享端点。
// 用法：node scripts/visual-qa/qa-prod-shared-cache.mjs
import puppeteer from 'puppeteer';

const BASE = 'https://dotahub.cn';
const SHARED = ['/api/upcoming?limit=20&days=7', '/api/matches?limit=40', '/api/live-hero'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function instrument() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });
  await page.evaluateOnNewDocument(() => {
    window.__api = [];
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const start = performance.now();
      return origFetch(input, init).then(async (res) => {
        window.__api.push({ url, ms: Math.round(performance.now() - start), status: res.status, at: Date.now() });
        return res;
      }).catch((e) => { window.__api.push({ url, ms: Math.round(performance.now() - start), error: String(e), at: Date.now() }); throw e; });
    };
  });
  return page;
}

function count(api, needle) {
  return api.filter((c) => c.url.includes(needle)).length;
}

const page = await instrument();
await page.goto(BASE + '/#', { waitUntil: 'domcontentloaded', timeout: 90000 });
await sleep(2500);

// 点赛程 nav 进比赛页
await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('a,button')).filter((el) => (el.textContent || '').trim() === '赛程');
  links[links.length - 1]?.click();
});
await sleep(2500);

// 点首页 nav 回来
await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('a,button')).filter((el) => (el.textContent || '').trim() === '首页');
  links[links.length - 1]?.click();
});
await sleep(2500);

const api = await page.evaluate(() => window.__api || []);

const result = {
  url: page.url(),
  totalApiCalls: api.length,
  upcomingCalls: count(api, '/api/upcoming?limit=20'),
  matchesCalls: count(api, '/api/matches?limit=40'),
  liveHeroCalls: count(api, '/api/live-hero'),
};
console.log(JSON.stringify(result, null, 2));

// 断言：upcoming/matches 恰好各 1 次；live-hero >= 2（首页 mount + 比赛页 mount + 30s poll）
const ok = result.upcomingCalls === 1 && result.matchesCalls === 1 && result.liveHeroCalls >= 2;
console.log(ok ? '\nPASS: shared endpoints fetched once; live-hero re-fetches' : '\nFAIL: shared endpoints re-fetched or live-hero not re-fetched');
await browser.close();
process.exit(ok ? 0 : 1);
