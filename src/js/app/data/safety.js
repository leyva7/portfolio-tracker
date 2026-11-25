/* ================= Data safety: trash, undo, daily snapshots ================= */
const TRASH_DAYS = 90, SNAP_CHUNK = 180000;
/** Every delete and every edit keeps the previous version in "trash" for 90 days. */
async function toTrash(kind, ref, data, reason, extra) {
  if (!db || DEMO || !data) return null;
  const id = `${kind}-${String(ref).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 80)}-${Date.now()}`;
  const clean = JSON.parse(JSON.stringify(data)); delete clean.id;
  await save('trash', id, Object.assign({ kind, ref: String(ref), data: clean, reason, at: new Date().toISOString() }, extra || {}));
  return id;
}
async function restoreTrash(tid, silent) {
  const t = S.trash[tid]; if (!t) return;
  if (t.kind === 'tx') await save('txs', t.ref, t.data);
  else if (t.kind === 'asset') { await save('assets', t.ref, t.data); if (t.history && !S.history[t.ref]) await save('history', t.ref, t.history); }
  else if (t.kind === 'history') await save('history', t.ref, t.data);
  else if (t.kind === 'cash') await save('cash', t.ref, t.data);
  else if (t.kind === 'cashmv') { const c = S.cash[t.acc]; if (!c) return toast('The account of that movement no longer exists.'); await retry1(() => db.collection('cash').doc(t.acc).update({ mv: { [t.ref]: t.data } })); if (t.txTid && S.trash[t.txTid]) await restoreTrash(t.txTid, true); }
  await remove('trash', tid);
  if (!silent) toast(t.reason === 'edited' ? 'Previous version restored.' : 'Restored.');
}
async function deleteTx(id) {
  const x = S.txs[id]; if (!x) return;
  const tid = await toTrash('tx', id, x, 'deleted');
  await remove('txs', id);
  if (x.type === 'interest' && String(id).startsWith('cash-')) {} // the cash movement stays; it has its own delete
  toast(x.cashMv && S.cash[x.cashMv.acc] ? `Transaction deleted. The ${eur(x.cashMv.a)} deposit is still in Cash.` : 'Transaction deleted.', 7000, tid ? { label: 'Undo', fn: () => restoreTrash(tid, true).then(() => toast('Transaction recovered.')) } : null);
}
function purgeTrash() {
  if (purgeTrash.done || !loaded.trash) return; purgeTrash.done = true;
  const lim = Date.now() - TRASH_DAYS * 864e5;
  for (const [id, t] of Object.entries(S.trash)) if (Date.parse(t.at || 0) < lim) remove('trash', id).catch(() => {});
}
/** Cheap content fingerprint, so an unchanged portfolio is not snapshotted twice. */
function fingerprint(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + str.length; }
function snapshotPayload() {
  const strip = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => { const c = Object.assign({}, v); delete c.id; return [k, c]; }));
  return { v: 1, created: new Date().toISOString(), txs: strip(S.txs), assets: strip(S.assets), cash: strip(S.cash), settings: S.settings };
}
/** Once a day (when the page opens and the data changed) a full copy of operations, assets, cash and settings is kept in "backups"
 *  (index) + "backupData" (the JSON, split in ≤180 KB pieces). Keeps the last 14 days and one per month for 2 years. */
