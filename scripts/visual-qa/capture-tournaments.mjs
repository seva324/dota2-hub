import puppeteer from 'puppeteer';
import fs from 'node:fs';

const url = 'http://localhost:5173/#/tournaments';
const outDir = 'scripts/visual-qa/artifacts/tournaments';
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForFunction(() => {
  const h = document.querySelector('h1');
  return h && h.textContent.includes('Tournaments') && document.body.textContent.includes('已结束');
}, { timeout: 25000 });
await new Promise((r) => setTimeout(r, 1200));

// Pixel QA: measure alignment and centering
const qa = await page.evaluate(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2) };
  };

  const h1 = rect(document.querySelector('h1'));
  const vw = window.innerWidth;

  // Ongoing poster cards
  const sections = [...document.querySelectorAll('section')];
  const ongoingSec = sections.find((s) => s.querySelector('h2')?.textContent?.includes('进行中'));
  const posters = ongoingSec
    ? [...ongoingSec.querySelectorAll('a')].map((a) => {
        const r = a.getBoundingClientRect();
        return {
          title: a.querySelector('h3')?.textContent?.slice(0, 24),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2),
          live: Boolean(a.querySelector('[class*="animate-pulse"]')),
        };
      })
    : [];

  // Upcoming cards grid: all <a> in the upcoming section with h3
  const upcomingSec = sections.find((s) => s.querySelector('h2')?.textContent?.includes('即将开始'));
  const upcomingCards = upcomingSec
    ? [...upcomingSec.querySelectorAll('a')].map((a) => {
        const r = a.getBoundingClientRect();
        return { title: a.querySelector('h3')?.textContent?.slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2) };
      })
    : [];

  // Finished rows: check name/winner alignment
  const finishedSec = sections.find((s) => s.querySelector('h2')?.textContent?.includes('已结束'));
  const finishedRows = finishedSec ? [...finishedSec.querySelectorAll('a')].slice(0, 4).map((a) => {
    const cols = [...a.querySelectorAll(':scope > *')].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), text: c.textContent.slice(0, 24) };
    });
    const names = a.querySelectorAll('h3');
    return { cols, nameTexts: [...names].map((n) => n.textContent) };
  }) : [];

  return {
    viewport: vw,
    h1: { ...h1, offsetFromCenter: h1 ? h1.cx - Math.round(vw / 2) : null },
    posters,
    posterWidthsUnique: [...new Set(posters.map((p) => p.w))],
    upcoming: { count: upcomingCards.length, xs: [...new Set(upcomingCards.map((c) => c.x))], widths: [...new Set(upcomingCards.map((c) => c.w))] },
    finishedSample: finishedRows,
  };
});
fs.writeFileSync(`${outDir}/qa.json`, JSON.stringify(qa, null, 2));
console.log(JSON.stringify(qa, null, 2));

await page.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${outDir}/full.png`, fullPage: true });

// focused screenshot of ongoing + upcoming
const firstSec = await page.$('section');
if (firstSec) {
  await firstSec.scrollIntoView({ block: 'start' });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${outDir}/top-sections.png` });
}

await browser.close();
console.log('saved to', outDir);
