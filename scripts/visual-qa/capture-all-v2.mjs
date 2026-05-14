import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = 'scripts/visual-qa/artifacts/local';
const BASE = 'http://localhost:5173';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // --- Desktop captures (full viewport for context) ---
  await page.setViewport({ width: 1440, height: 2000 });

  // 1. TeamFlyout
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const tfBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('EPT pts')) return b;
    }
    return null;
  });
  if (tfBtn.asElement()) {
    await tfBtn.asElement().click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/team-flyout.desktop.png`, fullPage: false });
    console.log('TeamFlyout desktop captured');
    await page.keyboard.press('Escape');
    await sleep(2000);
  }

  // 2. PlayerProfile
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const ppBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t.startsWith('1A')) return b;
    }
    return null;
  });
  if (ppBtn.asElement()) {
    await ppBtn.asElement().click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/player-profile.desktop.png`, fullPage: false });
    console.log('PlayerProfile desktop captured');
    await page.keyboard.press('Escape');
    await sleep(2000);
  }

  // 3. MatchDetail
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const mdBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === 'Map 1') return b;
    }
    return null;
  });
  if (mdBtn.asElement()) {
    await mdBtn.asElement().click();
    await sleep(4000);
    await page.screenshot({ path: `${OUT}/match-detail.desktop.png`, fullPage: false });
    console.log('MatchDetail desktop captured');
    await page.keyboard.press('Escape');
    await sleep(2000);
  }

  await browser.close();
  console.log('All captures done');
}
main().catch(e => { console.error(e); process.exit(1); });
