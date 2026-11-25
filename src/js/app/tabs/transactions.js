/* ---------- Operaciones ---------- */
/** Cash movements as rows of the same list (Movimientos = operaciones + efectivo). */
function cashRows() {
  const f = ui.txf; const q = f.q.trim().toLowerCase(); if (f.asset || (f.type && f.type !== 'cash')) return [];
  return cashList().flatMap((c) => cashMoves(c).filter((m) => m.t !== 'open' || Math.abs(m.a) > 0.004).map((m) => ({ _cash: 1, id: `c:${c.id}:${m.id}`, mid: m.id, date: m.d, t: m.t, a: m.a, n: m.n, acc: c })))
    .filter((x) => (!f.year || String(x.date).startsWith(f.year)) && (!q || [x.n, x.acc.name, x.acc.entity, MV_TYPES[x.t]].join(' ').toLowerCase().includes(q)));
}
function txRows() {
  const all = DEMO ? demoData.txs : Object.values(S.txs);
  const f = ui.txf; const q = f.q.trim().toLowerCase();
  const withCash = !f.asset && !f.type; // then interest and sale proceeds show once: the cash row for interest, the sale for proceeds
  return all.filter((x) => f.type !== 'cash' && !(withCash && x.type === 'interest' && String(x.id || '').startsWith('cash-'))).filter((x) => (!f.asset || x.assetId === f.asset) && (!f.type || x.type === f.type) && (!f.year || String(x.date).startsWith(f.year)) && (!q || [x.note, assetById(x.assetId)?.ticker, assetById(x.assetId)?.name, assetById(x.assetId)?.isin, assetById(x.toAssetId)?.ticker, assetById(x.toAssetId)?.name, assetById(x.toAssetId)?.isin].join(' ').toLowerCase().includes(q)))
    .concat(cashRows().filter((c) => !(withCash && c.t === 'in' && /^venta\b/i.test(c.n || '') && all.some((x) => x.type === 'sell' && Math.abs(Date.parse(x.date) - Date.parse(c.date)) <= 5 * 864e5 && res.txEUR[x.id] && Math.abs(Math.abs(res.txEUR[x.id].eur) - c.a) < 1.5)))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.id).localeCompare(String(a.id))));
}
/** Mobile: «Filtrar» button that unfolds the selects, plus chips of the active filters. */
function txfBar() {
  const f = ui.txf; const a = f.asset ? assetById(f.asset) : null;
  const chips = [['asset', f.asset && (a ? a.ticker || a.name : f.asset)], ['type', f.type && (f.type === 'cash' ? 'Efectivo' : TXT[f.type] || f.type)], ['year', f.year], ['q', f.q.trim() && `«${f.q.trim()}»`]].filter(([, l]) => l);
  return `<div class="only-mob fbar"><div class="fchips"><button class="btn small" type="button" data-act="txf-toggle" aria-expanded="${!!ui.txfOpen}" aria-controls="txFilters">${ui.txfOpen ? 'Ocultar filtros' : 'Filtrar'}${chips.length ? ` (${chips.length})` : ''}</button>${chips.map(([k, l]) => `<button class="fchip" type="button" data-act="txf-rm" data-k="${k}" aria-label="Quitar filtro ${esc(l)}">${esc(l)} <span aria-hidden="true">×</span></button>`).join('')}${chips.length ? '<button class="hint-btn" type="button" data-act="clear-txf">Quitar filtros</button>' : ''}</div></div>`;
}
const mHeadTr = (m, ms, mLabel) => `<tr class="mhead"><td colspan="10">${mLabel(m)}<span>${ms.shown < ms.n ? `${ms.shown} de ` : ''}${ms.n} movimiento${ms.n === 1 ? '' : 's'} · neto <b class="num">${eurS(ms.eur, 0)}</b></span></td></tr>`;
const cashDel = (x, lbl) => (String(x.mid).match(/^h|^b$/) ? '' : `<button class="btn ${lbl ? 'small' : 'ghost small'} danger" type="button" data-mv-del="${esc(x.mid)}" data-acc="${esc(x.acc.id)}"${lbl ? '' : ' aria-label="Borrar"'}>${lbl || '✕'}</button>`);
const cashTr = (x) => `<tr class="cashrow"><td class="num">${fdate(x.date)}</td><td><span class="chip ${x.a >= 0 ? 'inc' : 'sell'}">${MV_TYPES[x.t] || x.t}</span></td><td><span class="sw cashsw"></span>${esc(x.acc.name)}</td><td class="n"></td><td class="n"></td><td class="n ${x.t === 'open' ? '' : cls(x.a)}">${x.t === 'open' ? eur(x.a) : eurS(x.a)}</td><td class="n"></td><td class="n"></td><td class="small muted" style="white-space:normal">${esc(x.n || '')}</td><td><div class="rowact">${cashDel(x)}</div></td></tr>`;
const cashMCard = (x) => `<details class="mcard"><summary><div class="mrow"><div><div class="l1"><span class="chip ${x.a >= 0 ? 'inc' : 'sell'}">${MV_TYPES[x.t] || x.t}</span><span class="tk tkc">${esc(x.acc.name)}</span></div><div class="l2">${fdate(x.date, { year: undefined })}${x.n ? ' · ' + esc(x.n) : ''}</div></div><div><div class="r1 ${x.t === 'open' ? '' : cls(x.a)}">${x.t === 'open' ? eur(x.a) : eurS(x.a)}</div></div></div></summary><div class="mc-body"><div class="rowact"><button class="btn small" type="button" data-goto="efectivo">Ver la cuenta</button>${cashDel(x, 'Borrar')}</div></div></details>`;
/** Per-operation P&L from the engine: latent of what is left of each buy (FIFO lots, wherever a switch moved them) and realized FIFO gains. */
const plvCache = new WeakMap();
function plvIdx() {
  if (!res) return null; let o = plvCache.get(res); if (o) return o;
  o = { buy: {}, via: {}, sell: {} };
  const acc = (m, k) => (m[k] = m[k] || { cost: 0, val: 0, nop: 0, at: new Set(), rz: 0, rzCost: 0 });
  for (const p of res.positions) for (const l of p.lots || []) for (const b of [l.txId && acc(o.buy, l.txId), l.via && acc(o.via, l.via)]) {
    if (!b) continue; b.cost += l.cost; b.at.add(p.assetId); if (p.priceEUR != null) b.val += l.qty * p.priceEUR; else b.nop++;
  }
  for (const s of res.realized) { o.sell[s.id] = s; for (const l of s.lots) if (l.txId && s.qty > 0) { const b = acc(o.buy, l.txId); b.rz += s.proceeds * (l.qty / s.qty) - l.cost; b.rzCost += l.cost; } }
  plvCache.set(res, o); return o;
}
/** {v: amount or null, main, sub, tip} for the «Plusvalía» cell of an operation, or null. */
function plvOf(x) {
  const o = plvIdx(); if (!o) return null; const e2 = res.txEUR[x.id]; const nm = (id) => { const a = assetById(id); return a ? esc(a.ticker || a.name) : '—'; };
  const lat = (b) => (b.nop ? null : b.val - b.cost);
  if (x.type === 'sell') {
    const s = o.sell[x.id]; if (!s) return null;
    return { v: s.gain, main: eurS(s.gain), sub: `${s.cost > 0.005 ? pctS(s.gain / s.cost, 1) + ' · ' : ''}realizada${s.washSale ? ' · regla recompra' : ''}`, tip: `Ganancia o pérdida FIFO declarable: transmisión ${eur(s.proceeds)} − adquisición ${eur(s.cost)}${s.washSale ? `. Pérdida diferida por recompra: ${eur(s.deferred)}` : ''}` };
  }
  if (x.type === 'buy') {
    const b = o.buy[x.id]; if (!b) return null;
    const rz = b.rzCost > 0.005 ? `realizado ${eurS(b.rz)}` : '';
    if (!b.at.size) return { v: null, main: 'vendida', sub: rz, tip: 'Esta compra ya se vendió entera (FIFO); lo realizado está en las ventas.', rz: b.rz };
    const v = lat(b); const left = e2 && e2.eur > 0.005 ? b.cost / e2.eur : null; const moved = [...b.at].filter((id) => id !== x.assetId);
    const sub = [v != null && b.cost > 0.005 ? pctS(v / b.cost, 1) : v == null ? 'sin precio' : '', left != null && left < 0.995 ? `queda ${pct(left, 0)}` : '', rz, moved.length ? `en ${moved.map(nm).join(', ')}` : ''].filter(Boolean).join(' · ');
    return { v, main: v == null ? '—' : eurS(v), sub, tip: `Plusvalía latente de lo que queda de esta compra (FIFO): valor hoy ${v == null ? '—' : eur(b.val)} − coste ${eur(b.cost)}${moved.length ? '. Coste y fecha heredados por traspaso' : ''}` };
  }
  if (x.type === 'transfer') {
    const b = o.via[x.id]; const inh = e2 && e2.cost != null ? `coste heredado ${eur(e2.cost)}` : '';
    if (!b) return inh ? { v: null, main: '—', sub: inh, tip: 'Un traspaso no tributa: el coste y las fechas de compra pasan al fondo de destino.' } : null;
    const v = lat(b);
    return { v, main: v == null ? '—' : eurS(v), sub: [v != null && b.cost > 0.005 ? pctS(v / b.cost, 1) : '', inh].filter(Boolean).join(' · '), tip: `Plusvalía latente de las participaciones traspasadas que siguen en ${assetById(x.toAssetId)?.ticker || assetById(x.toAssetId)?.name || 'el destino'}: el coste se hereda de las compras originales.` };
  }
  return null;
}
const plvCell = (x) => { const p = plvOf(x); return p ? `<td class="n plv" title="${esc(p.tip)}"><span class="${p.v == null ? 'muted' : cls(p.v)}">${p.main}</span>${p.sub ? `<div class="small muted">${x.type === 'sell' ? p.sub : p.sub.split(' · ').join('<br>')}</div>` : ''}</td>` : '<td class="n plv"></td>'; };
const plvLine = (x) => { const p = plvOf(x); if (!p) return ''; const c = p.v == null ? '' : cls(p.v); const t = p.v == null ? p.main : `${x.type === 'sell' ? 'resultado' : 'plusv.'} <span class="${c}">${p.main}</span>${p.sub && x.type !== 'sell' ? ' · ' + p.sub.split(' · ')[0] : ''}`; return `<div class="r2 ${p.v == null ? 'muted' : c + ' noarr'}">${t}</div>`; };
const plvBody = (x) => { const p = plvOf(x); return p && p.sub && x.type !== 'sell' ? `<div class="small muted">Plusvalía: ${p.main} · ${p.sub}</div>` : p && x.type === 'sell' ? `<div class="small muted">${esc(p.tip)}</div>` : ''; };
function vOperaciones() {
  const all = DEMO ? demoData.txs : Object.values(S.txs);
  const years = Array.from(new Set(all.map((x) => String(x.date).slice(0, 4)))).sort().reverse();
  const rows = txRows();
  const limD = ui.txLimit || 60; const mStat = {}; let lastMD = '';
  rows.forEach((x, k) => { const m = String(x.date).slice(0, 7), e2 = !x._cash && res && res.txEUR[x.id], o = (mStat[m] = mStat[m] || { n: 0, shown: 0, eur: 0 }); o.n++; if (k < limD) o.shown++; if (x._cash && x.t !== 'open') o.eur += x.a; else if (e2) o.eur += x.type === 'buy' || x.type === 'fee' ? -e2.eur : e2.eur; });
  const mLabel = (m) => { const t = new Date(m + '-01T00:00:00').toLocaleDateString(L, { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const body = rows.slice(0, limD).map((x) => {
    if (x._cash) { const m = String(x.date).slice(0, 7), ms = mStat[m]; const head = m !== lastMD ? mHeadTr(m, ms, mLabel) : ''; lastMD = m; return head + cashTr(x); }
    const a = assetById(x.assetId); const e2 = res && res.txEUR[x.id];
    const toA = x.type === 'transfer' ? assetById(x.toAssetId) : null;
    const qtyTxt = x.type === 'buy' || x.type === 'sell' || x.type === 'transfer' ? qn(+x.qty, 6) : x.type === 'split' ? `× ${numf(+x.ratio, 4)}` : '';
    const prTxt = x.type === 'buy' || x.type === 'sell' ? money(+x.price, a?.currency || 'EUR', 4) : x.type === 'dividend' ? `${money(+x.amount, a?.currency || 'EUR')} bruto` : x.type === 'interest' ? `${eur(+x.amount)} bruto` : '';
    const m = String(x.date).slice(0, 7), ms = mStat[m]; const head = m !== lastMD ? mHeadTr(m, ms, mLabel) : ''; lastMD = m;
    return `${head}<tr><td class="num">${fdate(x.date)}</td><td><span class="chip ${TXCHIP[x.type]}">${TXT[x.type] || x.type}</span></td><td>${a ? `<span class="sw" style="background:${acolor(a.id)}"></span>${esc(a.ticker || a.name)}${toA ? ` → ${esc(toA.ticker || toA.name)} <span class="muted small">(${qn(+x.toQty, 6)})</span>` : ''}` : '<span class="muted">—</span>'}</td><td class="n">${qtyTxt}</td><td class="n">${prTxt}</td><td class="n">${e2 ? (x.type === 'buy' || x.type === 'fee' ? eur(-e2.eur) : eurS(e2.eur)) : '—'}</td>${plvCell(x)}<td class="n">${+x.fees ? eur(+x.fees) : ''}</td><td class="small muted notecell">${x.note ? `<div class="clamp2" title="${esc(x.note)}">${esc(x.note)}</div>` : ''}</td><td><div class="rowact">${x.type === 'buy' ? `<button class="btn ghost small" type="button" data-dup-tx="${esc(x.id)}" title="Repetir esta compra con fecha de hoy">Repetir</button>` : ''}<button class="btn ghost small" type="button" data-edit-tx="${esc(x.id)}">Editar</button><button class="btn ghost small danger" type="button" data-del-tx="${esc(x.id)}">Borrar</button></div></td></tr>`;
  }).join('');
  const lim = ui.txLimit || 60; let lastM = '';
  const mob = rows.slice(0, lim).map((x) => {
    if (x._cash) { const m = String(x.date).slice(0, 7); const head = m !== lastM ? `<div class="mmonth">${new Date(m + '-01T00:00:00').toLocaleDateString(L, { month: 'long', year: 'numeric' })}</div>` : ''; lastM = m; return head + cashMCard(x); }
    const a = assetById(x.assetId); const e2 = res && res.txEUR[x.id]; const toA = x.type === 'transfer' ? assetById(x.toAssetId) : null;
    const m = String(x.date).slice(0, 7); const head = m !== lastM ? `<div class="mmonth">${new Date(m + '-01T00:00:00').toLocaleDateString(L, { month: 'long', year: 'numeric' })}</div>` : ''; lastM = m;
    const sub = x.type === 'buy' || x.type === 'sell' ? `${qn(+x.qty, Math.abs(+x.qty) < 0.01 ? 8 : 4)} × ${money(+x.price, a?.currency || 'EUR', 4)}` : x.type === 'transfer' ? `${qn(+x.qty, 4)} → ${qn(+x.toQty, 4)}` : x.type === 'split' ? `× ${numf(+x.ratio, 4)}` : x.type === 'dividend' || x.type === 'interest' ? `${money(+x.amount, a?.currency || 'EUR')} bruto` : '';
    const net = e2 ? (x.type === 'buy' || x.type === 'fee' ? eur(-e2.eur) : eurS(e2.eur)) : '';
    return `${head}<details class="mcard"><summary><div class="mrow"><div><div class="l1"><span class="chip ${TXCHIP[x.type]}">${TXT[x.type] || x.type}</span><span class="tk">${a ? esc(a.ticker || a.name) : '—'}${toA ? ' → ' + esc(toA.ticker || toA.name) : ''}</span></div><div class="l2">${fdate(x.date, { year: undefined })}${sub ? ' · ' + sub : ''}</div></div><div><div class="r1 ${e2 && x.type !== 'buy' && x.type !== 'sell' ? cls(x.type === 'fee' ? -e2.eur : e2.eur) : ''}">${net}</div>${plvLine(x)}${+x.fees ? `<div class="r2 muted">com. ${eur(+x.fees)}</div>` : ''}</div></div></summary>
      <div class="mc-body">${plvBody(x)}${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}<div class="rowact">${x.type === 'buy' ? `<button class="btn small primary" type="button" data-dup-tx="${esc(x.id)}">Repetir hoy</button>` : ''}<button class="btn small" type="button" data-edit-tx="${esc(x.id)}">Editar</button><button class="btn small danger" type="button" data-del-tx="${esc(x.id)}">Borrar</button></div></div></details>`;
  }).join('');
  const fOn = ui.txf.asset || ui.txf.type || ui.txf.year || ui.txf.q.trim();
  const mobList = rows.length ? `<div class="mlist">${mob}${rows.length > lim ? `<button class="btn" type="button" data-act="more-tx" style="margin-top:10px;justify-content:center">Mostrar más (${rows.length - lim})</button>` : ''}</div>` : '';
  return `<section class="panel">
    <div class="panel-h"><div><h2>Movimientos <span class="muted small">(${rows.length})</span></h2><span class="small muted">operaciones de tus fondos y movimientos de efectivo, juntos y por fecha</span></div>
      <div class="toolbar only-desk"><button class="btn primary" type="button" data-act="add-tx">Añadir operación</button><button class="btn" type="button" data-act="import">Importar CSV</button><button class="btn" type="button" data-act="export-csv" ${downloads ? '' : 'disabled title="Descargas no disponibles en esta vista"'}>Exportar CSV</button></div></div>
    ${vlReviewPanel()}${txfBar()}<div class="toolbar filters${ui.txfOpen ? '' : ' fhide'}" id="txFilters">
      <select id="fAsset" aria-label="Activo"><option value="">Todos los activos</option>${assetList().map((a) => `<option value="${esc(a.id)}" ${ui.txf.asset === a.id ? 'selected' : ''}>${esc(a.ticker || a.name)}</option>`).join('')}</select>
      <select id="fType" aria-label="Tipo"><option value="">Todos los tipos</option>${Object.entries(TXT).map(([k, l]) => `<option value="${k}" ${ui.txf.type === k ? 'selected' : ''}>${l}</option>`).join('')}<option value="cash" ${ui.txf.type === 'cash' ? 'selected' : ''}>Efectivo (ingresos, retiradas, intereses)</option></select>
      <select id="fYear" aria-label="Año"><option value="">Todos los años</option>${years.map((y) => `<option ${ui.txf.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <input type="text" id="fQ" aria-label="Buscar nota, activo o ISIN" placeholder="Buscar nota, activo o ISIN" value="${esc(ui.txf.q)}" style="min-width:160px">
    </div>
    ${mobList}${rows.length ? `<div class="tbl-wrap only-desk txwrap"><table class="txtbl"><thead><tr><th>Fecha</th><th>Tipo</th><th>Activo</th><th class="n">Cantidad</th><th class="n">Precio / importe</th><th class="n">Neto €</th><th class="n" title="Compras: plusvalía latente de lo que queda (FIFO). Ventas: ganancia o pérdida realizada (FIFO).">Plusvalía</th><th class="n">Comisión</th><th>Nota</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : `<div class="empty">${fOn ? 'Ningún movimiento con estos filtros.' : 'Todavía no hay movimientos.'}${fOn ? '<div style="margin-top:10px"><button class="btn" type="button" data-act="clear-txf">Quitar filtros</button></div>' : ''}</div>`}
    ${rows.length > limD ? `<div class="only-desk" style="margin-top:4px"><button class="btn" type="button" data-act="more-tx">Mostrar más (${rows.length - limD})</button></div>` : ''}
  </section>`;
}

vOperaciones.after = function () {
  const t = $('.txtbl'), nav = $('#tabs'); if (!t || !nav) return;
  const a = nav.offsetHeight; t.style.setProperty('--stk-a', a + 'px'); t.style.setProperty('--stk-b', a + t.tHead.offsetHeight + 'px');
};

