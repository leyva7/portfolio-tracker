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
/** Esc / backdrop: a form with changes asks first («¿Descartar cambios?») and closes on the second press. */
function tryCloseModal() {
  const m = $('#modal'); if (!m.dataset.dirty) return closeModal();
  if (Date.now() - (tryCloseModal.armed || 0) < 5000) { tryCloseModal.armed = 0; return closeModal(); }
  tryCloseModal.armed = Date.now();
  toast('¿Descartar cambios? Pulsa Esc o toca fuera otra vez.', 5000, { label: 'Descartar', fn: closeModal }); toast._discard = true;
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
function delTxLabel(id) { const x = S.txs[id]; const ids = x ? [x.assetId, x.toAssetId].filter(Boolean) : []; return ids.length && !unbackedSell(ids) && unbackedSell(ids, id) ? '¿Borrar? Deja ventas sin respaldo' : '¿Borrar?'; }
/** Asset choices per operation type: closed assets last (not for sells); transfers only between funds. */
function txAssetOpts(type, assets, keepId) {
  if (type === 'transfer') { const q = (id) => ((res && res.positions.find((p) => p.assetId === id)) || {}).qty || 0; return assets.filter((a) => a.type === 'fund' && (q(a.id) > 1e-9 || a.id === keepId)).sort((a, b) => q(b.id) - q(a.id)); }
  return assets.filter((a) => !a.inactive || a.id === keepId || type !== 'sell');
}
function txAssetOptsHtml(type, assets, keepId) {
  const dup = (a) => a.name && a.name !== a.ticker && assets.some((z) => z.id !== a.id && z.ticker === a.ticker);
  const o = (a) => `<option value="${esc(a.id)}">${esc(a.ticker || a.name)}${dup(a) ? ' (' + esc(a.name) + ')' : ''}${type === 'transfer' ? '' : ' · ' + esc(a.currency)}</option>`;
  const list = txAssetOpts(type, assets, keepId); const open = list.filter((a) => !a.inactive || a.id === keepId || type === 'transfer'), closed = list.filter((a) => !open.includes(a));
  return (type === 'interest' || type === 'fee' ? '<option value="">— Ninguno —</option>' : '') + open.map(o).join('') + (closed.length ? `<optgroup label="Cerrados">${closed.map(o).join('')}</optgroup>` : '');
}
function txFundDest(assets, fromId, keepId) { return assets.filter((a) => a.type === 'fund' && a.id !== fromId && (!a.inactive || a.id === keepId)); }
function openTxForm(tx0, presetAsset, asCopy) {
  const tx = asCopy ? null : tx0;
  const assets = assetList();
  if (!assets.length || DEMO) { if (DEMO) { toast('Primero añade tus propios activos; la cartera de ejemplo no se puede editar.'); openAssetForm(); return; } openAssetForm(); return; }
  const rb0 = DEMO ? [] : recentBuys(); const big = res && res.positions.filter((p) => p.open).sort((a, b) => b.value - a.value)[0]; const defA = presetAsset || (tx0 && tx0.type === 'sell' && !tx0.assetId && big ? big.assetId : null) || (rb0[0] && assets.some((z) => z.id === rb0[0].assetId) ? rb0[0].assetId : assets[0].id);
  const x = Object.assign({ type: 'buy', date: todayStr(), assetId: defA }, tx0 || {});
  for (const k of ['price', 'qty', 'fees', 'fx', 'amount', 'withholding', 'toQty', 'ratio', '_amt']) if (typeof x[k] === 'number') x[k] = String(x[k]).replace('.', ',');
  if (x.type === 'transfer' && !tx && !presetAsset) x.assetId = (txAssetOpts('transfer', assets, null)[0] || {}).id || x.assetId;
  const html = `<div class="panel-h"><h2>${tx ? 'Editar operación' : 'Nueva operación'}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <div class="typepick" id="tp">${Object.entries(TXT).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${x.type === k}">${l}</button>`).join('')}</div>
  <form class="form" id="txForm" novalidate>
    <label class="f">Fecha${x._wkHint ? ` <span class="hint" id="txDateHint">${esc(x._wkHint)}</span>` : ''}<input type="date" id="txDate" value="${esc(x.date)}" required></label>
    <label class="f" id="wAsset">Activo<select id="txAsset">${txAssetOptsHtml(x.type, assets, tx ? x.assetId : null)}</select></label>
    <div id="txFields" class="full form" style="padding:0"></div>
    <label class="f full">Nota<input type="text" id="txNote" maxlength="200" value="${esc(x.note || '')}" placeholder="Opcional"></label>
    <div class="err full" id="txErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">${tx ? 'Guardar cambios' : 'Añadir'}</button></div>
  </form>`;
  openModal(html, (m) => {
    let type = x.type, fxAuto = null, upd = () => {};
    const KEEP = { txPrice: 'price', txAmt: '_amt', txQty: 'qty', txFees: 'fees', txFx: 'fx', txAmount: 'amount', txWh: 'withholding', txTo: 'toAssetId', txToQty: 'toQty', txRatio: 'ratio', txCash: '_cash' };
    const accs = cashList(); if (x._cash == null) x._cash = accs.length ? accs[0].id : '';
    const keep = () => { for (const [id, k] of Object.entries(KEEP)) { const el = $('#' + id); if (el) x[k] = el.value; } };
    const fxHintTxt = (ccy) => `€ por 1 ${esc(ccy)}${fxAuto ? ` · mercado ${ratio(fxAuto, 4)}` : ' · sin dato de mercado'}`;
    const heldTxt = () => `tienes ${numf(qtyAt($('#txAsset').value, $('#txDate').value || todayStr(), tx && tx.id), 6)} en esa fecha`;
    // funds: «usar» takes the NAV of the chosen date (or the previous one) and warns when the price differs > 1 %
    const pxRef = () => { const a = assetById($('#txAsset').value); if (!a) return null; if (a.type === 'fund') { const n = navOn(a.id, $('#txDate').value || todayStr()); return n && { d: n.d, v: n.v, known: n.known, fund: true, a }; } const lp = lastPx(a.id); return lp && { d: lp[0], v: +lp[1], a }; };
    const pxHint = () => { const hh = $('#txPxHint'); if (!hh) return; const r = pxRef(); const ccy = r ? r.a.currency : 'EUR';
      hh.innerHTML = r ? ` · ${r.fund ? `VL del ${fdate(r.d, { year: undefined })} ${money(r.v, ccy, r.v >= 100 ? 2 : 4)}` : `último ${money(r.v, ccy, r.v >= 100 ? 2 : 4)} (${fdate(r.d, { year: undefined })})`} <button type="button" class="hint-btn" id="txUseLast">usar</button>` : '';
      const ul = $('#txUseLast'); if (ul) ul.addEventListener('click', (e) => { e.preventDefault(); $('#txPrice').value = String(r.v).replace('.', ','); upd({ target: $('#txPrice') }); pxHint(); });
      const nt = $('#txVlNote'); const p = parseNum($('#txPrice').value); const d = r && r.fund && r.known && p > 0 && !vlDayBefore(r.a.id, $('#txDate').value || todayStr(), p) ? r.v / p - 1 : 0;
      nt.hidden = !(Math.abs(d) > 0.01); if (!nt.hidden) nt.innerHTML = `<span class="chip warn">precio ≠ VL</span> El VL del ${fdate(r.d, { year: undefined })} fue ${money(r.v, ccy, 4)}: ${numf(p, 6)} difiere un ${pctS(d, 1)}. ${esc(r.a.broker || 'Tu banco')} ejecuta las órdenes a ese VL.`; };
    const onDate = () => { pxHint(); const a = assetById($('#txAsset').value); const ccy = a ? a.currency : 'EUR'; fxAuto = fxFor(ccy, $('#txDate').value); const h = $('#txFxHint'); if (h) h.innerHTML = fxHintTxt(ccy); const f = $('#txFx'); if (f) f.placeholder = fxAuto ? String(+fxAuto.toFixed(4)).replace('.', ',') : 'p. ej. 0,92'; const hh = $('#txHeld'); if (hh) hh.textContent = heldTxt(); const dh = $('#txDateHint'); if (dh) dh.hidden = $('#txDate').value !== todayStr(); upd(); };
    const fields = () => {
      keep();
      const a = assetById($('#txAsset').value); const ccy = a ? a.currency : 'EUR'; const date = $('#txDate').value;
      fxAuto = fxFor(ccy, date);
      const fxField = ccy !== 'EUR' ? `<label class="f">Tipo de cambio <span class="hint" id="txFxHint">${fxHintTxt(ccy)}</span><input type="text" inputmode="decimal" autocomplete="off" id="txFx" value="${esc(x.fx ?? '')}" placeholder="${fxAuto ? String(+fxAuto.toFixed(4)).replace('.', ',') : 'p. ej. 0,92'}"></label>` : '';
      let h = '';
      if (type === 'buy' || type === 'sell') { h = `<label class="f">Precio por unidad <span class="hint">en ${esc(ccy)}<span id="txPxHint"></span></span><input type="text" inputmode="decimal" autocomplete="off" id="txPrice" value="${esc(x.price ?? '')}" required></label><label class="f">Importe <span class="hint">€ ${type === 'buy' ? 'invertidos' : 'recibidos'} · opcional, calcula la cantidad</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmt" value="${esc(x._amt ?? '')}" placeholder="p. ej. 300"></label><label class="f half">Cantidad<input type="text" inputmode="decimal" autocomplete="off" id="txQty" value="${esc(x.qty ?? '')}" required></label><label class="f half">Comisión total <span class="hint">en €</span><input type="text" inputmode="decimal" autocomplete="off" id="txFees" value="${esc(x.fees ?? '')}" placeholder="0"></label>${fxField}<div class="small muted full" id="txTotal"></div><div class="small full" id="txVlNote" hidden></div>${type === 'sell' && !tx && accs.length ? `<label class="f full">Ingresar el neto en <span class="hint">crea el ingreso en Efectivo con el importe exacto de la venta</span><select id="txCash"><option value="">No, lo apunto yo</option>${accs.map((c) => `<option value="${esc(c.id)}" ${c.id === x._cash ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}`; }
      else if (type === 'dividend') h = `<label class="f half">Importe bruto <span class="hint">en ${esc(ccy)}</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmount" value="${esc(x.amount ?? '')}" required></label><label class="f half">Retención <span class="hint">en ${esc(ccy)}</span><input type="text" inputmode="decimal" autocomplete="off" id="txWh" value="${esc(x.withholding ?? '')}" placeholder="0"></label>${fxField}`;
      else if (type === 'interest') h = `<label class="f half">Importe bruto <span class="hint">en €</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmount" value="${esc(x.amount ?? '')}" required></label><label class="f half">Retención <span class="hint">en € (19 % habitual)</span><input type="text" inputmode="decimal" autocomplete="off" id="txWh" value="${esc(x.withholding ?? '')}" placeholder="0"></label>`;
      else if (type === 'fee') h = `<label class="f">Importe <span class="hint">en € (custodia, conectividad…)</span><input type="text" inputmode="decimal" autocomplete="off" id="txAmount" value="${esc(x.amount ?? '')}" required></label>`;
      else if (type === 'transfer') { const dst = txFundDest(assets, $('#txAsset').value, tx && tx.toAssetId); h = !$('#txAsset').value ? '<p class="err full">No tienes fondos de inversión con participaciones. El traspaso solo es entre fondos; para otros activos registra una venta y una compra.</p>' : `<label class="f">Participaciones que salen <span class="hint" id="txHeld">${heldTxt()}</span><input type="text" inputmode="decimal" autocomplete="off" id="txQty" value="${esc(x.qty ?? '')}" required></label><label class="f">Fondo destino<select id="txTo">${dst.length ? dst.map((z) => `<option value="${esc(z.id)}" ${z.id === x.toAssetId ? 'selected' : ''}>${esc(z.ticker || z.name)}</option>`).join('') : '<option value="">— Sin otros fondos —</option>'}</select></label><label class="f">Participaciones que entran<input type="text" inputmode="decimal" autocomplete="off" id="txToQty" value="${esc(x.toQty ?? '')}" required></label><p class="note full">Un traspaso entre fondos no tributa: el coste y la antigüedad de tus participaciones pasan al fondo destino. Si el destino aún no existe, créalo antes en Ajustes.</p>`; }
      else if (type === 'split') h = `<label class="f">Proporción <span class="hint">unidades nuevas por cada una antigua (split 4×1 = 4; contrasplit 1×10 = 0,1)</span><input type="text" inputmode="decimal" autocomplete="off" id="txRatio" value="${esc(x.ratio ?? '')}" required></label>`;
      $('#txFields').innerHTML = h;
      upd = (ev) => {
        const t2 = $('#txTotal'); if (!t2) return;
        const p = parseNum($('#txPrice').value), fe = parseNum($('#txFees').value) || 0, fx = parseNum($('#txFx') ? $('#txFx').value : '') || fxAuto || 1, amt = parseNum($('#txAmt').value);
        const src = ev && ev.target && ev.target.id;
        if (ccy !== 'EUR' && !fxAuto && !(parseNum($('#txFx') ? $('#txFx').value : '') > 0)) { t2.innerHTML = `<span class="err">Sin tipo de cambio de mercado para ${esc(ccy)} en esa fecha: escribe cuántos € vale 1 ${esc(ccy)}.</span>`; return; }
        if (src === 'txQty') $('#txAmt').value = '';
        else if (amt > 0 && p > 0) { const q0 = (type === 'buy' ? amt - fe : amt + fe) / (p * fx); if (q0 > 0) $('#txQty').value = String(+q0.toFixed(8)).replace('.', ','); }
        const q = parseNum($('#txQty').value);
        if (q > 0 && p > 0) t2.textContent = `${type === 'buy' ? 'Total a pagar' : 'Total a recibir'}: ${eur(type === 'buy' ? q * p * fx + fe : q * p * fx - fe)}${amt > 0 ? ' · cantidad calculada a partir del importe' : ''}${type === 'sell' ? (() => { const pos = res.positions.find((z) => z.assetId === $('#txAsset').value && z.open); if (!pos) return ''; const y = todayStr().slice(0, 4); const b0 = res.fiscal[y] ? fiscalCalc(y).base : 0; const qq = Math.min(q, pos.qty); const g = q * p * fx - fe - fifoCost(pos.lots, qq); const tx2 = Math.max(0, cuota(b0 + g + deferredRelease(pos, qq)) - cuota(b0)); return ` · ganancia ${eurS(g, 0)}, IRPF ≈ ${eur(tx2, 0)} en la Renta`; })() : ''}`; else t2.textContent = '';
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return (err.textContent = 'Indica la fecha.');
      if (o.date > todayStr()) return (err.textContent = 'La fecha no puede ser futura.');
      if (o.date < '1990-01-01') return (err.textContent = 'La fecha debe ser de 1990 o posterior.');
      const amb = $$('#txFields input').find((el) => /^\d{1,3}(\.\d{3})+$/.test(el.value.trim())); if (amb) { const v = amb.value.trim(); return (err.textContent = `«${v}» es ambiguo: escribe ${v.replace(/\./g, '')} si son miles o ${v.replace('.', ',')} si son decimales (los decimales van con coma).`); }
      const bad = $$('#txFields input').find((el) => el.value.trim() && !Number.isFinite(parseNum(el.value))); if (bad) return (err.textContent = `«${bad.value.trim()}» no es un número válido.`);
      if (type === 'buy' || type === 'sell') { o.qty = v('txQty'); o.price = v('txPrice'); o.fees = v('txFees') || 0; const f = v('txFx'); if (f > 0) o.fx = f; if (!(o.price > 0)) return (err.textContent = 'Falta el precio: toca «usar» para poner el último valor liquidativo.'); if (!(o.qty > 0)) return (err.textContent = 'Indica la cantidad o el importe.'); if (!(o.price >= 0)) return (err.textContent = 'Indica el precio.'); if (o.fees < 0) return (err.textContent = 'La comisión no puede ser negativa.'); if (!o.assetId) return (err.textContent = 'Elige un activo.');
        const lp = assetById(o.assetId) ? lastPx(o.assetId) : null; const pk = `${o.assetId}|${o.price}`;
        if (lp && lp[1] > 0 && o.date >= E.addDays(lp[0], -10) && !(tx && +tx.price === o.price) && Math.abs(o.price / lp[1] - 1) > 0.2 && x._pxOk !== pk) { x._pxOk = pk; return (err.textContent = `El precio se aleja más de un 20 % del último conocido (${numf(lp[1], 4)} el ${fdate(lp[0])}). Si es correcto, pulsa otra vez para guardar.`); }
        if (type === 'sell') { const held = qtyAt(o.assetId, o.date, tx && tx.id); if (o.qty > held + 1e-6) return (err.textContent = `En esa fecha solo tenías ${numf(Math.max(0, held), 6)} unidades de este activo.`); } }
      else if (type === 'dividend') { o.amount = v('txAmount'); o.withholding = v('txWh') || 0; const f = v('txFx'); if (f > 0) o.fx = f; if (!(o.amount > 0)) return (err.textContent = 'Indica el importe bruto.'); if (!o.assetId) return (err.textContent = 'Elige un activo.'); }
      else if (type === 'interest') { o.amount = v('txAmount'); o.withholding = v('txWh') || 0; if (!(o.amount > 0)) return (err.textContent = 'Indica el importe.'); }
      else if (type === 'fee') { o.amount = v('txAmount'); if (!(o.amount > 0)) return (err.textContent = 'Indica el importe.'); }
      else if (type === 'transfer') { o.qty = v('txQty'); o.toAssetId = $('#txTo') ? $('#txTo').value : ''; o.toQty = v('txToQty'); const fa = assetById(o.assetId), fb = assetById(o.toAssetId); if (!o.assetId || !o.toAssetId) return (err.textContent = 'Elige el fondo origen y el destino.'); if (!fa || !fb || fa.type !== 'fund' || fb.type !== 'fund' || o.assetId === o.toAssetId) return (err.textContent = 'El traspaso solo puede ser entre dos fondos de inversión distintos.'); if (!(o.qty > 0) || !(o.toQty > 0)) return (err.textContent = 'Indica las participaciones que salen y las que entran.'); const held = qtyAt(o.assetId, o.date, tx && tx.id); if (o.qty > held + 1e-6) return (err.textContent = `En esa fecha solo tenías ${numf(Math.max(0, held), 6)} participaciones del fondo origen.`); }
      else if (type === 'split') { o.ratio = v('txRatio'); if (!(o.ratio > 0)) return (err.textContent = 'Indica la proporción.'); if (!o.assetId) return (err.textContent = 'Elige un activo.'); }
      if (o.withholding < 0) return (err.textContent = 'La retención no puede ser negativa.');
      if (o.withholding > o.amount) return (err.textContent = 'La retención no puede ser mayor que el importe bruto.');
      const fa = assetById(o.assetId); if ((type === 'buy' || type === 'sell' || type === 'dividend') && fa && fa.currency !== 'EUR' && !(o.fx > 0) && !fxFor(fa.currency, o.date)) return (err.textContent = `Indica el tipo de cambio (€ por 1 ${fa.currency}): no hay dato de mercado para esa fecha.`);
      const ids = [o.assetId, o.toAssetId, tx && tx.assetId, tx && tx.toAssetId].filter(Boolean); if (ids.length && !unbackedSell(ids)) { const u = unbackedSell(ids, tx && tx.id, o); if (u) return (err.textContent = `Así quedaría sin respaldo la ${u.type === 'transfer' ? 'salida por traspaso' : 'venta'} de ${(assetById(u.assetId) || {}).ticker || ''} del ${fdate(u.date)}: en esa fecha no habría suficientes unidades.`); }
      { x._warnOk = x._warnOk || []; const w = txSoftWarn(o, tx, v('txAmt')).find((z) => !x._warnOk.includes(z.k)); if (w) { x._warnOk.push(w.k); err.innerHTML = `${w.msg} <b>Si es correcto, pulsa otra vez para guardar.</b>`; err.scrollIntoView({ block: 'nearest' }); return; } }
      const id = tx ? tx.id : uid(); o.created = tx && tx.created ? tx.created : new Date().toISOString();
      const prev = tx && type === 'sell' && tx.cashMv && S.cash[tx.cashMv.acc] ? tx.cashMv : null;
      const acc = prev ? S.cash[prev.acc] : type === 'sell' && !tx && $('#txCash') ? S.cash[$('#txCash').value] : null; const fxS = o.fx || (fa && fa.currency !== 'EUR' ? fxFor(fa.currency, o.date) : 1) || 1;
      const net = acc ? +(o.qty * o.price * fxS - o.fees).toFixed(2) : 0; const mvId = acc && net > 0 ? (prev ? prev.mv : 'm' + uid().slice(0, 8)) : null;
      if (mvId) o.cashMv = { acc: acc.id, mv: mvId, a: net };
      try { let tid = null; if (tx && S.txs[id]) tid = await toTrash('tx', id, S.txs[id], 'edición'); await save('txs', id, o);
        let mvErr = null;
        if (mvId) { try { await addCashMove(acc, cashMoves(acc).filter((m) => m.id !== mvId).concat([{ id: mvId, d: o.date, a: net, t: 'in', n: `Venta ${(fa && (fa.ticker || fa.name)) || ''}`.trim() }]), mvId); } catch (e) { mvErr = e; if (!prev) { delete o.cashMv; await save('txs', id, o).catch(() => {}); } } }
        closeModal();
        if (mvErr) toast(`La venta se ha guardado, pero no el ingreso en ${acc.name}: apúntalo a mano en Efectivo.`, 8000);
        else toast(tx ? (prev ? `Operación actualizada y su ingreso en ${acc.name} pasa a ${eur(net)}.` : 'Operación actualizada.') : mvId ? `Venta añadida e ingreso de ${eur(net)} en ${acc.name}.` : 'Operación añadida.', 3200, tid ? { label: 'Deshacer', fn: () => restoreTrash(tid) } : null); }
      catch (e) { err.textContent = e.code === 'quota_exceeded' ? 'Se ha llenado la base de datos de la página (5.000 documentos).' : e.code === 'invalid_argument' ? 'No tienes permiso para guardar en esta página.' : 'No se pudo guardar: ' + (e.message || e.code); }
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
  openModal(`<div class="panel-h"><h2>¿Cuánto me queda si vendo?</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="ssForm" novalidate>
    <label class="f full">Qué vendes<select id="ssA"><option value="*"${pre === '*' ? ' selected' : ''}>Todas las posiciones (${eur(pos.reduce((t, p) => t + p.value, 0), 0)})</option>${pos.map((p) => `<option value="${esc(p.assetId)}"${(pre || (pos[0] && pos[0].assetId)) === p.assetId ? ' selected' : ''}>${esc(p.asset.name || p.asset.ticker)} · ${eur(p.value, 0)}</option>`).join('')}</select></label>
    <label class="f half">Importe bruto a vender <span class="hint">en €; vacío = todo</span><input type="text" inputmode="decimal" autocomplete="off" id="ssAmt" placeholder="todo"></label>
    <label class="f half">Comisión <span class="hint">en €</span><input type="text" inputmode="decimal" autocomplete="off" id="ssFee" value="0"></label>
    <div class="full" id="ssOut"></div>
    <p class="note full">Usa el último precio de cada fondo y el método FIFO, como Hacienda. El IRPF es la cuota extra sobre lo que ya llevas este año (${eur(base0, 0)} de base del ahorro) y se paga en la renta del año siguiente. Si traspasas a otro fondo en vez de vender, no pagas nada ahora.</p>
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
      $('#ssOut').innerHTML = `<div class="stats">${r('Vendes', eur(gross))}${fee ? r('Comisión', eurS(-fee)) : ''}${r('Llega a tu cuenta', eur(net), '', 1)}${r('Coste de lo vendido (FIFO)', eur(cost))}${r('Ganancia', eurS(gain), cls(gain))}${r('IRPF estimado', tax ? eurS(-tax) : '0 €')}${rel < -0.5 ? `<p class="small muted" style="margin:0">Ya cuenta ${eur(-rel)} de pérdidas diferidas que esta venta libera: te ahorran ${eur(Math.max(0, cuota(base0 + gain) - cuota(base0)) - tax)} de IRPF.</p>` : ''}${r('Te queda limpio', eur(left), '', 1)}${r('Efectivo después, ya pagado el IRPF', eur(cash + left))}${(() => { const gi = typeof goalInfo === 'function' && goalInfo(); return gi ? r(`Objetivo «${esc(gi.name)}»`, `${pct(Math.min(1, (gi.cash + net) / gi.amount), 0)} de ${eur(gi.amount, 0)}${gi.cu ? ' (sin el colchón)' : ''}`) : ''; })()}</div>${amtIn > tot + 0.5 ? `<p class="small muted">Solo tienes ${eur(tot, 0)} en lo elegido; se calcula con eso.</p>` : ''}`;
    };
    ['#ssA', '#ssAmt', '#ssFee'].forEach((id) => $(id).addEventListener('input', calc)); $('#ssA').addEventListener('change', calc);
    $('#ssForm').addEventListener('submit', (e) => e.preventDefault()); calc();
  });
}
function openAssetForm(a) {
  const x = Object.assign({ type: 'fund', currency: 'EUR', src: 'nav' }, a || {});
  const auto = x.src !== 'manual';
  const html = `<div class="panel-h"><h2>${a ? 'Editar activo' : 'Nuevo activo'}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="aForm" novalidate>
    <label class="f">Ticker<input type="text" id="aTicker" value="${esc(x.ticker || '')}" required placeholder="p. ej. VWCE"></label>
    <label class="f">Nombre<input type="text" id="aName" value="${esc(x.name || '')}" placeholder="p. ej. Vanguard FTSE All-World"></label>
    <label class="f">Tipo<select id="aType">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Divisa de cotización<select id="aCcy">${['EUR', 'USD', 'GBP', 'CHF'].map((c) => `<option ${x.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="f">ISIN <span class="hint" id="aIsinHint">opcional; sirve para importar de DeGiro</span><input type="text" id="aIsin" value="${esc(x.isin || '')}" placeholder="p. ej. IE00BK5BQT80"></label>
    <label class="f">Broker<input type="text" id="aBroker" list="brokers" value="${esc(x.broker || '')}" placeholder="p. ej. DeGiro"><datalist id="brokers"><option>DeGiro</option><option>Trade Republic</option><option>MyInvestor</option><option>Interactive Brokers</option></datalist></label>
    <label class="f">Etiqueta <span class="hint">región, sector…</span><input type="text" id="aTag" value="${esc(x.tag || '')}" placeholder="p. ej. Global"></label>
    <label class="f">Clase de activo<select id="aCls">${CLASSES.filter(([k]) => k !== 'cash').map(([k, l]) => `<option value="${k}" ${clsOf(x) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Tipo de bolsa <span class="hint">para «¿Qué tal está construida tu cartera?»</span><select id="aSub"><option value="">Automático (${esc(SUBS[subOf(Object.assign({}, x, { sub: null }))][0])})</option>${SUB_EQ.map((k) => `<option value="${k}" ${x.sub === k ? 'selected' : ''}>${SUBS[k][0]}</option>`).join('')}</select></label>
    ${(() => { const az = zonesOf(Object.assign({}, x, { zones: null })); const own = x.zones && typeof x.zones === 'object' ? x.zones : {}; return az || Object.keys(own).length ? `<fieldset class="f full zone-in" id="aZones"><legend>Zonas <span class="hint">% de cada región dentro del activo, para «¿En qué zonas está tu dinero?» · vacío = automático</span></legend><div class="zone-grid">${ZONES.map(([k, l]) => `<label class="f">${l}<input type="text" inputmode="decimal" data-zone="${k}" value="${own[k] != null && own[k] !== '' ? esc(String(+own[k]).replace('.', ',')) : ''}" placeholder="${az ? Math.round(az[k] * 100) : 0}"></label>`).join('')}</div></fieldset>` : ''; })()}
    <label class="f">Peso objetivo <span class="hint">% de la cartera</span><input type="text" inputmode="decimal" id="aTarget" value="${x.target != null && x.target !== '' ? esc(String(+(+x.target * 100).toFixed(4)).replace('.', ',')) : ''}" placeholder="p. ej. 20"></label>
    <label class="f">Precios<select id="aSrc"><option value="nav" ${x.src === 'nav' ? 'selected' : ''}>Fondo: valor liquidativo por ISIN</option><option value="auto" ${auto && x.src !== 'nav' ? 'selected' : ''}>Cotización automática (Claude)</option><option value="manual" ${x.src === 'manual' ? 'selected' : ''}>Manuales</option></select></label>
    <label class="f full" id="wA">Símbolo <span class="hint">ETF: el de Alpha Vantage, p. ej. SXR8.DEX · acciones y cripto: opcional</span><input type="text" id="aSymbol" value="${esc(x.symbol || '')}" placeholder="p. ej. SXR8.DEX"></label>
    <label class="f full" id="wQ">Página de finanzen.net <span class="hint">opcional · si la dejas vacía, Claude la busca</span><input type="text" id="aQuoteUrl" value="${esc(x.quoteUrl || '')}" placeholder="p. ej. https://www.finanzen.net/aktien/apple-aktie"></label>
    <label class="f">TER <span class="hint">opcional · comisión anual en %, para la ficha</span><input type="text" inputmode="decimal" id="aTer" value="${x.ter != null && x.ter !== '' ? esc(String(+(+x.ter * 100).toFixed(4)).replace('.', ',')) : ''}" placeholder="p. ej. 0,12"></label>
    <label class="f">Riesgo <span class="hint">opcional · indicador de 1 a 7</span><select id="aRisk"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7].map((k) => `<option ${+x.risk === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="f full">Categoría <span class="hint">opcional · p. ej. RV Global, Monetario</span><input type="text" id="aCatg" value="${esc(x.category || '')}" placeholder="p. ej. RV Global"></label>
    <div class="err full" id="aErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">${a ? 'Guardar' : 'Añadir activo'}</button></div>
  </form>`;
  openModal(html, (m) => {
    const syncSrc = () => {
      const on = $('#aSrc').value === 'auto'; $('#wA').hidden = !on; $('#wQ').hidden = !on; $('#aIsinHint').textContent = $('#aSrc').value === 'nav' ? 'obligatorio: Claude busca el valor liquidativo con él' : 'opcional; sirve para importar de DeGiro';
    };
    $('#aSrc').addEventListener('change', syncSrc);
    $('#aType').addEventListener('change', () => { if ($('#aType').value === 'crypto') { $('#aCls').value = 'cripto'; $('#aCcy').value = 'EUR'; } $('#aSrc').value = $('#aType').value === 'fund' ? 'nav' : $('#aSrc').value === 'nav' ? 'auto' : $('#aSrc').value; syncSrc(); });
    syncSrc();
    $('#aForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#aErr'); err.textContent = '';
      const o = { ticker: $('#aTicker').value.trim().toUpperCase(), name: $('#aName').value.trim(), type: $('#aType').value, currency: $('#aCcy').value, isin: $('#aIsin').value.trim().toUpperCase(), broker: $('#aBroker').value.trim(), tag: $('#aTag').value.trim(), cls: $('#aCls').value, src: $('#aSrc').value, ysym: x.ysym || '', symbol: $('#aSymbol').value.trim().toUpperCase(), quoteUrl: /^https:\/\/www\.finanzen\.net\//.test($('#aQuoteUrl').value.trim()) ? $('#aQuoteUrl').value.trim() : '' };
      const tg = parseNum($('#aTarget').value); o.target = tg >= 0 ? tg / 100 : null;
      const ter = parseNum($('#aTer').value); if ($('#aTer').value.trim() && !(ter >= 0 && ter <= 10)) return (err.textContent = 'El TER debe estar entre 0 y 10 %.');
      if (ter >= 0) o.ter = ter / 100; if (+$('#aRisk').value) o.risk = +$('#aRisk').value; if ($('#aCatg').value.trim()) o.category = $('#aCatg').value.trim(); o.sub = $('#aSub').value || null;
      { const zi = Array.from(document.querySelectorAll('#aZones [data-zone]')); if (zi.length) { const filled = zi.filter((i) => i.value.trim()); if (!filled.length) o.zones = null; else { const z = {}; for (const i of zi) { const v = i.value.trim() ? parseNum(i.value) : 0; if (!(v >= 0 && v <= 100)) return (err.textContent = 'Cada zona debe estar entre 0 y 100 %.'); if (v > 0) z[i.dataset.zone] = v; } const sum = Object.values(z).reduce((s, v) => s + v, 0); if (Math.abs(sum - 100) > 1) return (err.textContent = `Las zonas deben sumar 100 % (ahora suman ${String(+sum.toFixed(2)).replace('.', ',')} %).`); o.zones = z; } } }
      if (!o.ticker) return (err.textContent = 'Indica un ticker o nombre corto.');
      if ($('#aTarget').value.trim() && !(tg >= 0 && tg <= 100)) return (err.textContent = 'El peso objetivo debe estar entre 0 y 100 %.');
      const others = Object.values(S.assets).filter((z) => !a || z.id !== a.id); const dT = others.find((z) => String(z.ticker || '').toUpperCase() === o.ticker), dI = o.isin && others.find((z) => String(z.isin || '').toUpperCase() === o.isin);
      if (dT && (!o.name || o.name.toLowerCase() === String(dT.name || '').toLowerCase())) return (err.textContent = `Ya tienes otro activo con el ticker ${o.ticker}${dT.name && dT.name !== dT.ticker ? ` (${dT.name})` : ''}. Si es otro activo, ponle un nombre que los distinga.`);
      const dupKey = (dT ? 'T' + o.ticker : '') + (dI ? 'I' + o.isin : '');
      if (dupKey && $('#aForm').dataset.dupOk !== dupKey) { $('#aForm').dataset.dupOk = dupKey; return (err.textContent = dT ? `Ya tienes ${o.ticker}${dT.name && dT.name !== dT.ticker ? ` (${dT.name})` : ''}; ¿es otro activo? Pulsa de nuevo para guardarlo igualmente.` : `Ya tienes otro activo con el ISIN ${o.isin} (${dI.ticker || dI.name}); ¿es otro activo? Si es el mismo, edita ese. Pulsa de nuevo para guardarlo igualmente.`); }
      if (o.src === 'nav' && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(o.isin)) return (err.textContent = 'Para un fondo indica su ISIN (12 caracteres, p. ej. IE00B03HCZ61).');
      if (o.src === 'auto' && o.type === 'etf' && !o.symbol && !o.quoteUrl) return (err.textContent = 'Para un ETF indica el símbolo de Alpha Vantage (p. ej. SXR8.DEX) o la página de finanzen.net, o elige precios manuales.');
      const id = a ? a.id : (o.ticker.replace(/[^A-Z0-9]/g, '').toLowerCase().slice(0, 12) || 'a') + '-' + uid().slice(0, 6);
      o.order = a && a.order != null ? a.order : Date.now();
      const first = !a && !Object.keys(S.assets).length;
      try { await save('assets', id, o); closeModal(); toast(a ? 'Activo actualizado.' : 'Activo añadido. Ahora registra tus compras.', 3200, first ? { label: 'Registrar compra', fn: () => openTxForm(null, id) } : null); if (mcp && o.src !== 'manual' && (!a || a.isin !== o.isin || a.symbol !== o.symbol || a.quoteUrl !== o.quoteUrl)) setTimeout(() => refreshCloud({ silent: true, force: true }), 600); }
      catch (e) { err.textContent = e.code === 'invalid_argument' ? 'No tienes permiso para guardar en esta página.' : 'No se pudo guardar: ' + (e.message || e.code); }
    });
  });
}

function openPriceForm(assetId) {
  if (DEMO) { toast('La cartera de ejemplo no se puede editar.'); return; }
  const a = assetById(assetId); if (!a) return;
  const h = S.history[a.id]; const pts = (h && h.points) || [];
  const html = `<div class="panel-h"><h2>Precio de ${esc(a.ticker || a.name)}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <p class="note">${isAuto(a) || a.src === 'nav' ? 'Este activo tiene precio automático: si la actualización trae precio de ese mismo día, manda el automático.' : ''}</p>
  <form class="form" id="pForm" novalidate>
    <label class="f">Fecha<input type="date" id="pDate" value="${todayStr()}"></label>
    <label class="f">Precio <span class="hint">en ${esc(a.currency)}</span><input type="text" inputmode="decimal" autocomplete="off" id="pVal" required></label>
    <div class="err full" id="pErr"></div>
    <div class="form-actions full"><button class="btn primary" type="submit">Guardar precio</button></div>
  </form>
  ${pts.length ? `<div class="tbl-wrap" style="max-height:240px;overflow:auto"><table><thead><tr><th>Fecha</th><th class="n">Precio</th><th></th></tr></thead><tbody>${pts.slice(-30).reverse().map((p) => `<tr><td class="num">${fdate(p[0])}</td><td class="n">${money(p[1], a.currency, 4)}</td><td><button class="btn ghost small danger" type="button" data-delpt="${esc(p[0])}">Quitar</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  openModal(html, (m) => {
    $('#pForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const d = $('#pDate').value, v = parseNum($('#pVal').value);
      if (!(v > 0) || !d) return ($('#pErr').textContent = 'Indica fecha y precio.');
      const cur = S.history[a.id] || {};
      await save('history', a.id, Object.assign({}, cur, { points: mergePts(cur.points, [[d, v]]), source: cur.source || 'manual', symbol: cur.symbol || null, manualUpdated: todayStr() }));
      closeModal(); toast('Precio guardado.');
    });
    $$('[data-delpt]', m).forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Seguro?'; return; }
      const cur = S.history[a.id]; const tid = await toTrash('history', a.id, cur, 'precio quitado'); await save('history', a.id, Object.assign({}, cur, { points: cur.points.filter((p) => p[0] !== b.dataset.delpt) })); closeModal(); openPriceForm(a.id);
      if (tid) toast(`Precio del ${fdate(b.dataset.delpt)} quitado.`, 7000, { label: 'Deshacer', fn: async () => { await restoreTrash(tid); await sleep(300); if ($('#pForm')) { closeModal(); openPriceForm(a.id); } } });
    }));
  });
}

