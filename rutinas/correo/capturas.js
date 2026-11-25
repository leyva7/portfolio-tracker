// Capturas 390 px claro y oscuro (simulación aproximada de Gmail iOS en modo oscuro:
// fondo #1f1f1f e inversión de luminancia con hue-rotate, que conserva tonos de verde/rojo/azul).
// Uso: node capturas.js <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const dir = process.argv[2] || __dirname;
  const html = fs.readFileSync(path.join(dir, 'correo.html'), 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.screenshot({ path: path.join(dir, '390-claro.png'), fullPage: true });
  await page.setContent(html);
  await page.evaluate(() => {
    document.documentElement.style.background = '#1f1f1f';
    document.body.style.filter = 'invert(0.88) hue-rotate(180deg)';
    document.body.style.background = '#ffffff';
  });
  await page.screenshot({ path: path.join(dir, '390-oscuro.png'), fullPage: true });
  await browser.close();
})();
