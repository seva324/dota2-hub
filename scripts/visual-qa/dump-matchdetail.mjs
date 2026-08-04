import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const info = await page.evaluate(() => {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => ({ tag: h.tagName, text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 50) }));
  // 主内容前 1200 字
  const main = document.querySelector('main');
  const text = (main ? main.innerText : document.body.innerText).trim().slice(0, 1200);
  // 底部导航选中项
  const nav = document.querySelector('nav[aria-label="移动端主导航"]');
  const activeTab = nav ? [...nav.querySelectorAll('button')].find((b) => b.className.includes('text-red-400'))?.innerText : '(no nav)';
  // 当前 hash
  return { hash: location.hash, activeTab, headings, text };
});
console.log('HASH:', info.hash);
console.log('ACTIVE TAB:', info.activeTab);
console.log('HEADINGS:', JSON.stringify(info.headings, null, 1));
console.log('TEXT:\n', info.text);
await browser.close();
