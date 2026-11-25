/* ---- MyInvestor "Plusvalías y minusvalías" (capital gains statement): compare its lots with ours; nothing is written without an explicit confirmation ---- */
const MI_TOL = { days: 3, eur: 1, fit: 0.005, xfer: 0.02 };
const reconUI = { items: [], acts: [] };
const miNorm = (s) => String(s || '').replace(/﻿/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function isMyInvestorPL(text) { const h = (csvRows(String(text || '').replace(/^﻿/, ''))[0] || []).map(miNorm); return h.some((x) => x.startsWith('fecha fiscal')) && h.some((x) => x.startsWith('valor de mercado')); }
/** Lots still held ({date, cost, value}) and redemptions ({date, gain}: MyInvestor only gives their result). */
function parseMyInvestorPL(text) {
  const rows = csvRows(String(text || '').replace(/^﻿/, '')); const h = (rows[0] || []).map(miNorm); const ix = (f) => h.findIndex(f);
  const iD = ix((x) => x.startsWith('fecha')), iC = ix((x) => x.startsWith('inversi') || x === 'coste'), iV = ix((x) => x.startsWith('valor')), iR = ix((x) => x.startsWith('resultado'));
  if (iD < 0 || iC < 0 || iV < 0) throw new Error('This does not look like the MyInvestor "Plusvalías y minusvalías" CSV.');
  const lots = [], reds = [], bad = [];
  rows.slice(1).forEach((r, k) => { const d = normDate(r[iD]), c = parseNum(r[iC]), v = parseNum(r[iV]), g = iR >= 0 ? parseNum(r[iR]) : NaN;
    if (!d || !ok(c) || !ok(v)) { bad.push(k + 2); return; }
    if (c <= 0 && v <= 0) { if (ok(g) && Math.abs(g) >= 0.005) reds.push({ date: d, gain: g }); return; }
    lots.push({ date: d, cost: c, value: v }); });
  lots.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { lots, reds, bad };
}
/** Real NAVs only (no anchors rebuilt from returns): manual points + the ones the task read. */
function miNav(id) { const m = new Map(); for (const [d, v] of ((S.history[id] || {}).points) || []) if (+v > 0) m.set(d, +v); for (const [d, v] of Object.entries((S.navs[id] && S.navs[id].m) || {})) if (+v > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d)) m.set(d, +v); return m; }
function reconFund(id, pl) {
  const p = res && res.positions.find((z) => z.assetId === id); const app = ((p && p.lots) || []).map((l) => Object.assign({}, l, { tx: S.txs[l.txId] }));
  const navMap = miNav(id), dd = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5, used = new Set();
  const mi = pl.lots.map((l) => Object.assign({}, l, { app: null, uA: navMap.get(l.date) ? l.cost / navMap.get(l.date) : null }));
  // same fiscal date (±3 days) and cost (±1 €) first; then same date with a different cost
  const pick = (l, strict) => { let bi = -1, bk = Infinity; app.forEach((a, i) => { if (used.has(i) || dd(a.date, l.date) > MI_TOL.days) return; const dc = Math.abs(a.cost - l.cost); if (strict && dc > MI_TOL.eur) return; const k = strict ? dc * 1e3 + dd(a.date, l.date) : dd(a.date, l.date) * 1e7 + dc; if (k < bk) { bk = k; bi = i; } }); if (bi >= 0) { used.add(bi); l.app = app[bi]; } };
  mi.forEach((l) => pick(l, true)); mi.forEach((l) => { if (!l.app) pick(l, false); });
  // NAV MyInvestor valued the statement at: the recent one that makes most lots fit (value ≈ units × NAV, < 0.5 %)
  let navx = null, navxDate = null, best = [0, 0];
  for (const [d, v] of Array.from(navMap).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 60)) {
    let n = 0, e = 0; for (const l of mi) { if (!(l.value > 0)) continue; const er = Math.min(9, ...[l.uA, l.app && l.app.qty].filter((u) => u > 0).map((u) => Math.abs((u * v) / l.value - 1))); if (er < MI_TOL.fit) { n++; e += er; } }
    if (n > best[0] || (n && n === best[0] && -e / n > best[1])) { best = [n, -e / n]; navx = v; navxDate = d; }
  }
  for (const l of mi) {
    const a = l.app; l.uB = navx && l.value > 0 ? l.value / navx : null; l.u = l.uA && l.uB && Math.abs(l.uA / l.uB - 1) <= MI_TOL.fit ? l.uA : l.uB; // cost / NAV of the day is exact when it agrees
    l.cOk = !a || Math.abs(l.cost - a.cost) <= MI_TOL.eur; l.uOk = !a || !l.uB || Math.abs(a.qty / l.uB - 1) <= MI_TOL.fit;
    l.xfer = !!(a && a.via) || !!(l.uA && l.uB && Math.abs(l.uA / l.uB - 1) > MI_TOL.xfer && !(a && l.uOk));
    l.st = !a ? 'missing' : l.cOk && l.uOk ? 'ok' : 'diff';
    l.fix = l.xfer ? null : l.st === 'diff' ? reconFix(l) : l.st === 'missing' ? reconAdd(id, l, navMap) : null;
  }
  const extra = app.filter((a, i) => !used.has(i)).map((a) => Object.assign(a, { later: !!(navxDate && a.date > navxDate) }));
  const gainApp = res ? res.realized.filter((r) => r.assetId === id).reduce((s, r) => s + r.gain, 0) : 0;
  return { p, mi, extra, navx, navxDate, nFit: best[0], gainMI: pl.reds.reduce((s, r) => s + r.gain, 0), gainApp };
}
/** New qty/price for the buy behind a lot so that it matches MyInvestor (cost = theirs; units = market value / statement NAV). */
function reconFix(l) {
  const a = l.app, x = a.tx; if (!x || x.type !== 'buy') return { why: 'not a buy: check it by hand' };
  const q = +x.qty, fe = +x.fees || 0, fx = (res.txEUR[x.id] && res.txEUR[x.id].fx) || 1, full = Math.abs(a.qty - q) <= 1e-6 * Math.max(1, q);
  let qN = q, pN;
  if (!l.uOk) { if (!full) return { why: 'partly sold: fix it by hand' }; qN = +l.u.toFixed(6); pN = (l.cost - fe) / (qN * fx); }
  else pN = ((l.cost * q) / a.qty - fe) / (q * fx);
  pN = +pN.toFixed(6); if (!(pN > 0) || !(qN > 0)) return { why: 'no valid price comes out' };
  const o = Object.assign({}, x, { qty: qN, price: pN }); delete o.id;
  if (qN < q && unbackedSell([x.assetId], x.id, o)) return { why: 'it would leave a later sale without units' };
  return { kind: 'fix', txId: x.id, o, from: [q, +x.price], to: [qN, pN] };
}
function reconAdd(id, l, navMap) {
  const v = navMap.get(l.date), q = v ? l.cost / v : l.uB; if (!(q > 0)) return { why: 'no NAV for that day' };
  return { kind: 'add', src: v ? `the NAV of ${fdate(l.date, { year: undefined })}` : 'the implied price (no NAV for that day)', o: { type: 'buy', date: l.date, assetId: id, qty: +q.toFixed(6), price: +(v || l.cost / q).toFixed(6), fees: 0, note: 'Missing lot (MyInvestor statement)' } };
}
async function openReconcile(files) {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const items = [];
  for (const f of files) {
    let text = ''; try { const b = await f.arrayBuffer(); try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { text = new TextDecoder('windows-1252').decode(b); } } catch (e) { text = await f.text(); }
    const it = { name: String(f.name || 'file.csv').normalize('NFC') }; const m = it.name.toUpperCase().match(/(?:^|[^A-Z0-9])([A-Z]{2}[A-Z0-9]{9}[0-9])(?![A-Z0-9])/); it.isin = m ? m[1] : '';
    try { if (!isMyInvestorPL(text)) throw new Error('Not a MyInvestor "Plusvalías y minusvalías" CSV.'); it.pl = parseMyInvestorPL(text); } catch (e) { it.err = e.message; }
    if (!it.err && it.isin) { const a = assetList().find((z) => String(z.isin || '').toUpperCase() === it.isin); if (a) it.assetId = a.id; else it.err = `ISIN ${it.isin} is not in your assets. If it is yours, add the fund with that ISIN in Settings → Assets and choose the file again. Nothing has been created.`; }
    items.push(it);
  }
  reconUI.items = items;
  openModal(`<div class="recon"><style>.modal:has(.recon){max-width:820px}.recon{display:flex;flex-direction:column;gap:14px}.recon .rc-f{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:12px}.recon .rc-sum{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.recon .rc-row{display:grid;grid-template-columns:96px 1fr auto;gap:4px 12px;align-items:center;padding:7px 0;border-bottom:1px solid var(--grid);font-size:13px}.recon .rc-row:last-child{border-bottom:0}.recon .rc-d{font-variant-numeric:tabular-nums;color:var(--ink-2)}.recon .rc-m .small{margin-top:2px}
.recon .rc-cf{grid-column:1/-1;background:var(--surface-2);border-radius:8px;padding:8px 10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}.recon details summary{cursor:pointer;font-size:13px;color:var(--ink-2)}
@media (max-width:640px){.recon .rc-row{grid-template-columns:1fr auto}.recon .rc-d{grid-column:1/-1;font-size:13px}}</style>
  <div class="panel-h"><h2>Reconcile with MyInvestor</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <p class="note" style="margin:0">The statement's lots are compared with yours (same tax date ±3 days and cost ±1 €). MyInvestor's units come from market value ÷ the statement's NAV. <b>Nothing changes until you confirm it</b>; whatever you fix keeps the previous version in the trash and can be undone.</p>
  <div id="rcBody"></div></div>`, (m) => { reconPaint(); $('.recon', m).addEventListener('click', reconClick); $('.recon', m).addEventListener('change', (ev) => { const s = ev.target.closest('[data-rc-pick]'); if (s) { reconUI.items[+s.dataset.rcPick].assetId = s.value || null; reconPaint(); } }); });
}
function reconPaint() {
  const box = $('#rcBody'); if (!box) return; reconUI.acts = [];
  const act = (a, label, cls) => (a && a.kind ? `<button class="btn small ${cls || ''}" type="button" data-rc-ask="${reconUI.acts.push(a) - 1}">${label}</button>` : a && a.why ? `<span class="small muted">${esc(a.why)}</span>` : '');
  const q6 = (v) => numf(v, 4), px = (v) => numf(v, 4) + ' €';
  box.innerHTML = reconUI.items.map((it, i) => {
    if (it.err) return `<section class="rc-f"><h3>${esc(it.name)}</h3><p class="err" style="margin:0">${esc(it.err)}</p></section>`;
    const a = it.assetId && assetById(it.assetId);
    const pickSel = `<label class="f">Fund of this statement <span class="hint">the file name has no ISIN</span><select data-rc-pick="${i}"><option value="">Choose…</option>${assetList().filter((z) => z.type === 'fund').map((z) => `<option value="${esc(z.id)}" ${z.id === it.assetId ? 'selected' : ''}>${esc(z.ticker || z.name)}${z.isin ? ' · ' + esc(z.isin) : ''}</option>`).join('')}</select></label>`;
    if (!a) return `<section class="rc-f"><h3>${esc(it.name)}</h3>${pickSel}</section>`;
    const r = reconFund(a.id, it.pl); const n = (f) => r.mi.filter(f).length;
    const cnt = { ok: n((l) => l.st === 'ok'), diff: n((l) => l.st === 'diff'), miss: n((l) => l.st === 'missing'), xfer: n((l) => l.xfer), extra: r.extra.filter((x) => !x.later).length, later: r.extra.filter((x) => x.later).length };
    const row = (l) => {
      const ap = l.app, chips = [], det = [];
      if (l.st === 'ok') chips.push('<span class="chip inc">matches</span>');
      if (l.st === 'missing') { chips.push('<span class="chip sell">missing in the app</span>'); det.push(`cost ${eur(l.cost)} · value ${eur(l.value)}${l.u ? ` · ${q6(l.u)} units` : ''}`); }
      if (l.st === 'diff' && !l.cOk) { chips.push(`<span class="chip warn">different cost: ${eur(Math.abs(l.cost - ap.cost))}</span>`); det.push(`MyInvestor ${eur(l.cost)} · you ${eur(ap.cost)}`); }
      if (l.st === 'diff' && !l.uOk) { chips.push('<span class="chip warn">different units</span>'); det.push(`MyInvestor ${q6(l.u)} units · you ${q6(ap.qty)}`); }
      if (l.xfer) chips.push('<span class="chip xfer">comes from a switch</span>');
      const f = l.fix; if (f && f.kind === 'fix') det.push(`implied price ${px(f.to[1])} against ${px(f.from[1])} recorded`);
      if (f && f.kind === 'add') det.push(`it would be added with ${esc(f.src)}: ${q6(f.o.qty)} × ${px(f.o.price)}`);
      if (l.xfer) det.push(ap && ap.via ? 'it came from a switch: left as is' : 'its units do not match its cost: left as is');
      f && f.kind && (f.desc = f.kind === 'fix' ? `The buy of ${fdate(l.date)} changes from ${q6(f.from[0])} units × ${px(f.from[1])} to ${q6(f.to[0])} units × ${px(f.to[1])} (cost ${eur(l.cost)}).` : `A buy of ${fdate(l.date)} is added: ${q6(f.o.qty)} units × ${px(f.o.price)} = ${eur(l.cost)}. It changes the FIFO of later sales.`);
      return `<div class="rc-row"><div class="rc-d">${fdate(l.date)}</div><div class="rc-m">${chips.join(' ')}${det.length ? `<div class="small muted">${det.join(' · ')}</div>` : ''}</div><div>${l.st === 'ok' || l.xfer ? '' : act(f, f && f.kind === 'add' ? 'Add lot' : !l.uOk ? 'Fix price and units' : 'Fix price')}</div></div>`;
    };
    const fixes = r.mi.filter((l) => l.fix && l.fix.kind === 'fix').map((l) => l.fix);
    const bad = r.mi.filter((l) => l.st !== 'ok' || l.xfer);
    const extraRow = (x) => `<div class="rc-row"><div class="rc-d">${fdate(x.date)}</div><div class="rc-m"><span class="chip">${x.later ? 'after the statement' : 'extra in the app'}</span><div class="small muted">${q6(x.qty)} units · cost ${eur(x.cost)}${x.via ? ' · came from a switch' : ''}${x.later ? '' : ' · not in the statement: check it in Transactions'}</div></div><div></div></div>`;
    const cMI = r.mi.reduce((s, l) => s + l.cost, 0), cApp = r.p ? r.p.costBasis : 0;
    return `<section class="rc-f"><h3>${esc(a.ticker || a.name)} <span class="muted" style="font-weight:500">· ${esc(it.isin || a.isin || '')}</span></h3>
      <div class="small muted">${r.mi.length} lots in the statement · ${r.navx ? `statement NAV ${px(r.navx)} (${fdate(r.navxDate, { year: undefined })})` : 'the statement NAV is not in your history: only dates and costs are compared'} · MyInvestor cost ${eur(cMI)}, yours ${eur(cApp)}${Math.abs(cMI - cApp) >= 0.01 ? ` (${eurS(cMI - cApp)})` : ''}</div>
      <div class="rc-sum"><span class="chip inc">${cnt.ok} of ${r.mi.length} ${cnt.ok === 1 ? 'matches' : 'match'}</span>${cnt.diff ? `<span class="chip warn">${cnt.diff} different</span>` : ''}${cnt.miss ? `<span class="chip sell">${cnt.miss} missing in the app</span>` : ''}${cnt.extra ? `<span class="chip">${cnt.extra} extra in the app</span>` : ''}${cnt.xfer ? `<span class="chip xfer">${cnt.xfer} from switches</span>` : ''}${cnt.later ? `<span class="chip">${cnt.later} later</span>` : ''}${fixes.length > 1 ? act({ kind: 'many', list: fixes, desc: `${fixes.length} buys of ${a.ticker || a.name} are fixed with MyInvestor's cost and units.` }, `Fix all ${fixes.length}`, 'primary') : ''}</div>
      ${bad.length || r.extra.length ? `<div>${bad.map(row).join('')}${r.extra.map(extraRow).join('')}</div>` : ''}
      ${(() => { const g = r.mi.filter((l) => l.st === 'ok' && !l.xfer); return g.length ? `<details><summary>Lots that match (${g.length})</summary><div>${g.map(row).join('')}</div></details>` : ''; })()}
      ${it.pl.reds.length || r.gainApp ? `<div class="small muted">Redemptions: ${it.pl.reds.length ? `MyInvestor gives a result of ${eurS(r.gainMI)} over ${it.pl.reds.length}` : 'the statement has none'} · your sales of this fund (FIFO) add up to ${eurS(r.gainApp)}. For information only.</div>` : ''}
      ${it.pl.bad.length ? `<div class="small err">Rows ignored: ${it.pl.bad.slice(0, 6).join(', ')}${it.pl.bad.length > 6 ? '…' : ''}</div>` : ''}</section>`;
  }).join('');
}
async function reconClick(ev) {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.rcAsk != null) { const a = reconUI.acts[+t.dataset.rcAsk]; if (!a) return; $$('.rc-cf', $('#rcBody')).forEach((z) => z.remove()); const host = t.closest('.rc-row') || t.closest('.rc-sum');
    host.insertAdjacentHTML(host.matches('.rc-row') ? 'beforeend' : 'afterend', `<div class="rc-cf"><span class="small">${esc(a.desc || '')} The previous version goes to the trash.</span><span style="display:flex;gap:6px"><button class="btn small" type="button" data-rc-no>Cancel</button><button class="btn small primary" type="button" data-rc-go="${t.dataset.rcAsk}">Confirm</button></span></div>`); return; }
  if (t.dataset.rcNo != null) { t.closest('.rc-cf').remove(); return; }
  if (t.dataset.rcGo != null) { const a = reconUI.acts[+t.dataset.rcGo]; if (!a) return; t.disabled = true; t.textContent = 'Saving…'; await reconRun(a.kind === 'many' ? a.list : [a]); }
}
async function reconRun(acts) {
  const tids = [], added = [], r0 = res; let n = 0;
  try {
    await maybeSnapshot(true);
    for (const a of acts) {
      if (a.kind === 'fix') { const old = S.txs[a.txId]; if (!old) continue; const tid = await toTrash('tx', a.txId, old, 'edited'); if (tid) tids.push(tid); await save('txs', a.txId, a.o); n++; }
      else if (a.kind === 'add') { const id = uid(); await save('txs', id, Object.assign({}, a.o, { created: new Date().toISOString() })); added.push(id); n++; }
    }
    toast(added.length ? `Lot added (${eur(acts[0].o.qty * acts[0].o.price)}).` : `${n === 1 ? 'Buy fixed' : n + ' buys fixed'} with MyInvestor's data.`, 9000, { label: 'Undo', fn: async () => { const r1 = res; try { for (const id of added) if (S.txs[id]) { await toTrash('tx', id, S.txs[id], 'undo'); await remove('txs', id); } for (const tid of tids) await restoreTrash(tid, true); toast('Changes undone.'); } catch (e) { toast('Could not undo: ' + (e.message || e.code)); } for (let i = 0; i < 30 && res === r1; i++) await sleep(100); reconPaint(); } });
  } catch (e) { toast('Could not save: ' + (e.message || e.code)); }
  for (let i = 0; i < 30 && res === r0; i++) await sleep(100); reconPaint();
}
/** Sends every operation of one import (and the assets it created, if now unused) to the trash. */
async function undoImport(importId, assetIds) {
  const xs = Object.entries(S.txs).filter(([, x]) => x.importId === importId); toast('Undoing the import…', 10000);
  try {
    for (const [id, x] of xs) { await toTrash('tx', id, x, 'import undone'); await remove('txs', id); }
    for (const id of assetIds || []) if (S.assets[id] && !Object.values(S.txs).some((x) => x.importId !== importId && (x.assetId === id || x.toAssetId === id))) { await toTrash('asset', id, S.assets[id], 'import undone'); await remove('assets', id); }
    toast(`Import undone: ${xs.length} ${xs.length === 1 ? 'transaction' : 'transactions'} moved to the trash.`);
  } catch (e) { toast('Could not undo: ' + (e.message || e.code)); }
}
async function download(filename, data) {
  if (!downloads) { toast('Downloads are not available in this view.'); return; }
  try { const r = await downloads.save({ filename, data }); if (r === 'saved' || (r && r.status === 'saved')) toast('File saved.'); }
  catch (e) { if (e.code !== 'declined') toast('Could not download: ' + (e.message || e.code)); }
}
function exportCSV() {
  const rows = [['date', 'type', 'ticker', 'qty', 'price', 'fees', 'fx', 'amount', 'withholding', 'ratio', 'net_eur', 'note', 'to', 'to_qty', 'name', 'isin']];
  const all = (DEMO ? demoData.txs : Object.values(S.txs)).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const n = (v) => (v == null || v === '' || !Number.isFinite(+v) ? '' : String(+v));
  for (const x of all) { const a = assetById(x.assetId); const e2 = res && res.txEUR[x.id]; rows.push([x.date, x.type, a ? a.ticker : '', n(x.qty), n(x.price), n(x.fees), n(x.fx), n(x.amount), n(x.withholding), n(x.ratio), e2 && x.type !== 'transfer' ? n(+(e2.eur * (x.type === 'buy' || x.type === 'fee' ? -1 : 1)).toFixed(2)) : '', (x.note || '').replace(/[;\n]/g, ' '), x.type === 'transfer' ? ((assetById(x.toAssetId) || {}).ticker || '') : '', x.type === 'transfer' ? n(x.toQty) : '', a ? (a.name || '').replace(/[;\n]/g, ' ') : '', a && a.isin ? a.isin : '']); }
  download(`transactions-${todayStr()}.csv`, '﻿' + rows.map((r) => r.join(';')).join('\n'));
}
function fiscalCSV(y) {
  const n = (v) => (ok(v) ? (+v).toFixed(2) : ''), q = (v) => (ok(v) ? String(+(+v).toFixed(6)) : '');
  const rows = [['Tax report ' + y + ' (indicative, FIFO method)'], [], ['CAPITAL GAINS AND LOSSES'], ['Sale date', 'Asset', 'ISIN', 'Quantity', 'Sale value', 'Purchase date (FIFO)', 'Purchase value', 'Result', 'Wash-sale rule']];
  for (const x of fiscalGroups(y)) {
    rows.push([], [x.g.name.toUpperCase(), 'Renta Web section: ' + x.g.rw]);
    for (const s of x.sales) { const a = assetById(s.assetId) || {}; s.lots.forEach((l) => rows.push([s.date, a.name || a.ticker, a.isin || '', q(l.qty), n(s.proceeds * (l.qty / s.qty)), l.buyDate, n(l.cost), n(s.proceeds * (l.qty / s.qty) - l.cost), s.washSale ? 'yes (' + s.blocking.map((p) => p.date).join(', ') + ')' : ''])); }
    rows.push(['Subtotal ' + x.g.name, '', '', '', n(x.proceeds), '', n(x.cost), n(x.gain), '']);
  }
  const rel = fiscalReleased(y);
  if (rel.length) { rows.push([], ['DEFERRED LOSSES RELEASED (art. 33.5 LIRPF)'], ['Original sale date', 'Asset', 'ISIN', 'Original loss', 'Date of the sale that releases it', 'Loss released']); for (const r of rel) { const a = assetById(r.fromAssetId) || {}; rows.push([r.fromDate, a.name || a.ticker || '', a.isin || '', n(r.fromGain), r.byDate, n(r.amount)]); } }
  rows.push([], ['INVESTMENT INCOME'], ['Date', 'Type', 'Asset', 'Gross', 'Withholding', 'Net']);
  for (const r of res.incomeRows.filter((z) => String(z.year) === String(y))) { const a = assetById(r.assetId) || {}; rows.push([r.date, TXT[r.type], a.name || '', n(r.gross), n(r.withholding), n(r.net)]); }
  if (res.fiscal[y]) { const { f, g, base, tax, wh } = fiscalCalc(y); rows.push([], ['SUMMARY'], ['Gains', n(f.gains)], ['Losses', n(f.losses)], ['Losses deferred by the wash-sale rule (not counted this year)', n(f.flaggedLoss)], ['Deferred losses from earlier years released this year', n(f.deferredReleased)], ['Balance', n(g)], ['Gross dividends', n(f.dividendsGross)], ['Gross interest', n(f.interestGross)], ['Savings tax base', n(base)], ['Estimated tax', n(tax)], ['Withholdings', n(wh)], ['To pay after withholdings', n(tax - wh)], ['Deferred losses pending at 31-12-' + y, n(f.deferredPending)]); }
  download(`tax-report-${y}.csv`, '\ufeff' + rows.map((r) => r.map((c) => (/[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c)).join(';')).join('\n'));
}
function exportJSON() {
  const data = DEMO ? Object.assign({ demo: true }, demoData) : { version: 1, exported: new Date().toISOString(), assets: Object.values(S.assets), txs: Object.values(S.txs), cash: Object.fromEntries(Object.entries(S.cash).map(([k, v]) => { const c = Object.assign({}, v); delete c.id; return [k, c]; })), navs: S.navs, history: S.history, fx: S.fx, bench: S.bench, settings: S.settings };
  download(`portfolio-${DEMO ? 'SAMPLE' : 'backup'}-${todayStr()}.json`, JSON.stringify(data));
}
async function restoreJSON(file) {
  let d; try { d = JSON.parse(await file.text()); } catch (e) { toast('The file is not valid JSON.'); return; }
  if (!d || !Array.isArray(d.assets) || !Array.isArray(d.txs)) { toast('The file does not look like a backup of this portfolio.'); return; }
  if (d.demo || (d.assets.some((a) => /^d-/.test(a.id || '')) && d.txs.some((x) => /^dt\d+$/.test(x.id || '')))) { toast('That file is a backup of the sample portfolio: it is not restored.', 5000); return; }
  const cashIn = Array.isArray(d.cash) ? Object.fromEntries(d.cash.map((c) => [c.id, c])) : d.cash || {};
  // what the file would overwrite: those docs go to the trash first
  const over = [];
  for (const a of d.assets) if (a.id && S.assets[a.id] && !sameDoc(S.assets[a.id], a)) over.push(['asset', a.id, S.assets[a.id]]);
  for (const x of d.txs) if (x.id && S.txs[x.id] && !sameDoc(S.txs[x.id], x)) over.push(['tx', x.id, S.txs[x.id]]);
  for (const [id, c] of Object.entries(cashIn)) if (id && c && c.mv && S.cash[id] && !sameDoc(S.cash[id], c)) over.push(['cash', id, S.cash[id]]);
  for (const [id, h] of Object.entries(d.history || {})) if (h && h.points && S.history[id] && !sameDoc(S.history[id], h)) over.push(['history', id, S.history[id]]);
  const nA = d.assets.filter((a) => a.id).length, nT = d.txs.filter((x) => x.id).length, nC = Object.keys(cashIn).length;
  const newT = d.txs.filter((x) => x.id && !S.txs[x.id]).length;
  openModal(`<div class="panel-h"><h2>Restore from file</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <p style="margin:0">"${esc(file.name || 'backup.json')}" has <b>${nA} assets</b> and <b>${nT} transactions</b>${nC ? ` and ${nC} cash account${nC > 1 ? 's' : ''}` : ''}${d.exported ? ` (backup of ${fdate(String(d.exported).slice(0, 10))})` : ''}.</p>
  <p style="margin:0">${over.length ? `<b>${over.length} ${over.length === 1 ? 'record overwrites' : 'records overwrite'}</b> existing data that differs from the file` : 'Nothing overwrites data that differs from what you already have'}${newT ? `; ${newT === 1 ? '1 transaction is new' : newT + ' transactions are new'}` : ''}.</p>
  <p class="note">Before restoring, a backup of the current state is saved, and the current version of whatever is overwritten goes to the trash. Nothing that is not in the file is deleted.</p>
  <div class="err" id="rsErr"></div>
  <div class="form-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" id="rsGo">Restore</button></div>`, () => {
    $('#rsGo').addEventListener('click', async () => {
      const btn = $('#rsGo'); btn.disabled = true; btn.textContent = 'Restoring…';
      try { await maybeSnapshot(true); for (const [k, id, old] of over) await toTrash(k, id, old, 'restore'); }
      catch (e) { btn.disabled = false; btn.textContent = 'Restore'; $('#rsErr').textContent = 'Could not make the backup first: ' + (e.message || e.code); return; }
      closeModal(); writeRestore(d, cashIn, over.length);
    });
  });
}
const stableStr = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(stableStr).join(',')}]` : `{${Object.keys(v).filter((k) => k !== 'id' && v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stableStr(v[k])).join(',')}}`) : JSON.stringify(v));
const sameDoc = (a, b) => stableStr(a) === stableStr(b);
async function writeRestore(d, cashIn, nOver) {
  toast('Restoring…', 10000);
  try {
    for (const a of d.assets) { const { id, ...o } = a; if (id) await save('assets', id, o); }
    for (const x of d.txs) { const { id, ...o } = x; if (id) await save('txs', id, o); }
    for (const [id, c] of Object.entries(cashIn)) if (id && c && c.mv) { const o = Object.assign({}, c); delete o.id; await save('cash', id, o); }
    for (const [id, n] of Object.entries(d.navs || {})) if (n && n.m) { const o = mergeNavDoc(n, S.navs[id]); if (!S.navs[id] || !sameDoc(S.navs[id], o)) await save('navs', id, o); }
    for (const [id, h] of Object.entries(d.history || {})) if (h && h.points) await save('history', id, h);
    for (const [c, h] of Object.entries(d.fx || {})) if (h && h.points) await save('fx', c, h);
    if (d.bench && d.bench.points) await saveBench(d.bench);
    if (d.settings) { const { navTask, ...st } = d.settings; await saveSettings(st); }
    toast(`Restored ${d.assets.length} assets and ${d.txs.length} transactions.${nOver ? ` ${nOver} previous versions in the trash.` : ''}`, 5000);
  } catch (e) { toast('Error al restaurar: ' + (e.message || e.code)); }
}

