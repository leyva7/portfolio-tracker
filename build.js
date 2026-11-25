// Builds app.html (the single self-contained page that is published) by concatenating src/ in order.
// Usage: node build.js [out.html]   · no dependencies
const fs = require('fs'); const path = require('path');
const SRC = path.join(__dirname, 'src');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'app.html'));
const style = (open, files) => [open, ...files, '</style>\n'];
const script = (files) => ['<script>\n', ...files, '</script>\n'];
const app = (dir, names) => names.map((n) => `js/app/${dir}/${n}.js`);
// Order = order in the page. Strings starting with '<' are literal markup; the rest are files under src/.
const PARTS = [
  'head.html',
  ...style('<style>\n', ['base', 'header-nav', 'components', 'forms', 'tiles', 'mobile', 'polish', 'mobile-v21', 'calm-theme', 'sections'].map((n) => `styles/${n}.css`)),
  'body.html',
  ...style('<style id="anim">\n', ['styles/motion.css']),
  ...script(['js/motion.js']),
  '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>\n',
  ...script(['js/engine.js']), // engine.test.js finds this block by the text 'Portfolio engine'
  // The app is one IIFE: config.js opens it and boot.js closes it; the files share its scope.
  ...script([
    ...app('core', ['config', 'format', 'state', 'demo', 'capabilities', 'prices']),
    'js/app/ui/charts.js', 'js/app/core/periods.js', 'js/app/ui/header.js', 'js/app/core/patrimony.js',
    ...app('tabs', ['insights', 'summary', 'cash', 'claude-analysis', 'positions', 'transactions', 'analysis', 'efficiency', 'analyst', 'regions', 'drawdowns', 'estimate', 'projection', 'taxes', 'assets', 'world-map', 'sections']),
    ...app('modals', ['forms', 'asset-detail']),
    ...app('import', ['import', 'myinvestor']),
    ...app('data', ['quality', 'safety']),
    'js/app/ui/mobile-nav.js', 'js/app/modals/sheets.js', 'js/app/modals/recurring.js', 'js/app/tabs/rebalance.js',
    ...app('ui', ['events', 'theme-privacy', 'a11y']),
    'js/app/core/boot.js',
  ]),
  'tail.html',
];
const used = new Set();
const out = PARTS.map((p) => { if (p.startsWith('<')) return p; used.add(path.normalize(p)); return fs.readFileSync(path.join(SRC, p), 'utf8'); }).join('');
// Every source file must be listed, so nothing is silently left out of the page
const walk = (d) => fs.readdirSync(path.join(SRC, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const extra = walk('').filter((f) => !used.has(path.normalize(f)));
if (extra.length) { console.error('Files in src/ not listed in build.js: ' + extra.join(', ')); process.exit(1); }
fs.writeFileSync(OUT, out);
console.log(`${path.relative(process.cwd(), OUT) || OUT}: ${out.split('\n').length} lines, ${Buffer.byteLength(out)} bytes, ${used.size} files`);
