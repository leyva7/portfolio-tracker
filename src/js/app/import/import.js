/* ---------- Import / export ---------- */
const TYPE_ALIAS = { compra: 'buy', buy: 'buy', c: 'buy', venta: 'sell', sell: 'sell', v: 'sell', dividendo: 'dividend', dividend: 'dividend', div: 'dividend', interes: 'interest', 'interés': 'interest', interest: 'interest', comision: 'fee', 'comisión': 'fee', fee: 'fee', split: 'split', desdoblamiento: 'split', traspaso: 'transfer', transfer: 'transfer' };
function normDate(s) { s = String(s || '').trim(); let m, r = null; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) r = `${m[1]}-${m[2]}-${m[3]}`; else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) r = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (!r) return null; const t = new Date(r + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === r ? r : null; }
/** Same operation already stored? date|type|asset|qty|price|amount */
const txKey = (x) => [x.date, x.type, x.assetId || '', ...[x.qty, x.price, x.amount].map((v) => (v == null || v === '' || !Number.isFinite(+v) ? '' : String(+(+v).toFixed(6))))].join('|');
function parseImport(text) {
  const rows = csvRows(text); if (rows.length < 2) throw new Error('El archivo está vacío.');
  const h = rows[0].map((x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
  const assets = assetList(); const byTicker = new Map(assets.map((a) => [String(a.ticker).toUpperCase(), a])); const byIsin = new Map(assets.filter((a) => a.isin).map((a) => [a.isin, a]));
  const newAssets = new Map(); const txs = []; const errors = [];
  // A file whose numbers use '.' as decimal mark (and never ',') reads «1.234» as 1,234, not as thousands
  const dotDec = !rows.slice(1).some((r) => r.some((v) => /^-?\d+,\d+$/.test(String(v).trim()))) && rows.slice(1).some((r) => r.some((v) => /^-?\d+\.\d+$/.test(String(v).trim())));
  const parseNum = (v) => (dotDec && /^-?\d+\.\d+$/.test(String(v == null ? '' : v).trim()) ? parseFloat(String(v).trim()) : parseNumG(v));
  const isDegiro = h.includes('isin') && (h.includes('numero') || h.includes('number')) && h.includes('producto');
  if (isDegiro) {
    const iF = h.indexOf('fecha'), iP = h.indexOf('producto'), iI = h.indexOf('isin'), iN = h.indexOf('numero') >= 0 ? h.indexOf('numero') : h.indexOf('number'), iPr = h.indexOf('precio'), iFx = h.findIndex((x) => x.startsWith('tipo de cambio')), iC = h.findIndex((x) => x.startsWith('costes') || x.startsWith('comision'));
    rows.slice(1).forEach((r, k) => {
      const d = normDate(r[iF]); const q = parseNum(r[iN]); const pr = parseNum(r[iPr]); const ccy = (r[iPr + 1] || 'EUR').toUpperCase(); const isin = (r[iI] || '').toUpperCase();
      if (!d || !(Math.abs(q) > 0) || !(pr > 0) || !isin) { errors.push(`Fila ${k + 2}: incompleta`); return; }
      if (d > todayStr()) { errors.push(`Fila ${k + 2}: fecha futura`); return; }
      let a = byIsin.get(isin) || newAssets.get(isin);
      if (!a) { a = { id: 'i' + isin.toLowerCase() + '-' + uid().slice(0, 4), ticker: isin, name: r[iP], isin, type: 'etf', currency: ccy, src: 'manual', broker: 'DeGiro', order: Date.now() + newAssets.size, _new: true }; newAssets.set(isin, a); }
      const fxr = parseNum(r[iFx]); const fees = Math.abs(parseNum(r[iC])) || 0;
      const o = { type: q > 0 ? 'buy' : 'sell', date: d, assetId: a.id, qty: Math.abs(q), price: pr, fees, note: 'Importado de DeGiro' };
      if (ccy !== 'EUR' && fxr > 0) o.fx = 1 / fxr;
      txs.push(o);
    });
    return { txs, newAssets: Array.from(newAssets.values()), errors, source: 'DeGiro' };
  }
  const col = (...names) => h.findIndex((x) => names.includes(x));
  const c = { date: col('fecha', 'date'), type: col('tipo', 'type', 'operacion'), ticker: col('ticker', 'activo', 'symbol', 'simbolo'), qty: col('cantidad', 'qty', 'quantity', 'unidades', 'titulos'), price: col('precio', 'price'), fees: col('comision', 'comisiones', 'fees', 'fee'), fx: col('fx', 'tipo de cambio', 'cambio'), amount: col('importe', 'amount'), wh: col('retencion', 'withholding'), ratio: col('ratio', 'proporcion'), note: col('nota', 'note', 'notas'), dest: col('destino', 'to', 'destination'), toQty: col('cantidad_destino', 'cantidad destino', 'to_qty', 'toqty'), isin: col('isin') };
  const mkAsset = (tk) => { const a = { id: tk.replace(/[^A-Z0-9]/g, '').toLowerCase().slice(0, 12) + '-' + uid().slice(0, 6), ticker: tk, name: tk, type: 'etf', currency: 'EUR', src: 'manual', order: Date.now() + newAssets.size, _new: true }; newAssets.set(tk, a); return a; };
  if (c.date < 0 || c.type < 0) throw new Error('Faltan columnas: se necesitan al menos "fecha" y "tipo".');
  rows.slice(1).forEach((r, k) => {
    const d = normDate(r[c.date]); const t = TYPE_ALIAS[String(r[c.type] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] || TYPE_ALIAS[String(r[c.type] || '').toLowerCase()];
    if (!d || !t) { errors.push(`Fila ${k + 2}: fecha o tipo no válidos`); return; }
    if (d > todayStr()) { errors.push(`Fila ${k + 2}: fecha futura`); return; }
    const tk = c.ticker >= 0 ? String(r[c.ticker] || '').trim().toUpperCase() : '';
    const isn = c.isin >= 0 ? String(r[c.isin] || '').trim().toUpperCase() : '';
    let a = (isn && byIsin.get(isn)) || (tk ? byTicker.get(tk) || newAssets.get(tk) : null);
    if (tk && !a) a = mkAsset(tk);
    if (!a && t !== 'interest' && t !== 'fee') { errors.push(`Fila ${k + 2}: falta el activo`); return; }
    const g = (i) => (i >= 0 ? parseNum(r[i]) : NaN);
    const o = { type: t, date: d, assetId: a ? a.id : null, note: c.note >= 0 ? r[c.note] || '' : '' };
    if (t === 'buy' || t === 'sell') { o.qty = Math.abs(g(c.qty)); o.price = g(c.price); o.fees = Math.abs(g(c.fees)) || 0; if (g(c.fx) > 0) o.fx = g(c.fx); if (!(o.qty > 0) || !(o.price >= 0)) { errors.push(`Fila ${k + 2}: cantidad o precio no válidos`); return; } }
    else if (t === 'split') { o.ratio = g(c.ratio); if (!(o.ratio > 0)) { errors.push(`Fila ${k + 2}: ratio no válido`); return; } }
    else if (t === 'transfer') { o.qty = Math.abs(g(c.qty)); o.toQty = Math.abs(g(c.toQty)); const dk = c.dest >= 0 ? String(r[c.dest] || '').trim().toUpperCase() : ''; if (!dk || !(o.qty > 0) || !(o.toQty > 0)) { errors.push(`Fila ${k + 2}: traspaso sin destino o sin cantidades`); return; } o.toAssetId = (byTicker.get(dk) || newAssets.get(dk) || mkAsset(dk)).id; }
    else { o.amount = Math.abs(g(c.amount)); o.withholding = Math.abs(g(c.wh)) || 0; if (g(c.fx) > 0) o.fx = g(c.fx); if (!(o.amount > 0)) { errors.push(`Fila ${k + 2}: importe no válido`); return; } }
    txs.push(o);
  });
  // a sale can't exceed what you held that day (existing operations plus the earlier rows of this file)
  const kept = []; const byDate = txs.map((o, i) => [o, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1]));
  for (const [o] of byDate) {
    if (o.type === 'sell' && o.assetId) { const held = qtyAt(o.assetId, o.date) + kept.filter((z) => z.assetId === o.assetId).reduce((t, z) => t + (z.type === 'buy' ? z.qty : z.type === 'sell' ? -z.qty : 0), 0);
      if (o.qty > held + 1e-6) { const a = assetById(o.assetId) || newAssets.get(o.assetId) || {}; errors.push(`Venta del ${fdate(o.date)} de ${numf(o.qty, 6)} ${a.ticker || ''}: ese día solo tenías ${numf(Math.max(0, held), 6)}. No se importa.`); continue; } }
    kept.push(o);
  }
  return { txs: kept, newAssets: Array.from(newAssets.values()).filter((a) => kept.some((o) => o.assetId === a.id)), errors, source: 'CSV' };
}
function openImport() {
  if (DEMO && dbState === 'ready') { /* allowed: import ends demo */ }
  const html = `<div class="panel-h"><h2>Importar operaciones</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <p class="note">Acepta el CSV de <b>Transacciones de DeGiro</b> (Actividad → Transacciones → Exportar CSV) o un CSV propio con estas columnas (separador coma o punto y coma):</p>
  <pre class="small" style="background:var(--surface-2);padding:10px;border-radius:8px;overflow-x:auto;margin:0">fecha;tipo;ticker;cantidad;precio;comision;fx;importe;retencion;ratio;nota
2025-01-15;compra;VWCE;10;112,40;2;;;;;
2025-03-20;dividendo;MSFT;;;;0,92;7,50;1,13;;
2025-06-30;interes;;;;;;25,00;4,75;;Trade Republic</pre>
  <p class="note">Traspasos: tipo «traspaso» con las columnas <b>destino</b> (ticker) y <b>cantidad_destino</b>. Las operaciones que ya tienes (misma fecha, tipo, activo, cantidad, precio e importe) se omiten.</p>
  <p class="note">Para <b>cuadrar con MyInvestor</b>, elige uno o varios CSV «Plusvalías y minusvalías» (uno por fondo): no se importa nada, se comparan sus lotes con los tuyos.</p>
  <label class="btn" for="impFile" style="align-self:flex-start;cursor:pointer">Elegir archivo…</label><input type="file" id="impFile" accept=".csv,text/csv,text/plain" multiple hidden>
  <div id="impPrev"></div>`;
  openModal(html, () => {
    $('#impFile').addEventListener('change', async (ev) => {
      const f = ev.target.files[0]; if (!f) return; const text = await f.text();
      if (isMyInvestorPL(text)) { const fs = Array.from(ev.target.files); ev.target.value = ''; return openReconcile(fs); }
      let r; try { r = parseImport(text); } catch (e) { $('#impPrev').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      ev.target.value = '';
      const have = new Set(Object.values(S.txs).map(txKey)); const fresh = [], dups = [];
      for (const o of r.txs) { const k = txKey(o); if (have.has(k)) dups.push(o); else { have.add(k); fresh.push(o); } }
      $('#impPrev').innerHTML = `<div class="panel" style="padding:12px"><b>${r.txs.length} operaciones</b> leídas de ${esc(r.source)}${dups.length ? `. <b>${dups.length} ya existen, se omitirán</b>; se importarán ${fresh.length}` : ''}${r.newAssets.length ? `, y <b>${r.newAssets.length} activos nuevos</b> (${r.newAssets.map((a) => esc(a.name)).slice(0, 6).join(', ')}${r.newAssets.length > 6 ? '…' : ''}) que se crearán con precio manual: <b>revisa que no sea una errata</b> y después, en Ajustes, asígnales tipo, divisa e ISIN o símbolo` : ''}.${r.errors.length ? `<div class="err" style="margin-top:6px">${r.errors.length} filas ignoradas: ${esc(r.errors.slice(0, 4).join(' · '))}${r.errors.length > 4 ? '…' : ''}</div>` : ''}
      ${dups.length ? `<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="impDup"> Importar también las ${dups.length} repetidas</label>` : ''}
      <div class="form-actions" style="margin-top:10px"><button class="btn primary" type="button" id="impGo" ${r.txs.length ? '' : 'disabled'}>Importar</button></div></div>`;
      const sync = () => { const n = $('#impDup') && $('#impDup').checked ? r.txs.length : fresh.length; $('#impGo').disabled = !n; $('#impGo').textContent = n ? `Importar ${n}` : 'Nada nuevo que importar'; }; sync();
      $('#impDup') && $('#impDup').addEventListener('change', sync);
      $('#impGo') && $('#impGo').addEventListener('click', async () => {
        const btn = $('#impGo'); btn.disabled = true; btn.textContent = 'Importando…';
        const list = $('#impDup') && $('#impDup').checked ? r.txs : fresh; const importId = 'imp-' + new Date().toISOString().slice(0, 10) + '-' + uid().slice(0, 6);
        const used = new Set(list.flatMap((o) => [o.assetId, o.toAssetId]));
        try {
          await maybeSnapshot(true); // copy first, so the import can also be undone from Copias
          const newIds = []; for (const a of r.newAssets) { if (!used.has(a.id)) continue; const { id, _new, ...o } = a; await save('assets', id, o); newIds.push(id); }
          let i = 0; for (const o of list) { o.created = new Date().toISOString(); o.importId = importId; await save('txs', uid(), o); if (++i % 20 === 0) btn.textContent = `Importando… ${i}/${list.length}`; }
          closeModal(); toast(`${list.length} ${list.length === 1 ? 'operación importada' : 'operaciones importadas'}${list.length < r.txs.length ? ` (${r.txs.length - list.length} repetidas omitidas)` : ''}.`, 12000, { label: 'Deshacer importación', fn: () => undoImport(importId, newIds) });
        } catch (e) { btn.textContent = 'Error'; $('#impPrev').insertAdjacentHTML('beforeend', `<p class="err">${esc(e.code === 'quota_exceeded' ? 'Base de datos llena (5.000 documentos).' : e.message || e.code)}</p>`); }
      });
    });
  });
}
