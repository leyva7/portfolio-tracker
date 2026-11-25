/* ================= State ================= */
const S = { assets: {}, txs: {}, history: {}, fx: {}, navs: {}, cash: {}, insights: null, analista: null, mercado: null, estim: null, job: null, bench: null, settings: {}, trash: {}, backups: {} };
const loaded = { assets: false, txs: false, history: false, fx: false, navs: false, cash: false, job: false, bench: false, settings: false };
let db = null, mcp = null, downloads = null, perms = null, sampleFn = null, dbState = 'pending', dbErr = ''; // pending | ready | none | error
const bootT = Date.now();
let DEMO = true; let demoData = null; let res = null;
const ui = { tab: 'resumen', period: '1A', aPeriod: '1A', showClosed: false, sort: { key: 'value', dir: -1 }, txf: { asset: '', type: '', year: '', q: '' }, fiscalYear: null, refreshing: false, progress: 0, lastErrors: [], deferred: [] };
try { const saved = JSON.parse(localStorage.getItem('cartera-ui') || '{}'); Object.assign(ui, { period: saved.period || ui.period, aPeriod: saved.aPeriod || ui.aPeriod, aiMode: saved.aiMode === 'analista' ? 'analista' : 'obs' }); } catch (e) {}
const persistUI = () => { try { localStorage.setItem('cartera-ui', JSON.stringify({ period: ui.period, aPeriod: ui.aPeriod, aiMode: ui.aiMode })); } catch (e) {} };

function assetList() {
  const src = DEMO ? demoData.assets : Object.values(S.assets);
  return src.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.ticker || a.name).localeCompare(String(b.ticker || b.name)));
}
function assetById(id) { return assetList().find((a) => a.id === id); }
function colorIdx(id) { const i = assetList().findIndex((a) => a.id === id); return i < 0 ? 9 : Math.min(i + 1, 9); }
function acolor(id) { return cssv('--s' + colorIdx(id)); }
function catColor(i) { return cssv('--s' + Math.min(i + 1, 9)); }

function engineState() {
  if (DEMO) return demoData;
  const assets = assetList();
  const history = {}; for (const [id, d] of Object.entries(S.history)) history[id] = d.points || [];
  const fx = {}; for (const [c, d] of Object.entries(S.fx)) fx[c] = d.points || [];
  for (const [id, nv] of Object.entries(S.navs)) {
    if (id === 'bench') continue;
    if (id.startsWith('fx-')) { const c = id.slice(3); fx[c] = mergePts(fx[c], navPoints(nv)); } else history[id] = mergePts(history[id], navPoints(nv));
  }
  let benchmark = null;
  const bnav = S.navs.bench && (!S.bench || !S.navs.bench.symbol || S.navs.bench.symbol === S.bench.symbol) ? navPoints(S.navs.bench) : [];
  const bpts = mergePts(S.bench && S.bench.points, bnav);
  if (bpts.length) {
    const ccy = (S.bench && S.bench.ccy) || 'EUR';
    if (ccy === 'EUR') benchmark = bpts;
    else if (fx[ccy]) { const fl = E.lookup(fx[ccy]); benchmark = bpts.map(([d, v]) => [d, v * (fl(d) ?? (fl.first ? fl.first[1] : 1))]); }
  }
  return { assets, txs: Object.values(S.txs), history, fx, benchmark, settings: { riskFree: S.settings.riskFree ?? 0.02, today: todayStr() } };
}

let recalcT = null;
function schedule() { clearTimeout(recalcT); recalcT = setTimeout(recalc, 40); }
function recalc() {
  if (dbState === 'ready' && Object.values(loaded).every(Boolean)) DEMO = Object.keys(S.assets).length === 0 && Object.keys(S.txs).length === 0 && Object.keys(S.cash).length === 0;
  if (dbState === 'none' && (Object.keys(S.assets).length || Object.keys(S.txs).length || Object.keys(S.cash).length)) DEMO = false;
  try { res = E.build(engineState()); } catch (e) { console.error(e); res = null; }
  syncInactive();
  render();
}

const inactiveSent = new Set();
function syncInactive() {
  if (!db || DEMO || !res || dbState !== 'ready') return;
  for (const p of res.positions) {
    const a = S.assets[p.assetId]; if (!a) continue; const want = !p.open;
    const key = a.id + ':' + want;
    if (!!a.inactive !== want && !inactiveSent.has(key)) { inactiveSent.add(key); db.collection('assets').doc(a.id).update({ inactive: want }).catch(() => {}); }
  }
}
