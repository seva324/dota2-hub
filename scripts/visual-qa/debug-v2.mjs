import puppeteer from 'puppeteer';
import fs from 'fs';

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('1. Navigating...');
  await page.goto('https://dotahub.cn', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('2. Scrolling to TournamentSection...');
  await page.evaluate(() => {
    const headings = document.querySelectorAll('h2, h3, h1');
    for (const h of headings) {
      if (h.textContent.includes('赛事') || h.textContent.includes('Tournament')) {
        h.scrollIntoView({ block: 'center' });
        return;
      }
    }
    window.scrollBy(0, 800);
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/debug-v2-step1.png', fullPage: false });

  console.log('3. Finding team triggers...');
  const teamTriggers = await page.evaluate(() => {
    const results = [];
    const buttons = document.querySelectorAll('button.flex-shrink-0');
    for (const b of buttons) {
      const img = b.querySelector('img');
      if (img) {
        const alt = img.getAttribute('alt') || '';
        const rect = b.getBoundingClientRect();
        if (rect.width > 20 && rect.height > 20) {
          results.push({ alt, x: Math.round(rect.x), y: Math.round(rect.y) });
        }
      }
    }
    return results;
  });
  console.log(`   Found ${teamTriggers.length}`);
  if (teamTriggers.length > 0) console.log('   First:', JSON.stringify(teamTriggers[0]));

  if (teamTriggers.length === 0) { await browser.close(); return; }

  const clicked = await page.evaluate(() => {
    const btns = document.querySelectorAll('button.flex-shrink-0');
    for (const b of btns) {
      if (b.querySelector('img') && b.getBoundingClientRect().width > 20) {
        b.click();
        return b.querySelector('img')?.getAttribute('alt') || 'unknown';
      }
    }
    return null;
  });
  console.log(`4. Clicked: "${clicked}"`);
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/debug-v2-step2.png', fullPage: false });

  const sheetEl = await page.$('[data-slot="sheet-content"][data-state="open"]');
  console.log(`5. Sheet: ${sheetEl ? 'YES' : 'NO'}`);

  const slots = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot]'))
      .filter(e => { const s = e.getAttribute('data-slot') || ''; return s.includes('sheet') || s.includes('dialog'); })
      .map(e => ({ slot: e.getAttribute('data-slot'), state: e.getAttribute('data-state'), visible: e.getBoundingClientRect().width > 0, text: (e.textContent || '').slice(0, 50) }))
  );
  console.log('   Slots:', JSON.stringify(slots, null, 2));

  if (sheetEl) {
    const buf = await sheetEl.screenshot({ encoding: 'binary' });
    fs.writeFileSync('scripts/visual-qa/artifacts/debug-v2-step3-sheet.png', buf);
    console.log('   Saved debug-v2-step3-sheet.png');

    const players = await page.evaluate(() => {
      const sheet = document.querySelector('[data-slot="sheet-content"][data-state="open"]');
      if (!sheet) return [];
      return Array.from(sheet.querySelectorAll('button'))
        .map(b => ({ text: (b.textContent || '').trim().slice(0, 30) }))
        .filter(p => p.text.length > 2 && p.text.length < 30).slice(0, 10);
    });
    console.log('   Players:', JSON.stringify(players, null, 2));
  }

  await browser.close();
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });
