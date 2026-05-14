import puppeteer from 'puppeteer';

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('https://dotahub.cn', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // 扫描所有有 img 子元素的 button
  const btns = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    const results = [];
    for (const b of buttons) {
      const img = b.querySelector('img');
      const text = (b.textContent || '').trim().slice(0, 60);
      const cls = (b.className || '').slice(0, 80);
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        results.push({
          hasImg: !!img,
          imgAlt: img ? (img.getAttribute('alt') || '') : '',
          text,
          cls,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      }
    }
    return results.slice(0, 40);
  });

  console.log(`Total visible buttons: ${btns.length}`);
  for (const b of btns) {
    const marker = b.hasImg ? '[IMG]' : '     ';
    console.log(`${marker} (${b.x},${b.y}) ${b.w}x${b.h} cls="${b.cls}" text="${b.text}"`);
  }

  await browser.close();
}
main().catch(err => { console.error(err); process.exit(1); });
