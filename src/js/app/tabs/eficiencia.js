/* ---------- Análisis: «¿Qué tal está construida tu cartera?» ----------
 * Forward-looking risk/return map from long-run assumptions by sub-class (not from the viewer's short price history),
 * plus an efficiency score: the invested part's expected Sharpe against the best long-only mix of the same building blocks
 * and a world index. The realized check (Sharpe vs the benchmark) uses the same weekly figures as «Frente a …».
 */
// Equity and other sub-classes: label, extra expected return over the class base (pts), long-run volatility (%)
const SUBS = {
  world: ['Bolsa mundial', 0, 15], us: ['Bolsa de EE. UU.', 0, 16], dev: ['Desarrollados sin EE. UU.', 0, 16], em: ['Emergentes', 0.5, 20],
  small: ['Pequeñas empresas', 0.5, 19], sector: ['Sectorial o temática', 0, 24], single: ['Acción individual', 0, 30],
  rf: ['Renta fija', 0, null], oro: ['Oro', 0, null], cripto: ['Cripto', 0, null], otro: ['Otros', 0, null],
};
const SUB_EQ = ['world', 'us', 'dev', 'em', 'small', 'sector', 'single'];
// Long-run correlations between equity blocks (approximate, EUR investor)
const SUB_RHO = { 'world|us': 0.96, 'world|dev': 0.9, 'world|em': 0.8, 'world|small': 0.92, 'us|dev': 0.8, 'us|em': 0.68, 'us|small': 0.86, 'dev|em': 0.8, 'dev|small': 0.88, 'em|small': 0.78 };
function subRho(a, b) {
  if (a === b) return 1; const ea = SUB_EQ.includes(a), eb = SUB_EQ.includes(b);
  if (ea && eb) { if (a === 'single' || b === 'single') return 0.5; if (a === 'sector' || b === 'sector') return 0.75; return SUB_RHO[a + '|' + b] ?? SUB_RHO[b + '|' + a] ?? 0.8; }
  const k = [a, b].map((x) => (SUB_EQ.includes(x) ? 'rv' : x)).sort().join('|');
  return { 'cripto|rv': 0.4, 'otro|rv': 0.5, 'oro|rv': 0.1, 'rf|rv': 0.1, 'oro|rf': 0.3, 'cripto|oro': 0.1, 'cripto|rf': 0 }[k] ?? 0.15;
}
/** Sub-class of an asset: the one saved in the asset, else inferred from its class, type and name. */
function subOf(a) {
  if (!a) return 'otro'; if (a.sub && SUBS[a.sub]) return a.sub;
  const c = clsOf(a); if (c !== 'rv') return SUBS[c] ? c : 'otro';
  if (a.type === 'stock' && !/\bET[CFN]\b/i.test(a.name || '')) return 'single';
  const n = `${a.name || ''} ${a.category || ''}`;
  if (/emerg/i.test(n)) return 'em';
  if (/small|peque[ñn]|mid ?cap/i.test(n)) return 'small';
  if (/ex[- ]?(usa|us\b|u\.s\.)|europe|europa|japan|jap[oó]n|pacific|eurozone|stoxx|ibex|dax/i.test(n)) return 'dev';
  if (/energy|energ[ií]a|biotech|health|salud|solar|clean|tech|tecnolog|semicon|sector|robot|water|agua|real estate|reit|inmobil/i.test(n)) return 'sector';
  if (/s&p ?500|s&p ?us|nasdaq|\busa\b|u\.s\.|\bus\b|united states|america/i.test(n)) return 'us';
  return 'world';
}
/** Expected return (base scenario, fraction) and volatility (fraction) of a sub-class, from the Proyección assumptions. */
function subRV(k, o) {
  const s = SUBS[k] || SUBS.otro;
  if (SUB_EQ.includes(k)) { const r = pjRow(o, 'rv'); return [(r[1] + s[1]) / 100, s[2] / 100]; }
  const r = pjRow(o, k === 'otro' ? 'otro' : k); return [r[1] / 100, r[3] / 100];
}
function mixStats(w, keys, o) { // w: weights (sum 1) over keys
  let m = 0, v = 0; const rv = keys.map((k) => subRV(k, o));
  keys.forEach((a, i) => { m += w[i] * rv[i][0]; keys.forEach((b, j) => { v += w[i] * w[j] * rv[i][1] * rv[j][1] * subRho(a, b); }); });
  return { mu: m, vol: Math.sqrt(Math.max(0, v)) };
}
/** Long-only weights with the highest Sharpe over the given blocks (projected gradient ascent on the simplex). */
function maxSharpe(keys, o, rf) {
  const n = keys.length; let w = keys.map(() => 1 / n); const sh = (x) => { const s = mixStats(x, keys, o); return s.vol > 1e-9 ? (s.mu - rf) / s.vol : -Infinity; };
  let best = sh(w), step = 0.2;
  for (let it = 0; it < 400 && step > 1e-4; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j || w[j] < 1e-12) continue; const d = Math.min(step, w[j]); const x = w.slice(); x[i] += d; x[j] -= d; const s = sh(x);
      if (s > best + 1e-12) { best = s; w = x; moved = true; }
    }
    if (!moved) step /= 2;
  }
  return { w, sharpe: best, ...mixStats(w, keys, o) };
}
/** Best expected return for each level of risk (long-only, cash included): maximise mu − λ·var for a sweep of λ. */
function frontier(keys, o, cr) {
  const K = keys.concat(['cash']); const n = K.length;
  const st = (w) => { const m = mixStats(w.slice(0, -1), keys, o); return { mu: m.mu + w[n - 1] * cr, vol: m.vol }; };
  const out = []; let w = K.map((k) => (k === 'cash' ? 1 : 0));
  for (const lam of Array.from({ length: 48 }, (_, i) => 300 * Math.pow(0.84, i)).concat([0])) {
    const f = (x) => { const q = st(x); return q.mu - lam * q.vol * q.vol; }; let best = f(w), step = 0.25;
    for (let it = 0; it < 300 && step > 1e-4; it++) { let mv = false; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (i === j || w[j] < 1e-12) continue; const d = Math.min(step, w[j]); const x = w.slice(); x[i] += d; x[j] -= d; const v = f(x); if (v > best + 1e-12) { best = v; w = x; mv = true; } } if (!mv) step /= 2; }
    out.push({ ...st(w), w: w.slice() });
  }
  out.sort((p, q) => p.vol - q.vol); return out.filter((p, i) => !i || p.vol > out[i - 1].vol + 1e-4);
}
/** Frontier's expected return at a given volatility (linear between computed points). */
function frontAt(F, v) { if (!F.length) return null; if (v <= F[0].vol) return F[0].mu; for (let i = 1; i < F.length; i++) if (v <= F[i].vol) { const a = F[i - 1], b = F[i]; return a.mu + ((b.mu - a.mu) * (v - a.vol)) / (b.vol - a.vol); } return F[F.length - 1].mu; }
let effMemo = null;
function efficiency() {
  if (!res || DEMO) return null;
  const mk = JSON.stringify([pjOpts().cls, cashRate(), patrimony().cash, res.rf, assetList().map((x) => [x.id, x.sub, x.cls, x.name])]);
  if (effMemo && effMemo.res === res && effMemo.key === mk) return effMemo.v;
  const v = efficiency0(); effMemo = { res, key: mk, v }; return v;
}
function efficiency0() {
  const o = pjOpts(); const P = patrimony(); const cr = cashRate(); const rf = Math.max(res.rf || 0, cr);
  const by = {}; const assets = [];
  for (const p of res.positions) if (p.open && p.value > 0) { const k = subOf(p.asset); by[k] = (by[k] || 0) + p.value; assets.push({ id: p.assetId, name: p.asset.ticker || p.asset.name, k, value: p.value }); }
  const inv = Object.values(by).reduce((s, v) => s + v, 0); if (inv <= 0) return null;
  const keys = Object.keys(by); const w = keys.map((k) => by[k] / inv); const me = mixStats(w, keys, o);
  const cashW = P.total > 0 ? P.cash / P.total : 0;
  const total = { mu: (1 - cashW) * me.mu + cashW * cr, vol: (1 - cashW) * me.vol };
  // the best mix: the viewer's own blocks plus a world index and bonds
  const U = [...new Set(keys.concat(['world', 'rf']))]; const T = maxSharpe(U, o, rf);
  const shMe = me.vol > 0 ? (me.mu - rf) / me.vol : null;
  const score = shMe != null && T.sharpe > 0 ? Math.max(0, Math.min(100, Math.round((100 * shMe) / T.sharpe))) : null;
  const F = frontier(U, o, cr); const fMe = frontAt(F, me.vol), fTot = frontAt(F, total.vol);
  const score2 = fMe != null && fMe - cr > 1e-6 ? Math.max(0, Math.min(100, Math.round((100 * (me.mu - cr)) / (fMe - cr)))) : score;
  const wv = subRV('world', o);
  // same risk as the whole portfolio, on the line «cash + best mix»: expected return there
  return { o, rf, cr, me, total, cashW, by, keys, w, T, U, F, fMe, fTot, score: score2, shMe, world: { mu: wv[0], vol: wv[1] }, assets, atSame: fTot };
}
const SCORE_WORD = (s) => (s >= 95 ? 'muy eficiente' : s >= 85 ? 'eficiente' : s >= 70 ? 'mejorable' : 'poco eficiente');
function effPanel() {
  const E2 = efficiency(); if (!E2) return '';
  const { me, total, cashW, score, T, rf, by } = E2; const inv = Object.values(by).reduce((s, v) => s + v, 0);
  const mix = E2.keys.map((k, i) => [k, E2.w[i]]).sort((a, b) => b[1] - a[1]);
  const REFW = { em: ZONE_WORLD.em / 100, small: 0.12, sector: 0, single: 0 }; const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const tilt = mix.filter(([k, x]) => k in REFW && x > REFW[k] + 0.05).map(([k, x]) => `${lc(SUBS[k][0])} (${pct(x, 0)}${REFW[k] ? `; el índice, ≈ ${pct(REFW[k], 0)}` : ''})`).join(' y ');
  const fp = E2.F.reduce((b, q) => (Math.abs(q.vol - total.vol) < Math.abs(b.vol - total.vol) ? q : b), E2.F[0]); const iRf = E2.U.indexOf('rf');
  const rfHint = fp && iRf >= 0 && fp.w[iRf] > 0.05 ? ', sobre todo cambiando parte del efectivo por renta fija (si ese dinero es para un gasto cercano, como la entrada de un piso, el efectivo sigue siendo lo prudente)' : '';
  const gap = Math.round(E2.atSame * 1000) / 1000 - Math.round(total.mu * 1000) / 1000;
  const st = E.periodStats(res, null); const b = st && st.bench;
  const yrs = st ? st.days / 365.25 : 0; const bCagr = b && ok(b.twr) && yrs >= 1 ? Math.pow(1 + b.twr, 1 / yrs) - 1 : null;
  const bSh = bCagr != null && b.vol > 0 ? (bCagr - res.rf) / b.vol : null; const mSh = st && ok(st.cagr) && b && b.volPort > 0 ? (st.cagr - res.rf) / b.volPort : null;
  const S2 = (k, v, c, sub) => `<div class="stat"><span class="k">${k}${sub ? `<small>${sub}</small>` : ''}</span><span class="v ${c || ''}">${v}</span></div>`;
  return `<section class="panel" id="effPanel"><div class="panel-h"><div><h2>¿Qué tal está construida tu cartera?</h2><span class="small muted">riesgo que asumes frente a la rentabilidad que cabe esperar</span></div></div>
    <div class="tiles eff-tiles">
      <div class="tile"><span class="l">Eficiencia de lo invertido</span><span class="v">${score != null ? `${score}<small class="muted"> / 100</small>` : '—'}</span><span class="s">${score != null ? SCORE_WORD(score) : ''}</span></div>
      <div class="tile"><span class="l">Nivel de riesgo</span><span class="v">${pct(1 - cashW, 0)} <small class="muted">invertido</small></span><span class="s">volatilidad esperada ${pct(total.vol, 0)}</span></div>
      <div class="tile"><span class="l">Rentabilidad esperada</span><span class="v">${pct(total.mu, 1)}</span><span class="s">al año, toda la cartera · base</span></div>
      <div class="tile"><span class="l">Sharpe real · ${esc(benchName())}</span><span class="v">${mSh != null ? ratio(mSh) : '—'}</span><span class="s">${bSh != null ? `el índice: ${ratio(bSh)} · lo que ha pasado; la eficiencia mira lo esperado` : 'necesita ≥ 1 año con índice'}</span></div>
    </div>
    <div class="chart tall"><canvas id="cEff" role="img" aria-label="Mapa de riesgo y rentabilidad esperada"></canvas></div>
    <div class="legend" id="effLegend"></div>
    ${X('', `Tu parte invertida (${eur(inv, 0)}) espera <b>${pct(me.mu, 1)}</b> al año con una volatilidad de <b>${pct(me.vol, 0)}</b>. ${score != null ? `Con ese riesgo, la mejor mezcla posible de los mismos bloques más un índice mundial, bonos y efectivo esperaría ${pct(E2.fMe, 1)}: sacas el <b>${score} %</b> de la rentabilidad extra sobre el efectivo que se puede pedir a ese riesgo.` : ''} ${tilt ? `Pesas más que un índice mundial en ${tilt}: más oscilación a cambio de algo más de rentabilidad esperada (medio punto al año en estas hipótesis). Es una apuesta razonable si la buscas.` : ''}`)}
    ${X('', `Con el efectivo (${pct(cashW, 0)} a una TAE del ${pct(E2.cr, 2)}), toda tu cartera espera <b>${pct(total.mu, 1)}</b> con una volatilidad de <b>${pct(total.vol, 0)}</b>. ${gap > 0.0004 ? `Con ese mismo riesgo, la mejor mezcla esperaría ${pct(E2.atSame, 1)}: <b>${ppt(gap, 1)}</b> más al año${rfHint}.` : 'Con ese riesgo no hay una mezcla que espere claramente más.'} Cuánto riesgo asumir (la parte en efectivo) es decisión tuya: invertir más o menos es moverte a lo largo de la curva, no ser más o menos eficiente.`)}
    ${b && mSh != null && bSh != null ? X('', `Mirando atrás (${fdate(st.from)} – ${fdate(st.to)}): por cada punto de volatilidad tus inversiones han dado <b>${ratio(mSh)}</b> puntos de rentabilidad sobre el ${pct(res.rf, 1)} sin riesgo; ${esc(benchName())}, <b>${ratio(bSh)}</b>. En plazos cortos esto depende mucho de la suerte; la nota de arriba mira hacia delante.`) : ''}
    <p class="note">Hipótesis a largo plazo, no previsiones: la rentabilidad base de cada clase es la de Proyección (se cambia allí); volatilidades y correlaciones típicas por tipo de bolsa. La subclase de cada fondo se deduce de su nombre y se corrige en Ajustes, en la ficha del activo.</p>
  </section>`;
}
function effChart() {
  const cv = $('#cEff'); if (!cv) return; const E2 = efficiency(); if (!E2) return;
  const C = chartBase(); if (!C) return;
  const { me, total, F } = E2; const ink = cssv('--ink'), ink2 = cssv('--ink-2'), mut = cssv('--muted'), acc = cssv('--accent'), s2 = cssv('--s2'), s3 = cssv('--s3'), surf = cssv('--surface');
  const pt = (q) => ({ x: q.vol * 100, y: q.mu * 100 });
  const funds = E2.assets.map((a) => ({ ...pt({ mu: subRV(a.k, E2.o)[0], vol: subRV(a.k, E2.o)[1] }), n: a.name, k: a.k }));
  const ds = [
    { type: 'line', label: 'Mejores mezclas posibles', data: F.map(pt), borderColor: s3, backgroundColor: alpha(s3, 0.08), fill: 'origin', borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0.3, order: 3 },
    { type: 'scatter', label: 'Tus fondos', data: funds, pointRadius: 4.5, pointHoverRadius: 6, pointBackgroundColor: alpha(ink2, 0.45), pointBorderColor: surf, pointBorderWidth: 1.5, order: 2 },
    { type: 'scatter', label: 'Lo invertido', data: [pt(me)], pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: s2, pointBorderColor: surf, pointBorderWidth: 2, order: 1 },
    { type: 'scatter', label: 'Toda tu cartera', data: [pt(total)], pointRadius: 8, pointHoverRadius: 9, pointBackgroundColor: acc, pointBorderColor: surf, pointBorderWidth: 2, order: 0 },
  ];
  const xs = ds.flatMap((d) => d.data.map((q) => q.x)), ys = ds.flatMap((d) => d.data.map((q) => q.y));
  const labelsPlugin = { id: 'effLabels', afterDatasetsDraw(ch) {
    const c = ch.ctx; c.save(); c.font = `600 12px ${cssv('--f-ui') || 'system-ui'}`; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const lab = (di, txt, dx, dy) => { const e = ch.getDatasetMeta(di).data[0]; if (!e) return; c.textAlign = dx < 0 ? 'right' : 'left'; c.strokeStyle = surf; c.lineWidth = 4; c.strokeText(txt, e.x + dx, e.y + dy); c.fillStyle = ink; c.fillText(txt, e.x + dx, e.y + dy); };
    lab(3, 'Toda tu cartera', 12, 0); lab(2, 'Lo invertido', -12, -12);
    c.restore();
  } };
  const ch = mkChart(C, cv, { type: 'scatter', data: { labels: [], datasets: ds }, options: {
    responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12, top: 10 } },
    interaction: { mode: 'nearest', intersect: true },
    plugins: { legend: { display: false }, tooltip: tip((v) => pct(v / 100, 1), { filter: (c) => c.datasetIndex > 0, callbacks: {
      title: (it) => (it.length ? (it[0].datasetIndex === 1 ? `${funds[it[0].dataIndex].n} · ${SUBS[funds[it[0].dataIndex].k][0]}` : it[0].dataset.label) : ''),
      label: (c) => ` Rentabilidad esperada ${pct(c.parsed.y / 100, 1)} · volatilidad ${pct(c.parsed.x / 100, 0)}`,
    } }) },
    scales: {
      x: { type: 'linear', min: 0, suggestedMax: Math.ceil((Math.max(...xs) + 1) / 5) * 5, title: { display: true, text: 'Riesgo: volatilidad esperada al año', color: mut }, grid: { color: gridZero }, border: { display: false }, ticks: { callback: (v) => `${v} %` } },
      y: { type: 'linear', min: 0, suggestedMax: Math.ceil(Math.max(...ys)) + 1, title: { display: true, text: 'Rentabilidad esperada al año', color: mut }, grid: { color: gridZero }, border: { display: false }, ticks: { callback: (v) => `${v} %` } },
    } }, plugins: [labelsPlugin] });
  charts.push(ch);
  const lg = $('#effLegend'); if (lg) lg.innerHTML = `<span><i style="background:${acc};border-radius:50%"></i>Toda tu cartera</span><span><i style="background:${s2};border-radius:50%"></i>Lo invertido</span><span><i style="background:${alpha(ink2, 0.45)};border-radius:50%"></i>Cada fondo</span><span><i class="line" style="background:${s3}"></i>Lo máximo que cabe esperar a cada riesgo</span>`;
}
