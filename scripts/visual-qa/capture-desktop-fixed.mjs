import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

for (const [name, url] of [
  ['desktop-matchdetail-fixed', 'http://localhost:5173/#/match/427581?slug=lgd-gaming-vs-1win-team-1win-essence-2'],
  ['desktop-matches-fixed', 'http://localhost:5173/#/matches'],
]) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.screenshot({ path: `scripts/visual-qa/artifacts/${name}.png` });
  console.log('captured', name);
}
await browser.close();
