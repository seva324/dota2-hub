import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = 'scripts/visual-qa/artifacts/local';
const VP = { width: 1440, height: 2000 };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport(VP);

  await page.goto('http://localhost:5173/?prototype=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: OUT + '/homepage.desktop.png', fullPage: false });
  console.log('homepage captured');

  const btn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent||'').includes('VS')) return b;
    }
    return null;
  });
  if (btn.asElement()) {
    await btn.asElement().click();
    await new Promise(r => setTimeout(r, 3000));
    const modal = await page.$('[data-slot="dialog-content"][data-state="open"]');
    if (modal) {
      const buf = await modal.screenshot({ encoding: 'binary' });
      fs.writeFileSync(OUT + '/match-detail.desktop.png', buf);
      console.log('match-detail captured');
    }
  }

  await browser.close();
  console.log('Done');
}
main().catch(e => { console.error(e); process.exit(1); });
