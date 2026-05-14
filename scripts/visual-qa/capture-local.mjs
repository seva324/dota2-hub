import puppeteer from 'puppeteer';
import fs from 'fs';

const OUT = 'scripts/visual-qa/artifacts/local';
const VP = { width: 1440, height: 2000 };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport(VP);

  await page.goto('http://localhost:5174/?prototype=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Click match trigger
  const btn = await page.evaluateHandle(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent||'').includes('VS')) return b;
    }
    return null;
  });
  if (!btn.asElement()) { console.log('No match trigger'); await browser.close(); return; }
  await btn.asElement().click();
  await new Promise(r => setTimeout(r, 2500));

  const modal = await page.$('[data-slot="dialog-content"][data-state="open"]');
  if (!modal) { console.log('No modal'); await browser.close(); return; }

  const buf = await modal.screenshot({ encoding: 'binary' });
  fs.writeFileSync(`${OUT}/match-detail.local.png`, buf);
  console.log(`Saved: ${(buf.length/1024).toFixed(1)} KB`);
  await browser.close();
}
main().catch(err => { console.error(err); process.exit(1); });
