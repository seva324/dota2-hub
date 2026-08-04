import puppeteer from 'puppeteer';

// QA: match detail page reached from a home Result card actually loads content.
const URL = 'https://dotahub.cn/#/match/427567?slug=mouz-vs-gamerlegion-1win-essence-2';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('domcontentloaded at +' + (Date.now() - t0) + 'ms');

let doneAt = null;
let errState = null;
for (let i = 0; i < 40; i++) {
  const state = await page.evaluate(() => {
    const body = document.body.innerText.replace(/\s+/g, ' ');
    return {
      loading: body.includes('正在加载比赛详情'),
      err: /加载失败|not found|暂无比赛数据|网络错误|出错了/.test(body),
      hasTeams: /MOUZ/.test(body) && /GamerLegion/.test(body),
      blocks: document.querySelectorAll('div[class*="rounded-2xl"]').length,
    };
  });
  errState = state;
  if (!state.loading && state.hasTeams) { doneAt = Date.now() - t0; break; }
  await new Promise((r) => setTimeout(r, 500));
}
console.log('detail content at +' + doneAt + 'ms');
console.log('state:', JSON.stringify(errState));
if (doneAt == null) {
  const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
  console.log('BODY:', body);
}
await browser.close();
