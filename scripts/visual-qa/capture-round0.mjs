import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://dotahub.cn';
const OUT = 'scripts/visual-qa/artifacts/round0';
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 2000 },
  { name: 'mobile', width: 390, height: 1600 },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function takeShot(page, el) {
  return await el.screenshot({ encoding: 'binary' });
}

async function captureAll(browser, vp) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height });
  const results = [];

  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);

  // 1. Match Detail
  console.log(`  [${vp.name}] Match Detail...`);
  const matchBtn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      const cls = b.className || '';
      if (cls.includes('grid-cols-[88px') && (b.textContent || '').includes('VS')) return b;
    }
    return null;
  });
  if (matchBtn.asElement()) {
    await matchBtn.asElement().click();
    await sleep(2500);
    const modal = await page.$('[data-slot="dialog-content"][data-state="open"]');
    if (modal) {
      const buf = await takeShot(page, modal);
      fs.writeFileSync(path.join(OUT, `match-detail.${vp.name}.png`), buf);
      results.push({ module: 'match-detail', viewport: vp.name, status: 'captured' });
      console.log('    OK');
    } else { results.push({ module: 'match-detail', viewport: vp.name, status: 'blocked' }); }
    await page.keyboard.press('Escape');
    await sleep(1000);
  } else { results.push({ module: 'match-detail', viewport: vp.name, status: 'blocked' }); }

  // 2. Team Flyout
  console.log(`  [${vp.name}] Team Flyout...`);
  const teamName = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const cls = b.className || '';
      if (cls.includes('text-sm') && cls.includes('font-bold') && cls.includes('truncate')) {
        const t = (b.textContent || '').trim();
        if (t.length > 2) { b.click(); return t; }
      }
    }
    return null;
  });
  if (teamName) {
    await sleep(3000);
    const sheet = await page.$('[data-slot="sheet-content"][data-state="open"]');
    if (sheet) {
      const buf = await takeShot(page, sheet);
      fs.writeFileSync(path.join(OUT, `team-flyout.${vp.name}.png`), buf);
      results.push({ module: 'team-flyout', viewport: vp.name, status: 'captured', entity: teamName });
      console.log(`    OK (${teamName})`);

      // 3. Player Profile
      console.log(`  [${vp.name}] Player Profile...`);
      const playerName = await page.evaluate(() => {
        const s = document.querySelector('[data-slot="sheet-content"][data-state="open"]');
        if (!s) return null;
        for (const b of s.querySelectorAll('button')) {
          const t = (b.textContent || '').trim();
          if (t.includes(' ') && t.length > 8 && t.length < 30 && !t.includes(':')) { b.click(); return t; }
        }
        return null;
      });
      if (playerName) {
        await sleep(3000);
        const pSheet = await page.$('[data-slot="sheet-content"][data-state="open"]');
        if (pSheet) {
          const buf = await takeShot(page, pSheet);
          fs.writeFileSync(path.join(OUT, `player-profile-flyout.${vp.name}.png`), buf);
          results.push({ module: 'player-profile-flyout', viewport: vp.name, status: 'captured', entity: playerName });
          console.log(`    OK (${playerName})`);
        } else { results.push({ module: 'player-profile-flyout', viewport: vp.name, status: 'blocked' }); }
      } else { results.push({ module: 'player-profile-flyout', viewport: vp.name, status: 'blocked' }); }
    } else { results.push({ module: 'team-flyout', viewport: vp.name, status: 'blocked' }); }
  } else { results.push({ module: 'team-flyout', viewport: vp.name, status: 'blocked' }); }

  await page.close();
  return results;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const all = [];
  for (const vp of VIEWPORTS) {
    console.log(`\n=== ${vp.name} (${vp.width}x${vp.height}) ===`);
    all.push(...await captureAll(browser, vp));
  }
  await browser.close();
  console.log('\n===== FILES =====');
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.png')).sort()) {
    console.log(`  ${f} — ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1)} KB`);
  }
  console.log(`Captured: ${all.filter(r => r.status === 'captured').length}/${all.length}`);
}
main().catch(err => { console.error(err); process.exit(1); });
