/* ================= Demo data (clearly labelled) ================= */
function makeDemo() {
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const g = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const today = todayStr(); const start = E.addMonths(today, -30);
  const mkt = {}; for (let d = start; d <= today; d = E.addDays(d, 1)) mkt[d] = g();
  const walk = (p0, mu, sig, wk, beta = 0.7) => { const o = []; let p = p0; const idio = Math.sqrt(1 - beta * beta); for (let d = start; d <= today; d = E.addDays(d, 1)) { const w = new Date(d + 'T00:00:00Z').getUTCDay(); if (!wk && (w === 0 || w === 6)) continue; p *= Math.exp(mu / 252 + sig / Math.sqrt(252) * (beta * mkt[d] + idio * g())); o.push([d, +p.toFixed(4)]); } return o; };
  const assets = [
    { id: 'd-vwce', order: 1, name: 'Vanguard FTSE All-World (Acc)', ticker: 'VWCE', type: 'etf', currency: 'EUR', broker: 'DeGiro', tag: 'Global', target: 0.6, src: 'auto', ysym: 'VWCE.DE' },
    { id: 'd-qqq', order: 2, name: 'Invesco QQQ Trust', ticker: 'QQQ', type: 'etf', currency: 'USD', broker: 'DeGiro', tag: 'EE. UU.', target: 0.2, src: 'auto', ysym: 'QQQ' },
    { id: 'd-msft', order: 3, name: 'Microsoft', ticker: 'MSFT', type: 'stock', currency: 'USD', broker: 'Trade Republic', tag: 'EE. UU.', src: 'auto', ysym: 'MSFT' },
    { id: 'd-btc', order: 4, name: 'Bitcoin', ticker: 'BTC', type: 'crypto', currency: 'EUR', broker: 'Trade Republic', tag: 'Cripto', target: 0.1, src: 'auto', ysym: 'BTC-EUR' },
    { id: 'd-fund', order: 5, name: 'Fondo indexado MSCI Europe', ticker: 'IE00B04GQR24', type: 'fund', currency: 'EUR', broker: 'MyInvestor', tag: 'Europa', target: 0.1, src: 'nav', isin: 'IE00B04GQR24' },
  ];
  const history = { 'd-vwce': walk(108, 0.08, 0.14, false, 0.95), 'd-qqq': walk(400, 0.11, 0.22, false, 0.85), 'd-msft': walk(370, 0.10, 0.26, false, 0.7), 'd-btc': walk(52000, 0.12, 0.5, true, 0.35), 'd-fund': walk(21, 0.06, 0.13, false, 0.8).filter((_, i) => i % 20 === 0) };
  const fx = { USD: walk(0.915, 0.0, 0.07, false, 0) };
  const P = (id, d) => E.lookup(history[id])(d);
  const txs = []; let n = 0;
  const add = (o) => txs.push(Object.assign({ id: 'dt' + (++n) }, o));
  for (let m = 0; m < 30; m++) { const d = E.addMonths(start, m); const dd = new Date(d + 'T00:00:00Z').getUTCDay(); const d2 = dd === 6 ? E.addDays(d, 2) : dd === 0 ? E.addDays(d, 1) : d; add({ date: d2, type: 'buy', assetId: 'd-vwce', qty: 3, price: +(P('d-vwce', d2) || 108).toFixed(2), fees: 1 }); }
  add({ date: E.addDays(start, 10), type: 'buy', assetId: 'd-qqq', qty: 6, price: +P('d-qqq', E.addDays(start, 10)).toFixed(2), fees: 2 });
  add({ date: E.addDays(start, 45), type: 'buy', assetId: 'd-msft', qty: 5, price: +P('d-msft', E.addDays(start, 45)).toFixed(2), fees: 1 });
  add({ date: E.addDays(start, 80), type: 'buy', assetId: 'd-btc', qty: 0.04, price: Math.round(P('d-btc', E.addDays(start, 80))), fees: 1 });
  add({ date: E.addDays(start, 200), type: 'buy', assetId: 'd-fund', qty: 150, price: +P('d-fund', E.addDays(start, 200)).toFixed(2), fees: 0 });
  add({ date: E.addDays(start, 400), type: 'sell', assetId: 'd-msft', qty: 2, price: +P('d-msft', E.addDays(start, 400)).toFixed(2), fees: 1 });
  add({ date: E.addDays(start, 300), type: 'dividend', assetId: 'd-msft', amount: 3.75, withholding: 0.56 });
  add({ date: E.addDays(start, 480), type: 'dividend', assetId: 'd-msft', amount: 2.49, withholding: 0.37 });
  add({ date: E.addDays(start, 150), type: 'dividend', assetId: 'd-qqq', amount: 4.1, withholding: 0.62 });
  add({ date: E.addDays(start, 370), type: 'interest', amount: 38.2, withholding: 7.26 });
  add({ date: E.addDays(start, 600), type: 'buy', assetId: 'd-qqq', qty: 2, price: +P('d-qqq', E.addDays(start, 600)).toFixed(2), fees: 2 });
  add({ date: E.addDays(start, 700), type: 'sell', assetId: 'd-btc', qty: 0.01, price: Math.round(P('d-btc', E.addDays(start, 700))), fees: 1 });
  const cash = [
    { id: 'dc1', order: 1, name: 'Cuenta remunerada', entity: 'Trade Republic', rate: 2, mv: { a: { d: E.addMonths(today, -14), a: 3000, t: 'open' }, b: { d: E.addMonths(today, -10), a: 1000, t: 'in', n: 'Ahorro' }, c: { d: E.addMonths(today, -6), a: 1500, t: 'in', n: 'Paga extra' }, d: { d: E.addMonths(today, -3), a: -800, t: 'out', n: 'Compra de fondos' }, e: { d: E.addMonths(today, -1), a: 1500, t: 'in', n: 'Ahorro' } } },
    { id: 'dc2', order: 2, name: 'Colchón', entity: 'Banco', rate: 0, mv: { a: { d: E.addMonths(today, -14), a: 2500, t: 'open' } } },
  ];
  return { assets, history, fx, txs, cash, benchmark: history['d-vwce'], settings: { riskFree: 0.02, today } };
}

