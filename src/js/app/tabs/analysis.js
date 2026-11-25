/* ---------- Análisis (with plain-language explanations) ---------- */
// Only the reading of the user's own numbers; the generic definitions were dropped.
const X = (what, reading) => (reading ? `<div class="explain"><p>${reading}</p></div>` : '');
const benchName = () => (DEMO ? 'VWCE (ejemplo)' : (S.settings.benchName || S.settings.benchSymbol || 'el benchmark'));
function volWord(v) { return !ok(v) ? '' : v < 0.06 ? 'muy baja, propia de la renta fija' : v < 0.12 ? 'moderada, como una cartera mixta' : v < 0.2 ? 'alta, parecida a la bolsa mundial' : 'muy alta, por encima de la bolsa'; }
function ratioWord(r) { return !ok(r) ? '' : r < 0 ? 'negativo: no has compensado el riesgo' : r < 0.5 ? 'bajo' : r < 1 ? 'aceptable' : r < 2 ? 'bueno' : 'excelente (en periodos cortos suele ser en parte suerte)'; }
/** Months with no real market move: every session flat (only trades at the same price), so their 0 % means "no data". */
function monthNoData() { const mv = {}; for (const p of res.series) { const m = p.date.slice(0, 7); mv[m] = mv[m] || (p.active && Math.abs(p.r) > 1e-12); } return new Set(Object.keys(res.monthly).filter((m) => !mv[m])); }
/** Longest run of recent daily closes (gaps ≤ 4 days) among the open positions. */
function maxDailyRun() { let best = 0; for (const p of res.positions.filter((z) => z.open)) { const pts = histPts(p.assetId); let n = pts.length ? 1 : 0; for (let i = pts.length - 1; i > 0 && (Date.parse(pts[i][0]) - Date.parse(pts[i - 1][0])) / 864e5 <= 4; i--) n++; best = Math.max(best, n); } return best; }
/* ---------- Month by month, index in euros, return by year and fund ---------- */
const ownTxs = () => (DEMO ? demoData.txs || [] : Object.values(S.txs));
/** Per date and asset, EUR that went into (i) or came out of (o) the position: buys and switches in; sales, switches out and dividends. */
function assetFlowMap() {
  const out = {}; const add = (d, id, k, v) => { if (!id) return; const o = (out[d] = out[d] || {}); (o[id] = o[id] || { i: 0, o: 0 })[k] += v; };
  for (const x of ownTxs()) {
    const e = res.txEUR[x.id]; if (!e) continue;
    if (x.type === 'buy') add(x.date, x.assetId, 'i', e.eur);
    else if (x.type === 'sell' || x.type === 'dividend') add(x.date, x.assetId, 'o', e.eur);
    else if (x.type === 'transfer') { add(x.date, x.assetId, 'o', e.eur); add(x.date, x.toAssetId, 'i', e.eur); }
  }
  return out;
}
/** Calendar months: start and end patrimony (investments + cash), money you put into investments, money from outside into cash,
 *  market, cash interest, and sales whose money went to cash (internal: it does not change the patrimony). */
