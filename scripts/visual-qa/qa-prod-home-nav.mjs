import puppeteer from 'puppeteer';

// QA the deployed production home page for Parts 2+3:
//  1. Wait for real data (live/results cards) to render — records how long.
//  2. Click the first finished Result card → expect navigation to #/match/<id>?slug=...
const BASE = 'https://dotahub.cn/';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 2000 });

const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
console.log('domcontentloaded at +' + (Date.now() - t0) + 'ms');

// Wait until a real finished-result card is on screen (button containing "COMPLETED" + ":").
let dataAt = null;
let cardText = '';
for (let i = 0; i < 60; i++) {
  const found = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const card = btns.find((b) => /COMPLETED/i.test(b.innerText || '') && /:/i.test(b.innerText || ''));
    return card ? card.innerText.replace(/\s+/g, ' ').slice(0, 140) : null;
  });
  if (found) { cardText = found; dataAt = Date.now() - t0; break; }
  await new Promise((r) => setTimeout(r, 500));
}
console.log('result card visible at +' + dataAt + 'ms');
console.log('card:', cardText);

if (dataAt == null) {
  // Dump what's actually on screen to debug why no result card appeared.
  const dump = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
  console.log('BODY:', dump);
  await browser.close();
  process.exit(1);
}

// Click the finished result card and watch the hash route.
const clickRes = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const card = btns.find((b) => /COMPLETED/i.test(b.innerText || '') && /:/i.test(b.innerText || ''));
  card.click();
  return { ok: true };
});
console.log('clicked:', JSON.stringify(clickRes));

await new Promise((r) => setTimeout(r, 3000));
const afterNav = await page.evaluate(() => ({
  hash: location.hash,
  body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
}));
console.log('after navigation:', JSON.stringify(afterNav, null, 2));

await browser.close();
