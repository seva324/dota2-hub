import puppeteer from 'puppeteer';

const URL = 'https://dotahub.cn/#/match/427573?slug=nigma-vs-og-1win-essence-2';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });
await page.evaluateOnNewDocument(() => {
  window.__logs = [];
  window.__matchMs = null;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const start = performance.now();
    return origFetch(input, init).then(async (res) => {
      const clone = res.clone();
      try { await clone.text(); } catch {}
      window.__logs.push({ url, ms: Math.round(performance.now() - start), status: res.status });
      if (url.includes('/api/match-page')) window.__matchMs = Math.round(performance.now() - start);
      return res;
    }).catch((e) => { window.__logs.push({ url, ms: Math.round(performance.now() - start), error: String(e) }); throw e; });
  };
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

// Poll the DOM every 1s and record what state it's in, so we can see the progression
const marks = [];
for (let i = 0; i < 40; i++) {
  const state = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasScore = text.includes('1 : 1') && text.includes('Nigma Galaxy');
    const blocks = document.querySelectorAll('div[class*="rounded-2xl"]').length;
    const spinner = text.includes('正在加载比赛详情');
    const error = /加载失败|not found|暂无比赛数据|网络错误/.test(text);
    return { hasScore, blocks, spinner, error, textHead: text.replace(/\s+/g, ' ').slice(0, 120) };
  });
  marks.push({ t: Date.now() - t0, ...state });
  if (state.hasScore && state.blocks >= 2) break;
  await new Promise((r) => setTimeout(r, 1000));
}

console.log('progression:');
for (const m of marks) console.log(`+${m.t}s score=${m.hasScore} blocks=${m.blocks} spinner=${m.spinner} err=${m.error} | ${m.textHead}`);
const final = await page.evaluate(() => ({ logs: window.__logs, matchMs: window.__matchMs }));
console.log('match-page ms:', final.matchMs);
console.log('fetches:', JSON.stringify(final.logs, null, 2));
await browser.close();
