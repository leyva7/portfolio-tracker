// Usage in a Playwright script:  const { openApp } = require('<this file>'); const { page, browser } = await openApp({ width: 390, html: 'path', seed: 'demo'|'empty', theme, dsf: 2, beforeGoto: async (page, ctx) => {} });
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const fs = require('fs'); const path = require('path');
const DIR = __dirname;
const CHROME = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || undefined;
async function openApp(o = {}) {
  const html = o.html || process.env.APP_HTML || path.join(DIR, '..', 'app.html');
  const seed = o.seed === 'empty' ? {} : JSON.parse(fs.readFileSync(o.seedPath || process.env.SEED || path.join(DIR, '..', 'fixtures', 'demo-seed.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: o.width || 1280, height: o.height || (o.width && o.width < 700 ? 844 : 900) }, deviceScaleFactor: o.dsf || 1, isMobile: !!(o.width && o.width < 700), hasTouch: !!(o.width && o.width < 700), colorScheme: o.theme || 'light', locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  const page = await ctx.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') page.__errors.push('console: ' + m.text()); });
  await page.route(/cdn\.jsdelivr\.net\/npm\/chart\.js/, (r) => r.fulfill({ path: path.join(DIR, 'chart.umd.js'), contentType: 'application/javascript' }));
  if (!o.realFonts) await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', contentType: 'text/css' }));
  if (o.beforeGoto) await o.beforeGoto(page, ctx); // e.g. serve a local font in place of Google Fonts for screenshots
  if (o.mock !== false) {
    await page.addInitScript((s) => { window.__SEED = s; }, seed);
    await page.addInitScript({ path: path.join(DIR, 'mock.js') });
  }
  await page.goto('file://' + html);
  await page.waitForTimeout(o.wait || 1500);
  return { page, browser, ctx };
}
module.exports = { openApp };
