// Test of the calculation engine (src/js/engine.js) with a synthetic portfolio whose figures are checked by hand.
// Usage: node tests/engine.test.js [app.html]   — exits with code 1 if anything does not add up.
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'app.html'), 'utf8');
const src = html.split('<script>').map((s) => s.split('</script>')[0]).find((s) => s.includes('Portfolio engine'));
if (!src) { console.error('The engine was not found in the HTML'); process.exit(1); }
const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;

// Test portfolio: 10 units at 100 €, 4 sold at 120 €; one asset in dollars; one dividend.
const state = {
  assets: [
    { id: 'etf', name: 'Test ETF', ticker: 'ETF', type: 'etf', currency: 'EUR' },
    { id: 'usd', name: 'Dollar stock', ticker: 'USD1', type: 'stock', currency: 'USD' },
  ],
  txs: [
    { id: 't1', date: '2025-01-02', type: 'buy', assetId: 'etf', qty: 10, price: 100, fees: 0 },
    { id: 't2', date: '2025-06-02', type: 'sell', assetId: 'etf', qty: 4, price: 120, fees: 0 },
    { id: 't3', date: '2025-03-03', type: 'buy', assetId: 'usd', qty: 2, price: 50, fees: 0, fx: 0.9 },
    { id: 't4', date: '2025-09-01', type: 'dividend', assetId: 'usd', amount: 10, withholding: 1.5 },
  ],
  history: {
    etf: [['2025-01-02', 100], ['2025-06-02', 120], ['2025-12-31', 110]],
    usd: [['2025-03-03', 50], ['2025-12-31', 60]],
  },
  fx: { USD: [['2025-01-01', 0.9], ['2025-12-31', 0.8]] },
  settings: { riskFree: 0.02, today: '2025-12-31' },
};
const r = E.build(state); const t = r.totals; const f = r.fiscal['2025'] || {};
const pos = Object.fromEntries(r.positions.map((p) => [p.assetId, p]));
const checks = [
  ['ETF value (6 × 110)', pos.etf.value, 660, 0.005],
  ['stock value (2 × 60 $ × 0.8)', pos.usd.value, 96, 0.005],
  ['investments value', t.value, 756, 0.005],
  ['FIFO cost (6 × 100 + 2 × 50 $ × 0.9)', t.costBasis, 690, 0.005],
  ['unrealized gain', t.unrealized, 66, 0.005],
  ['sales in the year', f.sales, 1, 0],
  ['gain on the sale (4 × 20)', f.gains, 80, 0.005],
];
let bad = 0;
for (const [k, got, want, tol] of checks) { const ok = Number.isFinite(got) && Math.abs(got - want) <= tol; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${k}: ${got} (expected ${want})`); }
for (const [k, v] of [['IRR (XIRR)', t.xirr], ['TWR', t.twr]]) { const ok = Number.isFinite(v); if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${k} is a number: ${v}`); }
const x = E.xirr([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }]);
{ const ok = Math.abs(x - 0.1) < 1e-4; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} XIRR of −100 → +110 in one year: ${x} (expected 0.1)`); }
console.log(bad ? `${bad} checks failed` : 'Engine: everything adds up'); process.exit(bad ? 1 : 0);