function monthMoves() {
  const S2 = res.series, today = res.totals.today, mvs = cashList().flatMap((c) => cashMoves(c));
  const linked = new Set(ownTxs().filter((x) => x.cashMv).map((x) => x.cashMv.mv)); const af = assetFlowMap(); const fees = ownTxs().filter((x) => x.type === 'fee');
  const first = [S2.length ? S2[0].date : today, ...mvs.map((m) => m.d)].sort()[0]; const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
  const out = []; let i = 0, prev = { value: 0, pnl: 0, holdings: {} };
  for (let m = first.slice(0, 7); m <= today.slice(0, 7); m = E.addMonths(m + '-01', 1).slice(0, 7)) {
    const d0 = E.addDays(m + '-01', -1), last = E.addDays(E.addMonths(m + '-01', 1), -1), d1 = last < today ? last : today; const inM = (d) => d > d0 && d <= d1;
    const a = prev; let b = prev; while (i < S2.length && S2[i].date <= d1) b = S2[i++]; prev = b;
    const mm = mvs.filter((x) => inM(x.d)); const interest = sum(mm.filter((x) => x.t === 'interest'), (x) => x.a);
    const toCash = sum(mm.filter((x) => x.a > 0 && x.t !== 'interest' && (linked.has(x.id) || /^venta\b/i.test(x.n))), (x) => x.a);
    const sold = sum(res.realized.filter((r) => inM(r.date)), (r) => r.proceeds); const internal = Math.min(toCash, sold);
    const c0 = cashAt(d0), c1 = cashAt(d1), market = b.pnl - a.pnl, inv = b.value - a.value - market;
    const fl = {}; for (const [d, o] of Object.entries(af)) if (inM(d)) for (const [id, f] of Object.entries(o)) fl[id] = (fl[id] || 0) + f.i - f.o;
    const rows = [...new Set([...Object.keys(a.holdings), ...Object.keys(b.holdings), ...Object.keys(fl)])].map((id) => { const s = a.holdings[id] || 0, e = b.holdings[id] || 0, p = fl[id] || 0; return { id, start: s, put: p, market: e - s - p, end: e }; })
      .filter((r) => Math.abs(r.start) + Math.abs(r.end) + Math.abs(r.put) > 0.005).sort((x, y) => y.end - x.end || y.start - x.start);
    const fee = sum(fees.filter((x) => inM(x.date)), (x) => (res.txEUR[x.id] || {}).eur || 0); if (Math.abs(fee) > 0.005) rows.push({ id: '', start: 0, put: fee, market: -fee, end: 0 });
    out.push({ m, d0, d1, partial: d1 < last, start: a.value + c0, end: b.value + c1, inv0: a.value, inv1: b.value, put: inv + internal, ext: c1 - c0 - interest - internal, market, interest, internal, rows, ret: res.monthly[m] });
  }
  return out;
}
const mmName = (m, o) => DF(Object.assign({ month: 'long', year: 'numeric', timeZone: 'UTC' }, o)).format(new Date(m + '-01T00:00:00Z'));
function monthBreakdown() {
  const all = monthMoves().filter((x) => Math.abs(x.start) + Math.abs(x.end) > 0.5); if (!all.length) return '';
  const c = all.find((x) => x.m === ui.mmonth) || all[all.length - 1]; const ci = all.indexOf(c);
  const row = (l, v, sub, n) => `<div class="stat"><span class="k">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num ${n ? '' : cls(v)}">${n ? eur(v, 0) : eurS(v, 0)}</span></div>`;
  const nav = (j, l, al) => `<button class="btn small" type="button" ${all[j] ? `data-mmonth="${all[j].m}"` : 'disabled'} aria-label="${al}">${l}</button>`;
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1); const aName = (id) => { const a = assetById(id); return a ? esc(a.ticker || a.name) : 'Comisiones aparte'; };
  const inv = { start: c.inv0, put: c.put - c.internal, market: c.market, end: c.inv1 };
  const tr = (r, nm, b) => `<tr${b ? ' class="tot"' : ''}><td>${b ? `<b>${nm}</b>` : `<span class="sw" style="background:${r.id ? acolor(r.id) : 'var(--muted)'}"></span>${nm}`}</td><td class="n xm">${eur(r.start, 0)}</td><td class="n ${cls(r.put)}">${eurS(r.put, 0)}</td><td class="n ${cls(r.market)}">${eurS(r.market, 0)}</td><td class="n">${eur(r.end, 0)}</td><td class="n xm ${cls(r.end - r.start)}">${eurS(r.end - r.start, 0)}</td></tr>`;
  const bars = all.slice(-18); const mx = Math.max(1, ...bars.flatMap((x) => [x.put + x.ext, x.market])), mn = Math.min(0, ...bars.flatMap((x) => [x.put + x.ext, x.market])); const rg = mx - mn, z = mx / rg * 100;
  const bar = (v, k2) => `<i class="${k2}" style="${v >= 0 ? `bottom:${(100 - z).toFixed(2)}%` : `top:${z.toFixed(2)}%`};height:${(Math.abs(v) / rg * 100).toFixed(2)}%"></i>`;
  return `<section class="panel" id="mmPanel"><div class="panel-h"><h2>Qué ha movido tu patrimonio</h2><div class="seg" role="group" aria-label="Periodo">${MB_W.map(([id, l]) => `<button type="button" data-mbw="${id}" aria-pressed="${id === 'N'}">${l}</button>`).join('')}</div></div>
    <div class="mm-nav">${nav(ci - 1, '‹', 'Mes anterior')}<select id="mmSel" aria-label="Mes">${all.slice().reverse().map((x) => `<option value="${x.m}"${x === c ? ' selected' : ''}>${cap(mmName(x.m))}</option>`).join('')}</select>${nav(ci + 1, '›', 'Mes siguiente')}
      <span class="small muted">${c.partial ? `en curso, hasta el ${fdate(c.d1, { year: undefined })}` : ''}${ok(c.ret) ? `${c.partial ? ' · ' : ''}rentabilidad del mes <span class="num ${cls(c.ret)}">${pctS(c.ret, 1)}</span>` : ''}</span></div>
    <p class="small" style="margin:0 0 6px">De <b class="num">${eur(c.start, 0)}</b> a <b class="num">${eur(c.end, 0)}</b>: <b class="num ${cls(c.end - c.start)}">${eurS(c.end - c.start, 0)}</b>.</p>
    <div class="stats">
      ${row('Al empezar', c.start, `cierre del ${fdate(c.d0)}`, 1)}
      ${row('Lo pusiste tú en inversiones', c.put, 'compras con dinero nuevo, menos ventas que no pasaron a efectivo')}
      ${Math.abs(c.ext) > 0.5 ? row('Dinero de fuera en el efectivo', c.ext, 'ingresos, retiradas y ajustes de tus cuentas') : ''}
      ${row('Lo puso el mercado', c.market, 'lo que han ganado o perdido tus inversiones por precio')}
      ${Math.abs(c.interest) > 0.5 ? row('Intereses del efectivo', c.interest, 'apuntados en Efectivo') : ''}
      ${row('<b>Al cerrar</b>', c.end, c.partial ? `a ${fdate(c.d1)}` : `cierre del ${fdate(c.d1)}`, 1)}
      ${c.internal > 0.5 ? `<div class="stat"><span class="k">Movimiento interno<small>ventas cuyo dinero pasó a Efectivo: no cambia el patrimonio</small></span><span class="v num muted">${eur(c.internal, 0)}</span></div>` : ''}
    </div>
    ${c.rows.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="mmt"><thead><tr><th>Inversiones</th><th class="n xm">Al empezar</th><th class="n">Aportaste</th><th class="n">Mercado</th><th class="n">Al cerrar</th><th class="n xm">Variación</th></tr></thead><tbody>${c.rows.map((r) => tr(r, aName(r.id))).join('')}${c.rows.length > 1 ? tr(inv, 'Total', 1) : ''}</tbody></table></div>${c.internal > 0.5 ? `<p class="note" style="margin:6px 0 0">En la tabla, las ventas restan en «Aportaste»; ${eur(c.internal, 0)} de ellas pasaron a Efectivo y no cuentan como dinero que sale.</p>` : ''}` : ''}
    <h3 class="eyebrow" style="margin:14px 0 2px">Tu esfuerzo y el del mercado, mes a mes</h3>
    <div class="legend"><span><i style="background:var(--s1)"></i>Lo pusiste tú (inversiones + efectivo)</span><span><i style="background:var(--s2)"></i>Lo puso el mercado</span></div>
    <div class="mm-bars" role="group" aria-label="Lo que pusiste tú y lo que puso el mercado en los últimos ${bars.length} meses">${bars.map((x, j) => `<button type="button" class="mm-g${x === c ? ' on' : ''}${j < bars.length - 12 ? ' old' : ''}" data-mmonth="${x.m}" title="${cap(mmName(x.m))}: tú ${eurS(x.put + x.ext, 0)} · mercado ${eurS(x.market, 0)}"><span class="mm-b"><span class="z" style="top:${z.toFixed(2)}%"></span>${bar(x.put + x.ext, 't')}${bar(x.market, 'k')}</span><small>${mmName(x.m, { month: 'short', year: undefined }).replace('.', '')}</small></button>`).join('')}</div>
    <p class="note" style="margin:8px 0 0">Son euros de cada mes, no rentabilidades. Pulsa un mes para verlo arriba.</p>
  </section>`;
}
/** «Con el índice tendrías»: the same net money, on the same days, in the benchmark (res.benchmark simValue), in euros and with its IRR. */
function indexFlows() { const f = []; let pi = 0, pf = 0; for (const p of res.series) { const v = p.flow - (p.income - pi) + (p.fees - pf); pi = p.income; pf = p.fees; if (Math.abs(v) > 1e-9) f.push({ date: p.date, amount: -v }); } return f; }
function indexInfo() {
  const lastB = res.benchmark ? res.benchmark[res.benchmark.length - 1] : null; if (!lastB) return null;
  const t = res.totals, f = indexFlows(), sim = lastB.simValue, V = t.value;
  return { V, sim, irr: t.xirr, simIrr: E.xirr(f.concat(sim > 0 ? [{ date: t.today, amount: sim }] : [])), pocket: -f.reduce((s, x) => s + x.amount, 0), d: V - sim };
}
function indexPanel() {
  const x = indexInfo(); if (!x) return '';
  const box = (l, v, s) => `<div class="tile"><span class="l">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const same = x.V > 0 && Math.abs(x.d) / x.V < 0.005;
  const verdict = same ? `<b>Prácticamente igual</b> que con ${esc(benchName())}: la diferencia es de ${eur(Math.abs(x.d), 0)}.` : x.d > 0 ? `<b class="gain">Vas ${eur(x.d, 0)} por delante</b> de ${esc(benchName())}.` : `<b class="loss">Con ${esc(benchName())} tendrías ${eur(-x.d, 0)} más.</b>`;
  return `<section class="panel"><div class="panel-h"><div><h2>Con el índice tendrías</h2><span class="small muted">el mismo dinero, en las mismas fechas, en ${esc(benchName())}</span></div><div class="legend"><span><i class="line" style="background:${cssv('--s1')}"></i>Tus inversiones</span><span><i class="line" style="background:${cssv('--s2')}"></i>Mismo dinero en el índice</span><span><i class="dash" style="border-color:${cssv('--ink-2')}"></i>Puesto de tu bolsillo</span></div></div>
    <div class="idx3">${box('Tus inversiones hoy', eur(x.V, 0), `TIR ${pctS(x.irr, 1)}`)}${box('Con el índice', eur(x.sim, 0), `TIR ${pctS(x.simIrr, 1)}`)}${box('Puesto de tu bolsillo', eur(x.pocket, 0), 'compras − ventas, en neto')}</div>
    <p class="small" style="margin:0 0 8px">${verdict}</p>
    <div class="chart sm"><canvas id="cIdx" role="img" aria-label="Tus inversiones frente al mismo dinero en el índice, en euros"></canvas></div>
    <p class="note" style="margin:6px 0 0">El índice se elige en Ajustes. El gráfico usa el periodo de arriba; las cajas, todo tu historial.</p></section>`;
}
function indexChart(from) {
  if (!$('#cIdx') || !res.benchmark) return;
  const { pts, i0 } = sliceFrom(from); const B = res.benchmark.slice(from ? Math.max(0, i0) : 0); const s1 = cssv('--s1'), s2 = cssv('--s2'), ink2 = cssv('--ink-2');
  mkLine($('#cIdx'), pts.map((q) => q.date), [
    { label: 'Tus inversiones', data: pts.map((q) => q.value), borderColor: s1, backgroundColor: fillGrad(s1, .14, .01), fill: 'origin' },
    { label: 'Mismo dinero en el índice', data: B.map((b) => (b ? b.simValue : null)), borderColor: s2 },
    { label: 'Puesto de tu bolsillo', data: pts.map((q) => q.invested - q.income + q.fees), borderColor: ink2, borderDash: [5, 4], borderWidth: 1.5, stepped: true },
  ], { fmt: (v) => eur(v, 0), endDots: [0, 1], suggestedMin: 0 });
}
/** TWR of each position by calendar year: each day (V_t + out_t) / (V_{t−1} + in_t) − 1, so the first day counts value against the price paid. */
function assetYearly() {
  const af = assetFlowMap(), R = {}; let prev = {};
  for (const p of res.series) {
    const y = p.date.slice(0, 4), f = af[p.date] || {};
    for (const id of new Set([...Object.keys(prev), ...Object.keys(p.holdings), ...Object.keys(f)])) {
      const v0 = prev[id] || 0, v1 = p.holdings[id] || 0, fl = f[id] || { i: 0, o: 0 }, den = v0 + fl.i; if (den <= 0.005) continue;
      const r = (v1 + fl.o) / den - 1, A = (R[id] = R[id] || {});
      const o = A[y] || (A[y] = { g: 1, from: p.date, fresh: v0 <= 0.005, mv: false }); o.g *= 1 + r; o.to = p.date; o.end = v1; if (v0 > 0.005 && Math.abs(r) > 1e-12) o.mv = true;
    }
    prev = p.holdings;
  }
  return R;
}
function assetYearPanel() {
  const R = assetYearly(), ids = Object.keys(R); if (!ids.length) return '';
  const ys = Object.keys(res.yearly).sort(), today = res.totals.today, lastY = ys[ys.length - 1];
  const pos = (id) => res.positions.find((p) => p.assetId === id); const val = (id) => (pos(id) || {}).value || 0;
  ids.sort((a, b) => val(b) - val(a) || Math.max(...Object.keys(R[b])) - Math.max(...Object.keys(R[a])));
  const yEnd = (y) => (y === today.slice(0, 4) ? today : y + '-12-31'); const sd = (d) => fdate(d, { year: undefined }).replace('.', '');
  const cell = (id, y) => {
    const o = R[id][y]; const ks = Object.keys(R[id]);
    if (!o) return ks.some((k) => k < y) ? '<td class="n muted small">vendido</td>' : '<td></td>';
    const sold = o.end <= 0.005 && o.to < yEnd(y); const sub = [o.fresh && o.from > y + '-01-01' ? `desde ${sd(o.from)}` : '', sold ? `hasta ${sd(o.to)}` : ''].filter(Boolean).join('</small><small>');
    if (!o.mv) return `<td class="n muted small">sin datos${sub ? `<small>${sub}</small>` : ''}</td>`;
    return `<td class="n ${cls(o.g - 1)}">${pctS(o.g - 1, 1)}${sub ? `<small>${sub}</small>` : ''}</td>`;
  };
  const nm = (id) => { const a = assetById(id); return a ? `<span class="sw" style="background:${acolor(id)}"></span>${esc(a.ticker || a.name)}` : esc(id); };
  return `<section class="panel"><div class="panel-h"><div><h2>Rentabilidad por año y fondo</h2><span class="small muted">TWR de tu posición en cada activo; ${lastY} hasta hoy</span></div></div>
    <div class="tbl-wrap"><table class="ay"><thead><tr><th>Activo</th>${ys.map((y) => `<th class="n">${y}</th>`).join('')}</tr></thead><tbody>
    ${ids.map((id) => `<tr${pos(id) && pos(id).open ? '' : ' class="muted"'}><td>${nm(id)}</td>${ys.map((y) => cell(id, y)).join('')}</tr>`).join('')}
    <tr class="tot"><td><b>Cartera</b></td>${ys.map((y) => `<td class="n ${cls(res.yearly[y])}"><b>${pctS(res.yearly[y], 1)}</b></td>`).join('')}</tr></tbody></table></div>
    <p class="note" style="margin:6px 0 0">Cada fila encadena los días que tuviste el activo: el primer año empieza en tu primera compra, al precio que pagaste, y no influye cuánto aportaste después.</p></section>`;
}
function vAnalisis() {
  if (!res || res.series.length < 3) return emptyState('Hace falta algo más de historial para calcular estadísticas.');
  const from = periodFrom(ui.aPeriod);
  const st = E.periodStats(res, from);
  if (!st) return emptyState('Sin datos en este periodo.');
  const b = st.bench; const t = res.totals; const V = t.value;
  const S2 = (k, v, c, sub) => `<div class="stat"><span class="k">${k}${sub ? `<small>${sub}</small>` : ''}</span><span class="v ${c || ''}">${v}</span></div>`;
  const lastB = res.benchmark ? res.benchmark[res.benchmark.length - 1] : null;
  const short = st.days < 365;
  const cov = priceCoverage(from); const low = !!(cov && cov.low); const dimC = '';
  const S3 = (...a) => (low ? '' : S2(...a)); // daily-price metrics: hidden while prices are mostly interpolated
  const k = [
    kpi('Rentabilidad TWR', pctS(t.twr), t.twrAnn != null ? `TWR anual ${pctS(t.twrAnn)}` : 'menos de 1 año', cls(t.twr), 'Rentabilidad de la estrategia, sin el efecto de cuándo aportas dinero'),
    kpi('TIR anual (XIRR)', pctS(t.xirr), 'ponderada por el dinero', cls(t.xirr), 'Tu rentabilidad real teniendo en cuenta cuándo y cuánto aportaste'),
    kpi('Dividendos', eur(t.dividends), `intereses netos del efectivo: ${eur(t.interest, 0)}`),
    kpi('Comisiones', eur(t.fees), `${pct(t.grossInvested ? t.fees / t.grossInvested : null, 2)} de lo invertido`),
  ].join('');
  const diff = b && ok(b.twr) ? st.twr - b.twr : null;
  // monthly stats for reading
  const nd = monthNoData(); const mAll = Object.entries(res.monthly).filter(([m]) => !from || m >= from.slice(0, 7)); const mv = mAll.filter(([m]) => !nd.has(m)); const mPos = mv.filter(([, r]) => r > 0).length;
  const pLbl = { '1M': 'último mes', '3M': 'últimos 3 meses', YTD: 'este año', '1A': 'último año', '3A': 'últimos 3 años' }[from ? ui.aPeriod : ''] || 'todo el historial';
  const volIds = res.correlations.ids.filter((id) => assetVol()[id] != null && res.positions.some((p) => p.assetId === id));
  const bestM = mv.slice().sort((a, c) => c[1] - a[1])[0], worstM = mv.slice().sort((a, c) => a[1] - c[1])[0];
  const mName = (m) => { const [y, mo] = m.split('-'); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleDateString(L, { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  const last12 = Array.from({ length: 12 }, (_, i) => E.addMonths(t.today, -i).slice(0, 7)); const inv12 = last12.reduce((s, m) => s + ((res.monthFlows[m] || {}).invested || 0), 0);
  return `
  <section class="kpis">${k}</section>
  ${effPanel()}
  ${zonePanel()}
  <div class="panel-h"><h2>Estadísticas · ${fdate(st.from)} – ${fdate(st.to)}</h2>${periodSeg(ui.aPeriod, 'ap')}</div>
  ${short ? '<div class="banner info"><div><b>Periodo corto.</b> Con menos de un año de datos, las cifras anualizadas y los ratios cambian mucho de una semana a otra: tómalas como orientación.</div></div>' : ''}
  ${low ? `<div class="banner" id="covWarn"><div><b>Pocos precios diarios:</b> en el ${pct(cov.share, 0)} de las sesiones del periodo (${cov.flat} de ${cov.n}) la mayor parte del valor no tiene cotización de ese día y se interpola o se repite. Por eso se ocultan la volatilidad, el VaR, el Sharpe, el Sortino, la beta, el alfa y las cifras por día: saldrían falseadas${cov.since ? `. Elige un periodo desde el ${fdate(cov.since)} para verlas` : ''}.</div></div>` : ''}
  <div class="grid g-2e">
    <section class="panel"><h3 class="eyebrow">Rentabilidad</h3><div class="stats">
      ${S2('TWR del periodo', pctS(st.twr), cls(st.twr))}
      ${S2('Anualizada (CAGR)', st.cagr != null ? pctS(st.cagr) : '—', cls(st.cagr), st.cagr == null ? 'necesita ≥ 1 año' : '')}
      ${S2('Resultado en €', eurS(st.pnl, 0), cls(st.pnl))}
      ${S3('Mejor día', pctS(st.best), 'gain', fdate(st.bestDate))}
      ${S3('Peor día', pctS(st.worst), 'loss', fdate(st.worstDate))}
      ${S3('Días en positivo', pct(st.positiveDays, 0), '', `${st.n} sesiones`)}
    </div>
    ${X('La <b>TWR</b> mide cómo ha rendido tu estrategia sin que influya cuándo metes o sacas dinero: es la cifra comparable con un fondo o un índice. La <b>CAGR</b> es esa rentabilidad expresada por año.',
      `Desde el ${fdate(st.from)} tus inversiones han rendido <b>${pctS(st.twr, 1)}</b>${st.cagr != null ? ` (${pctS(st.cagr, 1)} al año)` : ''}, <b>${eurS(st.pnl, 0)}</b> en euros.${low ? '' : ` El ${pct(st.positiveDays, 0)} de los días cerró en positivo; el peor fue el ${fdate(st.worstDate)} (${pctS(st.worst, 2)}).`}`)}</section>
    <section class="panel"><h3 class="eyebrow">Riesgo</h3><div class="stats">
      ${S3('Volatilidad anual', pct(st.vol, 1), dimC, st.nw ? `de ${st.nw} rentabilidades semanales` : '')}
      ${S2('Caída máxima', pct(st.maxDD, 1), 'loss', st.maxDDPeak ? `${fdate(st.maxDDPeak)} → ${fdate(st.maxDDTrough)}` : '')}
      ${S2('Recuperada', st.maxDDTrough ? (st.maxDDRecovery ? fdate(st.maxDDRecovery) : 'aún no') : '—')}
      ${S3('VaR 95 % semanal', pct(st.var95), dimC, ok(st.var95) ? `≈ ${eur(st.var95 * V, 0)} hoy` : 'necesita ≥ 20 semanas')}
      ${S3('CVaR 95 % semanal', pct(st.cvar95), dimC, ok(st.cvar95) ? `≈ ${eur(st.cvar95 * V, 0)}` : '')}
    </div>
    ${X('La <b>volatilidad</b> indica cuánto oscila tu cartera en un año normal. La <b>caída máxima</b> es lo peor que has vivido desde un máximo hasta el mínimo siguiente. El <b>VaR 95 %</b> es la pérdida semanal que solo se supera 1 de cada 20 semanas, y el <b>CVaR</b>, lo que pierdes de media en esas semanas malas.',
      low ? (st.maxDD < 0 ? `La peor racha fue ${pct(st.maxDD, 1)} y ${st.maxDDRecovery ? `se recuperó el ${fdate(st.maxDDRecovery)}` : 'aún no se ha recuperado del todo'}. Con tan pocos precios diarios, la volatilidad y el VaR no se pueden interpretar todavía.` : 'Con tan pocos precios diarios, la volatilidad y el VaR no se pueden interpretar todavía.') : ok(st.vol) ? `Tu volatilidad del <b>${pct(st.vol, 1)}</b> es ${volWord(st.vol)}. Con tu tamaño actual, un año malo pero normal (dos desviaciones) podría restar unos <b>${eur(2 * st.vol * V, 0)}</b>. ${ok(st.var95) ? `Una de cada 20 semanas puedes perder <b>${eur(st.var95 * V, 0)}</b> o más. ` : ''}${st.maxDD < 0 ? `La peor racha fue ${pct(st.maxDD, 1)} y ${st.maxDDRecovery ? `se recuperó el ${fdate(st.maxDDRecovery)}` : 'aún no se ha recuperado del todo'}.` : ''}` : '')}</section>
    <section class="panel"><h3 class="eyebrow">Ratios</h3><div class="stats">
      ${S3('Sharpe', ratio(st.sharpe), dimC, `sin riesgo ${pct(res.rf, 1)}`)}
      ${S3('Sortino', ratio(st.sortino), dimC)}
      ${S2('Calmar', ratio(st.calmar))}
    </div>
    ${X(`Los tres dicen si la rentabilidad compensa el riesgo. <b>Sharpe</b>: rentabilidad por encima de un activo sin riesgo (${pct(res.rf, 1)}, ajustable en Ajustes) por cada unidad de volatilidad. <b>Sortino</b>: igual, pero solo penaliza las caídas. <b>Calmar</b>: rentabilidad anual entre la peor caída. Por encima de 1 es bueno.`,
      low ? 'Con tan pocos precios diarios solo se muestra el Calmar, que usa la caída máxima.' : ok(st.sharpe) ? `Tu Sharpe de <b>${ratio(st.sharpe)}</b> es ${ratioWord(st.sharpe)}.${ok(st.sortino) && st.sortino > st.sharpe * 1.3 ? ' El Sortino es bastante mayor: buena parte de tu volatilidad son subidas, no caídas.' : ''}` : '')}</section>
    <section class="panel"><h3 class="eyebrow">Frente a ${esc(benchName())}</h3>${b ? `<div class="stats">
      ${S2(`Rentabilidad ${esc(benchName())}`, pctS(b.twr), cls(b.twr))}
      ${S2('Diferencia', ppt(diff, 1, true), cls(diff), 'tu TWR − la del índice, en puntos')}
      ${S3('Beta', ratio(b.beta))}
      ${S3('Alfa anual', pctS(b.alpha), cls(b.alpha))}
      ${S3('Correlación', ratio(b.corr))}
      ${S3('Tracking error', pct(b.trackingError, 1))}
      ${S3('Captura alcista', pct(b.upCapture, 0))}
      ${S3('Captura bajista', pct(b.downCapture, 0))}
      ${lastB ? S2('Mismo dinero en el índice', eur(lastB.simValue, 0), '', `tus inversiones: ${eur(V, 0)}`) : ''}
    </div>
    ${X(`Comparación semana a semana (${b.weeks} semanas) con ${esc(benchName())}. <b>Beta</b>: cuánto te mueves cuando se mueve el índice (1 = igual). <b>Alfa</b>: rentabilidad anual que no explica el índice. <b>Correlación</b>: 1 = os movéis juntos. <b>Tracking error</b>: cuánto te separas de él. <b>Capturas</b>: qué parte de sus subidas y de sus caídas te llevas.`,
      `En el periodo el índice hizo <b>${pctS(b.twr, 1)}</b> y tú <b>${pctS(st.twr, 1)}</b>: ${diff >= 0 ? 'le ganas' : 'te quedas atrás'} por <b>${ppt(Math.abs(diff), 1)}</b>${low ? ' ' : `; con una beta de ${ratio(b.beta)}, si ${esc(benchName())} cae un 10 % tu cartera tiende a caer ~${pct(Math.abs((b.beta || 0) * 0.1), 1)}. Te llevas el ${pct(b.upCapture, 0)} de sus subidas y el ${pct(b.downCapture, 0)} de sus caídas${ok(b.upCapture) && ok(b.downCapture) && b.upCapture > b.downCapture ? ', un perfil favorable' : ''}. `}${lastB ? `Si cada euro que aportaste lo hubieras metido en el índice el mismo día, hoy tendrías <b>${eur(lastB.simValue, 0)}</b> frente a tus ${eur(V, 0)}.${eurGapNote(lastB.simValue, V, diff)}` : ''}`)}` : `<p class="note">Todavía no hay suficientes semanas en común con el índice.</p>`}</section>
  </div>
  ${res.benchmark ? `<section class="panel"><div class="panel-h"><h2>Tú frente a ${esc(benchName())}</h2><div class="legend"><span><i class="line" style="background:${cssv('--s1')}"></i>Tus inversiones (TWR)</span><span><i class="line" style="background:${cssv('--s2')}"></i>${esc(benchName())}</span></div></div><div class="chart"><canvas id="cVsB" role="img" aria-label="Comparativa con el benchmark"></canvas></div>
    ${X('Las dos líneas parten de 0 % al inicio del periodo y muestran cuánto habría crecido cada euro. Así se compara la estrategia, sin que influya cuándo aportaste.', '')}</section>` : ''}
  <section class="panel"><div class="panel-h"><h2>Caída desde máximos</h2><span class="small muted" id="ddInfo"></span></div><div class="chart sm"><canvas id="cDD" role="img" aria-label="Caída desde máximos"></canvas></div>
    ${X('En cada momento, cuánto estaba tu cartera por debajo de su máximo anterior (con la TWR, sin contar aportaciones). Te ayuda a saber qué caídas has aguantado de verdad.', st.maxDD < 0 ? `La mayor fue de <b>${pct(st.maxDD, 1)}</b> entre el ${fdate(st.maxDDPeak)} y el ${fdate(st.maxDDTrough)}; en euros de hoy serían unos ${eur(-st.maxDD * V, 0)}.` : '')}
    ${dropHistory()}</section>
  <section class="panel"><div class="panel-h"><h2>Rentabilidad mensual</h2><span class="small muted">TWR por mes; en la última columna, el año</span></div>${heatmap()}
    ${X('Cada casilla es la rentabilidad de ese mes (verde sube, rojo baja; cuanto más intenso, más grande). La última columna encadena los meses del año.', mv.length ? `En el periodo elegido (${pLbl}): ${mPos} de ${mv.length} meses en positivo${mAll.length > mv.length ? ` (sin contar ${mAll.length - mv.length} sin datos, «s/d»)` : ''}. Mejor mes: ${mName(bestM[0])} (${pctS(bestM[1], 1)}); peor: ${mName(worstM[0])} (${pctS(worstM[1], 1)}).` : '')}</section>
  <section class="panel"><div class="panel-h"><h2>Aportaciones por mes</h2><div class="legend"><span><i style="background:${cssv('--s1')}"></i>Invertido</span><span><i style="background:${cssv('--s2')}"></i>Retirado (ventas)</span><span><i style="background:${cssv('--s3')}"></i>Dividendos</span></div></div><div class="chart sm"><canvas id="cFlows" role="img" aria-label="Aportaciones mensuales"></canvas></div>
    ${X('Dinero que has metido o sacado de tus inversiones cada mes (compras y ventas), y dividendos cobrados. No incluye el efectivo.', `En los últimos 12 meses has invertido <b>${eur(inv12, 0)}</b>: una media de <b>${eur(inv12 / 12, 0)} comprados al mes</b> (${eur(pjAvgMonthly(), 0)} netos de ventas).`)}</section>
  <section class="panel"><div class="panel-h"><h2>Riesgo por activo</h2>${volIds.length ? `<div class="legend"><span><i style="background:${cssv('--s1')}"></i>Volatilidad (color del activo)</span><span><i style="background:${alpha(cssv('--muted'), .35)}"></i>Peso</span></div>` : ''}</div>${volIds.length ? '<div class="chart sm" id="volBox"><canvas id="cAVol" role="img" aria-label="Volatilidad por activo"></canvas></div>' : volLow() ? '<p class="note" id="volBox">La mayoría de tus precios diarios son estimados (los fondos solo tienen algunos valores liquidativos sueltos), así que la volatilidad de cada activo saldría falseada. Se mostrará cuando haya suficientes precios reales.</p>' : `<p class="note" id="volBox">Para la volatilidad de cada activo hacen falta 20 cierres diarios seguidos; ahora hay ${maxDailyRun()}. Se completará solo con las actualizaciones diarias.</p>`}
</section>
  ${indexPanel()}
  ${assetYearPanel()}`;
}
vAnalisis.after = function () {
  if (!res || res.series.length < 3) return;
  effChart();
  const from = periodFrom(ui.aPeriod);
  const s1 = cssv('--s1'), s2 = cssv('--s2'), s3 = cssv('--s3'), g = cssv('--gain-fill'), l = cssv('--loss');
  { const { base, pts } = sliceFrom(from); let pk = base ? base.index : 1; const dd = pts.map((q) => { pk = Math.max(pk, q.index); return q.index / pk - 1; }); const lc = cssv('--loss');
    mkLine($('#cDD'), pts.map((q) => q.date), [{ label: 'Caída', data: dd, borderColor: lc, backgroundColor: fillGrad(lc, .04, .26), fill: 'origin', borderWidth: 1.5 }], { fmt: (v) => pct(v), yfmt: (v) => pct(v, 0), suggestedMax: 0, suggestedMin: -0.02 });
    const el = $('#ddInfo'); if (el) el.innerHTML = `máx. <span class="num loss">${pct(Math.min(0, ...dd), 1)}</span> · actual <span class="num">${pct(dd[dd.length - 1], 1)}</span>`;
    if (res.benchmark && $('#cVsB')) {
      const i0 = from ? res.series.findIndex((p) => p.date >= from) : 0; const bi = base ? base.index : 1;
      const B = res.benchmark; const bb = B[Math.max(0, i0 - 1)] || B.find((x) => x && x.has);
      const b0 = bb ? bb.level : null;
      mkLine($('#cVsB'), pts.map((q) => q.date), [
        { label: 'Tus inversiones', data: pts.map((q) => q.index / bi - 1), borderColor: s1, backgroundColor: fillGrad(s1, .16, .01), fill: 'origin' },
        { label: benchName(), data: B.slice(Math.max(0, i0)).map((x) => (x && b0 ? x.level / b0 - 1 : null)), borderColor: s2 },
      ], { fmt: (v) => pctS(v, 1), yfmt: (v) => pct(v, 0), endDots: [0, 1], tooltip: { callbacks: { footer: (it) => { const a = it.find((x) => x.datasetIndex === 0), b = it.find((x) => x.datasetIndex === 1); return a && b && b.parsed.y != null ? `Diferencia: ${pctS(a.parsed.y - b.parsed.y, 1).replace(/\s?%/, ' p. p.')}` : ''; } } } });
    }
  }
  const months = Object.keys(res.monthFlows).sort().slice(-24);
  const mlab = (m) => { const [y, mo] = m.split('-'); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleDateString(L, { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
  mkBar($('#cFlows'), months, [
    { label: 'Invertido', data: months.map((m) => res.monthFlows[m].invested), backgroundColor: s1 },
    { label: 'Retirado', data: months.map((m) => -res.monthFlows[m].withdrawn), backgroundColor: s2 },
    { label: 'Dividendos', data: months.map((m) => res.monthFlows[m].income), backgroundColor: s3 },
  ], { xlab: mlab, titleFmt: mlab, stacked: false });
  indexChart(from);
  const ids = res.correlations.ids.filter((id) => assetVol()[id] != null);
  const rows = ids.map((id) => res.positions.find((p) => p.assetId === id)).filter(Boolean);
  const hw = $('table.heat'); if (hw && hw.parentElement) hw.parentElement.scrollLeft = hw.parentElement.scrollWidth; // the year column is sticky, so the latest months show with their year
  const box = $('#volBox'); if (!box || !$('#cAVol')) return;
  if (box) box.style.height = Math.max(160, rows.length * 34 + 50) + 'px';
  mkBar($('#cAVol'), rows.map((p) => p.asset.ticker || p.asset.name), [
    { label: 'Volatilidad', data: rows.map((p) => res.correlations.vol[p.assetId]), backgroundColor: rows.map((p) => acolor(p.assetId)) },
    { label: 'Peso', data: rows.map((p) => p.weight), backgroundColor: rows.map(() => alpha(cssv('--muted'), .35)) },
  ], { horizontal: true, fmt: (v) => pct(v, 1), yfmt: (v) => pct(v, 0) });
};

