import puppeteer from 'puppeteer';
import fs from 'fs';

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('1. Navigating...');
  await page.goto('https://dotahub.cn', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('2. Finding match trigger...');
  const matchBtn = await page.evaluateHandle(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.includes('VS')) return b;
    }
    return null;
  });
  if (!matchBtn.asElement()) { console.log('ERROR: no match trigger'); await browser.close(); return; }

  console.log('3. Clicking match trigger...');
  await matchBtn.asElement().click();
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'scripts/visual-qa/artifacts/debug-step1-modal.png', fullPage: false });
  console.log('   Saved debug-step1-modal.png');

  console.log('4. Finding team trigger in modal...');
  const teamInfo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { error: 'no dialog' };
    const buttons = dialog.querySelectorAll('button');
    const candidates = [];
    for (const b of buttons) {
      const text = (b.textContent || '').trim();
      const style = window.getComputedStyle(b);
      if (text.length > 2 && text.length < 40 && parseInt(style.fontWeight) >= 600) {
        candidates.push({ text });
      }
    }
    return { count: candidates.length, candidates };
  });
  console.log('   Team candidates:', JSON.stringify(teamInfo, null, 2));

  if (teamInfo.candidates && teamInfo.candidates.length > 0) {
    const name = teamInfo.candidates[0].text;
    console.log(`5. Clicking team trigger: "${name}"...`);
    await page.evaluate((targetText) => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return;
      for (const b of dialog.querySelectorAll('button')) {
        if ((b.textContent || '').trim() === targetText) { b.click(); return; }
      }
    }, name);
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: 'scripts/visual-qa/artifacts/debug-step2-after-team.png', fullPage: false });
    console.log('   Saved debug-step2-after-team.png');

    const sheetEl = await page.$('[data-slot="sheet-content"][data-state="open"]');
    console.log(`   Sheet found: ${sheetEl ? 'YES' : 'NO'}`);
    if (sheetEl) {
      const buf = await sheetEl.screenshot({ encoding: 'binary' });
      fs.writeFileSync('scripts/visual-qa/artifacts/debug-step3-sheet.png', buf);
      console.log('   Saved debug-step3-sheet.png');
    }

    const allSlots = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slot]')).map(e => ({
        slot: e.getAttribute('data-slot'),
        state: e.getAttribute('data-state'),
        visible: e.getBoundingClientRect().width > 0,
      }))
    );
    console.log('   All data-slot elements:', JSON.stringify(allSlots, null, 2));
  }

  await browser.close();
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });
