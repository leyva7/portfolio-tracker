/* ================= Secciones (v3 «simplificar»): Inicio, Cartera, Análisis y Plan =================
 * Cada sección responde una pregunta: ¿cómo voy?, ¿qué tengo?, ¿lo hago bien?, ¿hacia dónde voy?
 * Reutiliza los paneles de siempre; aquí solo se agrupan. Efectivo, Movimientos (operaciones) e Impuestos (fiscal)
 * pasan a ser detalles de Cartera y Análisis, y Ajustes se abre desde el engranaje.
 */
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const since = () => '<span class="since">desde el inicio</span>';

/* ---------- Inicio ---------- */
const RV_TAG = { 'Concentración': 'Peso', 'Riesgo desproporcionado': 'Riesgo', 'Fuera de tu plan': 'Objetivo', 'Tu efectivo': 'Efectivo' };
/** Warnings that ask for something: interest not recorded, deferred losses and the «warn» insights. */
function revisarItems() {
  const out = []; if (!res || DEMO) return out;
  const y = res.totals.today.slice(0, 4);
  for (const h of interestHints(y)) out.push({ prio: 0, tag: 'Interés', title: `${res.incomeRows.some((r) => r.type === 'interest' && String(r.year) === String(y)) ? 'Te faltan intereses' : 'Intereses sin anotar'} en ${esc(h.c.name)}`, sub: `${(() => { const got = res.incomeRows.filter((r) => r.type === 'interest' && String(r.year) === String(y)).reduce((t, r) => t + (+r.gross || +r.amount || 0), 0); return got >= 1 ? `llevas ${eur(got, 0)} brutos apuntados; faltan unos ${eur(h.n, 0)} de ${h.months} mes${h.months === 1 ? '' : 'es'}` : `rondarían ${eur(h.n, 0)} en ${h.months} mes${h.months === 1 ? '' : 'es'} de ${y}`; })()} · cuentan para la Renta`, act: `<button class="btn small" type="button" data-mv="interest" data-acc="${esc(h.c.id)}">Anotar</button>` });
  const f = res.fiscal[y];
  if (f && f.deferredPending < -0.004) out.push({ prio: 3, tag: 'Fiscal', title: 'Pérdidas diferidas por recompra', sub: `${eur(-f.deferredPending)} que aún no puedes compensar (regla de recompra)`, act: '<a href="#fiscal" data-goto="fiscal" class="small">Ver</a>' });
  for (const i of buildInsights()) if (i.tone === 'warn') {
    if (/^Frente a/.test(i.title)) { out.push({ prio: i.prio, tag: 'Índice', title: `Vas por detrás de ${esc(benchName())}`, sub: (() => { const ix = typeof indexInfo === 'function' && indexInfo(); return ix && ix.sim > ix.V ? `desde que empezaste: con el índice tendrías ${eur(ix.sim - ix.V, 0)} más` : 'desde que empezaste'; })(), act: '<a href="#analisis" data-goto="analisis" data-period="MAX" data-to="idxPanel" class="small">Ver</a>' }); continue; }
    out.push({ prio: i.prio, tag: RV_TAG[i.title] || 'Aviso', title: i.title, sub: i.text });
  }
  return out.sort((a, b) => a.prio - b.prio);
}
function paraRevisar() {
  if (!res || DEMO) return '';
  const it = revisarItems(), top = it.slice(0, 3), more = it.slice(3), rest = buildInsights().filter((i) => i.tone !== 'warn');
  const nb = (t) => String(t).replace(/(\d) %/g, '$1\u00a0%').replace(/(\d) €/g, '$1\u00a0€');
  const li = (x) => `<div class="rv-i"><span class="rv-tag">${x.tag}</span><div class="rv-b"><div class="rv-t">${nb(x.title)}</div><div class="small muted">${nb(x.sub)}</div></div>${x.act || ''}</div>`;
  const sum = [more.length ? `${more.length} aviso${more.length === 1 ? '' : 's'} más` : '', rest.length ? `${rest.length} dato${rest.length === 1 ? '' : 's'} de tu cartera` : ''].filter(Boolean).join(' y ');
  return `<section class="panel" id="revPanel"><div class="panel-h"><h2>Para revisar</h2><span class="small muted">${it.length ? (it.length === 1 ? '1 aviso' : `${it.length} avisos`) : 'nada pendiente'}</span></div>
    ${top.length ? `<div class="rv-list">${top.map(li).join('')}</div>` : '<p class="small muted" style="margin:0">Todo en orden: no hay nada que revisar.</p>'}
    ${sum ? `<details class="rv-more"><summary>${sum}</summary>${more.length ? `<div class="rv-list">${more.map(li).join('')}</div>` : ''}${rest.length ? `<div class="ins-list" style="margin-top:10px">${rest.map(insightCard).join('')}</div>` : ''}</details>` : ''}
  </section>`;
}
function vInicio() {
  if (!res || !res.series.length) return emptyState('Añade activos y operaciones para ver tu cartera.');
  return `<div class="grid g-2e">${moveBreakdown() || ''}${paraRevisar()}</div>
  ${estPanel()}
  ${dropLine()}
  ${goalLine()}
  <section class="panel">
    <div class="panel-h"><h2>Evolución</h2>${periodSeg(ui.period, 'p')}</div>
    <div class="evo-bar">${evoSeg()}<div class="legend" id="mainLegend"></div></div>
    <div class="chart tall"><canvas id="cMain" role="img" aria-label="Evolución del patrimonio"></canvas></div>
    <div class="small muted" id="mainFoot"></div>
  </section>`;
}
vInicio.after = function () { vResumen.after(); };
/** The savings goal in one line (the detail lives in Plan). */
function goalLine() {
  const g = typeof goalInfo === 'function' && goalInfo(); if (!g) return '';
  return `<section class="panel" id="goalLine"><div class="rv-i rv-solo"><span class="rv-tag">Objetivo</span><div class="rv-b"><div class="rv-t">${esc(g.name)}: ${pct(g.share, 0)}</div><div class="small muted">${g.left > 0 ? `${eur(g.cash, 0)} de ${eur(g.amount, 0)}${g.cu ? ` (sin tu colchón de ${eur(g.cu.amount, 0)})` : ''} · faltan ${eur(g.left, 0)}${g.eta && g.pace > 0 ? ` · a tu ritmo, hacia ${fdate(g.eta, { day: undefined })}` : ''}` : 'objetivo alcanzado'}</div><div class="goalbar" style="margin-top:6px" aria-hidden="true"><span style="width:${(g.share * 100).toFixed(1)}%"></span></div></div><a href="#proyeccion" data-goto="proyeccion" class="small">Ver</a></div></section>`;
}
/** The drop warning in one line (the history of drops lives in Análisis › Riesgo y caídas). Same rule as dropPanel: a week down 3 % or more. */
function dropLine() {
  if (!res || DEMO || res.series.length < 30) return '';
  const th = 0.03; const W = weekRets(); if (!W.length) return '';
  const today = res.totals.today; const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  let cur = W[W.length - 1]; if (!(cur.r <= -th) && dow <= 1 && W.length > 1 && W[W.length - 2].mon === E.addDays(monOf(today), -7)) cur = W[W.length - 2];
  if (!(cur.r <= -th) || cur.mon < E.addDays(monOf(today), -7)) return '';
  const isThis = cur.mon === monOf(today);
    return `<section class="panel" id="dropPanel"><div class="rv-i rv-solo"><span class="rv-tag">Caída</span><div class="rv-b"><div class="rv-t">${isThis ? 'Esta semana tus inversiones han caído' : 'La semana pasada tus inversiones cayeron'} un ${pct(-cur.r, 1)}</div><div class="small muted">del ${fdate(cur.mon, { year: undefined })} al ${fdate([cur.end || E.addDays(cur.mon, 4), lastMktDate() || '9999'].sort()[0], { year: undefined })} · sin contar el efectivo</div></div><a href="#analisis" data-goto="analisis" data-to="riskPanel" class="small">Ver</a></div></section>`;
}

