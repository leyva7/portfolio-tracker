/* ================= Modals ================= */
function openModal(html, onMount) {
  const o = $('#overlay'), m = $('#modal'); if (o.hidden) openModal.ret = document.activeElement;
  m.innerHTML = html; delete m.dataset.dirty; o.hidden = false;
  const h = m.querySelector('h2'); if (h) { h.id = 'modalTitle'; m.setAttribute('aria-labelledby', 'modalTitle'); } else m.removeAttribute('aria-labelledby');
  if (!toast._act) $('#toast').hidden = true;
  (onMount || (() => {}))(m);
  if (!matchMedia('(max-width:640px)').matches) { const f = modalFocusables().find((x) => x.closest('form') && x.matches('input,select,textarea')) || modalFocusables().find((x) => !x.matches('[data-close]')) || modalFocusables()[0]; if (f) f.focus(); }
}
function closeModal() {
  if (window.__motion) __motion.ghost();
  $('#overlay').hidden = true; $('#modal').innerHTML = ''; delete $('#modal').dataset.dirty;
  if (toast._discard) { $('#toast').hidden = true; toast._act = toast._discard = false; }
  const r = openModal.ret; openModal.ret = null; const back = r && (r.isConnected ? r : r.id && document.getElementById(r.id));
  if (back && back.focus) try { back.focus({ preventScroll: true }); } catch (e) {}
}
const modalFocusables = () => $$('button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', $('#modal')).filter((x) => x.getClientRects().length);
/** Esc / backdrop: a form with changes asks first ("Discard changes?") and closes on the second press. */
function tryCloseModal() {
  const m = $('#modal'); if (!m.dataset.dirty) return closeModal();
  if (Date.now() - (tryCloseModal.armed || 0) < 5000) { tryCloseModal.armed = 0; return closeModal(); }
  tryCloseModal.armed = Date.now();
  toast('Discard changes? Press Esc or tap outside again.', 5000, { label: 'Discard', fn: closeModal }); toast._discard = true;
}
function guardDemoWrite() { if (DEMO && dbState === 'ready') { /* first real write ends demo */ } return true; }
function fxFor(ccy, date) { if (!ccy || ccy === 'EUR') return 1; const pts = DEMO ? (demoData.fx[ccy]) : (S.fx[ccy] && S.fx[ccy].points); if (!pts) return null; const l = E.lookup(pts); return l(date) ?? (l.first ? l.first[1] : null); }

