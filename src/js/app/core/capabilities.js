/* ================= Capabilities ================= */
async function initCaps() {
  const C = window.claude;
  if (!C || typeof C.use !== 'function') { dbState = 'none'; render(); return; }
  C.use('permissions').then((p) => { perms = p; }).catch(() => {});
  C.use('downloads').then((d) => { downloads = d; render(); }).catch(() => {});
  C.use('sample').then((f) => { sampleFn = f; if (ui.tab === 'analysis') render(); }).catch(() => {});
  C.use('mcp').then((m) => { mcp = m; render(); }).catch(() => {});
  try { db = await C.use('db'); } catch (e) { db = null; dbErr = (e && (e.code || e.message)) || 'error'; }
  if (!db) { dbState = dbErr ? 'error' : 'none'; render(); return; }
  dbState = 'ready';
  const onErr = (k) => (e) => { console.warn('db', k, e); banner('db', `Could not read ${k} (${e.code}). Reload the page.`); };
  const coll = (name, key, map) => db.collection(name).onSnapshot((snap) => { S[key] = {}; for (const d of snap.docs) S[key][d.id] = map ? map(d) : Object.assign({ id: d.id }, d.data()); loaded[key] = true; schedule(); }, onErr(name));
  coll('assets', 'assets'); coll('txs', 'txs'); coll('history', 'history', (d) => d.data()); coll('fx', 'fx', (d) => d.data()); coll('navs', 'navs', (d) => d.data()); coll('cash', 'cash');
  db.collection('trash').onSnapshot((snap) => { S.trash = {}; for (const d of snap.docs) S.trash[d.id] = d.data(); loaded.trash = true; if (ui.tab === 'settings') schedule(); }, onErr('trash'));
  db.collection('backups').onSnapshot((snap) => { S.backups = {}; for (const d of snap.docs) S.backups[d.id] = d.data(); loaded.backups = true; maybeSnapshot(); if (ui.tab === 'settings') schedule(); }, onErr('backups'));
  db.doc('insights/claude').onSnapshot((d) => { S.insights = d.exists ? d.data() : null; if (ui.tab === 'analysis') render(); }, onErr('insights'));
  db.doc('insights/analyst').onSnapshot((d) => { S.analyst = d.exists ? d.data() : null; if (ui.tab === 'analysis') render(); }, onErr('insights'));
  db.doc('insights/market').onSnapshot((d) => { S.market = d.exists ? d.data() : null; if (ui.tab === 'analysis') render(); }, onErr('insights'));
  db.doc('insights/estimate').onSnapshot((d) => { S.estim = d.exists ? d.data() : null; if (ui.tab === 'home') render(); }, onErr('insights'));
  db.doc('jobs/funds').onSnapshot((d) => { const prev = S.job; S.job = d.exists ? d.data() : null; loaded.job = true; if (ui.fundsFired && S.job && S.job.state === 'done' && (!prev || prev.state !== 'done')) { ui.fundsFired = false; const bad = (S.job.results || []).filter((r) => !r.ok).length; toast(bad ? `Prices updated with ${bad} warning(s). See above.` : 'Prices updated.'); } schedule(); }, onErr('jobs'));
  db.doc('bench/main').onSnapshot((d) => { S.bench = d.exists ? d.data() : null; loaded.bench = true; schedule(); }, onErr('bench'));
  db.doc('settings/main').onSnapshot((d) => { S.settings = d.exists ? d.data() : {}; loaded.settings = true; schedule(); }, onErr('settings'));
}
const bannersExtra = {};
function banner(k, msg) { bannersExtra[k] = msg; renderBanners(); }

/** One retry on a transient platform error; everything else surfaces to the caller. */
async function retry1(fn) { try { return await fn(); } catch (e) { if (e && e.code === 'unavailable') { await sleep(700 + Math.random() * 800); return fn(); } throw e; } }
const noDbErr = () => Object.assign(new Error('There is no connection to your data, so nothing can be saved. Reload the page.'), { code: 'no_db' });
async function save(col, id, data) {
  if (!db && dbState === 'error') throw noDbErr();
  if (db) { await retry1(() => db.collection(col).doc(id).set(data)); }
  else { const key = col; if (!S[key]) S[key] = {}; S[key][id] = Object.assign({ id }, data); if (col === 'history' || col === 'fx') S[key][id] = data; DEMO = false; schedule(); }
}
async function remove(col, id) { if (!db && dbState === 'error') throw noDbErr(); if (db) await retry1(() => db.collection(col).doc(id).delete()); else { delete S[col][id]; schedule(); } }
async function saveSettings(patch) {
  const next = Object.assign({}, S.settings, patch);
  if (db) await db.doc('settings/main').set(next); else { S.settings = next; schedule(); }
}
async function saveBench(data) { if (db) await db.doc('bench/main').set(data); else { S.bench = data; schedule(); } }

