import puppeteer from 'puppeteer';
import fs from 'fs';

const outDir = 'preview/artifacts';
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

async function capture(file, url, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 等待所有图片加载完成（最多 15s）
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const imgs = () => [...document.querySelectorAll('img')];
    for (let i = 0; i < 30; i++) {
      const pending = imgs().filter((img) => !img.complete || img.naturalWidth === 0);
      if (pending.length === 0) break;
      await wait(500);
    }
  });
  // 再等渲染稳定
  await new Promise((r) => setTimeout(r, 800));
  const path = `${outDir}/${file}`;
  await page.screenshot({ path, fullPage: true });
  const dims = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    return {
      w: document.body.scrollWidth,
      h: document.body.scrollHeight,
      cards: document.querySelectorAll('.card').length,
      featured: !document.getElementById('featured').hidden,
      imgsLoaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      imgsTotal: imgs.length,
    };
  });
  console.log(file, '->', JSON.stringify(dims));
  await page.close();
}

await capture('news-desktop.png', 'http://127.0.0.1:8801/news.html', { width: 1440, height: 900 });
await capture('news-mobile.png', 'http://127.0.0.1:8801/news.html', { width: 390, height: 844 });

await browser.close();
console.log('done');
