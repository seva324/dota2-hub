import puppeteer from 'puppeteer';

// Capture the production homepage (real data) for visual QA against prototypes.
const OUT = 'scripts/visual-qa/artifacts/prod';
import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--ignore-certificate-errors', '--allow-insecure-localhost'],
});

async function snap(viewport, suffix) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto('http://dotahub.cn/', { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 8000));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 800));
  const metrics = await page.metrics();
  const info = await page.evaluate(() => ({
    text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
    imgs: [...document.images].length,
    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 130)).slice(0, 12),
  }));
  console.log(suffix, JSON.stringify(info, null, 1));
  await page.screenshot({ path: `${OUT}/homepage.${suffix}.png`, fullPage: true });
  console.log('captured', `${OUT}/homepage.${suffix}.png`);
  await page.close();
}

await snap({ width: 1440, height: 2400 }, 'desktop');
await snap({ width: 390, height: 1700, isMobile: true, hasTouch: true }, 'mobile');
await browser.close();
