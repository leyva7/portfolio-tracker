/* ---------- Resumen (visual) ---------- */
/** Stacked bar of the open positions by weight, with how much the three largest concentrate. */
function mixBar(pos) {
  const tot = pos.reduce((s, p) => s + p.value, 0); if (pos.length < 2 || !(tot > 0)) return '';
  const top = pos.slice(0, 3), w3 = top.reduce((s, p) => s + p.value, 0) / tot; const nm = (p) => esc(p.asset.ticker || p.asset.name);
  return `<div class="mixbar-wrap"><div class="panel-h"><h3>Por activo</h3><span class="small muted">las 3 mayores son el ${pct(w3, 0)} de lo invertido</span></div>
    <div class="mixbar" role="img" aria-label="Peso de cada posición: ${pos.slice(0, 8).map((p) => `${nm(p)} ${pct(p.value / tot, 0)}`).join(', ')}${pos.length > 8 ? ` y ${pos.length - 8} más` : ''}">${pos.map((p) => `<span style="flex:${(p.value / tot).toFixed(4)} 1 0;background:${acolor(p.assetId)}" title="${nm(p)} · ${pct(p.value / tot, 1)}"></span>`).join('')}</div>
    <div class="mixbar-lg">${top.map((p) => `<span><span class="sw" style="background:${acolor(p.assetId)}"></span>${nm(p)} <span class="num muted">${pct(p.value / tot, 0)}</span></span>`).join('')}${pos.length > 3 ? `<span class="muted">+${pos.length - 3} más</span>` : ''}</div></div>`;
}
function vResumen() {
  if (!res || !res.series.length) return emptyState('Añade activos y operaciones para ver tu cartera.');
  const t = res.totals; const y = ytdInfo(); const P = patrimony();
  const tile = (l, v, s, c) => `<div class="tile"><span class="l">${l}</span><span class="v ${c || ''}">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const al = classAlloc();
  const insAll = buildInsights(); const ins = insAll.slice(0, 3), insMore = insAll.slice(3);
  const openPos = res.positions.filter((p) => p.open && p.value > 0).sort((a, b) => b.value - a.value); const topPos = openPos.length <= 8 ? openPos : openPos.slice(0, 7); const moreN = openPos.length - topPos.length;
  const maxW = topPos.length ? topPos[0].value : 1;
  return `
  <section class="tiles">
    ${tile('Plusvalía latente', eurS(t.unrealized, 0), pctS(t.costBasis ? t.unrealized / t.costBasis : null, 1) + ' sobre el coste', cls(t.unrealized))}
    ${ok(t.xirr) ? tile('TIR anual', pctS(t.xirr, 1), 'ponderada por el dinero', cls(t.xirr)) : tile('TWR anual', pctS(t.twrAnn, 1), 'rentabilidad de la estrategia', cls(t.twrAnn))}
    ${tile(`En ${t.today.slice(0, 4)}`, y ? eurS(y.pnl, 0) : '—', y ? `TWR ${pctS(y.twr, 1)} · aportado ${eurS(y.invested, 0)}` : '', cls(y && y.pnl))}
    ${tile('Efectivo', eur(P.cash, 0), P.cash ? `${pct(P.total ? P.cash / P.total : 0, 0)} del patrimonio · TAE ${pct(cashRate(), 2)}` : '<a href="#efectivo" data-goto="efectivo">Añadir cuentas</a>')}
  </section>
  ${estPanel()}
  ${dropPanel()}
  ${goalPanel(true)}
  ${moveBreakdown()}
  <section class="panel">
    <div class="panel-h"><h2>Evolución del patrimonio</h2>${periodSeg(ui.period, 'p')}</div>
    <div class="evo-bar">${evoSeg()}<div class="legend" id="mainLegend"></div></div>
    <div class="chart tall"><canvas id="cMain" role="img" aria-label="Evolución del patrimonio"></canvas></div>
    <div class="small muted" id="mainFoot"></div>
  </section>
  <div class="grid g-2e">
    <section class="panel"><div class="panel-h"><h2>Reparto</h2><span class="small muted">${eur(P.total, 0)}</span></div>
      <div class="donut-wrap"><div class="chart donut"><canvas id="cAlloc" role="img" aria-label="Reparto por tipo de activo"></canvas></div>
      <ul class="alloc-list">${al.map((a, i) => `<li data-di="${i}" tabindex="0"><span class="sw" style="background:${a.color}"></span><span>${a.label}</span><span class="num">${eur(a.value, 0)}</span><span class="num muted">${pct(a.weight, 0)}</span></li>`).join('')}</ul></div>
      ${mixBar(openPos)}
    </section>
    <section class="panel"><div class="panel-h"><h2>Lo más destacado</h2></div>
      <div class="ins-list">${ins.map(insightCard).join('') || '<p class="muted">Sin novedades.</p>'}</div>
      ${insMore.length ? `<details><summary>${insMore.length} indicador${insMore.length === 1 ? '' : 'es'} más</summary><div class="ins-list" style="margin-top:10px">${insMore.map(insightCard).join('')}</div></details>` : ''}
    </section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Principales posiciones</h2><a href="#posiciones" data-goto="posiciones" class="small">Ver todas</a></div>
    <div class="toppos">${topPos.map((p, i) => `<div class="tp-row"><div class="tp-name"><span class="sw" style="background:${acolor(p.assetId)}"></span><span>${esc(p.asset.name || p.asset.ticker)}</span></div><div class="tp-bar"><span style="--mj:${i};width:${(p.value / maxW * 100).toFixed(1)}%;background:${acolor(p.assetId)}"></span></div><span class="num tp-v" data-fv="t:${esc(p.assetId)}" data-fn="${p.value}">${eur(p.value, 0)}</span><span class="chip ${p.unrealized >= 0 ? 'inc' : 'sell'} num">${pctS(p.unrealizedPct, 1)}</span></div>`).join('')}${moreN > 0 ? `<a href="#posiciones" data-goto="posiciones" class="small">+${moreN} más</a>` : ''}</div>
  </section>
  ${aiPanel()}`;
}
const MB_W = [['S', 'Semana', 7], ['M', 'Mes', 30], ['A', 'Año', 0], ['N', 'Meses', 0]];
/** Change of the patrimony in the last week / month / this year, split into market, interest, money that came in or went out,
 *  and the sales and buys that only move money between investments and cash. */
function moveBreakdown() {
  if (!res || !res.series.length || DEMO) return '';
  if (ui.mbw === 'N') return monthBreakdown();
  const k = MB_W.find((w) => w[0] === ui.mbw) || MB_W[0]; let today = res.totals.today;
  // «Semana»: the calendar week of the latest market closes (a trade of yours today doesn't move it), the same week as the drop warning
  const lp = lastMktDate();
  const from = k[0] === 'S' ? E.addDays(monOf(lp || today), -1) : k[2] ? E.addDays(today, -k[2]) : `${today.slice(0, 4) - 1}-12-31`;
  const S2 = res.series; const at = (d) => { let r = null; for (const q of S2) { if (q.date <= d) r = q; else break; } return r || { value: 0, invested: 0, pnl: 0 }; };
  if (k[0] === 'S' && lp && lp < today) today = lp; // the week stops at the latest close; what you record after it shows up next week
  const a = at(from), b = at(today);
  const dCash = cashAt(today) - cashAt(from); const dP = b.value - a.value + dCash;
  const market = b.pnl - a.pnl;
  const interest = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest' && m.d > from && m.d <= today).reduce((t, m) => t + m.a, 0);
  const ext = dP - market - interest;
  const sold = res.realized.filter((r) => r.date > from && r.date <= today).reduce((t, r) => t + r.proceeds, 0);
  const bought = Object.values(S.txs).filter((x) => x.type === 'buy' && x.date > from && x.date <= today).reduce((t, x) => { const fa = assetById(x.assetId); const f = x.fx || (fa && fa.currency !== 'EUR' ? fxFor(fa.currency, x.date) : 1) || 1; return t + x.qty * x.price * f + (+x.fees || 0); }, 0);
  const row = (l, v, sub) => `<div class="stat"><span class="k">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num ${cls(v)}">${eurS(v, 0)}</span></div>`;
  return `<section class="panel"><div class="panel-h"><h2>Qué ha movido tu patrimonio</h2><div class="seg" role="group" aria-label="Periodo">${MB_W.map(([id, l]) => `<button type="button" data-mbw="${id}" aria-pressed="${id === k[0]}">${id === 'A' ? today.slice(0, 4) : l}</button>`).join('')}</div></div>
    <div class="stats">
      ${row('Mercado', market, k[0] === 'S' ? (() => { const fl = {}; for (const x of Object.values(S.txs)) if ((x.type === 'buy' || x.type === 'sell') && x.date > from && x.date <= today && res.txEUR[x.id]) fl[x.assetId] = (fl[x.assetId] || 0) + (x.type === 'buy' ? 1 : -1) * Math.abs(res.txEUR[x.id].eur); const ah = a.holdings || {}, bh = b.holdings || {}; const by = [...new Set([...Object.keys(ah), ...Object.keys(bh)])].map((id) => ({ id, m: (bh[id] || 0) - (ah[id] || 0) - (fl[id] || 0) })).filter((r) => Math.abs(r.m) >= 1).sort((x, y) => Math.abs(y.m) - Math.abs(x.m)).slice(0, 3); return `por el precio de tus inversiones${by.length ? `: ${by.map((r) => `${esc(assetById(r.id)?.ticker || r.id)} ${eurS(r.m, 0)}`).join(' · ')}` : ''}`; })() : 'por el precio de tus inversiones')}
      ${interest ? row('Intereses del efectivo', interest, 'apuntados en Efectivo') : ''}
      ${row('Dinero que entra o sale', ext, 'ingresos, retiradas y compras con dinero de fuera')}
      <div class="stat"><span class="k"><b>Cambio del patrimonio</b><small>${k[0] === 'S' ? `semana del ${fdate(E.addDays(from, 1), { year: undefined })}` : `desde el ${fdate(from)}`}</small></span><span class="v num ${cls(dP)}"><b>${eurS(dP, 0)}</b></span></div>${k[0] === 'S' && today < res.totals.today ? (() => { const after = Object.values(S.txs).filter((x) => x.date > today && ['buy', 'sell'].includes(x.type)).map((x) => `${x.type === 'buy' ? 'compra' : 'venta'} ${esc(assetById(x.assetId)?.ticker || '')} ${eur(Math.abs((res.txEUR[x.id] || {}).eur || 0), 0)}`).concat(cashList().flatMap((c) => cashMoves(c)).filter((m) => m.d > today && m.t !== 'open' && !/^venta\b/i.test(m.n || '')).map((m) => `${m.t === 'interest' ? 'intereses' : m.a >= 0 ? 'ingreso' : 'retirada'} ${eurS(m.a, 0)}`)); return after.length ? `<p class="small muted" style="margin:8px 0 0">Apuntado después del cierre del ${fdate(today, { year: undefined })}: ${after.join(' · ')}. Cuenta en la semana siguiente.</p>` : ''; })() : ''}
    </div>
    ${sold > 0.5 || bought > 0.5 ? `<p class="small muted" style="margin:8px 0 0">${sold > 0.5 ? `Vendiste por <b class="num">${eur(sold, 0)}</b>` : ''}${sold > 0.5 && bought > 0.5 ? ' y ' : ''}${bought > 0.5 ? `${sold > 0.5 ? 'compraste' : 'Compraste'} por <b class="num">${eur(bought, 0)}</b>` : ''}. Mover dinero entre ventas, Efectivo y compras no cambia el patrimonio; solo cuenta el que entra de fuera.</p>` : ''}
  </section>`;
}
vResumen.after = function () {
  if (!res || !res.series.length) return;
  const from = periodFrom(ui.period); const { base, pts } = sliceFrom(from);
  let foot = '';
  const cash = pts.map((p) => cashAt(p.date));
  const C = chartBase(); if (!C) return;
  if (evoView() === 'tipo') evoByType(pts, cash); else evoTotal(pts, cash);
  const last = pts[pts.length - 1], b = base || { pnl: 0 };
  const firstCash = cashList().map((c) => (cashPts(c)[0] || [])[0]).filter(Boolean).sort()[0];
  foot = (firstCash && firstCash > (pts[0] || {}).date ? `El efectivo cuenta desde que lo registraste (${fdate(firstCash)}). ` : '') + `En el periodo tus inversiones ganaron <b class="${cls(last.pnl - b.pnl)} num">${eurS(last.pnl - b.pnl, 0)}</b>. ` + (evoView() === 'tipo' ? 'Cada franja es una clase de activo, de menos a más riesgo hacia arriba; el borde superior es tu patrimonio total.' : 'La franja entre las dos líneas es lo que has ganado o perdido sobre lo que has puesto. Vender no cambia el patrimonio: el dinero pasa a efectivo.');
  $('#mainFoot').innerHTML = foot;
  const al = classAlloc();
  donutLegend(mkDonut($('#cAlloc'), al.map((a) => a.label), al.map((a) => a.value), al.map((a) => a.color)), $('.alloc-list'));
};
/* ---------- Resumen: patrimony over time ---------- */
const evoView = () => { if (ui.evo == null) { try { ui.evo = localStorage.getItem('cartera-evo') || 'total'; } catch (e) { ui.evo = 'total'; } } return ui.evo === 'tipo' ? 'tipo' : 'total'; };
// 'tipo' stays as the stored key so a saved choice still works; the view now splits by asset class, like the Reparto donut
function evoSeg() { const v = evoView(); return `<div class="seg" role="group" aria-label="Vista del gráfico" id="evoSeg">${[['total', 'Total'], ['tipo', 'Por clase']].map(([k, l]) => `<button type="button" data-evo="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div>`; }
/** Total: what you have (investments + cash) against what you put in; the band between them is the gain or loss. */
function evoTotal(pts, cash) {
  const acc = cssv('--accent'), ink2 = cssv('--chart-base'), g = cssv('--accent'), l = cssv('--loss'), k = darkUI() ? .16 : .12;
  const tot = pts.map((p, i) => p.value + cash[i]), ap = pts.map((p, i) => p.invested + cash[i]);
  const ch = mkLine($('#cMain'), pts.map((p) => p.date), [
    { label: 'Dinero aportado', data: ap, borderColor: ink2, borderDash: [4, 4], borderWidth: 1.6, stepped: true },
    { label: 'Patrimonio', data: tot, borderColor: acc, borderWidth: 2.4, fill: { target: 0, above: alpha(g, k), below: alpha(l, k) } },
  ], { endDots: [1], clean: true, tooltip: {
    itemSort: (x, y) => y.datasetIndex - x.datasetIndex,
    callbacks: { footer: (it) => { if (!it.length) return ''; const p = pts[it[0].dataIndex], d = p.value - p.invested; return `${d >= 0 ? 'Ganado' : 'Perdido'}: ${eurS(d, 0)}`; } } } });
  $('#mainLegend').innerHTML = `<span><i class="line" style="background:${acc}"></i>Patrimonio <span class="muted">(inversiones + efectivo)</span></span><span><i class="dash" style="border-color:${ink2}"></i>Dinero aportado</span><span><i style="background:${alpha(g, .18)};box-shadow:inset 0 0 0 1px ${acc}"></i>Ganancia</span>`;
  return ch;
}
// Bottom to top: from the steadiest to the most volatile
const EVO_ORDER = ['cash', 'rf', 'oro', 'otro', 'rv', 'cripto'];
/** Daily value of each asset class (cash accounts included) over the given series points; layers add up to value + cash. */
function evoLayers(pts, cash) {
  const cl = {}; for (const a of assetList()) cl[a.id] = clsOf(a);
  const L2 = Object.fromEntries(EVO_ORDER.map((k) => [k, pts.map(() => 0)]));
  pts.forEach((p, i) => { for (const [id, v] of Object.entries(p.holdings || {})) L2[L2[cl[id]] ? cl[id] : 'otro'][i] += v; L2.cash[i] += cash ? cash[i] : cashAt(p.date); });
  return EVO_ORDER.filter((k) => L2[k].some((v) => Math.abs(v) > 0.005)).map((k) => ({ key: k, label: CLS_LABEL[k], color: clsColor(k), data: L2[k] }));
}
function evoByType(pts, cash) {
  const lay = evoLayers(pts, cash), a = darkUI() ? .42 : .3;
  // soft fills with a crisp top edge per layer; same colours as the Reparto donut
  const ds = lay.map((l, i) => ({ label: l.label, data: l.data, borderColor: l.color, borderWidth: 1.5, backgroundColor: alpha(l.color, a), fill: i ? '-1' : 'origin', stack: 'p' }));
  const ch = mkLine($('#cMain'), pts.map((p) => p.date), ds, { stacked: true, suggestedMin: 0, clean: true, tooltip: {
    filter: (c) => Math.abs(c.parsed.y) > 0.005,
    itemSort: (x, y) => y.datasetIndex - x.datasetIndex,
    callbacks: {
      label: (c) => { const t = lay.reduce((s, l) => s + l.data[c.dataIndex], 0); return ` ${c.dataset.label}: ${eur(c.parsed.y, 0)} · ${pct(t ? c.parsed.y / t : 0, 0)}`; },
      footer: (it) => { if (!it.length) return ''; const i = it[0].dataIndex; return `Total: ${eur(lay.reduce((s, l) => s + l.data[i], 0), 0)}`; },
    } } });
  const k = pts.length - 1, t = lay.reduce((s, l) => s + l.data[k], 0);
  $('#mainLegend').innerHTML = lay.slice().reverse().map((l) => `<span><i style="background:${l.color}"></i>${l.label}${l.data[k] > 0.5 ? ` <span class="num muted">${pct(t ? l.data[k] / t : 0, 0)}</span>` : ''}</span>`).join('');
  return ch;
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-evo]'); if (!b || b.disabled || b.getAttribute('aria-pressed') === 'true') return; ui.evo = b.dataset.evo; try { localStorage.setItem('cartera-evo', ui.evo); } catch (er) {} render(); });
/** Legend rows drive the donut: hover (or tap) pulls that slice out, shows it in the centre and dims the rest. */
function donutLegend(ch, ul) {
  if (!ch || !ul) return;
  const base = ch.data.datasets[0].backgroundColor.slice(); let cur = null, fT = 0;
  const hl = (i) => { if (i === cur) return; cur = i; ul.classList.toggle('hl', i != null); $$('li', ul).forEach((li) => li.classList.toggle('on', +li.dataset.di === i)); ch.data.datasets[0].backgroundColor = base.map((c, k) => (i == null || k === i ? c : alpha(c, .3))); ch.setActiveElements(i == null ? [] : [{ datasetIndex: 0, index: i }]); ch.update('active'); };
  ul.addEventListener('pointerover', (e) => { const li = e.target.closest('li[data-di]'); if (li && e.pointerType === 'mouse') hl(+li.dataset.di); });
  ul.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hl(null); });
  ul.addEventListener('focusin', (e) => { const li = e.target.closest('li[data-di]'); if (li && cur !== +li.dataset.di) { fT = 1; hl(+li.dataset.di); } });
  ul.addEventListener('focusout', (e) => { fT = 0; if (!ul.contains(e.relatedTarget)) hl(null); });
  ul.addEventListener('click', (e) => { const li = e.target.closest('li[data-di]'); if (!li || e.pointerType === 'mouse') return; if (fT) { fT = 0; return; } hl(cur === +li.dataset.di ? null : +li.dataset.di); });
}

