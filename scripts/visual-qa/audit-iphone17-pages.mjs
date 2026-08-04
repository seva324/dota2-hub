import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const PAGES = [
  { name: 'matches', url: 'http://localhost:5173/#/matches' },
  { name: 'teams', url: 'http://localhost:5173/#/teams' },
  { name: 'matchdetail', url: 'http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2' },
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);

for (const p of PAGES) {
  console.log(`\n===== ${p.name} =====`);
  try {
    await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));
  } catch (e) {
    console.log('goto err:', String(e).slice(0, 100));
  }

  const metrics = await page.evaluate(() => ({
    title: document.title,
    hash: location.hash,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    scrollH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bodyTextLen: (document.body.innerText || '').length,
    errorOnPage: /加载失败|出错了|Error|无法|空空/.test(document.body.innerText || ''),
  }));
  console.log('metrics:', JSON.stringify(metrics));

  // 头部标题锚点
  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('h1,h2,h3')]
      .slice(0, 12)
      .map((h) => `${h.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)}@${Math.round(h.getBoundingClientRect().top + window.scrollY)}`)
  );
  console.log('headings:', headings.join(' | '));

  // 首屏
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: `scripts/visual-qa/artifacts/iphone17-${p.name}-top.png` });

  // 分段：按页面高度取 40% 与 70%
  const h = metrics.scrollH;
  for (const frac of [0.4, 0.7]) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(h * frac));
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: `scripts/visual-qa/artifacts/iphone17-${p.name}-seg${Math.round(frac * 100)}.png` });
  }
  console.log('captured top + seg40 + seg70');
}
await browser.close();
console.log('\ndone');
