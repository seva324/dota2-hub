import puppeteer from 'puppeteer';
import fs from 'fs';

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('https://dotahub.cn', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 找 HeroSection 中的战队名 button: text-sm font-bold truncate hover:text-red-300
  const teams = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    const results = [];
    for (const b of buttons) {
      const cls = (b.className || '');
      if (cls.includes('text-sm') && cls.includes('font-bold') && cls.includes('truncate')) {
        const text = (b.textContent || '').trim();
        const rect = b.getBoundingClientRect();
        if (rect.width > 50 && text.length > 2) {
          results.push({ text, x: Math.round(rect.x), y: Math.round(rect.y) });
        }
      }
    }
    return results;
  });
  console.log(`Found ${teams.length} team name buttons`);
  teams.slice(0, 5).forEach(t => console.log(`  "${t.text}" (${t.x},${t.y})`));

  if (teams.length === 0) { console.log('ERROR: no team buttons'); await browser.close(); return; }

  // 点击第一个
  const name = teams[0].text;
  console.log(`\nClicking: "${name}"...`);
  await page.evaluate((target) => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if ((b.textContent || '').trim() === target) { b.click(); return; }
    }
  }, name);
  await new Promise(r => setTimeout(r, 3000));

  await page.screenshot({ path: 'scripts/visual-qa/artifacts/debug-v4-step1.png', fullPage: false });

  const sheetEl = await page.$('[data-slot="sheet-content"][data-state="open"]');
  console.log(`Sheet: ${sheetEl ? 'YES' : 'NO'}`);

  const slots = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot]'))
      .filter(e => { const s = e.getAttribute('data-slot') || ''; return s.includes('sheet') || s.includes('dialog'); })
      .map(e => ({ slot: e.getAttribute('data-slot'), state: e.getAttribute('data-state'), visible: e.getBoundingClientRect().width > 0, text: (e.textContent || '').slice(0, 60) }))
  );
  console.log('Slots:', JSON.stringify(slots, null, 2));

  if (sheetEl) {
    const buf = await sheetEl.screenshot({ encoding: 'binary' });
    fs.writeFileSync('scripts/visual-qa/artifacts/debug-v4-sheet.png', buf);
    console.log('Saved debug-v4-sheet.png');

    const players = await page.evaluate(() => {
      const sheet = document.querySelector('[data-slot="sheet-content"][data-state="open"]');
      if (!sheet) return [];
      return Array.from(sheet.querySelectorAll('button'))
        .map(b => ({ text: (b.textContent || '').trim().slice(0, 40) }))
        .filter(p => p.text.length > 2 && p.text.length < 40).slice(0, 10);
    });
    console.log('Players:', JSON.stringify(players, null, 2));
  }

  await browser.close();
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });
