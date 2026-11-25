// UI smoke test: opens the app on desktop and mobile, goes through the sections and checks
// that there are no JavaScript errors. Two modes: demo (no window.claude) and with the harness's
// simulated database (harness/mock.js) seeded with fixtures/demo-seed.json.
// Usage: node tests/smoke.js [app.html]
const path = require('path'); const fs = require('fs');
const { openApp } = require('../harness/open.js');
const html = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app.html'));
if (!fs.existsSync(path.join(__dirname, '..', 'fixtures', 'demo-seed.json'))) require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'demo-seed.js')], { stdio: 'inherit' });
const TABS = ['home', 'portfolio', 'analysis', 'plan', 'settings'];
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); };
(async () => {
  for (const mode of ['demo', 'mock']) for (const width of [1280, 390]) {
    const { page, browser } = await openApp({ html, width, mock: mode === 'mock' });
    const brand = await page.evaluate(() => document.querySelector('#brandLine') && document.querySelector('#brandLine').textContent);
    check(mode === 'demo' ? /Sample/.test(brand) : /Total/.test(brand), `${mode} ${width}px: header "${brand}"`);
    for (const t of TABS) {
      await page.evaluate((t) => document.querySelector(`[data-tab=${t}]`).click(), t);
      await page.waitForTimeout(500);
      const n = await page.evaluate(() => document.querySelectorAll('#view section, #view .panel').length);
      check(n > 0, `${mode} ${width}px: tab ${t} renders ${n} blocks`);
    }
    check(page.__errors.length === 0, `${mode} ${width}px: no errors${page.__errors.length ? ': ' + page.__errors.join(' | ') : ''}`);
    await browser.close();
  }
  console.log(bad ? `${bad} checks failed` : 'UI: all good'); process.exit(bad ? 1 : 0);
})();