/* ---------- Cartera ---------- */
const repView = () => (ui.rep = ui.rep || lsGet('cartera-rep', 'clase'));
const zMapOn = () => (ui.zmap == null ? (ui.zmap = lsGet('cartera-zmap', '0') === '1') : ui.zmap);
const zDevOn = () => (ui.zdev == null ? (ui.zdev = lsGet('cartera-zdev', '0') === '1') : ui.zdev);
document.addEventListener('click', (e) => {
  const z = e.target.closest('.zmap [data-z]'); if (z) { const box = $('#zmInfo'); if (box) box.innerHTML = z.dataset.info; $$('.zmap [data-z]').forEach((x) => x.classList.toggle('on', x.dataset.z === z.dataset.z)); return; }
  const b = e.target.closest('[data-rep],[data-zmap],[data-taxy],[data-zdev]'); if (!b) return;
  if (b.dataset.zdev) { ui.zdev = b.dataset.zdev === '1'; lsSet('cartera-zdev', ui.zdev ? '1' : '0'); render(); return; }
  if (b.dataset.rep) { ui.rep = b.dataset.rep; lsSet('cartera-rep', ui.rep); }
  else if (b.dataset.zmap) { ui.zmap = b.dataset.zmap === '1'; lsSet('cartera-zmap', ui.zmap ? '1' : '0'); }
  else { ui.taxY = b.dataset.taxy; ui.fiscalYear = ui.taxY; }
  render();
});
/** World map of the money in equities: each MSCI zone is shaded by its weight; the legend shows the world weight next to it. */
function zoneMap(rows) {
  const W = WORLD_MAP; const dev = true; const w = Object.fromEntries(rows.map((r) => [r.k, r]));
  const gap = (r) => r.w * 100 - ZONE_WORLD[r.k]; const maxW = Math.max(...rows.map((r) => r.w), 0.01), maxG = Math.max(...rows.map((r) => Math.abs(gap(r))), 1);
  const paint = (r) => (dev ? { c: gap(r) >= 0 ? 'var(--accent)' : 'var(--s4)', o: (0.3 + 0.65 * Math.abs(gap(r)) / maxG).toFixed(2) } : { c: 'var(--accent)', o: (0.3 + 0.65 * r.w / maxW).toFixed(2) });
  const g = (r) => { const d = gap(r); return `${d >= 0 ? '+' : '−'}${numf(Math.abs(d), 0)} p. p.`; };
  const info = (r) => `<b>${r.l}</b>: ${pct(r.w, 0)} de tu bolsa (${eur(r.v, 0)}); en la bolsa mundial, ${ZONE_WORLD[r.k]} %. ${gap(r) >= 0 ? 'Pesa más' : 'Pesa menos'} que en el mundo: ${g(r)}`;
  return `<figure class="zmap">
    <svg viewBox="0 0 800 ${W.h}" role="img" aria-label="Mapa del mundo: ${rows.map((r) => `${r.l} ${pct(r.w, 0)}, mundo ${ZONE_WORLD[r.k]} %`).join('; ')}">
      <path d="${W.p.rest}" class="zm-rest"><title>Sin peso en tus fondos</title></path>
      ${ZONES.map(([k]) => { const p = paint(w[k]); return `<path d="${W.p[k]}" class="zm-z" style="fill:${p.c};fill-opacity:${p.o}" data-z="${k}" data-info="${esc(info(w[k]))}"><title>${esc(info(w[k]).replace(/<[^>]+>/g, ''))}</title></path>`; }).join('')}
    </svg>
    <p class="small" id="zmInfo" aria-live="polite">Toca una zona para ver su detalle.</p>
    <figcaption class="zm-lg">${rows.map((r) => { const p = paint(r); return `<span class="zm-li"><i style="background:${p.c};opacity:${p.o}"></i><span class="zm-n">${r.l}</span><b class="num">${dev ? g(r) : pct(r.w, 0)}</b><span class="small muted num">${dev ? `tú ${pct(r.w, 0)} · mundo ${ZONE_WORLD[r.k]} %` : `mundo ${ZONE_WORLD[r.k]} %`}</span></span>`; }).join('')}</figcaption>
    <p class="small muted" style="margin:4px 0 0">Cada zona se compara con su peso en la bolsa mundial. Azul: en tu bolsa pesa más. Ocre: pesa menos. Cuanto más intenso, más diferencia. «Otros desarrollados» son Canadá, Australia, Israel, Nueva Zelanda, Hong Kong y Singapur; los dos últimos no se ven a esta escala.</p></figure>`;
}
function fundBars() {
  const open = res.positions.filter((p) => p.open && p.value > 0).sort((a, b) => b.value - a.value); if (!open.length) return '';
  const maxW = open[0].value;
  return `<div class="toppos">${open.map((p, i) => `<button type="button" class="tp-row alink" data-ficha="${esc(p.assetId)}"><div class="tp-name"><span class="sw" style="background:${acolor(p.assetId)}"></span><span>${esc(p.asset.ticker || p.asset.name)}</span></div><div class="tp-bar"><span style="--mj:${i};width:${(p.value / maxW * 100).toFixed(1)}%;background:${acolor(p.assetId)}"></span>${p.target != null ? `<i class="tp-tgt" style="left:${Math.min(100, p.target * res.totals.value / maxW * 100).toFixed(1)}%" title="Objetivo ${pct(p.target, 0)}"></i>` : ''}</div><span class="num tp-v">${eur(p.value, 0)}</span><span class="num muted tp-w">${pct(p.weight, 0)}${p.target != null ? ` <small>obj. ${pct(p.target, 0)}</small>` : ''}</span></button>`).join('')}</div>${mixBar(open)}`;
}
function repartoPanel() {
  const P = patrimony(); const z = zoneBody(false); const v = repView() === 'zona' && !z ? 'clase' : repView();
  const al = classAlloc();
  const seg = `<div class="seg" role="group" aria-label="Ver el reparto por">${[['clase', 'Clase'], ['zona', 'Zona'], ['fondo', 'Fondo']].filter(([k]) => k !== 'zona' || z).map(([k, l]) => `<button type="button" data-rep="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (v === 'zona') body = `<div class="rep-sub"><span class="small muted">lo invertido en bolsa, mirando dentro de cada fondo</span><div class="seg seg-sm" role="group" aria-label="Vista">${[['0', 'Barras'], ['1', 'Mapa']].map(([k, l]) => `<button type="button" data-zmap="${k}" aria-pressed="${zMapOn() === (k === '1')}">${l}</button>`).join('')}</div></div>${zoneBody(zMapOn())}`;
  else if (v === 'fondo') body = `<p class="small muted" style="margin:0 0 8px">lo invertido, por fondo; toca uno para ver su ficha</p>${fundBars()}`;
  else body = `<div class="donut-wrap"><div class="chart donut"><canvas id="cAlloc" role="img" aria-label="Reparto por clase de activo"></canvas></div>
      <ul class="alloc-list">${al.map((a, i) => `<li data-di="${i}" tabindex="0"><span class="sw" style="background:${a.color}"></span><span>${a.label}</span><span class="num">${eur(a.value, 0)}</span><span class="num muted">${pct(a.weight, 0)}</span></li>`).join('')}</ul></div>`;
  const tgt = res.rebalance.length ? '' : `<div class="rv-i rep-tgt"><div class="rv-b"><div class="rv-t">Pesos objetivo</div><div class="small muted">fíjalos en cada activo y verás cuánto te desvías y dónde poner la próxima aportación</div></div><a href="#activos" data-goto="activos" class="small">Fijar</a></div>`;
  return `<section class="panel" id="repPanel"><div class="panel-h"><h2>Reparto</h2><span class="small muted num">${eur(v === 'clase' ? P.total : v === 'zona' ? zoneSplit().eq : P.inv, 0)}</span></div>${seg}<div class="rep-body">${body}</div>${tgt}</section>`;
}
function cashCard() {
  const list = cashList(), tot = cashTotal(), P = patrimony(), one = list.length === 1 && !DEMO ? list[0] : null;
  const rows = list.map((c) => { const bal = cashBal(c); return `<a class="cc-row" href="#efectivo" data-goto="efectivo"><span class="cc-ic" aria-hidden="true">€</span><span class="cc-b"><b>${esc(c.name)}</b><span class="small muted">${[esc(c.entity || ''), +c.rate ? `TAE ${pct(+c.rate / 100, 2)} · ~${eur(bal * c.rate / 100, 0)}/año` : ''].filter(Boolean).join(' · ')}</span></span><b class="num">${eur(bal, 0)}</b>${CHEV}</a>`; }).join('');
  return `<section class="panel" id="cashCard"><div class="panel-h"><div><h2>Efectivo</h2><span class="small muted">${list.length} cuenta${list.length === 1 ? '' : 's'} · ${pct(P.total ? tot / P.total : 0, 0)} del patrimonio</span></div><b class="num cc-tot">${eur(tot, 0)}</b></div>
    ${list.length ? `<div class="cc-list">${rows}</div>` : '<p class="small muted" style="margin:0">Sin cuentas de efectivo.</p>'}
    ${one ? `<div class="toolbar"><button class="btn primary small" type="button" data-mv="in" data-acc="${esc(one.id)}">+ Ingreso</button><button class="btn small" type="button" data-mv="out" data-acc="${esc(one.id)}">− Retirada</button><button class="btn small" type="button" data-mv="interest" data-acc="${esc(one.id)}">Intereses</button></div>` : ''}
    <div class="pos-foot"><button class="btn ghost small" type="button" data-act="add-cash">Añadir cuenta</button>${list.length ? '<a href="#efectivo" data-goto="efectivo" class="small">Movimientos, saldo y evolución</a>' : ''}</div></section>`;
}
function movCard() {
  const keep = ui.txf; ui.txf = { asset: '', type: '', year: '', q: '' }; let rows; try { rows = txRows(); } finally { ui.txf = keep; }
  if (!rows.length) return '';
  const it = (x) => {
    if (x._cash) return `<div class="mv-r"><span class="mv-l"><b>${MV_TYPES[x.t] || x.t}</b> · ${esc(x.acc.name)}${x.n ? ` <span class="muted">· ${esc(x.n)}</span>` : ''}<small>${fdate(x.date, { year: undefined })}</small></span><span class="num ${x.t === 'open' ? '' : cls(x.a)}">${x.t === 'open' ? eur(x.a) : eurS(x.a)}</span></div>`;
    const a = assetById(x.assetId), e2 = res && res.txEUR[x.id], toA = x.type === 'transfer' ? assetById(x.toAssetId) : null;
    const v = e2 ? (x.type === 'buy' || x.type === 'fee' ? -e2.eur : e2.eur) : null;
    return `<div class="mv-r"><span class="mv-l"><b>${TXT[x.type] || x.type}</b> · ${a ? esc(a.ticker || a.name) : '—'}${toA ? ' → ' + esc(toA.ticker || toA.name) : ''}<small>${fdate(x.date, { year: undefined })}</small></span><span class="num ${x.type === 'buy' || x.type === 'sell' ? '' : cls(v)}">${v == null ? '' : x.type === 'buy' || x.type === 'fee' ? eur(v) : eurS(v)}</span></div>`;
  };
  const nTx = rows.filter((x) => !x._cash).length, nC = rows.length - nTx;
  return `<section class="panel" id="movCard"><div class="panel-h"><div><h2>Movimientos</h2><span class="small muted">los últimos; operaciones y efectivo juntos</span></div></div>
    <div class="mv-list">${rows.slice(0, 5).map(it).join('')}</div>
    <div class="pos-foot"><span class="small muted">${nTx} operaciones y ${nC} movimientos de efectivo</span><a href="#operaciones" data-goto="operaciones" class="small">Ver los ${rows.length}</a></div></section>`;
}
function vCartera() {
  if (!res || !res.positions.length) return vPosiciones();
  vPosiciones(); const P = vPosiciones.parts;
  return `${P.main}
  <div class="grid g-2e">${repartoPanel()}<div class="col-stack">${cashCard()}${movCard()}</div></div>
  ${res.rebalance.length ? P.reb : ''}
  ${P.last}`;
}
vCartera.after = function () {
  const c = $('#cAlloc'); if (!c) return; const al = classAlloc();
  donutLegend(mkDonut(c, al.map((a) => a.label), al.map((a) => a.value), al.map((a) => a.color)), $('.alloc-list'));
};

