/* ---------- Ficha de un activo ---------- */
const FICHA_CSS = `<style>.modal:has(.ficha){max-width:780px}.ficha{display:flex;flex-direction:column;gap:14px}.ficha>*{flex-shrink:0}
.ficha .fh-sub{font-size:13px;color:var(--muted);margin-top:-8px}
.ficha .fh-px{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.ficha .fh-px b{font-family:var(--f-num);font-size:22px;font-weight:500;color:var(--ink)}
.ficha .fh-info{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 16px;background:var(--surface-2);border-radius:10px;padding:12px 14px;margin:0}
.ficha .fh-info dt{font-size:13px;color:var(--muted);font-weight:500}.ficha .fh-info dd{margin:2px 0 0;font-size:13px;overflow-wrap:anywhere}
.ficha .fh-h{font-size:13px;color:var(--muted);font-weight:700;margin:4px 0 -6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.ficha .kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.ficha .kpi .v{font-size:16px}
.ficha .fh-risk{display:inline-flex;gap:2px;margin-left:6px;vertical-align:middle}.ficha .fh-risk i{width:8px;height:8px;border-radius:2px;background:var(--line)}.ficha .fh-risk i.on{background:var(--warn)}
.ficha .fh-ops{display:flex;flex-direction:column}.ficha .fh-op{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:8px 0;border-bottom:1px solid var(--grid);font-size:13px}.ficha .fh-op:last-child{border-bottom:0}
.ficha .fh-op .l2{font-size:13px;color:var(--muted)}.ficha .fh-op .r{text-align:right;font-family:var(--f-num);font-variant-numeric:tabular-nums;white-space:nowrap}
.ficha .fh-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.ficha .fh-leg span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px;background:var(--c)}.ficha .fh-leg span.dash::before{height:0;border-radius:0;border-top:2px dashed var(--c);vertical-align:3px}
@media (max-width:640px){.ficha .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ficha .fh-info{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>`;
const fichaUI = { mode: 'value', per: 'MAX' }; let fichaChart = null;
function fichaTxs(id) { return (DEMO ? demoData.txs : Object.values(S.txs)).filter((x) => x.assetId === id || (x.type === 'transfer' && x.toAssetId === id)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); }
/** «2 años y 3 meses» since d. */
function fichaAge(d) { if (!d) return ''; const t = todayStr(); let m = (+t.slice(0, 4) - +d.slice(0, 4)) * 12 + (+t.slice(5, 7) - +d.slice(5, 7)) - (t.slice(8) < d.slice(8) ? 1 : 0); if (m < 1) { const n = Math.round((Date.parse(t) - Date.parse(d)) / 864e5); return `${n} día${n === 1 ? '' : 's'}`; } const y = Math.floor(m / 12); m %= 12; return [y ? `${y} año${y === 1 ? '' : 's'}` : '', m ? `${m} mes${m === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' y '); }
/** Net money put into the asset by date: buys minus sale proceeds, transfers move their cost basis. */
function fichaNetIn(id, x) { const e2 = res && res.txEUR[x.id]; if (!e2) return 0; if (x.type === 'buy') return e2.eur; if (x.type === 'sell') return -e2.eur; if (x.type === 'transfer') return (x.toAssetId === id ? 1 : -1) * (e2.cost || 0); return 0; }
function openFicha(id) {
  const a = assetById(id); if (!a) return;
  const p = res && res.positions.find((z) => z.assetId === id);
  const txs = fichaTxs(id), ccy = a.currency || 'EUR';
  const first = (txs.find((x) => x.type === 'buy' || (x.type === 'transfer' && x.toAssetId === id)) || {}).date || null;
  const proceeds = res ? res.realized.filter((r) => r.assetId === id).reduce((s, r) => s + r.proceeds, 0) : 0;
  const netIn = p ? p.invested - proceeds : null;
  const hp = histPts(id), lp = p && ok(p.price) ? [p.priceDate, p.price] : hp.length ? hp[hp.length - 1] : null;
  const srcTxt = a.src === 'nav' ? 'Valor liquidativo por ISIN' : isAuto(a) ? (a.quoteUrl ? 'Automático · finanzen.net' : `Automático · ${a.symbol || '?'}`) : 'Manual';
  const info = [['Tipo', TYPES[a.type] || a.type], ['Clase', CLS_LABEL[clsOf(a)]], ['Categoría', a.category], ['ISIN', a.isin], ['Broker', a.broker], ['Divisa', ccy], ['Etiqueta', a.tag],
    ['Comisión anual (TER)', a.ter != null && a.ter !== '' && ok(+a.ter) ? pct(+a.ter, 2) : null],
    ['Riesgo', +a.risk >= 1 && +a.risk <= 7 ? `${+a.risk} de 7<span class="fh-risk" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7].map((k) => `<i class="${k <= +a.risk ? 'on' : ''}"></i>`).join('')}</span>` : null],
    ['Fuente del precio', srcTxt], ['Peso objetivo', p && p.target != null ? pct(p.target, 1) : null]].filter((r) => r[1]);
  const k = (l, v, s, c) => kpi(l, v, s, c);
  const kp = !p ? '<p class="note">Sin operaciones todavía en este activo.</p>' : `<div class="kpis">${[
    k('Participaciones', p.open ? qn(p.qty, 6) : '<span class="chip">cerrada</span>'),
    k('Valor', eur(p.value), p.open && ok(p.price) ? `a ${money(p.price, ccy, p.price >= 100 ? 2 : 4)}` : null),
    k('Coste medio', p.open ? eur(p.avgCost, p.avgCost >= 100 ? 2 : 4) : '—', p.open ? `coste ${eur(p.costBasis)}` : null),
    k('Aportado neto', eur(netIn), 'compras − ventas', null),
    k('Plusvalía latente', p.open ? eurS(p.unrealized) : '—', p.open ? pctS(p.unrealizedPct) : null, cls(p.unrealized)),
    k('Realizada', Math.abs(p.realized) > 0.004 ? eurS(p.realized) : '—', null, cls(p.realized)),
    k('Dividendos', p.dividends > 0.004 ? eur(p.dividends) : '—', p.dividends > 0.004 ? 'netos' : null),
    k('Ganancia total', eurS(p.totalReturn), p.totalReturnPct != null ? pctS(p.totalReturnPct) + ' s/ invertido' : null, cls(p.totalReturn)),
    k('TIR', pctS(p.xirr, 1), 'anual, con fechas', cls(p.xirr)),
    k('Peso en cartera', p.open ? pct(p.weight, 1) : '—'),
    k('Primera compra', first ? fdate(first) : '—', first ? fichaAge(first) : null),
    k('Operaciones', String(txs.length), txs.length ? `última ${fdate(txs[txs.length - 1].date)}` : null),
  ].join('')}</div>`;
  const ops = txs.slice().reverse(), LIM = 12;
  const opRow = (x) => {
    const e2 = res && res.txEUR[x.id], inT = x.type === 'transfer' && x.toAssetId === id, o = x.type === 'transfer' ? assetById(inT ? x.assetId : x.toAssetId) : null;
    const lbl = x.type === 'transfer' ? `Traspaso ${inT ? 'desde' : 'a'} ${esc(o ? o.ticker || o.name : '?')}` : TXT[x.type] || x.type;
    const sub = x.type === 'buy' || x.type === 'sell' ? `${qn(+x.qty, 6)} × ${money(+x.price, ccy, 4)}` : x.type === 'transfer' ? `${qn(inT ? +x.toQty : +x.qty, 6)} participaciones` : x.type === 'split' ? `× ${numf(+x.ratio, 4)}` : x.type === 'dividend' ? `${money(+x.amount, ccy)} bruto` : '';
    const amt = !e2 ? '—' : x.type === 'buy' || x.type === 'fee' ? eur(-e2.eur) : x.type === 'transfer' ? eur(e2.cost != null ? e2.cost : e2.eur) : eurS(e2.eur);
    return `<div class="fh-op"><div><span class="chip ${x.type === 'transfer' ? 'xfer' : TXCHIP[x.type]}">${lbl}</span> <span class="num">${fdate(x.date)}</span>${sub ? `<div class="l2">${sub}${+x.fees ? ` · com. ${eur(+x.fees)}` : ''}</div>` : ''}</div><div class="r">${amt}${x.type === 'transfer' ? '<div class="l2">coste traspasado</div>' : ''}</div></div>`;
  };
  const html = `${FICHA_CSS}<div class="ficha">
  <div class="panel-h"><h2><span class="sw" style="background:${acolor(id)}"></span>${esc(a.ticker || a.name)}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <div class="fh-sub">${[esc(a.name || ''), a.isin ? esc(a.isin) : '', a.broker ? esc(a.broker) : ''].filter(Boolean).join(' · ')}</div>
  <div class="fh-px">${lp ? `<b>${money(lp[1], ccy, lp[1] >= 100 ? 2 : 4)}</b><span>${p && p.open && p.priceDate ? priceSub(p) : fdate(lp[0])}</span>` : '<span>Sin precio todavía</span>'}</div>
  <dl class="fh-info">${info.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
  <div class="fh-h">Tu posición</div>${kp}
  <div class="fh-h"><span>Evolución</span><span style="display:flex;gap:6px;flex-wrap:wrap"><span class="seg" role="group" aria-label="Qué ver">${[['value', 'Valor'], ['price', 'Precio']].map(([v, l]) => `<button type="button" data-fmode="${v}" aria-pressed="${fichaUI.mode === v}">${l}</button>`).join('')}</span><span class="seg" role="group" aria-label="Periodo">${[['1A', '1A'], ['3A', '3A'], ['MAX', 'Máx']].map(([v, l]) => `<button type="button" data-fper="${v}" aria-pressed="${fichaUI.per === v}">${l}</button>`).join('')}</span></span></div>
  <div class="chart sm" id="fichaBox"><canvas id="cFicha" role="img" aria-label="Evolución de ${esc(a.ticker || a.name)}"></canvas></div><div class="fh-leg" id="fichaLeg"></div>
  <div class="fh-h"><span>Operaciones (${txs.length})</span></div>
  ${ops.length ? `<div class="fh-ops">${ops.slice(0, LIM).map(opRow).join('')}</div>` : '<p class="note">Sin operaciones.</p>'}
  <div class="rowact" style="flex-wrap:wrap">${p && p.open ? `<button class="btn small primary" type="button" data-trade="${esc(id)}">Operar</button>${p.value > 0 && !DEMO ? `<button class="btn small" type="button" data-act="sell-sim" data-id="${esc(id)}">Simular venta</button>` : ''}` : ''}${a.src === 'manual' || a.type === 'fund' ? `<button class="btn small" type="button" data-price="${esc(id)}">Precio</button>` : ''}${S.assets[id] ? `<button class="btn small" type="button" data-edit-asset="${esc(id)}">Editar datos</button>` : ''}${txs.length ? `<button class="btn small" type="button" data-goto-tx="${esc(id)}">${ops.length > LIM ? `Ver las ${ops.length} en Movimientos` : 'Ver en Movimientos'}</button>` : ''}</div>
  </div>`;
  openModal(html, (m) => {
    m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fmode],[data-fper]'); if (!b) return; if (b.dataset.fmode) fichaUI.mode = b.dataset.fmode; else fichaUI.per = b.dataset.fper; $$('[data-fmode]', m).forEach((z) => z.setAttribute('aria-pressed', String(z.dataset.fmode === fichaUI.mode))); $$('[data-fper]', m).forEach((z) => z.setAttribute('aria-pressed', String(z.dataset.fper === fichaUI.per))); fichaDraw(id); });
    fichaDraw(id);
  });
}
function fichaDraw(id) {
  if (fichaChart) { try { fichaChart.destroy(); } catch (e) {} fichaChart = null; }
  const cv = $('#cFicha'), leg = $('#fichaLeg'); if (!cv) return;
  const a = assetById(id), ccy = (a && a.currency) || 'EUR', txs = fichaTxs(id);
  const t = todayStr(), from = fichaUI.per === '1A' ? E.addMonths(t, -12) : fichaUI.per === '3A' ? E.addMonths(t, -36) : '';
  const cIn = cssv('--ink'), cOut = cssv('--loss'), col = acolor(id), mut = cssv('--muted');
  const isIn = (x) => x.type === 'buy' || (x.type === 'transfer' && x.toAssetId === id), isOut = (x) => x.type === 'sell' || (x.type === 'transfer' && x.assetId === id);
  const tr = txs.filter((x) => isIn(x) || isOut(x));
  const mkTxt = (x) => { const e2 = res && res.txEUR[x.id]; if (x.type === 'transfer') { const inT = x.toAssetId === id, o = assetById(inT ? x.assetId : x.toAssetId); return `Traspaso ${inT ? 'desde' : 'a'} ${o ? o.ticker || o.name : '?'}: ${numf(inT ? +x.toQty : +x.qty, 4)}`; } return `${TXT[x.type]}: ${numf(+x.qty, 4)} × ${money(+x.price, ccy, 4)}${e2 ? ` = ${eur(e2.eur)}` : ''}`; };
  let labels = [], ds = [], fmt = eur, yfmt;
  const marks = (yAt) => [[isIn, 'Entradas', cIn], [isOut, 'Salidas', cOut]].map(([f, l, c]) => { const by = {}; tr.filter(f).forEach((x) => { (by[x.date] = by[x.date] || []).push(x); }); return { label: l, mk: labels.map((d) => (by[d] ? by[d].map(mkTxt).join(' · ') : null)), data: labels.map((d, i) => (by[d] ? yAt(i, by[d]) : null)), showLine: false, borderColor: c, backgroundColor: c, pointBackgroundColor: c, pointBorderColor: cssv('--surface'), pointBorderWidth: 1.5, pointRadius: tr.length > 40 ? 3.5 : 5, pointHoverRadius: 6 }; });
  if (fichaUI.mode === 'value') {
    if (!res) return;
    const d0 = (txs[0] || {}).date; const pts = res.series.filter((s) => d0 && s.date >= d0 && (!from || s.date >= from));
    let ni = 0, k = 0; const pre = txs.filter((x) => pts.length && x.date < pts[0].date); pre.forEach((x) => { ni += fichaNetIn(id, x); }); k = pre.length;
    labels = pts.map((s) => s.date);
    const val = pts.map((s) => s.holdings[id] || 0), inv = pts.map((s) => { while (k < txs.length && txs[k].date <= s.date) ni += fichaNetIn(id, txs[k++]); return Math.max(0, ni); });
    ds = [{ label: 'Valor', data: val, borderColor: col, backgroundColor: fillGrad(col, .22, .02), fill: 'origin' }, { label: 'Aportado neto', data: inv, borderColor: mut, borderDash: [4, 4], borderWidth: 1.5, stepped: true, fill: false }].concat(marks((i) => val[i]));
    leg.innerHTML = `<span style="--c:${col}">Valor</span><span class="dash" style="--c:${mut}">Aportado neto</span><span style="--c:${cIn}">Compras</span><span style="--c:${cOut}">Ventas</span>`;
  } else {
    const hp = histPts(id).filter((z) => ok(+z[1])); const own = tr.filter((x) => x.type !== 'transfer' && ok(+x.price) && +x.price > 0);
    const f0 = from || (txs[0] || {}).date || ''; // «Máx» starts at your first trade: older points are sparse anchors
    labels = Array.from(new Set(hp.map((z) => z[0]).concat(own.map((x) => x.date)))).filter((d) => !f0 || d >= f0).sort();
    const hm = new Map(hp.map((z) => [z[0], +z[1]])), om = new Map(own.map((x) => [x.date, +x.price])); const lk = E.lookup(hp);
    const px = labels.map((d) => (hm.has(d) ? hm.get(d) : om.has(d) ? om.get(d) : null));
    ds = [{ label: 'Precio', data: px, borderColor: col, backgroundColor: fillGrad(col, .16, .01), fill: 'origin', spanGaps: true }].concat(marks((i, xs) => { const o = xs.find((x) => x.type !== 'transfer'); return o ? +o.price : lk(labels[i]) ?? null; }));
    fmt = (v) => money(v, ccy, v >= 100 ? 2 : 4); yfmt = (v) => numf(v, v >= 100 ? 0 : 2);
    leg.innerHTML = `<span style="--c:${col}">Precio (${esc(ccy)})</span><span style="--c:${cIn}">Compras</span><span style="--c:${cOut}">Ventas</span>`;
  }
  if (labels.length < 2) { $('#fichaBox').innerHTML = `<p class="note">Aún no hay datos suficientes para la gráfica.</p><canvas id="cFicha" hidden></canvas>`; $('#fichaBox').style.height = 'auto'; return; }
  $('#fichaBox').style.height = '';
  fichaChart = mkLine(cv, labels, ds, { fmt: (v, c) => (c && c.dataset.mk ? c.dataset.mk[c.dataIndex] : fmt(v)), yfmt, endDots: [0], suggestedMin: fichaUI.mode === 'value' ? 0 : undefined, tooltip: { filter: (c) => c.parsed.y != null } });
  const i = charts.indexOf(fichaChart); if (i >= 0) charts.splice(i, 1); // lives with the modal, not with the tab
}
/** Ficha links where the rows only carry an operation or asset id (Operaciones, Ajustes → Activos). */
function fichaHooks() {
  const txA = (tid) => { const x = (DEMO ? demoData.txs : Object.values(S.txs)).find((z) => String(z.id) === tid); return x && x.assetId; };
  $$('#view tr').forEach((tr) => { const b = tr.querySelector('[data-edit-tx],[data-edit-asset]'); const td = Array.from(tr.cells).find((c) => c.querySelector(':scope > .sw, :scope > .asset-cell')); if (!b || !td || td.dataset.ficha) return; const id = b.dataset.editAsset || txA(b.dataset.editTx); if (!id || !assetById(id)) return; td.dataset.ficha = id; td.classList.add('fcell'); td.tabIndex = 0; td.setAttribute('role', 'button'); td.title = 'Ver ficha'; });
  $$('#view .mcard .rowact').forEach((ra) => { const b = ra.querySelector('[data-edit-tx],[data-edit-asset]'); if (!b || ra.querySelector('[data-ficha]')) return; const id = b.dataset.editAsset || txA(b.dataset.editTx); if (!id || !assetById(id)) return; const f = document.createElement('button'); f.type = 'button'; f.className = 'btn small'; f.dataset.ficha = id; f.textContent = 'Ficha'; ra.insertBefore(f, b); });
}
{ const op = vOperaciones.after; vOperaciones.after = function () { if (op) op(); fichaHooks(); }; const ac = vActivos.after; vActivos.after = function () { if (ac) ac(); fichaHooks(); }; }
document.addEventListener('click', (ev) => { const t = ev.target.closest && ev.target.closest('[data-ficha]'); if (!t || (ev.target.closest('button,a') && ev.target.closest('button,a') !== t)) return; ev.preventDefault(); openFicha(t.dataset.ficha); });
document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('td[data-ficha]')) { ev.preventDefault(); openFicha(ev.target.dataset.ficha); } });

