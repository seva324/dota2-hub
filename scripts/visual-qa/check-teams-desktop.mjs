import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
await page.goto('http://localhost:8804/#/teams', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
const result = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) offenders.push(el.tagName + ' ' + (typeof el.className === 'string' ? el.className.slice(0, 60) : ''));
  });
  const podium = document.querySelector('main div.grid');
  const list = document.querySelector('ul');
  const rows = [...(list?.querySelectorAll('li') ?? [])].slice(0, 4).map(li => {
    const avDiv = li.querySelector('.order-last');
    return avDiv ? getComputedStyle(avDiv).order + '/' + getComputedStyle(avDiv).flexBasis : 'n/a';
  });
  return JSON.stringify({ vw, overflowCount: offenders.length, podiumCols: podium ? getComputedStyle(podium).gridTemplateColumns.split(' ').length : null, listCols: list ? getComputedStyle(list).gridTemplateColumns.split(' ').length : null, rowWrap: rows });
});
console.log(result);
await browser.close();