/* ---------- Análisis ---------- */
function taxPanel() {
  const years = Object.keys(res.fiscal).sort().reverse(); if (!years.length) return '';
  const y = ui.taxY && years.includes(ui.taxY) ? ui.taxY : years[0];
  const { f, g, rcm, tax } = fiscalCalc(y); const sales = res.realized.filter((s) => String(s.year) === y);
  const nG = sales.filter((s) => s.gain >= 0).length, nL = sales.length - nG; const hints = interestHints(y);
  const r = (l, sub, v, c) => `<div class="stat"><span class="k">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num ${c || ''}">${v}</span></div>`;
  return `<section class="panel" id="taxPanel"><div class="panel-h"><div><h2>Impuestos</h2><span class="small muted">por ejercicio fiscal, no por el periodo</span></div>${years.length > 1 ? `<div class="seg" role="group" aria-label="Ejercicio">${years.slice(0, 3).map((k) => `<button type="button" data-taxy="${k}" aria-pressed="${k === y}">${k}</button>`).join('')}</div>` : ''}</div>
    <div class="stats">
      ${r('Ganancias netas', sales.length ? `${nSales(nG)} con ganancia${nL ? `, ${nL} con pérdida` : ''}` : 'sin ventas', eurS(g), cls(g))}
      ${f.deferredPending ? r('Pérdidas diferidas', 'bloqueadas por la regla de recompra; toca abajo para ver de dónde salen', eur(-f.deferredPending), 'loss') : ''}
      ${r('Dividendos e intereses', hints.length ? 'faltan intereses de la cuenta por anotar' : 'brutos', eur(rcm))}
      ${r('<b>Cuota estimada</b>', 'base del ahorro', `<b>${eur(tax)}</b>`)}
    </div>
    ${f.deferredPending ? `<details class="an-more wash"><summary>¿De dónde salen las pérdidas diferidas?</summary>${res.realized.filter((x) => x.washSale && x.deferred).map((x) => `<p class="small" style="margin:6px 0 0">Vendiste <b>${esc(assetById(x.assetId)?.ticker || assetById(x.assetId)?.name || '')}</b> el ${fdate(x.date)} con una pérdida de ${eur(-x.gain)}, y ${x.washSaleDate ? `compraste el mismo fondo el ${fdate(x.washSaleDate)}, a menos de ${x.washSaleWindow === 12 ? 'un año' : '2 meses'} de la venta` : `compraste el mismo fondo a menos de ${x.washSaleWindow === 12 ? 'un año' : '2 meses'} de la venta`}. Hacienda no te deja restar ${eur(-x.deferred)} de esa pérdida mientras tengas esas participaciones; cuando las vendas, se aplica. No la pierdes: se aplaza.</p>`).join('')}</details>` : ''}
    <div class="pos-foot"><span class="small muted">Detalle por venta para la Renta e informe descargable</span><a href="#fiscal" data-goto="fiscal" class="small">Abrir</a></div></section>`;
}
function vAnalisis3() {
  if (!res || res.series.length < 3) return emptyState('Hace falta algo más de historial para calcular estadísticas.');
  const from = periodFrom(ui.aPeriod); const st = E.periodStats(res, from);
  if (!st) return emptyState('Sin datos en este periodo.');
  const b = st.bench, t = res.totals, V = t.value;
  const cov = priceCoverage(from), low = !!(cov && cov.low);
  const S2 = (k, v, c, sub) => `<div class="stat"><span class="k">${k}${sub ? `<small>${sub}</small>` : ''}</span><span class="v ${c || ''}">${v}</span></div>`;
  const S3 = (...a) => (low ? '' : S2(...a));
  const fees = ownTxs().filter((x) => !from || x.date >= from).reduce((s, x) => s + (+x.fees || 0) + (x.type === 'fee' && res.txEUR[x.id] ? Math.abs(res.txEUR[x.id].eur) : 0), 0);
  const diff = b && ok(b.twr) ? st.twr - b.twr : null; const ix = indexInfo();
  const nd = monthNoData(); const mAll = Object.entries(res.monthly).filter(([m]) => !from || m >= from.slice(0, 7)); const mv = mAll.filter(([m]) => !nd.has(m)); const mPos = mv.filter(([, x]) => x > 0).length;
  const bestM = mv.slice().sort((a, c) => c[1] - a[1])[0], worstM = mv.slice().sort((a, c) => a[1] - c[1])[0];
  const mName = (m) => mmName(m);
  const kp = [
    kpi('Rentabilidad', pctS(st.twr, 1), st.cagr != null && st.days > 400 ? `TWR · ${pctS(st.cagr, 1)} al año` : `TWR · ${{ '1M': 'último mes', '3M': 'últimos 3 meses', YTD: 'en ' + new Date().getFullYear(), '1A': 'último año', '3A': 'últimos 3 años' }[from ? ui.aPeriod : ''] || 'desde el inicio'}`, cls(st.twr), 'Rentabilidad de la estrategia en el periodo, sin el efecto de cuándo aportas dinero'),
    kpi('Resultado', eurS(st.pnl, 0), 'en euros, en el periodo', cls(st.pnl)),
    kpi('Costes', eur(fees), 'compraventa · el TER, en la ficha'),
    kpi('Tu dinero ha rendido', pctS(t.xirr, 1), 'TIR anual · desde el inicio', cls(t.xirr), `Ponderada por el dinero: tiene en cuenta cuándo y cuánto aportaste. La de Inicio (${ok(t.twrAnn) ? `≈ ${pctS(t.twrAnn, 0)} al año` : 'TWR'}) mide la estrategia, como si todo el dinero hubiera estado desde el principio. Si aportaste mucho justo antes de subidas, la TIR sale mayor.`),
  ].join('');
  const idx = res.benchmark && b ? `<section class="panel" id="idxPanel"><div class="panel-h"><div><h2>Frente a ${esc(benchName())}</h2><span class="small muted">cada euro de tu estrategia frente al índice, en el periodo</span></div><div class="legend"><span><i class="line" style="background:${cssv('--s1')}"></i>Tú</span><span><i class="line" style="background:${cssv('--s2')}"></i>${esc(benchName())}</span></div></div>
    ${ix ? `<p class="idx-lead">${since()} Con el mismo dinero en el índice tendrías <b class="num">${eur(ix.sim, 0)}</b>; tienes <b class="num">${eur(ix.V, 0)}</b> (<span class="${cls(ix.V - ix.sim)}">${eurS(ix.V - ix.sim, 0)}</span>). <span class="small muted">Los puntos de abajo miden la estrategia, como si todo el dinero hubiera estado desde el principio; los euros, tu dinero real con sus fechas. Por eso no van en proporción.</span></p>` : ''}
    <div class="chart"><canvas id="cVsB" role="img" aria-label="Tu rentabilidad frente al índice"></canvas></div>
    <div class="idx3"><div class="tile"><span class="l">Tú</span><span class="v num ${cls(st.twr)}">${pctS(st.twr, 1)}</span></div><div class="tile"><span class="l">Índice</span><span class="v num ${cls(b.twr)}">${pctS(b.twr, 1)}</span></div><div class="tile"><span class="l">Diferencia</span><span class="v num ${cls(diff)}">${ppt(diff, 1, true)}</span></div></div>
    <p class="small" style="margin:0">En el periodo ${diff >= 0 ? 'le ganas' : 'te quedas atrás'} por <b>${ppt(Math.abs(diff), 1)}</b>${!low && ok(b.beta) ? ` Con una beta de ${ratio(b.beta)}, si el índice cae un 10 % tu cartera tiende a caer ~${pct(Math.abs(b.beta * 0.1), 1)}.` : ''}</p>
    ${ix ? `<div class="idx-euros">${since()} Puesto de tu bolsillo (compras − ventas): ${eur(ix.pocket, 0)} · TIR del índice ${pctS(ix.simIrr, 1)}, la tuya ${pctS(ix.irr, 1)}.</div>` : ''}
    <details class="an-more"><summary>Más datos frente al índice</summary><div class="stats">
      ${S3('Beta', ratio(b.beta))}${S3('Alfa anual', pctS(b.alpha), cls(b.alpha))}${S3('Correlación', ratio(b.corr))}${S3('Tracking error', pct(b.trackingError, 1))}${S3('Captura alcista', pct(b.upCapture, 0))}${S3('Captura bajista', pct(b.downCapture, 0))}${S2('Semanas comparadas', String(b.weeks))}
    </div>${low ? '<p class="small muted">Con tan pocos precios diarios se ocultan la beta, el alfa y las capturas: saldrían falseadas.</p>' : ''}
    ${ix ? `<div class="chart sm" style="margin-top:10px"><canvas id="cIdx" role="img" aria-label="Tus inversiones frente al mismo dinero en el índice, en euros"></canvas></div><p class="note" style="margin:6px 0 0">En euros: tus inversiones, el mismo dinero en las mismas fechas en el índice y lo puesto de tu bolsillo. El índice se elige en Ajustes.</p>` : ''}</details>
  </section>` : '';
  const mes = `<section class="panel" id="mesPanel"><div class="panel-h"><h2>Mes a mes</h2><span class="small muted">TWR por mes; ${window.innerWidth < 640 ? 'la última fila' : 'la última columna'}, el año</span></div>${heatmap()}
    ${mv.length ? `<p class="small muted" style="margin:6px 0 0">La tabla enseña todo tu historial. En el periodo elegido (${fdate(st.from)} – ${fdate(st.to)}), ${mPos} de ${mv.length} meses en positivo${mAll.length > mv.length ? ` (sin contar ${mAll.length - mv.length} sin datos, «s/d»)` : ''}. Mejor, ${mName(bestM[0])} (${pctS(bestM[1], 1)}); peor, ${mName(worstM[0])} (${pctS(worstM[1], 1)}).</p>` : ''}</section>`;
  const risk = `<section class="panel" id="riskPanel"><div class="panel-h"><h2>Riesgo y caídas</h2><span class="small muted" id="ddInfo"></span></div>
    <div class="chart sm"><canvas id="cDD" role="img" aria-label="Caída desde máximos"></canvas></div>
    <div class="stats">
      ${S2('Caída máxima del periodo', pct(st.maxDD, 1), 'loss', st.maxDDPeak ? `${fdate(st.maxDDPeak)} → ${fdate(st.maxDDTrough)}${st.maxDDTrough ? (st.maxDDRecovery ? ` · recuperada el ${fdate(st.maxDDRecovery)}` : ' · sin recuperar') : ''}` : '')}
      ${S3('Volatilidad anual', pct(st.vol, 1), '', ok(st.vol) ? volWord(st.vol) : '')}
      ${S3('VaR 95 % semanal', pct(st.var95), '', ok(st.var95) ? `≈ ${eur(st.var95 * V, 0)} hoy · se supera 1 de cada 20 semanas` : 'necesita ≥ 20 semanas')}
      ${S3('CVaR 95 % semanal', pct(st.cvar95), '', ok(st.cvar95) ? `≈ ${eur(st.cvar95 * V, 0)} de media en esas semanas` : '')}
    </div>
    ${low ? '<p class="small muted" style="margin:6px 0 0">Con tan pocos precios diarios, la volatilidad y el VaR no se pueden interpretar todavía.</p>' : ''}
    ${dropHistory()}</section>`;
  const contrib = `<section class="panel"><div class="panel-h"><div><h2>Qué ha aportado cada fondo ${since()}</h2><span class="small muted">latente + realizado + rentas; las cerradas, en gris; las de menos de 20 €, juntas</span></div></div><div class="chart sm" id="contribBox"><canvas id="cContrib" role="img" aria-label="Contribución por activo"></canvas></div></section>`;
  return `<div class="an-top">${periodSeg(ui.aPeriod, 'ap')}<span class="small muted">Todo lo de esta pestaña usa este periodo (${fdate(st.from)} – ${fdate(st.to)}), salvo lo marcado ${since()}</span></div>
  ${st.days < 365 ? '<div class="banner info"><div><b>Periodo corto.</b> Con menos de un año de datos las cifras cambian mucho de una semana a otra: tómalas como orientación.</div></div>' : ''}
  ${low ? `<div class="banner" id="covWarn"><div><b>Pocos precios diarios:</b> en el ${pct(cov.share, 0)} de las sesiones del periodo la mayor parte del valor no tiene cotización de ese día. Por eso se ocultan la volatilidad, el VaR, la beta y las capturas${cov.since ? `. Elige un periodo desde el ${fdate(cov.since)} para verlas` : ''}.</div></div>` : ''}
  <section class="kpis">${kp}</section>
  ${idx}
  ${mes}
  <div class="grid g-2e"><div class="col-stack">${contrib}${taxPanel()}</div><div class="col-stack">${risk}</div></div>
  <div class="grid g-2e"><div class="col-stack">${effPanel()}</div><div class="col-stack">${assetYearPanel()}</div></div>
  ${aiPanel()}`;
}
vAnalisis3.after = function () { vAnalisis.after(); vPosiciones.after(); };

