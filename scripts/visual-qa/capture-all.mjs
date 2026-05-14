import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = 'scripts/visual-qa/artifacts/local';
const BASE = 'http://localhost:5173';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function captureDesktop(page) {
  await page.setViewport({ width: 1440, height: 2000 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);

  // 1. MatchDetailModal — click a "Map" tab button in live matches section
  const mapBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t === 'Map 1' || t === 'Map 1 ') return b;
    }
    return null;
  });
  if (mapBtn.asElement()) {
    await mapBtn.asElement().click();
    await sleep(4000);
    const modal = await page.$('[data-visual-role="match-detail-modal"]');
    if (modal) {
      const buf = await modal.screenshot({ encoding: 'binary' });
      fs.writeFileSync(`${OUT}/match-detail.desktop.png`, buf);
      console.log(`MatchDetail desktop: ${(buf.length / 1024).toFixed(1)} KB`);
      await page.keyboard.press('Escape');
      await sleep(2000);
    } else { console.log('No MatchDetail modal found after Map click'); }
  } else { console.log('No Map button found'); }

  // 2. TeamFlyout — click first team in "热门战队" rail
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  // Find the first team button: contains "EPT pts" or team names like "Tundra Esports"
  const teamBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t.includes('EPT pts') && t.includes('点击查看详情')) {
        return b;
      }
    }
    return null;
  });
  if (teamBtn.asElement()) {
    await teamBtn.asElement().click();
    await sleep(4000);
    const tf = await page.$('[data-visual-role="team-flyout"]');
    if (tf) {
      // Wait for flyout to fully render
      await sleep(2000);
      const buf = await tf.screenshot({ encoding: 'binary' });
      fs.writeFileSync(`${OUT}/team-flyout.desktop.png`, buf);
      console.log(`TeamFlyout desktop: ${(buf.length / 1024).toFixed(1)} KB`);
      await page.keyboard.press('Escape');
      await sleep(2000);
    } else { console.log('No TeamFlyout found'); }
  } else { console.log('No team button found'); }

  // 3. PlayerProfileFlyout — click first player in "人气选手" rail
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const playerBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t.startsWith('1A') || t.startsWith('1AAme')) return b;
    }
    return null;
  });
  if (playerBtn.asElement()) {
    await playerBtn.asElement().click();
    await sleep(4000);
    const pp = await page.$('[data-visual-role="player-profile-flyout"]');
    if (pp) {
      await sleep(2000);
      const buf = await pp.screenshot({ encoding: 'binary' });
      fs.writeFileSync(`${OUT}/player-profile.desktop.png`, buf);
      console.log(`PlayerProfile desktop: ${(buf.length / 1024).toFixed(1)} KB`);
      await page.keyboard.press('Escape');
      await sleep(2000);
    } else { console.log('No PlayerProfile found'); }
  } else { console.log('No player button found'); }
}

async function captureMobile(page) {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  // Mobile: MatchDetail - Map tab
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const mapBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === 'Map 1') return b;
    }
    return null;
  });
  if (mapBtn.asElement()) {
    await mapBtn.asElement().click();
    await sleep(4000);
    const sheet = await page.$('[data-visual-role="match-detail-modal"]');
    if (sheet) {
      const buf = await sheet.screenshot({ encoding: 'binary' });
      fs.writeFileSync(`${OUT}/match-detail.mobile.png`, buf);
      console.log(`MatchDetail mobile: ${(buf.length / 1024).toFixed(1)} KB`);
      await page.keyboard.press('Escape');
      await sleep(2000);
    }
  } else { console.log('Mobile: No Map button'); }

  // Mobile: TeamFlyout — try team names directly
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const teamBtn = await page.evaluateHandle(() => {
    // Mobile may have team buttons with just the name
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t === 'Tundra Esports' || t.includes('Tundra')) return b;
    }
    return null;
  });
  if (teamBtn.asElement()) {
    try {
      await teamBtn.asElement().click();
      await sleep(4000);
      const tf = await page.$('[data-visual-role="team-flyout"]');
      if (tf) {
        await sleep(1500);
        const buf = await tf.screenshot({ encoding: 'binary' });
        fs.writeFileSync(`${OUT}/team-flyout.mobile.png`, buf);
        console.log(`TeamFlyout mobile: ${(buf.length / 1024).toFixed(1)} KB`);
        await page.keyboard.press('Escape');
        await sleep(2000);
      }
    } catch (e) { console.log(`Mobile team click error: ${e.message}`); }
  } else { console.log('Mobile: No team button'); }

  // Mobile: PlayerProfile
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);
  const playerBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('Ame')) return b;
    }
    return null;
  });
  if (playerBtn.asElement()) {
    try {
      await playerBtn.asElement().click();
      await sleep(4000);
      const pp = await page.$('[data-visual-role="player-profile-flyout"]');
      if (pp) {
        await sleep(1500);
        const buf = await pp.screenshot({ encoding: 'binary' });
        fs.writeFileSync(`${OUT}/player-profile.mobile.png`, buf);
        console.log(`PlayerProfile mobile: ${(buf.length / 1024).toFixed(1)} KB`);
        await page.keyboard.press('Escape');
        await sleep(2000);
      }
    } catch (e) { console.log(`Mobile player click error: ${e.message}`); }
  } else { console.log('Mobile: No player button'); }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    console.log('=== Desktop captures ===');
    await captureDesktop(page);
    console.log('=== Mobile captures ===');
    await captureMobile(page);
  } finally {
    await browser.close();
    console.log('Done');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
