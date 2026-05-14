import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = 'scripts/visual-qa/artifacts/local';
const BASE = 'http://localhost:5173';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2000 });

  // TeamFlyout — capture FULL viewport so panel context is visible
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  const btn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').includes('EPT pts')) return b;
    }
    return null;
  });
  if (btn.asElement()) {
    await btn.asElement().click();
    await new Promise(r => setTimeout(r, 4000));
    // Capture full viewport so the flyout appears as a side panel
    await page.screenshot({ path: `${OUT}/team-flyout.desktop.png`, fullPage: false });
    console.log('TeamFlyout (full viewport) captured');
  } else { console.log('No team button'); }

  await browser.close();
  console.log('Done');
}
main().catch(e => { console.error(e); process.exit(1); });
