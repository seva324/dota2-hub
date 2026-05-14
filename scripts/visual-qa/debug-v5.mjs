import puppeteer from 'puppeteer';
import fs from 'fs';

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('https://dotahub.cn', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 1. 开 TeamFlyout
  const teams = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      const cls = b.className || '';
      if (cls.includes('text-sm') && cls.includes('font-bold') && cls.includes('truncate')) {
        const text = (b.textContent || '').trim();
        if (text.length > 2) { b.click(); return text; }
      }
    }
    return null;
  });
  console.log(`Team clicked: "${teams}"`);
  await new Promise(r => setTimeout(r, 3000));

  const sheetAfterTeam = await page.$('[data-slot="sheet-content"][data-state="open"]');
  console.log(`Team Sheet: ${sheetAfterTeam ? 'YES' : 'NO'}`);

  if (sheetAfterTeam) {
    // 截 Team Flyout
    const buf = await sheetAfterTeam.screenshot({ encoding: 'binary' });
    fs.writeFileSync('scripts/visual-qa/artifacts/debug-v5-team-flyout.png', buf);
    console.log('Saved team-flyout');

    // 2. 找选手（在 Sheet 中，文本包含两行文字如 "Ame Wang Chunyu" - 选第一个非战队名的）
    const playerClicked = await page.evaluate(() => {
      const sheet = document.querySelector('[data-slot="sheet-content"][data-state="open"]');
      if (!sheet) return null;
      const buttons = sheet.querySelectorAll('button');
      for (const b of buttons) {
        const text = (b.textContent || '').trim();
        // 选手文本包含空格(名+姓) 或长度在 5-25 之间，但排除纯数字和队伍名
        if (text.includes(' ') && text.length > 8 && text.length < 30 && !text.includes(':')) {
          b.click();
          return text;
        }
      }
      // fallback: 任何非战队名的 button
      for (const b of buttons) {
        const text = (b.textContent || '').trim();
        if (text.length > 5 && text.length < 30 && text !== teams && !text.includes(':')) {
          b.click();
          return text;
        }
      }
      return null;
    });
    console.log(`Player clicked: "${playerClicked}"`);
    await new Promise(r => setTimeout(r, 3000));

    // 检查 Player Sheet（新的 sheet-content 应该替换了 team sheet）
    const playerSheet = await page.$('[data-slot="sheet-content"][data-state="open"]');
    console.log(`Player Sheet: ${playerSheet ? 'YES' : 'NO'}`);

    if (playerSheet) {
      const buf2 = await playerSheet.screenshot({ encoding: 'binary' });
      fs.writeFileSync('scripts/visual-qa/artifacts/debug-v5-player-profile.png', buf2);
      console.log('Saved player-profile');
    } else {
      // 可能两个 Sheet 同时存在 - 检查页面
      await page.screenshot({ path: 'scripts/visual-qa/artifacts/debug-v5-full.png', fullPage: false });
    }
  }

  await browser.close();
  console.log('Done.');
}
main().catch(err => { console.error(err); process.exit(1); });
