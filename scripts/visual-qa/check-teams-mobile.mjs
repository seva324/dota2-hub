import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812 });
await page.goto('http://localhost:8804/#/teams', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
const result = await page.evaluate(() => {
  const podium = document.querySelector('main div.grid');
  const list = document.querySelector('ul');
  const podiumCols = podium ? getComputedStyle(podium).gridTemplateColumns.split(' ').length : null;
  const listCols = list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : null;
  const hScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  const podiumOrder = [...(podium?.querySelectorAll('div') ?? [])].filter(d => d.className.includes('md:order')).map(d => getComputedStyle(d).order);
  return JSON.stringify({ podiumCols, listCols, hScroll, podiumOrder });
});
console.log(result);
await browser.close();
