import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const bar = await page.evaluate(() => {
  // 第一个 GameBlock 的对战栏（含 '第 N 场' 的容器）
  const gameNo = [...document.querySelectorAll('*')].find((e) => /^第 \d+ 场$/.test((e.textContent || '').trim()) && e.children.length === 0);
  if (!gameNo) return { error: 'no gameNo found' };
  const bar = gameNo.parentElement; // 对战栏容器
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
  };
  const textEls = [...bar.querySelectorAll('span,div')].filter((e) => e.children.length === 0 && (e.textContent || '').trim());
  const items = textEls.map((e) => ({
    text: (e.textContent || '').trim().slice(0, 22),
    cls: (e.className || '').toString().slice(0, 40),
    ...rect(e),
  }));
  const imgs = [...bar.querySelectorAll('img')].map((e) => ({ alt: e.alt, ...rect(e) }));
  const barRect = rect(bar);
  return { bar: barRect, vw: window.innerWidth, items, imgs };
});
console.log(JSON.stringify(bar, null, 1));
await browser.close();
