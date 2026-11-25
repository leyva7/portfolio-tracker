// 390 px screenshots in light mode and a simulated dark mode (a rough approximation of Gmail on iOS in dark mode:
// #1f1f1f background and a luminance inversion with hue-rotate, which keeps green/red/blue hues).
// Usage: node screenshots.js <folder containing email.html>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const dir = process.argv[2] || __dirname;
  const html = fs.readFileSync(path.join(dir, 'email.html'), 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.screenshot({ path: path.join(dir, '390-light.png'), fullPage: true });
  await page.setContent(html);
  await page.evaluate(() => {
    document.documentElement.style.background = '#1f1f1f';
    document.body.style.filter = 'invert(0.88) hue-rotate(180deg)';
    document.body.style.background = '#ffffff';
  });
  await page.screenshot({ path: path.join(dir, '390-dark.png'), fullPage: true });
  await browser.close();
})();
