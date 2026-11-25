// Screenshots of the app with the SAMPLE portfolio (no real data) for the documentation.
// Usage: node tools/screenshots.js [app.html]   → docs/screenshots/*.png
const path = require('path');
const { openApp } = require('../harness/open.js');
const html = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app.html'));
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const TABS = [['home', 'home'], ['portfolio', 'portfolio'], ['analysis', 'analysis'], ['plan', 'plan']];
(async () => {
  for (const [width, theme] of [[1280, 'light'], [390, 'light'], [390, 'dark']]) {
    // mock: false → no window.claude → the app starts in demo mode
    const { page, browser } = await openApp({ html, width, theme, mock: false, realFonts: true, dsf: 2, wait: 2500 });
    for (const [tab, name] of TABS) {
      await page.evaluate((t) => document.querySelector(`[data-tab=${t}]`).click(), tab);
      await page.waitForTimeout(1200);
      const file = path.join(OUT, `${name}-${width}${theme === 'dark' ? '-dark' : ''}.png`);
      await page.screenshot({ path: file, fullPage: width !== 1280 ? false : false });
      console.log(path.relative(process.cwd(), file));
    }
    if (page.__errors.length) console.log('errors:', page.__errors);
    await browser.close();
  }
})();