function lastPx(id) { const p = res && res.positions.find((z) => z.assetId === id); if (p && ok(p.price) && p.priceDate) return [p.priceDate, p.price]; const h = S.history[id]; const pts = h && h.points; return pts && pts.length ? pts[pts.length - 1] : null; }
/** Units of an asset at the end of `date` (buys, sells, splits, transfers in/out), optionally without one tx and/or with an extra one. */
function qtyAt(assetId, date, exclId, add) {
  const TO = { split: 0, buy: 1, transfer: 2, sell: 3 };
  const xs = Object.entries(S.txs).filter(([id]) => id !== exclId).map(([, z]) => z).concat(add ? [add] : [])
    .filter((z) => z.date <= date && (z.assetId === assetId || (z.type === 'transfer' && z.toAssetId === assetId)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (TO[a.type] ?? 9) - (TO[b.type] ?? 9)));
  let q = 0;
  for (const z of xs) {
    if (z.assetId === assetId) { if (z.type === 'buy') q += +z.qty || 0; else if (z.type === 'sell' || z.type === 'transfer') q -= +z.qty || 0; else if (z.type === 'split') q *= +z.ratio || 1; }
    if (z.type === 'transfer' && z.toAssetId === assetId) q += +z.toQty || 0;
  }
  return q;
}
/** First sell/transfer-out left without enough units, or null. */
function unbackedSell(assetIds, exclId, add) {
  const xs = Object.entries(S.txs).filter(([id]) => id !== exclId).map(([, z]) => z).concat(add ? [add] : []);
  for (const aid of new Set(assetIds)) for (const z of xs.filter((y) => y.assetId === aid && (y.type === 'sell' || y.type === 'transfer')).sort((a, b) => (a.date < b.date ? -1 : 1))) if (qtyAt(aid, z.date, exclId, add) < -1e-6) return { assetId: aid, date: z.date, type: z.type };
  return null;
}
function delTxLabel(id) { const x = S.txs[id]; const ids = x ? [x.assetId, x.toAssetId].filter(Boolean) : []; return ids.length && !unbackedSell(ids) && unbackedSell(ids, id) ? 'Delete? It leaves sales without units' : 'Delete?'; }
/** Asset choices per operation type: closed assets last (not for sells); transfers only between funds. */
function txAssetOpts(type, assets, keepId) {
  if (type === 'transfer') { const q = (id) => ((res && res.positions.find((p) => p.assetId === id)) || {}).qty || 0; return assets.filter((a) => a.type === 'fund' && (q(a.id) > 1e-9 || a.id === keepId)).sort((a, b) => q(b.id) - q(a.id)); }
  return assets.filter((a) => !a.inactive || a.id === keepId || type !== 'sell');
}
function txAssetOptsHtml(type, assets, keepId) {
  const dup = (a) => a.name && a.name !== a.ticker && assets.some((z) => z.id !== a.id && z.ticker === a.ticker);
  const o = (a) => `<option value="${esc(a.id)}">${esc(a.ticker || a.name)}${dup(a) ? ' (' + esc(a.name) + ')' : ''}${type === 'transfer' ? '' : ' · ' + esc(a.currency)}</option>`;
  const list = txAssetOpts(type, assets, keepId); const open = list.filter((a) => !a.inactive || a.id === keepId || type === 'transfer'), closed = list.filter((a) => !open.includes(a));
  return (type === 'interest' || type === 'fee' ? '<option value="">— None —</option>' : '') + open.map(o).join('') + (closed.length ? `<optgroup label="Closed">${closed.map(o).join('')}</optgroup>` : '');
}
function txFundDest(assets, fromId, keepId) { return assets.filter((a) => a.type === 'fund' && a.id !== fromId && (!a.inactive || a.id === keepId)); }
function openTxForm(tx0, presetAsset, asCopy) {
  const tx = asCopy ? null : tx0;
  const assets = assetList();
  if (!assets.length || DEMO) { if (DEMO) { toast('First add your own assets; the sample portfolio cannot be edited.'); openAssetForm(); return; } openAssetForm(); return; }
  const rb0 = DEMO ? [] : recentBuys(); const big = res && res.positions.filter((p) => p.open).sort((a, b) => b.value - a.value)[0]; const defA = presetAsset || (tx0 && tx0.type === 'sell' && !tx0.assetId && big ? big.assetId : null) || (rb0[0] && assets.some((z) => z.id === rb0[0].assetId) ? rb0[0].assetId : assets[0].id);
  const x = Object.assign({ type: 'buy', date: todayStr(), assetId: defA }, tx0 || {});
  for (const k of ['price', 'qty', 'fees', 'fx', 'amount', 'withholding', 'toQty', 'ratio', '_amt']) if (typeof x[k] === 'number') x[k] = String(x[k]).replace('.', ',');
  if (x.type === 'transfer' && !tx && !presetAsset) x.assetId = (txAssetOpts('transfer', assets, null)[0] || {}).id || x.assetId;
  const html = `<div class="panel-h"><h2>${tx ? 'Edit transaction' : 'New transaction'}</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <div class="typepick" id="tp">${Object.entries(TXT).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${x.type === k}">${l}</button>`).join('')}</div>
  <form class="form" id="txForm" novalidate>
    <label class="f">Date${x._wkHint ? ` <span class="hint" id="txDateHint">${esc(x._wkHint)}</span>` : ''}<input type="date" id="txDate" value="${esc(x.date)}" required></label>
    <label class="f" id="wAsset">Asset<select id="txAsset">${txAssetOptsHtml(x.type, assets, tx ? x.assetId : null)}</select></label>
    <div id="txFields" class="full form" style="padding:0"></div>
    <label class="f full">Note<input type="text" id="txNote" maxlength="200" value="${esc(x.note || '')}" placeholder="Optional"></label>
    <div class="err full" id="txErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">${tx ? 'Save changes' : 'Add'}</button></div>
  </form>`;
  openModal(html, (m) => {
    let type = x.type, fxAuto = null, upd = () => {};
    const KEEP = { txPrice: 'price', txAmt: '_amt', txQty: 'qty', txFees: 'fees', txFx: 'fx', txAmount: 'amount', txWh: 'withholding', txTo: 'toAssetId', txToQty: 'toQty', txRatio: 'ratio', txCash: '_cash' };
    const accs = cashList(); if (x._cash == null) x._cash = accs.length ? accs[0].id : '';
    const keep = () => { for (const [id, k] of Object.entries(KEEP)) { const el = $('#' + id); if (el) x[k] = el.value; } };
    const fxHintTxt = (ccy) => `€ per 1 ${esc(ccy)}${fxAuto ? ` · market ${ratio(fxAuto, 4)}` : ' · no market data'}`;
    const heldTxt = () => `you hold ${numf(qtyAt($('#txAsset').value, $('#txDate').value || todayStr(), tx && tx.id), 6)} on that date`;
    // funds: "use" takes the NAV of the chosen date (or the previous one) and warns when the price differs > 1 %
    const pxRef = () => { const a = assetById($('#txAsset').value); if (!a) return null; if (a.type === 'fund') { const n = navOn(a.id, $('#txDate').value || todayStr()); return n && { d: n.d, v: n.v, known: n.known, fund: true, a }; } const lp = lastPx(a.id); return lp && { d: lp[0], v: +lp[1], a }; };
    const pxHint = () => { const hh = $('#txPxHint'); if (!hh) return; const r = pxRef(); const ccy = r ? r.a.currency : 'EUR';
      hh.innerHTML = r ? ` · ${r.fund ? `NAV on ${fdate(r.d, { year: undefined })} ${money(r.v, ccy, r.v >= 100 ? 2 : 4)}` : `last ${money(r.v, ccy, r.v >= 100 ? 2 : 4)} (${fdate(r.d, { year: undefined })})`} <button type="button" class="hint-btn" id="txUseLast">use</button>` : '';
      const ul = $('#txUseLast'); if (ul) ul.addEventListener('click', (e) => { e.preventDefault(); $('#txPrice').value = String(r.v).replace('.', ','); upd({ target: $('#txPrice') }); pxHint(); });
      const nt = $('#txNavNote'); const p = parseNum($('#txPrice').value); const d = r && r.fund && r.known && p > 0 && !navDayBefore(r.a.id, $('#txDate').value || todayStr(), p) ? r.v / p - 1 : 0;
      nt.hidden = !(Math.abs(d) > 0.01); if (!nt.hidden) nt.innerHTML = `<span class="chip warn">price ≠ NAV</span> The NAV on ${fdate(r.d, { year: undefined })} was ${money(r.v, ccy, 4)}: ${numf(p, 6)} differs by ${pctS(d, 1)}. ${esc(r.a.broker || 'Your bank')} executes orders at that NAV.`; };
    const onDate = () => { pxHint(); const a = assetById($('#txAsset').value); const ccy = a ? a.currency : 'EUR'; fxAuto = fxFor(ccy, $('#txDate').value); const h = $('#txFxHint'); if (h) h.innerHTML = fxHintTxt(ccy); const f = $('#txFx'); if (f) f.placeholder = fxAuto ? String(+fxAuto.toFixed(4)).replace('.', ',') : 'p. ej. 0,92'; const hh = $('#txHeld'); if (hh) hh.textContent = heldTxt(); const dh = $('#txDateHint'); if (dh) dh.hidden = $('#txDate').value !== todayStr(); upd(); };
    const fields = () => {
      keep();
      const a = assetById($('#txAsset').value); const ccy = a ? a.currency : 'EUR'; const date = $('#txDate').value;
      fxAuto = fxFor(ccy, date);
      const fxField = ccy !== 'EUR' ? `<label class="f">Exchange rate <span class="hint" id="txFxHint">${fxHintTxt(ccy)}</span><input type="text" inputmode="decimal" autocomplete="off" id="txFx" value="${esc(x.fx ?? '')}" placeholder="${fxAuto ? String(+fxAuto.toFixed(4)) : 'e.g. 0.92'}"></label>` : '';
      let h = '';
      if (type === 'buy' || type === 'sell') { h = `<label class="f">Price per unit <span class="hint">in ${esc(ccy)}<span id="txPxHint"></span></span><input type="text" inputmode="decimal" autocomplete="off" id="txPrice" value="${esc(x.price ?? '')}" required></label><label class="f">Amount <span class="hint">€ ${type === 'buy' ? 'invested' : 'received'} · optional, works out the quantity</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmt" value="${esc(x._amt ?? '')}" placeholder="e.g. 300"></label><label class="f half">Quantity<input type="text" inputmode="decimal" autocomplete="off" id="txQty" value="${esc(x.qty ?? '')}" required></label><label class="f half">Total fee <span class="hint">in €</span><input type="text" inputmode="decimal" autocomplete="off" id="txFees" value="${esc(x.fees ?? '')}" placeholder="0"></label>${fxField}<div class="small muted full" id="txTotal"></div><div class="small full" id="txNavNote" hidden></div>${type === 'sell' && !tx && accs.length ? `<label class="f full">Pay the net amount into <span class="hint">creates the deposit in Cash with the exact amount of the sale</span><select id="txCash"><option value="">No, I will record it myself</option>${accs.map((c) => `<option value="${esc(c.id)}" ${c.id === x._cash ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}`; }
      else if (type === 'dividend') h = `<label class="f half">Gross amount <span class="hint">in ${esc(ccy)}</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmount" value="${esc(x.amount ?? '')}" required></label><label class="f half">Withholding tax <span class="hint">in ${esc(ccy)}</span><input type="text" inputmode="decimal" autocomplete="off" id="txWh" value="${esc(x.withholding ?? '')}" placeholder="0"></label>${fxField}`;
      else if (type === 'interest') h = `<label class="f half">Gross amount <span class="hint">in €</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmount" value="${esc(x.amount ?? '')}" required></label><label class="f half">Withholding tax <span class="hint">in € (19 % is usual)</span><input type="text" inputmode="decimal" autocomplete="off" id="txWh" value="${esc(x.withholding ?? '')}" placeholder="0"></label>`;
      else if (type === 'fee') h = `<label class="f">Amount <span class="hint">in € (custody, connectivity…)</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmount" value="${esc(x.amount ?? '')}" required></label>`;
      else if (type === 'transfer') { const dst = txFundDest(assets, $('#txAsset').value, tx && tx.toAssetId); h = !$('#txAsset').value ? '<p class="err full">You have no investment funds with units. A switch is only between funds; for other assets record a sale and a buy.</p>' : `<label class="f">Units going out <span class="hint" id="txHeld">${heldTxt()}</span><input type="text" inputmode="decimal" autocomplete="off" id="txQty" value="${esc(x.qty ?? '')}" required></label><label class="f">Destination fund<select id="txTo">${dst.length ? dst.map((z) => `<option value="${esc(z.id)}" ${z.id === x.toAssetId ? 'selected' : ''}>${esc(z.ticker || z.name)}</option>`).join('') : '<option value="">— No other funds —</option>'}</select></label><label class="f">Units coming in<input type="text" inputmode="decimal" autocomplete="off" id="txToQty" value="${esc(x.toQty ?? '')}" required></label><p class="note full">A switch between funds is not taxed: the cost and the age of your units move to the destination fund. If the destination does not exist yet, create it first in Settings.</p>`; }
      else if (type === 'split') h = `<label class="f">Ratio <span class="hint">new units for each old one (4-for-1 split = 4; 1-for-10 reverse split = 0.1)</span><input type="text" inputmode="decimal" autocomplete="off" id="txRatio" value="${esc(x.ratio ?? '')}" required></label>`;
      $('#txFields').innerHTML = h;
      upd = (ev) => {
        const t2 = $('#txTotal'); if (!t2) return;
        const p = parseNum($('#txPrice').value), fe = parseNum($('#txFees').value) || 0, fx = parseNum($('#txFx') ? $('#txFx').value : '') || fxAuto || 1, amt = parseNum($('#txAmt').value);
        const src = ev && ev.target && ev.target.id;
        if (ccy !== 'EUR' && !fxAuto && !(parseNum($('#txFx') ? $('#txFx').value : '') > 0)) { t2.innerHTML = `<span class="err">No market exchange rate for ${esc(ccy)} on that date: enter how many € 1 ${esc(ccy)} is worth.</span>`; return; }
        if (src === 'txQty') $('#txAmt').value = '';
        else if (amt > 0 && p > 0) { const q0 = (type === 'buy' ? amt - fe : amt + fe) / (p * fx); if (q0 > 0) $('#txQty').value = String(+q0.toFixed(8)).replace('.', ','); }
        const q = parseNum($('#txQty').value);
        if (q > 0 && p > 0) t2.textContent = `${type === 'buy' ? 'Total to pay' : 'Total to receive'}: ${eur(type === 'buy' ? q * p * fx + fe : q * p * fx - fe)}${amt > 0 ? ' · quantity worked out from the amount' : ''}${type === 'sell' ? (() => { const pos = res.positions.find((z) => z.assetId === $('#txAsset').value && z.open); if (!pos) return ''; const y = todayStr().slice(0, 4); const b0 = res.fiscal[y] ? fiscalCalc(y).base : 0; const qq = Math.min(q, pos.qty); const g = q * p * fx - fe - fifoCost(pos.lots, qq); const tx2 = Math.max(0, cuota(b0 + g + deferredRelease(pos, qq)) - cuota(b0)); return ` · gain ${eurS(g, 0)}, income tax ≈ ${eur(tx2, 0)} on your tax return`; })() : ''}`; else t2.textContent = '';
      };
      $$('#txFields input').forEach((i) => i.addEventListener('input', upd)); upd();
      pxHint(); const tp = $('#txPrice'); if (tp) tp.addEventListener('input', pxHint);
      if (type === 'sell' && tp && !tp.value && !tx) { const ul = $('#txUseLast'); if (ul) ul.click(); }
      $('#wAsset').hidden = false;
    };
    const setAssetOpts = () => { const sel = $('#txAsset'); const cur = sel.value; const allowNone = type === 'interest' || type === 'fee'; const keepId = tx ? tx.assetId : null; sel.innerHTML = txAssetOptsHtml(type, assets, keepId); const ids = $$('option', sel).map((o) => o.value); sel.value = ids.includes(cur) && (allowNone || cur) ? cur : allowNone ? '' : ids[0] || ''; };
    $$('#tp button', m).forEach((b) => b.addEventListener('click', () => { type = b.dataset.t; $$('#tp button', m).forEach((z) => z.setAttribute('aria-pressed', String(z === b))); setAssetOpts(); fields(); }));
    $('#txAsset').addEventListener('change', fields); $('#txDate').addEventListener('change', onDate);
    if (x.assetId != null) $('#txAsset').value = x.assetId; if (!$('#txAsset').value && type !== 'interest' && type !== 'fee') $('#txAsset').selectedIndex = 0;
    fields();
    $('#txForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('#txErr'); err.textContent = '';
      const o = { type, date: $('#txDate').value, assetId: $('#txAsset').value || null, note: $('#txNote').value.trim() };
      const v = (id) => { const el = $('#' + id); return el ? parseNum(el.value) : NaN; };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return (err.textContent = 'Enter the date.');
      if (o.date > todayStr()) return (err.textContent = 'The date cannot be in the future.');
      if (o.date < '1990-01-01') return (err.textContent = 'The date must be 1990 or later.');
      const amb = $$('#txFields input').find((el) => /^\d{1,3}(,\d{3})+$/.test(el.value.trim())); if (amb) { const v = amb.value.trim(); return (err.textContent = `"${v}" is ambiguous: write ${v.replace(/,/g, '')} if it is thousands or ${v.replace(',', '.')} if it is decimals (decimals use a point).`); }
      const bad = $$('#txFields input').find((el) => el.value.trim() && !Number.isFinite(parseNum(el.value))); if (bad) return (err.textContent = `"${bad.value.trim()}" is not a valid number.`);
      if (type === 'buy' || type === 'sell') { o.qty = v('txQty'); o.price = v('txPrice'); o.fees = v('txFees') || 0; const f = v('txFx'); if (f > 0) o.fx = f; if (!(o.price > 0)) return (err.textContent = 'The price is missing: tap "use" to fill in the last NAV.'); if (!(o.qty > 0)) return (err.textContent = 'Enter the quantity or the amount.'); if (!(o.price >= 0)) return (err.textContent = 'Enter the price.'); if (o.fees < 0) return (err.textContent = 'The fee cannot be negative.'); if (!o.assetId) return (err.textContent = 'Choose an asset.');
        const lp = assetById(o.assetId) ? lastPx(o.assetId) : null; const pk = `${o.assetId}|${o.price}`;
        if (lp && lp[1] > 0 && o.date >= E.addDays(lp[0], -10) && !(tx && +tx.price === o.price) && Math.abs(o.price / lp[1] - 1) > 0.2 && x._pxOk !== pk) { x._pxOk = pk; return (err.textContent = `The price is more than 20 % away from the last known one (${numf(lp[1], 4)} on ${fdate(lp[0])}). If it is right, press again to save.`); }
        if (type === 'sell') { const held = qtyAt(o.assetId, o.date, tx && tx.id); if (o.qty > held + 1e-6) return (err.textContent = `On that date you only held ${numf(Math.max(0, held), 6)} units of this asset.`); } }
      else if (type === 'dividend') { o.amount = v('txAmount'); o.withholding = v('txWh') || 0; const f = v('txFx'); if (f > 0) o.fx = f; if (!(o.amount > 0)) return (err.textContent = 'Enter the gross amount.'); if (!o.assetId) return (err.textContent = 'Choose an asset.'); }
      else if (type === 'interest') { o.amount = v('txAmount'); o.withholding = v('txWh') || 0; if (!(o.amount > 0)) return (err.textContent = 'Enter the amount.'); }
      else if (type === 'fee') { o.amount = v('txAmount'); if (!(o.amount > 0)) return (err.textContent = 'Enter the amount.'); }
      else if (type === 'transfer') { o.qty = v('txQty'); o.toAssetId = $('#txTo') ? $('#txTo').value : ''; o.toQty = v('txToQty'); const fa = assetById(o.assetId), fb = assetById(o.toAssetId); if (!o.assetId || !o.toAssetId) return (err.textContent = 'Choose the source and the destination fund.'); if (!fa || !fb || fa.type !== 'fund' || fb.type !== 'fund' || o.assetId === o.toAssetId) return (err.textContent = 'A switch can only be between two different investment funds.'); if (!(o.qty > 0) || !(o.toQty > 0)) return (err.textContent = 'Enter the units going out and the units coming in.'); const held = qtyAt(o.assetId, o.date, tx && tx.id); if (o.qty > held + 1e-6) return (err.textContent = `On that date you only held ${numf(Math.max(0, held), 6)} units of the source fund.`); }
      else if (type === 'split') { o.ratio = v('txRatio'); if (!(o.ratio > 0)) return (err.textContent = 'Enter the ratio.'); if (!o.assetId) return (err.textContent = 'Choose an asset.'); }
      if (o.withholding < 0) return (err.textContent = 'The withholding tax cannot be negative.');
      if (o.withholding > o.amount) return (err.textContent = 'The withholding tax cannot be larger than the gross amount.');
      const fa = assetById(o.assetId); if ((type === 'buy' || type === 'sell' || type === 'dividend') && fa && fa.currency !== 'EUR' && !(o.fx > 0) && !fxFor(fa.currency, o.date)) return (err.textContent = `Enter the exchange rate (€ per 1 ${fa.currency}): there is no market data for that date.`);
      const ids = [o.assetId, o.toAssetId, tx && tx.assetId, tx && tx.toAssetId].filter(Boolean); if (ids.length && !unbackedSell(ids)) { const u = unbackedSell(ids, tx && tx.id, o); if (u) return (err.textContent = `This would leave the ${u.type === 'transfer' ? 'switch out' : 'sale'} of ${(assetById(u.assetId) || {}).ticker || ''} on ${fdate(u.date)} without units: there would not be enough on that date.`); }
      { x._warnOk = x._warnOk || []; const w = txSoftWarn(o, tx, v('txAmt')).find((z) => !x._warnOk.includes(z.k)); if (w) { x._warnOk.push(w.k); err.innerHTML = `${w.msg} <b>If it is right, press again to save.</b>`; err.scrollIntoView({ block: 'nearest' }); return; } }
      const id = tx ? tx.id : uid(); o.created = tx && tx.created ? tx.created : new Date().toISOString();
      const prev = tx && type === 'sell' && tx.cashMv && S.cash[tx.cashMv.acc] ? tx.cashMv : null;
      const acc = prev ? S.cash[prev.acc] : type === 'sell' && !tx && $('#txCash') ? S.cash[$('#txCash').value] : null; const fxS = o.fx || (fa && fa.currency !== 'EUR' ? fxFor(fa.currency, o.date) : 1) || 1;
      const net = acc ? +(o.qty * o.price * fxS - o.fees).toFixed(2) : 0; const mvId = acc && net > 0 ? (prev ? prev.mv : 'm' + uid().slice(0, 8)) : null;
      if (mvId) o.cashMv = { acc: acc.id, mv: mvId, a: net };
      try { let tid = null; if (tx && S.txs[id]) tid = await toTrash('tx', id, S.txs[id], 'edited'); await save('txs', id, o);
        let mvErr = null;
        if (mvId) { try { await addCashMove(acc, cashMoves(acc).filter((m) => m.id !== mvId).concat([{ id: mvId, d: o.date, a: net, t: 'in', n: `Sale ${(fa && (fa.ticker || fa.name)) || ''}`.trim() }]), mvId); } catch (e) { mvErr = e; if (!prev) { delete o.cashMv; await save('txs', id, o).catch(() => {}); } } }
        closeModal();
        if (mvErr) toast(`The sale has been saved, but not the deposit in ${acc.name}: record it by hand in Cash.`, 8000);
        else toast(tx ? (prev ? `Transaction updated and its deposit in ${acc.name} changes to ${eur(net)}.` : 'Transaction updated.') : mvId ? `Sale added and ${eur(net)} deposited in ${acc.name}.` : 'Transaction added.', 3200, tid ? { label: 'Undo', fn: () => restoreTrash(tid) } : null); }
      catch (e) { err.textContent = e.code === 'quota_exceeded' ? 'The page\'s database is full (5,000 documents).' : e.code === 'invalid_argument' ? 'You do not have permission to save on this page.' : 'Could not save: ' + (e.message || e.code); }
    });
  });
}

