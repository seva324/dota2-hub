import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = 'scripts/visual-qa/artifacts/prod';
const PROD = 'https://dotahub.cn';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });

  // 1. TeamFlyout — click team with "EPT pts"
  console.log('Capturing TeamFlyout...');
  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(8000);
  const tfBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('EPT pts')) return b;
    }
    return null;
  });
  if (tfBtn.asElement()) {
    await tfBtn.asElement().click();
    await sleep(5000);
    await page.screenshot({ path: `${OUT}/team-flyout.desktop.png`, fullPage: false });
    console.log('TeamFlyout captured');
    await page.keyboard.press('Escape');
    await sleep(2000);
  } else {
    console.log('No EPT pts button — trying fallback');
    // Try to find a team name button
    const fb = await page.evaluateHandle(() => {
      for (const b of document.querySelectorAll('button')) {
        if ((b.textContent || '').includes('Xtreme Gaming')) return b;
      }
      return null;
    });
    if (fb.asElement()) {
      await fb.asElement().click();
      await sleep(5000);
      await page.screenshot({ path: `${OUT}/team-flyout.desktop.png`, fullPage: false });
      console.log('TeamFlyout captured (fallback)');
      await page.keyboard.press('Escape');
      await sleep(2000);
    }
  }

  // 2. PlayerProfile — click first player button
  console.log('Capturing PlayerProfile...');
  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(8000);
  const ppBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t.match(/^\d+[A-Z]/) || t.includes('Ame')) return b;
    }
    return null;
  });
  if (ppBtn.asElement()) {
    await ppBtn.asElement().click();
    await sleep(5000);
    await page.screenshot({ path: `${OUT}/player-profile.desktop.png`, fullPage: false });
    console.log('PlayerProfile captured');
    await page.keyboard.press('Escape');
    await sleep(2000);
  } else {
    console.log('No player button found');
  }

  // 3. MatchDetail — click "Map 1" in LIVE match section
  console.log('Capturing MatchDetail...');
  await page.goto(PROD, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(8000);
  const mdBtn = await page.evaluateHandle(() => {
    // Find "Map 1" button inside a live match card (near "LIVE" badge)
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === 'Map 1') return b;
    }
    return null;
  });
  if (mdBtn.asElement()) {
    await mdBtn.asElement().click();
    await sleep(5000);
    // Try data-visual-role first, then fall back to any open dialog
    let modal = await page.$('[data-visual-role="match-detail-modal"]');
    if (!modal) modal = await page.$('[role="dialog"][data-state="open"]');
    if (modal) {
      await sleep(2000);
      const buf = await modal.screenshot({ encoding: 'binary' });
      fs.writeFileSync(`${OUT}/match-detail.desktop.png`, buf);
      console.log(`MatchDetail captured: ${(buf.length/1024).toFixed(1)} KB`);
    } else {
      await page.screenshot({ path: `${OUT}/match-detail.desktop.png`, fullPage: false });
      console.log('MatchDetail captured (full page fallback)');
    }
  } else {
    console.log('No Map 1 button found');
  }

  await browser.close();
  console.log('All captures done');
}
main().catch(e => { console.error(e); process.exit(1); });
