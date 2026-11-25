// Genera datos de ejemplo a partir de la cartera de demostración de la app (src/js/app/core/demo.js).
// No usa ningún dato real: son precios simulados con una semilla fija.
//   node tools/demo-seed.js                       → fixtures/demo-seed.json (semilla del arnés: colección → {id: documento})
//   node tools/demo-seed.js --db <carpeta>        → además, una carpeta con el formato de ArtifactData (<col>/<id>.json)
//   node tools/demo-seed.js --today 2026-11-20    → fija la fecha «hoy» (por defecto, la de hoy)
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const today = arg('--today') || new Date().toLocaleDateString('sv-SE');
const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/engine.js'), 'utf8'), ctx);
ctx.E = ctx.module.exports; ctx.todayStr = () => today;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/app/core/demo.js'), 'utf8') + '\nglobalThis.__demo = makeDemo();', ctx);
const D = ctx.__demo;
const byId = (list) => Object.fromEntries(list.map(({ id, ...rest }) => [id, rest]));
const toM = (pts) => Object.fromEntries(pts.map(([d, v]) => [d, v]));
const navs = {};
for (const [id, pts] of Object.entries(D.history)) { const last = pts[pts.length - 1]; navs[id] = { m: toM(pts), kind: id === 'd-fund' ? 'nav' : 'quote', navDate: last && last[0], checked: today + 'T21:40:00Z', source: 'demo' }; }
for (const [c, pts] of Object.entries(D.fx)) navs['fx-' + c] = { m: toM(pts), kind: 'fx', checked: today + 'T21:40:00Z', source: 'demo' };
navs.bench = { m: toM(D.benchmark), kind: 'quote', symbol: 'VWCE', source: 'demo' };
const seed = {
  assets: byId(D.assets),
  txs: byId(D.txs.map((x) => Object.assign({ created: x.date + 'T12:00:00Z' }, x))),
  cash: byId(D.cash),
  navs,
  bench: { main: { ccy: 'EUR', name: 'Bolsa mundial (ejemplo)', symbol: 'VWCE', points: [] } },
  settings: { main: { riskFree: 0.02, benchName: 'Bolsa mundial (ejemplo)', benchCcy: 'EUR', nombre: 'Ana' } },
  jobs: { funds: { state: 'done', by: 'demo', finishedAt: today + 'T21:45:00Z', results: [] } },
};
const out = path.join(ROOT, 'fixtures', 'demo-seed.json');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(seed));
console.log(`${path.relative(process.cwd(), out)}: ${D.assets.length} activos, ${D.txs.length} operaciones, ${D.cash.length} cuentas (hoy = ${today})`);
const dbDir = arg('--db');
if (dbDir) {
  for (const [col, docs] of Object.entries(seed)) { fs.mkdirSync(path.join(dbDir, col), { recursive: true }); for (const [id, d] of Object.entries(docs)) fs.writeFileSync(path.join(dbDir, col, id + '.json'), JSON.stringify(d)); }
  console.log(`${dbDir}: carpeta con formato ArtifactData`);
}
