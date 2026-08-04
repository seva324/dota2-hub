import puppeteer from 'puppeteer';

const URL = 'https://dotahub.cn/#/match/427573?slug=nigma-vs-og-1win-essence-2';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('domcontentloaded at +' + (Date.now() - t0) + 'ms');

// Poll until the score header (whitespace-collapsed) and 3 game blocks are present.
let doneAt = null;
let blocksSeen = 0;
for (let i = 0; i < 40; i++) {
  const state = await page.evaluate(() => {
    const collapsed = document.body.innerText.replace(/\s+/g, ' ');
    return {
      hasScore: collapsed.includes('1 : 1') && collapsed.includes('Nigma Galaxy'),
      blocks: document.querySelectorAll('div[class*="rounded-2xl"]').length,
      loading: document.body.innerText.includes('正在加载比赛详情'),
      err: /加载失败|not found|暂无比赛数据|网络错误/.test(document.body.innerText),
    };
  });
  blocksSeen = state.blocks;
  if (state.hasScore && state.blocks >= 2 && !state.loading) { doneAt = Date.now() - t0; break; }
  await new Promise((r) => setTimeout(r, 500));
}
console.log('content visible at +' + doneAt + 'ms (blocks=' + blocksSeen + ')');
await browser.close();
