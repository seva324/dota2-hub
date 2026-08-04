import puppeteer from 'puppeteer';

const HOME = 'https://dotahub.cn/';
const MATCH = 'https://dotahub.cn/#/match/427573?slug=nigma-vs-og-1win-essence-2';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function instrument() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });
  await page.evaluateOnNewDocument(() => {
    window.__api = [];
    window.__nav = null;
    const origFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const start = performance.now();
      return origFetch(input, init).then(async (res) => {
        const clone = res.clone();
        try { await clone.text(); } catch {}
        window.__api.push({ url, ms: Math.round(performance.now() - start), status: res.status, bytes: clone ? clone.headers.get('content-length') : null });
        return res;
      }).catch((e) => { window.__api.push({ url, ms: Math.round(performance.now() - start), error: String(e) }); throw e; });
    };
    // network timing for the document itself
    window.__navStart = performance.now();
  });
  return page;
}

async function measureHome() {
  const page = await instrument();
  const t0 = Date.now();
  await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const domReady = Date.now() - t0;

  // Wait for the main content (results section or hero stats) to settle
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return t.includes('Recent Results') || t.includes('Live Matches') || t.includes('暂无比赛结果');
  }, { timeout: 45000 }).catch(() => console.log('  home content wait TIMEOUT'));

  // Poll until no more fetch activity for 2s (page "settled")
  let lastActivity = Date.now();
  const startSettle = Date.now();
  let settledAt = null;
  while (Date.now() - startSettle < 45000) {
    const active = await page.evaluate(() => (window.__api || []).length);
    if (Date.now() - lastActivity > 2000) { settledAt = Date.now(); break; }
    await sleep(500);
  }
  const settledMs = settledAt ? settledAt - t0 : null;

  const api = await page.evaluate(() => window.__api || []);
  console.log(`\n=== HOME ===`);
  console.log(`domcontentloaded: ${domReady}ms, settled: ${settledMs}ms`);
  console.log(`api calls (${api.length}):`);
  const sorted = [...api].sort((a, b) => a.ms - b.ms);
  for (const c of sorted) console.log(`  ${c.url} -> ${c.ms}ms status=${c.status}${c.error ? ' ERROR=' + c.error : ''}`);
  console.log(`slowest: ${sorted.length ? sorted[sorted.length - 1].url + ' ' + sorted[sorted.length - 1].ms + 'ms' : 'n/a'}`);
  await page.close();
  return { domReady, settledMs, api };
}

async function measureMatch() {
  const page = await instrument();
  const t0 = Date.now();
  await page.goto(MATCH, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const domReady = Date.now() - t0;
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return t.includes('1 : 1') || /加载失败|not found|暂无比赛数据/.test(t);
  }, { timeout: 45000 }).catch(() => console.log('  match content wait TIMEOUT'));
  await sleep(1500);
  const contentMs = Date.now() - t0;
  const api = await page.evaluate(() => window.__api || []);
  console.log(`\n=== MATCH ===`);
  console.log(`domcontentloaded: ${domReady}ms, content visible: ${contentMs}ms`);
  for (const c of [...api].sort((a, b) => a.ms - b.ms)) console.log(`  ${c.url} -> ${c.ms}ms status=${c.status}${c.error ? ' ERROR=' + c.error : ''}`);
  await page.close();
  return { domReady, contentMs, api };
}

await measureHome();
await measureMatch();
await browser.close();
console.log('\ndone');
