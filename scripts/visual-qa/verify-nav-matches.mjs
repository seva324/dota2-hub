import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });
await page.goto('http://localhost:5174/#/matches', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const info = await page.evaluate(() => {
  // 桌面导航
  const desktopNav = [...document.querySelectorAll('header nav[aria-label="主导航"] a, header nav[aria-label="主导航"] button')].map(el => el.textContent?.trim());
  // 移动导航 (hidden on desktop, but check DOM)
  const mobileNav = [...document.querySelectorAll('nav[aria-label="移动端主导航"] button')].map(el => el.textContent?.trim());
  // 比赛页标题
  const headings = [...document.querySelectorAll('h1,h2')].map(h => h.textContent?.trim());
  return { desktopNav, mobileNav, headings };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
