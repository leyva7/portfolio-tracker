/* ---------- Import / export ----------
 * Column names and type aliases also accept Spanish (fecha, tipo, compra, venta…) because DeGiro and MyInvestor export Spanish CSVs. */
const TYPE_ALIAS = { compra: 'buy', buy: 'buy', c: 'buy', venta: 'sell', sell: 'sell', v: 'sell', dividendo: 'dividend', dividend: 'dividend', div: 'dividend', interes: 'interest', 'interés': 'interest', interest: 'interest', comision: 'fee', 'comisión': 'fee', fee: 'fee', split: 'split', desdoblamiento: 'split', traspaso: 'transfer', transfer: 'transfer' };
function normDate(s) { s = String(s || '').trim(); let m, r = null; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) r = `${m[1]}-${m[2]}-${m[3]}`; else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) r = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (!r) return null; const t = new Date(r + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === r ? r : null; }
/** Same operation already stored? date|type|asset|qty|price|amount */
const txKey = (x) => [x.date, x.type, x.assetId || '', ...[x.qty, x.price, x.amount].map((v) => (v == null || v === '' || !Number.isFinite(+v) ? '' : String(+(+v).toFixed(6))))].join('|');
function parseImport(text) {
  const rows = csvRows(text); if (rows.length < 2) throw new Error('The file is empty.');
  const h = rows[0].map((x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
  const assets = assetList(); const byTicker = new Map(assets.map((a) => [String(a.ticker).toUpperCase(), a])); const byIsin = new Map(assets.filter((a) => a.isin).map((a) => [a.isin, a]));
  const newAssets = new Map(); const txs = []; const errors = [];
  // A file whose numbers use '.' as decimal mark (and never ',') reads "1.234" as 1.234, not as thousands
  const dotDec = !rows.slice(1).some((r) => r.some((v) => /^-?\d+,\d+$/.test(String(v).trim()))) && rows.slice(1).some((r) => r.some((v) => /^-?\d+\.\d+$/.test(String(v).trim())));
  const parseNum = (v) => (dotDec && /^-?\d+\.\d+$/.test(String(v == null ? '' : v).trim()) ? parseFloat(String(v).trim()) : parseNumG(v));
  const isDegiro = h.includes('isin') && (h.includes('numero') || h.includes('number')) && h.includes('producto');
  if (isDegiro) {
    const iF = h.indexOf('fecha'), iP = h.indexOf('producto'), iI = h.indexOf('isin'), iN = h.indexOf('numero') >= 0 ? h.indexOf('numero') : h.indexOf('number'), iPr = h.indexOf('precio'), iFx = h.findIndex((x) => x.startsWith('tipo de cambio')), iC = h.findIndex((x) => x.startsWith('costes') || x.startsWith('comision'));
    rows.slice(1).forEach((r, k) => {
      const d = normDate(r[iF]); const q = parseNum(r[iN]); const pr = parseNum(r[iPr]); const ccy = (r[iPr + 1] || 'EUR').toUpperCase(); const isin = (r[iI] || '').toUpperCase();
      if (!d || !(Math.abs(q) > 0) || !(pr > 0) || !isin) { errors.push(`Row ${k + 2}: incomplete`); return; }
      if (d > todayStr()) { errors.push(`Row ${k + 2}: future date`); return; }
      let a = byIsin.get(isin) || newAssets.get(isin);
      if (!a) { a = { id: 'i' + isin.toLowerCase() + '-' + uid().slice(0, 4), ticker: isin, name: r[iP], isin, type: 'etf', currency: ccy, src: 'manual', broker: 'DeGiro', order: Date.now() + newAssets.size, _new: true }; newAssets.set(isin, a); }
      const fxr = parseNum(r[iFx]); const fees = Math.abs(parseNum(r[iC])) || 0;
      const o = { type: q > 0 ? 'buy' : 'sell', date: d, assetId: a.id, qty: Math.abs(q), price: pr, fees, note: 'Imported from DeGiro' };
      if (ccy !== 'EUR' && fxr > 0) o.fx = 1 / fxr;
      txs.push(o);
    });
    return { txs, newAssets: Array.from(newAssets.values()), errors, source: 'DeGiro' };
  }
  const col = (...names) => h.findIndex((x) => names.includes(x));
  const c = { date: col('fecha', 'date'), type: col('tipo', 'type', 'operacion'), ticker: col('ticker', 'activo', 'symbol', 'simbolo'), qty: col('cantidad', 'qty', 'quantity', 'unidades', 'titulos'), price: col('precio', 'price'), fees: col('comision', 'comisiones', 'fees', 'fee'), fx: col('fx', 'tipo de cambio', 'cambio'), amount: col('importe', 'amount'), wh: col('retencion', 'withholding'), ratio: col('ratio', 'proporcion'), note: col('nota', 'note', 'notas'), dest: col('destino', 'to', 'destination'), toQty: col('cantidad_destino', 'cantidad destino', 'to_qty', 'toqty'), isin: col('isin') };
  const mkAsset = (tk) => { const a = { id: tk.replace(/[^A-Z0-9]/g, '').toLowerCase().slice(0, 12) + '-' + uid().slice(0, 6), ticker: tk, name: tk, type: 'etf', currency: 'EUR', src: 'manual', order: Date.now() + newAssets.size, _new: true }; newAssets.set(tk, a); return a; };
  if (c.date < 0 || c.type < 0) throw new Error('Missing columns: at least "date" and "type" are needed.');
  rows.slice(1).forEach((r, k) => {
    const d = normDate(r[c.date]); const t = TYPE_ALIAS[String(r[c.type] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] || TYPE_ALIAS[String(r[c.type] || '').toLowerCase()];
    if (!d || !t) { errors.push(`Row ${k + 2}: invalid date or type`); return; }
    if (d > todayStr()) { errors.push(`Row ${k + 2}: future date`); return; }
    const tk = c.ticker >= 0 ? String(r[c.ticker] || '').trim().toUpperCase() : '';
    const isn = c.isin >= 0 ? String(r[c.isin] || '').trim().toUpperCase() : '';
    let a = (isn && byIsin.get(isn)) || (tk ? byTicker.get(tk) || newAssets.get(tk) : null);
    if (tk && !a) a = mkAsset(tk);
    if (!a && t !== 'interest' && t !== 'fee') { errors.push(`Row ${k + 2}: missing asset`); return; }
    const g = (i) => (i >= 0 ? parseNum(r[i]) : NaN);
    const o = { type: t, date: d, assetId: a ? a.id : null, note: c.note >= 0 ? r[c.note] || '' : '' };
    if (t === 'buy' || t === 'sell') { o.qty = Math.abs(g(c.qty)); o.price = g(c.price); o.fees = Math.abs(g(c.fees)) || 0; if (g(c.fx) > 0) o.fx = g(c.fx); if (!(o.qty > 0) || !(o.price >= 0)) { errors.push(`Row ${k + 2}: invalid quantity or price`); return; } }
    else if (t === 'split') { o.ratio = g(c.ratio); if (!(o.ratio > 0)) { errors.push(`Row ${k + 2}: invalid ratio`); return; } }
    else if (t === 'transfer') { o.qty = Math.abs(g(c.qty)); o.toQty = Math.abs(g(c.toQty)); const dk = c.dest >= 0 ? String(r[c.dest] || '').trim().toUpperCase() : ''; if (!dk || !(o.qty > 0) || !(o.toQty > 0)) { errors.push(`Row ${k + 2}: switch without destination or quantities`); return; } o.toAssetId = (byTicker.get(dk) || newAssets.get(dk) || mkAsset(dk)).id; }
    else { o.amount = Math.abs(g(c.amount)); o.withholding = Math.abs(g(c.wh)) || 0; if (g(c.fx) > 0) o.fx = g(c.fx); if (!(o.amount > 0)) { errors.push(`Row ${k + 2}: invalid amount`); return; } }
    txs.push(o);
  });
  // a sale can't exceed what you held that day (existing operations plus the earlier rows of this file)
  const kept = []; const byDate = txs.map((o, i) => [o, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1]));
  for (const [o] of byDate) {
    if (o.type === 'sell' && o.assetId) { const held = qtyAt(o.assetId, o.date) + kept.filter((z) => z.assetId === o.assetId).reduce((t, z) => t + (z.type === 'buy' ? z.qty : z.type === 'sell' ? -z.qty : 0), 0);
      if (o.qty > held + 1e-6) { const a = assetById(o.assetId) || newAssets.get(o.assetId) || {}; errors.push(`Sale on ${fdate(o.date)} of ${numf(o.qty, 6)} ${a.ticker || ''}: on that day you only held ${numf(Math.max(0, held), 6)}. Not imported.`); continue; } }
    kept.push(o);
  }
  return { txs: kept, newAssets: Array.from(newAssets.values()).filter((a) => kept.some((o) => o.assetId === a.id)), errors, source: 'CSV' };
}
function openImport() {
  if (DEMO && dbState === 'ready') { /* allowed: import ends demo */ }
  const html = `<div class="panel-h"><h2>Import transactions</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <p class="note">Accepts the <b>DeGiro Transactions</b> CSV (Activity → Transactions → Export CSV) or your own CSV with these columns (comma or semicolon separated):</p>
  <pre class="small" style="background:var(--surface-2);padding:10px;border-radius:8px;overflow-x:auto;margin:0">date;type;ticker;qty;price;fees;fx;amount;withholding;ratio;note
2025-01-15;buy;VWCE;10;112.40;2;;;;;
2025-03-20;dividend;MSFT;;;;0.92;7.50;1.13;;
2025-06-30;interest;;;;;;25.00;4.75;;Savings account</pre>
  <p class="note">Switches: type "transfer" with the columns <b>to</b> (ticker) and <b>to_qty</b>. Transactions you already have (same date, type, asset, quantity, price and amount) are skipped.</p>
  <p class="note">To <b>reconcile with MyInvestor</b>, pick one or more "Plusvalías y minusvalías" (capital gains) CSVs, one per fund: nothing is imported, their lots are compared with yours.</p>
  <label class="btn" for="impFile" style="align-self:flex-start;cursor:pointer">Choose file…</label><input type="file" id="impFile" accept=".csv,text/csv,text/plain" multiple hidden>
  <div id="impPrev"></div>`;
  openModal(html, () => {
    $('#impFile').addEventListener('change', async (ev) => {
      const f = ev.target.files[0]; if (!f) return; const text = await f.text();
      if (isMyInvestorPL(text)) { const fs = Array.from(ev.target.files); ev.target.value = ''; return openReconcile(fs); }
      let r; try { r = parseImport(text); } catch (e) { $('#impPrev').innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      ev.target.value = '';
      const have = new Set(Object.values(S.txs).map(txKey)); const fresh = [], dups = [];
      for (const o of r.txs) { const k = txKey(o); if (have.has(k)) dups.push(o); else { have.add(k); fresh.push(o); } }
      $('#impPrev').innerHTML = `<div class="panel" style="padding:12px"><b>${r.txs.length} transactions</b> read from ${esc(r.source)}${dups.length ? `. <b>${dups.length} already exist and will be skipped</b>; ${fresh.length} will be imported` : ''}${r.newAssets.length ? `, and <b>${r.newAssets.length} new assets</b> (${r.newAssets.map((a) => esc(a.name)).slice(0, 6).join(', ')}${r.newAssets.length > 6 ? '…' : ''}) that will be created with a manual price: <b>check they are not typos</b> and then, in Settings, give them a type, currency and ISIN or symbol` : ''}.${r.errors.length ? `<div class="err" style="margin-top:6px">${r.errors.length} rows ignored: ${esc(r.errors.slice(0, 4).join(' · '))}${r.errors.length > 4 ? '…' : ''}</div>` : ''}
      ${dups.length ? `<label class="small" style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="checkbox" id="impDup"> Also import the ${dups.length} duplicates</label>` : ''}
      <div class="form-actions" style="margin-top:10px"><button class="btn primary" type="button" id="impGo" ${r.txs.length ? '' : 'disabled'}>Import</button></div></div>`;
      const sync = () => { const n = $('#impDup') && $('#impDup').checked ? r.txs.length : fresh.length; $('#impGo').disabled = !n; $('#impGo').textContent = n ? `Import ${n}` : 'Nothing new to import'; }; sync();
      $('#impDup') && $('#impDup').addEventListener('change', sync);
      $('#impGo') && $('#impGo').addEventListener('click', async () => {
        const btn = $('#impGo'); btn.disabled = true; btn.textContent = 'Importing…';
        const list = $('#impDup') && $('#impDup').checked ? r.txs : fresh; const importId = 'imp-' + new Date().toISOString().slice(0, 10) + '-' + uid().slice(0, 6);
        const used = new Set(list.flatMap((o) => [o.assetId, o.toAssetId]));
        try {
          await maybeSnapshot(true); // copy first, so the import can also be undone from Backups
          const newIds = []; for (const a of r.newAssets) { if (!used.has(a.id)) continue; const { id, _new, ...o } = a; await save('assets', id, o); newIds.push(id); }
          let i = 0; for (const o of list) { o.created = new Date().toISOString(); o.importId = importId; await save('txs', uid(), o); if (++i % 20 === 0) btn.textContent = `Importing… ${i}/${list.length}`; }
          closeModal(); toast(`${list.length} ${list.length === 1 ? 'transaction imported' : 'transactions imported'}${list.length < r.txs.length ? ` (${r.txs.length - list.length} duplicates skipped)` : ''}.`, 12000, { label: 'Undo import', fn: () => undoImport(importId, newIds) });
        } catch (e) { btn.textContent = 'Error'; $('#impPrev').insertAdjacentHTML('beforeend', `<p class="err">${esc(e.code === 'quota_exceeded' ? 'Database full (5,000 documents).' : e.message || e.code)}</p>`); }
      });
    });
  });
}
