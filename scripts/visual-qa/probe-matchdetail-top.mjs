import puppeteer from 'puppeteer';

const VIEWPORT = { width: 402, height: 874, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
await page.setUserAgent(UA);
await page.goto('http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));

const probe = await page.evaluate(() => {
  const header = document.querySelector('header');
  const headerH = header ? header.getBoundingClientRect().height : 0;
  // 找 '返回赛程' 按钮和比分/队名元素
  const byText = (t) => [...document.querySelectorAll('button,span,div,h1,h2,h3')].find((e) => (e.textContent || '').trim() === t && e.children.length === 0);
  const back = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim().includes('返回'));
  const firstText = [...document.querySelectorAll('main *')].find((e) => e.children.length === 0 && (e.textContent || '').trim().length > 0);
  const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
  // main 的 top padding
  const main = document.querySelector('main');
  const mainCS = main ? getComputedStyle(main) : null;
  return {
    headerH,
    backBtn: back ? { text: back.textContent.trim(), rect: rect(back) } : null,
    firstContentEl: firstText ? { tag: firstText.tagName, text: (firstText.textContent || '').trim().slice(0, 30), rect: rect(firstText) } : null,
    mainPaddingTop: mainCS ? mainCS.paddingTop : null,
    mainPaddingBottom: mainCS ? mainCS.paddingBottom : null,
    mainChildFirst: main && main.firstElementChild ? { tag: main.firstElementChild.tagName, cls: (main.firstElementChild.className || '').toString().slice(0, 60) } : null,
  };
});
console.log(JSON.stringify(probe, null, 1));

// 截一张 scroll 0 的图，确认顶部
await page.screenshot({ path: 'scripts/visual-qa/artifacts/iphone17-matchdetail-top2.png' });
await browser.close();
