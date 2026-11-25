// Prueba de humo de la interfaz: abre la app en escritorio y móvil, recorre las 4 secciones y comprueba
// que no hay errores de JavaScript. Dos modos: demostración (sin window.claude) y con la base de datos
// simulada del arnés (harness/mock.js) sembrada con fixtures/demo-seed.json.
// Uso: node tests/smoke.js [app.html]
const path = require('path'); const fs = require('fs');
const { openApp } = require('../harness/open.js');
const html = path.resolve(process.argv[2] || path.join(__dirname, '..', 'app.html'));
if (!fs.existsSync(path.join(__dirname, '..', 'fixtures', 'demo-seed.json'))) require('child_process').execFileSync('node', [path.join(__dirname, '..', 'tools', 'demo-seed.js')], { stdio: 'inherit' });
const TABS = ['resumen', 'posiciones', 'analisis', 'proyeccion', 'activos'];
let bad = 0;
const check = (ok, msg) => { if (!ok) bad++; console.log(`${ok ? 'OK ' : 'MAL'} ${msg}`); };
(async () => {
  for (const mode of ['demo', 'mock']) for (const width of [1280, 390]) {
    const { page, browser } = await openApp({ html, width, mock: mode === 'mock' });
    const brand = await page.evaluate(() => document.querySelector('#brandLine') && document.querySelector('#brandLine').textContent);
    check(mode === 'demo' ? /ejemplo/.test(brand) : /total/.test(brand), `${mode} ${width}px: cabecera «${brand}»`);
    for (const t of TABS) {
      await page.evaluate((t) => document.querySelector(`[data-tab=${t}]`).click(), t);
      await page.waitForTimeout(500);
      const n = await page.evaluate(() => document.querySelectorAll('#view section, #view .panel').length);
      check(n > 0, `${mode} ${width}px: pestaña ${t} pinta ${n} bloques`);
    }
    check(page.__errors.length === 0, `${mode} ${width}px: sin errores${page.__errors.length ? ': ' + page.__errors.join(' | ') : ''}`);
    await browser.close();
  }
  console.log(bad ? `${bad} comprobaciones fallan` : 'Interfaz: todo bien'); process.exit(bad ? 1 : 0);
})();