async function maybeSnapshot(force) {
  if (!db || DEMO || maybeSnapshot.busy) return;
  if (!['assets', 'txs', 'cash', 'settings', 'backups'].every((k) => loaded[k])) return;
  if (!Object.keys(S.txs).length) return;
  const today = todayStr();
  if (!force && (maybeSnapshot.doneFor === today)) return;
  maybeSnapshot.busy = true;
  try {
    const p = snapshotPayload(); const body = JSON.stringify({ txs: p.txs, assets: p.assets, cash: p.cash, settings: p.settings }); const fp = fingerprint(body);
    const metas = Object.entries(S.backups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    if (!force && metas.length && metas[0][1].fp === fp) { maybeSnapshot.doneFor = today; return; }
    if (!force && S.backups[today] && S.backups[today].fp === fp) { maybeSnapshot.doneFor = today; return; }
    const key = force ? `${today}T${new Date().toTimeString().slice(0, 5).replace(':', '')}` : today;
    const str = JSON.stringify(p); const parts = Math.ceil(str.length / SNAP_CHUNK);
    for (let i = 0; i < parts; i++) await save('backupData', `${key}~${i}`, { s: str.slice(i * SNAP_CHUNK, (i + 1) * SNAP_CHUNK) });
    await save('backups', key, { key, date: today, manual: !!force, created: p.created, parts, bytes: str.length, fp, n: { txs: Object.keys(p.txs).length, assets: Object.keys(p.assets).length, cash: Object.keys(p.cash).length } });
    maybeSnapshot.doneFor = today;
    // retention
    const keep = new Set(); const all = Array.from(new Set(Object.keys(S.backups).concat([key]))).sort().reverse();
    all.filter((d) => !d.includes('T')).slice(0, 14).forEach((d) => keep.add(d)); all.filter((d) => d.includes('T')).slice(0, 10).forEach((d) => keep.add(d));
    const byMonth = {}; for (const d of all.filter((x) => !x.includes('T')).sort()) { const m = d.slice(0, 7); if (!byMonth[m]) byMonth[m] = d; }
    Object.keys(byMonth).sort().reverse().slice(0, 24).forEach((m) => keep.add(byMonth[m]));
    for (const d of all) if (!keep.has(d) && S.backups[d]) { const n = S.backups[d].parts || 1; for (let i = 0; i < n; i++) await remove('backupData', `${d}~${i}`).catch(() => {}); await remove('backups', d).catch(() => {}); }
    if (force) toast('Backup saved.');
  } catch (e) { console.warn('snapshot', e); if (force) toast('Could not save the backup: ' + (e.message || e.code)); }
  finally { maybeSnapshot.busy = false; }
  purgeTrash();
}
async function loadSnapshot(key) {
  const m = S.backups[key]; if (!m) throw new Error('That backup does not exist');
  let str = ''; for (let i = 0; i < (m.parts || 1); i++) { const d = await db.collection('backupData').doc(`${key}~${i}`).get(); if (!d.exists) throw new Error('Part of the backup is missing'); str += d.data().s; }
  return JSON.parse(str);
}
async function restoreSnapshot(date, btn) {
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = 'Sure?'; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Restore'; } }, 4000); return; }
  btn.disabled = true; btn.textContent = 'Restaurando…';
  try {
    await maybeSnapshot(true); // a copy of the current state first, so the restore itself can be undone
    const p = await loadSnapshot(date);
    for (const [id, x] of Object.entries(S.txs)) if (!p.txs[id]) { await toTrash('tx', id, x, 'restore'); await remove('txs', id); }
    for (const [id, x] of Object.entries(p.txs)) if (JSON.stringify(Object.assign({}, S.txs[id] || {}, { id: undefined })) !== JSON.stringify(Object.assign({}, x, { id: undefined }))) await save('txs', id, x);
    for (const [id, a] of Object.entries(p.assets)) await save('assets', id, a);
    for (const [id, c] of Object.entries(p.cash)) await save('cash', id, c);
    toast(`Backup from ${fdate(S.backups[date] ? S.backups[date].date : date)} restored. A backup of the previous state was saved first.`);
  } catch (e) { toast('Could not restore: ' + (e.message || e.code)); }
}
async function downloadSnapshot(date) {
  if (!downloads) return toast('Downloads are not available in this view.');
  try { const p = await loadSnapshot(date); await downloads.save({ filename: `portfolio-backup-${String(date).replace(/[^0-9T-]/g, '')}.json`, data: JSON.stringify(Object.assign({ assets: Object.entries(p.assets).map(([id, a]) => Object.assign({ id }, a)), txs: Object.entries(p.txs).map(([id, x]) => Object.assign({ id }, x)), cash: p.cash, settings: p.settings }), null, 1) }); }
  catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('Could not download: ' + (e.message || e.code)); }
}
function safetyPanel() {
  const fileBtns = `<div class="toolbar"><button class="btn small" type="button" data-act="export-json" ${downloads ? '' : 'disabled title="Downloads are not available in this view"'}>Download backup (JSON)</button><label class="btn small" for="restoreFile" style="cursor:pointer">Restore from file…</label><input type="file" id="restoreFile" accept=".json,application/json" hidden></div>`;
  if (DEMO || !db) return `<section class="panel"><h2>Backup</h2>${fileBtns}<p class="note">Restoring adds and overwrites by id; it never deletes anything.</p></section>`;
  const bk = Object.entries(S.backups).map(([k, v]) => Object.assign({ key: k }, v)).sort((a, b) => (a.key < b.key ? 1 : -1));
  const tr = Object.entries(S.trash).sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
  const desc = (t) => { const d = t.data || {}; if (t.kind === 'tx') { const a = assetById(d.assetId); return `${TXT[d.type] || d.type} ${a ? esc(a.ticker || a.name) : ''} · ${fdate(d.date)}${d.qty ? ' · ' + numf(+d.qty, 4) : d.amount ? ' · ' + eur(+d.amount) : ''}`; } if (t.kind === 'cashmv') return `Movement ${eurS(+d.a)} · ${fdate(d.d)}`; if (t.kind === 'asset') return `Asset ${esc(d.ticker || d.name || '')}`; if (t.kind === 'cash') return `Account ${esc(d.name || '')}`; if (t.kind === 'history') { const a = assetById(t.ref); return `Prices of ${esc(a ? a.ticker || a.name : t.ref)}`; } return t.kind; };
  return `<section class="panel"><div class="panel-h"><h2>Your data, kept safe</h2><button class="btn small" type="button" data-act="snap-now">Back up now</button></div>
    <p class="note">A daily backup when something changed (14 days + 1 a month for 2 years) and a 90-day trash. Download an external copy every now and then.</p>
    ${fileBtns}
    <details><summary>Automatic backups (${bk.length})</summary><div class="mlist" style="display:flex;margin-top:6px">${bk.length ? bk.map((b) => `<div class="mrow"><div><div class="l1">${fdate(b.date)}${b.manual && b.created ? ' · ' + new Date(b.created).toLocaleTimeString(L, { hour: '2-digit', minute: '2-digit' }) : ''}</div><div class="l2">${b.n ? `${b.n.txs} transactions · ${b.n.assets} assets · ${b.n.cash} accounts` : ''}</div></div><div class="rowact"><button class="btn small" type="button" data-snap-dl="${esc(b.key)}">Download</button><button class="btn small" type="button" data-snap-restore="${esc(b.key)}">Restore</button></div></div>`).join('') : '<p class="muted small">No backups yet.</p>'}</div></details>
    <details><summary>Trash (${tr.length})</summary><div class="mlist" style="display:flex;margin-top:6px">${tr.length ? tr.slice(0, 60).map(([id, t]) => `<div class="mrow"><div><div class="l1" style="font-weight:500">${desc(t)}</div><div class="l2">${t.reason === 'edited' ? 'version before an edit' : t.reason} · ${new Date(t.at).toLocaleString(L, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div><button class="btn small" type="button" data-trash-restore="${esc(id)}">Restore</button></div>`).join('') : '<p class="muted small">Empty.</p>'}</div></details>
  </section>`;
}

