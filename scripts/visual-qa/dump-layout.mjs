import puppeteer from 'puppeteer';

// Dump the rendered layout box tree of a page: tag/class/rect/text for
// containers that occupy meaningful space.
const url = process.argv[2] || 'http://dotahub.cn/';
const suffix = process.argv[3] || 'desktop';
const query = process.argv[4] || '/';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--ignore-certificate-errors'],
});
const page = await browser.newPage();
const mobile = suffix === 'mobile';
await page.setViewport(mobile ? { width: 390, height: 1700, isMobile: true } : { width: 1440, height: 2400 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 7000));

const tree = await page.evaluate(() => {
  const out = [];
  const MIN_AREA = 3000;
  const walk = (el, depth) => {
    if (depth > 6) return;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width * r.height >= MIN_AREA && s.display !== 'none' && s.visibility !== 'hidden') {
      const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(' ').filter(Boolean).slice(0, 5).join(' ');
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ').slice(0, 40);
      out.push(`${'  '.repeat(depth)}[${el.tagName.toLowerCase()}] ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ${cls}${own ? '  "' + own + '"' : ''}`);
      for (const c of el.children) walk(c, depth + 1);
    }
  };
  walk(document.body, 0);
  return out.join('\n');
});
console.log(tree);
await browser.close();
