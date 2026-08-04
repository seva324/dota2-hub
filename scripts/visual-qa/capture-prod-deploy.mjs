import puppeteer from 'puppeteer';
import fs from 'node:fs';
const OUT = 'scripts/visual-qa/artifacts/prod';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2400 });

// Match detail deep link
await page.goto('https://dotahub.cn/#/match/427386?slug=midas-club-vs-team-resilience-games-of-the-future-2026', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 6000));
const md = await page.evaluate(() => ({
  url: location.hash,
  hasSeriesTitle: document.body.innerText.includes('Midas Club') && document.body.innerText.includes('Team Resilience'),
  hasScore: /1\s*:\s*2/.test(document.body.innerText),
  gameBlocks: document.querySelectorAll('[class*="rounded-2xl"]').length,
  text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
}));
console.log('MATCH-DETAIL:', JSON.stringify(md));
await page.screenshot({ path: `${OUT}/match-page-deployed.png`, fullPage: true });

// Matches page (live cards area)
await page.goto('https://dotahub.cn/#/matches', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
const mp = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[data-slot="carousel-item"]'));
  const btns = items.map((it) => it.querySelector('button'));
  return {
    url: location.hash,
    liveHeading: document.body.innerText.split('\n').find((l) => l.includes('LIVE')),
    slideCount: items.length,
    btnWidths: btns.map((b) => b && Math.round(b.getBoundingClientRect().width)),
    slideWidths: items.map((el) => Math.round(el.getBoundingClientRect().width)),
    uniform: items.length > 1 && btns.every((b, i) => b && Math.round(b.getBoundingClientRect().width) === Math.round(btns[0].getBoundingClientRect().width)),
  };
});
console.log('MATCHES:', JSON.stringify(mp));
await page.screenshot({ path: `${OUT}/matches-deployed.png`, fullPage: true });

await browser.close();
console.log('done');