/* ---------- Plan ---------- */
function aportPanel() {
  const t = res.totals; const last12 = Array.from({ length: 12 }, (_, i) => E.addMonths(t.today, -i).slice(0, 7));
  const inv12 = last12.reduce((s, m) => s + ((res.monthFlows[m] || {}).invested || 0), 0), n12 = last12.filter((m) => ((res.monthFlows[m] || {}).invested || 0) > 0).length;
  const box = (l, v, s) => `<div class="tile"><span class="l">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const plans = recurPlans();
  return `<section class="panel" id="aportPanel"><div class="panel-h"><div><h2>Aportaciones</h2><span class="small muted" id="aportSub">${(() => { const m = +pjOpts().m, avg = pjAvgMonthly(); return Math.abs(m - avg) < 1 ? `la proyección usa tu media neta: ${eur(avg, 0)}/mes` : `la proyección usa ${eur(m, 0)}/mes (tu media neta es ${eur(avg, 0)})`; })()}</span></div><div class="legend"><span><i style="background:${cssv('--s1')}"></i>Invertido</span><span><i style="background:${cssv('--s2')}"></i>Retirado (ventas)</span><span><i style="background:${cssv('--s3')}"></i>Dividendos</span></div></div>
    <div class="idx3">${box('Comprado, 12 meses', eur(inv12, 0))}${box('Media al mes', eur(inv12 / 12, 0), `${eur(pjAvgMonthly(), 0)} netos de ventas`)}${box('Constancia', `${n12} de 12`, 'meses con compras')}</div>
    <div class="chart sm"><canvas id="cFlows" role="img" aria-label="Aportaciones mensuales"></canvas></div>
    ${res.rebalance.length ? contribBlock() : '<div class="rv-i"><div class="rv-b"><div class="rv-t">Voy a aportar…</div><div class="small muted">fija pesos objetivo en tus activos y te digo cómo repartir la próxima compra</div></div><a href="#activos" data-goto="activos" class="small">Fijar</a></div>'}
    <div class="rv-i"><div class="rv-b"><div class="rv-t">Compras periódicas</div><div class="small muted">${plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 'es'} · tus órdenes de cada mes` : 'apunta tus órdenes de cada mes y se anotan solas'}</div></div><button class="btn small" type="button" data-recurring="${plans.length ? 'manage' : 'new'}">${plans.length ? 'Ver' : 'Añadir'}</button></div>
  </section>`;
}
const pjChipsHtml = (o) => `<span class="chip">${eur(o.m, 0)}/mes</span><span class="chip">${o.h} años</span><span class="chip">inflación ${numf(+o.inf, 1)} %</span><span class="chip">${o.cash ? 'con' : 'sin'} efectivo</span>`;
function vPlan() {
  if (!res || !res.series.length) return vProyeccion();
  const o = pjOpts();
  const chips = `<div class="pj-chips"><span id="pjChips" style="display:contents">${pjChipsHtml(o)}</span><button class="btn ghost small" type="button" data-pjopen="1" aria-expanded="${!!ui.pjEdit}" aria-controls="pjSup">${ui.pjEdit ? 'Ocultar supuestos' : 'Cambiar'}</button></div>`;
  const pj = vProyeccion().replace('<div class="small muted" id="pjFoot"></div>', `${chips}<div class="small muted" id="pjFoot"></div>`).replace('<section class="panel"><div class="panel-h"><h2>Supuestos</h2>', `<section class="panel" id="pjSup"${ui.pjEdit ? '' : ' hidden'}><div class="panel-h"><h2>Supuestos</h2>`);
  return `${pj}
  <div class="grid g-2e">${aportPanel()}<div class="col-stack">${goalPanel(false)}${cushionPanel()}</div></div>`;
}
vPlan.after = function () {
  vProyeccion.after();
  const s1 = cssv('--s1'), s2 = cssv('--s2'), s3 = cssv('--s3');
  const months = Object.keys(res.monthFlows).sort().slice(-24);
  const mlab = (m) => { const [y, mo] = m.split('-'); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleDateString(L, { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
  mkBar($('#cFlows'), months, [
    { label: 'Invertido', data: months.map((m) => res.monthFlows[m].invested), backgroundColor: s1 },
    { label: 'Retirado', data: months.map((m) => -res.monthFlows[m].withdrawn), backgroundColor: s2 },
    { label: 'Dividendos', data: months.map((m) => res.monthFlows[m].income), backgroundColor: s3 },
  ], { xlab: mlab, titleFmt: mlab, stacked: false });
};
/* «Cambiar» shows the assumptions panel and takes you there */
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-pjopen]')) return; ui.pjEdit = !ui.pjEdit; render();
  if (ui.pjEdit) setTimeout(() => { const p = $('#pjSup'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
});