/** FIFO sale of `qty` units from open lots: cost of the units sold. */
function fifoCost(lots, qty) { let rest = qty, cost = 0; for (const l of lots) { if (rest <= 1e-9) break; const q = Math.min(rest, l.qty); cost += l.cost * (q / l.qty); rest -= q; } return cost; }
/** What a sale would leave: net proceeds, FIFO gain and the extra IRPF on top of this year's savings base. Nothing is saved. */
/** Deferred losses (negative €) that selling q units of position p releases: those tied to the lots FIFO consumes. */
function deferredRelease(p, q) {
  const blk = {}; for (const x of res.realized) if (x.assetId === p.assetId && x.blocking) for (const b of x.blocking) if (b.left < 0) blk[b.txId] = (blk[b.txId] || 0) + b.left;
  let acc = 0, rel = 0; for (const l of p.lots) { if (blk[l.txId]) rel += blk[l.txId] * Math.min(1, Math.max(0, (q - acc) / l.qty)); acc += l.qty; } return rel;
}
function openSellSim(pre) {
  const pos = res.positions.filter((p) => p.open && p.value > 0 && p.priceEUR > 0).sort((a, b) => b.value - a.value);
  const y = res.totals.today.slice(0, 4); const fc = res.fiscal[y] ? fiscalCalc(y) : null; const base0 = fc ? fc.base : 0;
  openModal(`<div class="panel-h"><h2>How much is left if I sell?</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="ssForm" novalidate>
    <label class="f full">What you sell<select id="ssA"><option value="*"${pre === '*' ? ' selected' : ''}>All positions (${eur(pos.reduce((t, p) => t + p.value, 0), 0)})</option>${pos.map((p) => `<option value="${esc(p.assetId)}"${(pre || (pos[0] && pos[0].assetId)) === p.assetId ? ' selected' : ''}>${esc(p.asset.name || p.asset.ticker)} · ${eur(p.value, 0)}</option>`).join('')}</select></label>
    <label class="f half">Gross amount to sell <span class="hint">in €; empty = everything</span><input type="text" inputmode="decimal" autocomplete="off" id="ssAmt" placeholder="everything"></label>
    <label class="f half">Fee <span class="hint">in €</span><input type="text" inputmode="decimal" autocomplete="off" id="ssFee" value="0"></label>
    <div class="full" id="ssOut"></div>
    <p class="note full">It uses the last price of each fund and the FIFO method, like the Spanish tax office. The income tax is the extra amount on top of what you already have this year (${eur(base0, 0)} of savings income base) and is paid in the following year's tax return. If you switch to another fund instead of selling, you pay nothing now.</p>
  </form>`, () => {
    const calc = () => {
      const sel = $('#ssA').value; const list = sel === '*' ? pos : pos.filter((p) => p.assetId === sel); const tot = list.reduce((t, p) => t + p.value, 0);
      const amtIn = parseNum($('#ssAmt').value); const amt = Number.isFinite(amtIn) && amtIn > 0 ? Math.min(amtIn, tot) : tot; const fee = Math.max(0, parseNum($('#ssFee').value) || 0);
      let gross = 0, cost = 0, rel = 0; for (const p of list) { const g = amt * (p.value / tot); const q = Math.min(g / p.priceEUR, p.qty); gross += g; cost += fifoCost(p.lots, q);
        // deferred losses tied to the lots this sale consumes (FIFO) are released and lower the tax
        rel += deferredRelease(p, q); }
      const net = gross - fee, gain = net - cost; const tax = Math.max(0, cuota(base0 + gain + rel) - cuota(base0)); const left = net - tax;
      const g = (S.settings || {}).goal; const cash = cashTotal();
      const r = (l, v, c, b) => `<div class="stat"><span class="k">${b ? `<b>${l}</b>` : l}</span><span class="v num ${c || ''}">${b ? `<b>${v}</b>` : v}</span></div>`;
      $('#ssOut').innerHTML = `<div class="stats">${r('You sell', eur(gross))}${fee ? r('Fee', eurS(-fee)) : ''}${r('Reaches your account', eur(net), '', 1)}${r('Cost of what you sell (FIFO)', eur(cost))}${r('Gain', eurS(gain), cls(gain))}${r('Estimated income tax', tax ? eurS(-tax) : eur(0))}${rel < -0.5 ? `<p class="small muted" style="margin:0">It already counts ${eur(-rel)} of deferred losses that this sale releases: they save you ${eur(Math.max(0, cuota(base0 + gain) - cuota(base0)) - tax)} of income tax.</p>` : ''}${r('Left for you, net', eur(left), '', 1)}${r('Cash afterwards, with the tax paid', eur(cash + left))}${(() => { const gi = typeof goalInfo === 'function' && goalInfo(); return gi ? r(`Goal "${esc(gi.name)}"`, `${pct(Math.min(1, (gi.cash + net) / gi.amount), 0)} of ${eur(gi.amount, 0)}${gi.cu ? ' (without the emergency fund)' : ''}`) : ''; })()}</div>${amtIn > tot + 0.5 ? `<p class="small muted">You only have ${eur(tot, 0)} in what you chose; it is calculated with that.</p>` : ''}`;
    };
    ['#ssA', '#ssAmt', '#ssFee'].forEach((id) => $(id).addEventListener('input', calc)); $('#ssA').addEventListener('change', calc);
    $('#ssForm').addEventListener('submit', (e) => e.preventDefault()); calc();
  });
}
function openAssetForm(a) {
  const x = Object.assign({ type: 'fund', currency: 'EUR', src: 'nav' }, a || {});
  const auto = x.src !== 'manual';
  const html = `<div class="panel-h"><h2>${a ? 'Edit asset' : 'New asset'}</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="aForm" novalidate>
    <label class="f">Ticker<input type="text" id="aTicker" value="${esc(x.ticker || '')}" required placeholder="e.g. VWCE"></label>
    <label class="f">Name<input type="text" id="aName" value="${esc(x.name || '')}" placeholder="e.g. Vanguard FTSE All-World"></label>
    <label class="f">Type<select id="aType">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Trading currency<select id="aCcy">${['EUR', 'USD', 'GBP', 'CHF'].map((c) => `<option ${x.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f">ISIN <span class="hint" id="aIsinHint">optional; used to import from DeGiro</span><input type="text" id="aIsin" value="${esc(x.isin || '')}" placeholder="e.g. IE00BK5BQT80"></label>
    <label class="f">Broker<input type="text" id="aBroker" list="brokers" value="${esc(x.broker || '')}" placeholder="e.g. DeGiro"><datalist id="brokers"><option>DeGiro</option><option>Trade Republic</option><option>MyInvestor</option><option>Interactive Brokers</option></datalist></label>
    <label class="f">Tag <span class="hint">region, sector…</span><input type="text" id="aTag" value="${esc(x.tag || '')}" placeholder="e.g. Global"></label>
    <label class="f">Asset class<select id="aCls">${CLASSES.filter(([k]) => k !== 'cash').map(([k, l]) => `<option value="${k}" ${clsOf(x) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Equity type <span class="hint">for "How well built is your portfolio?"</span><select id="aSub"><option value="">Automatic (${esc(SUBS[subOf(Object.assign({}, x, { sub: null }))][0])})</option>${SUB_EQ.map((k) => `<option value="${k}" ${x.sub === k ? 'selected' : ''}>${SUBS[k][0]}</option>`).join('')}</select></label>
    ${(() => { const az = zonesOf(Object.assign({}, x, { zones: null })); const own = x.zones && typeof x.zones === 'object' ? x.zones : {}; return az || Object.keys(own).length ? `<fieldset class="f full zone-in" id="aZones"><legend>Regions <span class="hint">% of each region inside the asset, for "Where in the world is your money?" · empty = automatic</span></legend><div class="zone-grid">${ZONES.map(([k, l]) => `<label class="f">${l}<input type="text" inputmode="decimal" data-zone="${k}" value="${own[k] != null && own[k] !== '' ? esc(String(+own[k])) : ''}" placeholder="${az ? Math.round(az[k] * 100) : 0}"></label>`).join('')}</div></fieldset>` : ''; })()}
    <label class="f">Target weight <span class="hint">% of the portfolio</span><input type="text" inputmode="decimal" id="aTarget" value="${x.target != null && x.target !== '' ? esc(String(+(+x.target * 100).toFixed(4))) : ''}" placeholder="e.g. 20"></label>
    <label class="f">Prices<select id="aSrc"><option value="nav" ${x.src === 'nav' ? 'selected' : ''}>Fund: NAV by ISIN</option><option value="auto" ${auto && x.src !== 'nav' ? 'selected' : ''}>Automatic quote (Claude)</option><option value="manual" ${x.src === 'manual' ? 'selected' : ''}>Manual</option></select></label>
    <label class="f full" id="wA">Symbol <span class="hint">ETF: the Alpha Vantage one, e.g. SXR8.DEX · shares and crypto: optional</span><input type="text" id="aSymbol" value="${esc(x.symbol || '')}" placeholder="e.g. SXR8.DEX"></label>
    <label class="f full" id="wQ">finanzen.net page <span class="hint">optional · if you leave it empty, Claude looks it up</span><input type="text" id="aQuoteUrl" value="${esc(x.quoteUrl || '')}" placeholder="e.g. https://www.finanzen.net/aktien/apple-aktie"></label>
    <label class="f">TER <span class="hint">optional · annual fee in %, for the asset page</span><input type="text" inputmode="decimal" id="aTer" value="${x.ter != null && x.ter !== '' ? esc(String(+(+x.ter * 100).toFixed(4))) : ''}" placeholder="e.g. 0.12"></label>
    <label class="f">Risk <span class="hint">optional · indicator from 1 to 7</span><select id="aRisk"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7].map((k) => `<option ${+x.risk === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="f full">Category <span class="hint">optional · e.g. Global equity, Money market</span><input type="text" id="aCatg" value="${esc(x.category || '')}" placeholder="e.g. Global equity"></label>
    <div class="err full" id="aErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">${a ? 'Save' : 'Add asset'}</button></div>
  </form>`;
  openModal(html, (m) => {
    const syncSrc = () => {
      const on = $('#aSrc').value === 'auto'; $('#wA').hidden = !on; $('#wQ').hidden = !on; $('#aIsinHint').textContent = $('#aSrc').value === 'nav' ? 'required: Claude looks up the NAV with it' : 'optional; used to import from DeGiro';
    };
    $('#aSrc').addEventListener('change', syncSrc);
    $('#aType').addEventListener('change', () => { if ($('#aType').value === 'crypto') { $('#aCls').value = 'cripto'; $('#aCcy').value = 'EUR'; } $('#aSrc').value = $('#aType').value === 'fund' ? 'nav' : $('#aSrc').value === 'nav' ? 'auto' : $('#aSrc').value; syncSrc(); });
    syncSrc();
    $('#aForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#aErr'); err.textContent = '';
      const o = { ticker: $('#aTicker').value.trim().toUpperCase(), name: $('#aName').value.trim(), type: $('#aType').value, currency: $('#aCcy').value, isin: $('#aIsin').value.trim().toUpperCase(), broker: $('#aBroker').value.trim(), tag: $('#aTag').value.trim(), cls: $('#aCls').value, src: $('#aSrc').value, ysym: x.ysym || '', symbol: $('#aSymbol').value.trim().toUpperCase(), quoteUrl: /^https:\/\/www\.finanzen\.net\//.test($('#aQuoteUrl').value.trim()) ? $('#aQuoteUrl').value.trim() : '' };
      const tg = parseNum($('#aTarget').value); o.target = tg >= 0 ? tg / 100 : null;
      const ter = parseNum($('#aTer').value); if ($('#aTer').value.trim() && !(ter >= 0 && ter <= 10)) return (err.textContent = 'The TER must be between 0 and 10 %.');
      if (ter >= 0) o.ter = ter / 100; if (+$('#aRisk').value) o.risk = +$('#aRisk').value; if ($('#aCatg').value.trim()) o.category = $('#aCatg').value.trim(); o.sub = $('#aSub').value || null;
      { const zi = Array.from(document.querySelectorAll('#aZones [data-zone]')); if (zi.length) { const filled = zi.filter((i) => i.value.trim()); if (!filled.length) o.zones = null; else { const z = {}; for (const i of zi) { const v = i.value.trim() ? parseNum(i.value) : 0; if (!(v >= 0 && v <= 100)) return (err.textContent = 'Each region must be between 0 and 100 %.'); if (v > 0) z[i.dataset.zone] = v; } const sum = Object.values(z).reduce((s, v) => s + v, 0); if (Math.abs(sum - 100) > 1) return (err.textContent = `The regions must add up to 100 % (they now add up to ${String(+sum.toFixed(2))} %).`); o.zones = z; } } }
      if (!o.ticker) return (err.textContent = 'Enter a ticker or short name.');
      if ($('#aTarget').value.trim() && !(tg >= 0 && tg <= 100)) return (err.textContent = 'The target weight must be between 0 and 100 %.');
      const others = Object.values(S.assets).filter((z) => !a || z.id !== a.id); const dT = others.find((z) => String(z.ticker || '').toUpperCase() === o.ticker), dI = o.isin && others.find((z) => String(z.isin || '').toUpperCase() === o.isin);
      if (dT && (!o.name || o.name.toLowerCase() === String(dT.name || '').toLowerCase())) return (err.textContent = `You already have another asset with the ticker ${o.ticker}${dT.name && dT.name !== dT.ticker ? ` (${dT.name})` : ''}. If it is a different asset, give it a name that tells them apart.`);
      const dupKey = (dT ? 'T' + o.ticker : '') + (dI ? 'I' + o.isin : '');
      if (dupKey && $('#aForm').dataset.dupOk !== dupKey) { $('#aForm').dataset.dupOk = dupKey; return (err.textContent = dT ? `You already have ${o.ticker}${dT.name && dT.name !== dT.ticker ? ` (${dT.name})` : ''}; is it a different asset? Press again to save it anyway.` : `You already have another asset with the ISIN ${o.isin} (${dI.ticker || dI.name}); is it a different asset? If it is the same, edit that one. Press again to save it anyway.`); }
      if (o.src === 'nav' && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(o.isin)) return (err.textContent = 'For a fund, enter its ISIN (12 characters, e.g. IE00B03HCZ61).');
      if (o.src === 'auto' && o.type === 'etf' && !o.symbol && !o.quoteUrl) return (err.textContent = 'For an ETF, enter the Alpha Vantage symbol (e.g. SXR8.DEX) or the finanzen.net page, or choose manual prices.');
      const id = a ? a.id : (o.ticker.replace(/[^A-Z0-9]/g, '').toLowerCase().slice(0, 12) || 'a') + '-' + uid().slice(0, 6);
      o.order = a && a.order != null ? a.order : Date.now();
      const first = !a && !Object.keys(S.assets).length;
      try { await save('assets', id, o); closeModal(); toast(a ? 'Asset updated.' : 'Asset added. Now record your buys.', 3200, first ? { label: 'Record a buy', fn: () => openTxForm(null, id) } : null); if (mcp && o.src !== 'manual' && (!a || a.isin !== o.isin || a.symbol !== o.symbol || a.quoteUrl !== o.quoteUrl)) setTimeout(() => refreshCloud({ silent: true, force: true }), 600); }
      catch (e) { err.textContent = e.code === 'invalid_argument' ? 'You do not have permission to save on this page.' : 'Could not save: ' + (e.message || e.code); }
    });
  });
}

function openPriceForm(assetId) {
  if (DEMO) { toast('The sample portfolio cannot be edited.'); return; }
  const a = assetById(assetId); if (!a) return;
  const h = S.history[a.id]; const pts = (h && h.points) || [];
  const html = `<div class="panel-h"><h2>Price of ${esc(a.ticker || a.name)}</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <p class="note">${isAuto(a) || a.src === 'nav' ? 'This asset has an automatic price: if the update brings a price for that same day, the automatic one wins.' : ''}</p>
  <form class="form" id="pForm" novalidate>
    <label class="f">Date<input type="date" id="pDate" value="${todayStr()}"></label>
    <label class="f">Price <span class="hint">in ${esc(a.currency)}</span><input type="text" inputmode="decimal" autocomplete="off" id="pVal" required></label>
    <div class="err full" id="pErr"></div>
    <div class="form-actions full"><button class="btn primary" type="submit">Save price</button></div>
  </form>
  ${pts.length ? `<div class="tbl-wrap" style="max-height:240px;overflow:auto"><table><thead><tr><th>Date</th><th class="n">Price</th><th></th></tr></thead><tbody>${pts.slice(-30).reverse().map((p) => `<tr><td class="num">${fdate(p[0])}</td><td class="n">${money(p[1], a.currency, 4)}</td><td><button class="btn ghost small danger" type="button" data-delpt="${esc(p[0])}">Remove</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  openModal(html, (m) => {
    $('#pForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const d = $('#pDate').value, v = parseNum($('#pVal').value);
      if (!(v > 0) || !d) return ($('#pErr').textContent = 'Enter a date and a price.');
      const cur = S.history[a.id] || {};
      await save('history', a.id, Object.assign({}, cur, { points: mergePts(cur.points, [[d, v]]), source: cur.source || 'manual', symbol: cur.symbol || null, manualUpdated: todayStr() }));
      closeModal(); toast('Price saved.');
    });
    $$('[data-delpt]', m).forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sure?'; return; }
      const cur = S.history[a.id]; const tid = await toTrash('history', a.id, cur, 'price removed'); await save('history', a.id, Object.assign({}, cur, { points: cur.points.filter((p) => p[0] !== b.dataset.delpt) })); closeModal(); openPriceForm(a.id);
      if (tid) toast(`Price for ${fdate(b.dataset.delpt)} removed.`, 7000, { label: 'Undo', fn: async () => { await restoreTrash(tid); await sleep(300); if ($('#pForm')) { closeModal(); openPriceForm(a.id); } } });
    }));
  });
}

