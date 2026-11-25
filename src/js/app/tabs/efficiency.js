/* ---------- Analysis: "How well built is your portfolio?" ----------
 * Forward-looking risk/return map from long-run assumptions by sub-class (not from the viewer's short price history),
 * plus an efficiency score: the invested part's expected Sharpe against the best long-only mix of the same building blocks
 * and a world index. The realized check (Sharpe vs the benchmark) uses the same weekly figures as "Against …".
 */
// Equity and other sub-classes: label, extra expected return over the class base (pts), long-run volatility (%)
const SUBS = {
  world: ['World stocks', 0, 15], us: ['US stocks', 0, 16], dev: ['Developed ex-US', 0, 16], em: ['Emerging markets', 0.5, 20],
  small: ['Small caps', 0.5, 19], sector: ['Sector or thematic', 0, 24], single: ['Single stock', 0, 30],
  rf: ['Bonds', 0, null], oro: ['Gold', 0, null], cripto: ['Crypto', 0, null], otro: ['Other', 0, null],
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
/** Expected return (base scenario, fraction) and volatility (fraction) of a sub-class, from the Projection assumptions. */
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
  // same risk as the whole portfolio, on the line "cash + best mix": expected return there
  return { o, rf, cr, me, total, cashW, by, keys, w, T, U, F, fMe, fTot, score: score2, shMe, world: { mu: wv[0], vol: wv[1] }, assets, atSame: fTot };
}
const SCORE_WORD = (s) => (s >= 95 ? 'very efficient' : s >= 85 ? 'efficient' : s >= 70 ? 'could be better' : 'not very efficient');
function effPanel() {
  const E2 = efficiency(); if (!E2) return '';
  const { me, total, cashW, score, T, rf, by } = E2; const inv = Object.values(by).reduce((s, v) => s + v, 0);
  const mix = E2.keys.map((k, i) => [k, E2.w[i]]).sort((a, b) => b[1] - a[1]);
  const REFW = { em: ZONE_WORLD.em / 100, small: 0.12, sector: 0, single: 0 }; const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const tilt = mix.filter(([k, x]) => k in REFW && x > REFW[k] + 0.05).map(([k, x]) => `${lc(SUBS[k][0])} (${pct(x, 0)}${REFW[k] ? `; the index, ≈ ${pct(REFW[k], 0)}` : ''})`).join(' and ');
  const fp = E2.F.reduce((b, q) => (Math.abs(q.vol - total.vol) < Math.abs(b.vol - total.vol) ? q : b), E2.F[0]); const iRf = E2.U.indexOf('rf');
  const rfHint = fp && iRf >= 0 && fp.w[iRf] > 0.05 ? ', mainly by swapping part of the cash for bonds (if that money is for a near-term expense, such as a home deposit, cash is still the prudent choice)' : '';
  const gap = Math.round(E2.atSame * 1000) / 1000 - Math.round(total.mu * 1000) / 1000;
  const st = E.periodStats(res, null); const b = st && st.bench;
  const yrs = st ? st.days / 365.25 : 0; const bCagr = b && ok(b.twr) && yrs >= 1 ? Math.pow(1 + b.twr, 1 / yrs) - 1 : null;
  const bSh = bCagr != null && b.vol > 0 ? (bCagr - res.rf) / b.vol : null; const mSh = st && ok(st.cagr) && b && b.volPort > 0 ? (st.cagr - res.rf) / b.volPort : null;
  const S2 = (k, v, c, sub) => `<div class="stat"><span class="k">${k}${sub ? `<small>${sub}</small>` : ''}</span><span class="v ${c || ''}">${v}</span></div>`;
  return `<section class="panel" id="effPanel"><div class="panel-h"><div><h2>How well built is your portfolio?</h2><span class="small muted">the risk you take against the return you can expect</span></div></div>
    <div class="tiles eff-tiles">
      <div class="tile"><span class="l">Efficiency of what is invested</span><span class="v">${score != null ? `${score}<small class="muted"> / 100</small>` : '—'}</span><span class="s">${score != null ? SCORE_WORD(score) : ''}</span></div>
      <div class="tile"><span class="l">Risk level</span><span class="v">${pct(1 - cashW, 0)} <small class="muted">invested</small></span><span class="s">expected volatility ${pct(total.vol, 0)}</span></div>
      <div class="tile"><span class="l">Expected return</span><span class="v">${pct(total.mu, 1)}</span><span class="s">a year, whole portfolio · base</span></div>
      <div class="tile"><span class="l">Actual Sharpe · ${esc(benchName())}</span><span class="v">${mSh != null ? ratio(mSh) : '—'}</span><span class="s">${bSh != null ? `the index: ${ratio(bSh)} · what has happened; efficiency looks at what is expected` : 'needs ≥ 1 year with an index'}</span></div>
    </div>
    <div class="chart tall"><canvas id="cEff" role="img" aria-label="Map of risk and expected return"></canvas></div>
    <div class="legend" id="effLegend"></div>
    ${X('', `Your invested part (${eur(inv, 0)}) expects <b>${pct(me.mu, 1)}</b> a year with a volatility of <b>${pct(me.vol, 0)}</b>. ${score != null ? `At that risk, the best possible mix of the same building blocks plus a world index, bonds and cash would expect ${pct(E2.fMe, 1)}: you get <b>${score} %</b> of the extra return over cash that can be asked of that risk.` : ''} ${tilt ? `You weigh more than a world index in ${tilt}: more swings in exchange for a bit more expected return (half a point a year under these assumptions). It is a reasonable bet if you are after it.` : ''}`)}
    ${X('', `With cash (${pct(cashW, 0)} at an AER of ${pct(E2.cr, 2)}), your whole portfolio expects <b>${pct(total.mu, 1)}</b> with a volatility of <b>${pct(total.vol, 0)}</b>. ${gap > 0.0004 ? `At that same risk, the best mix would expect ${pct(E2.atSame, 1)}: <b>${ppt(gap, 1)}</b> more a year${rfHint}.` : 'At that risk there is no mix that clearly expects more.'} How much risk to take (the part in cash) is your decision: investing more or less moves you along the curve; it does not make you more or less efficient.`)}
    ${b && mSh != null && bSh != null ? X('', `Looking back (${fdate(st.from)} – ${fdate(st.to)}): for each point of volatility your investments have given <b>${ratio(mSh)}</b> points of return over the ${pct(res.rf, 1)} risk-free rate; ${esc(benchName())}, <b>${ratio(bSh)}</b>. Over short periods this depends a lot on luck; the score above looks ahead.`) : ''}
    <p class="note">Long-term assumptions, not forecasts: the base return of each class is the one in Projection (change it there); typical volatilities and correlations by equity type. Each fund's sub-class is worked out from its name and can be corrected in Settings, on the asset page.</p>
  </section>`;
}
function effChart() {
  const cv = $('#cEff'); if (!cv) return; const E2 = efficiency(); if (!E2) return;
  const C = chartBase(); if (!C) return;
  const { me, total, F } = E2; const ink = cssv('--ink'), ink2 = cssv('--ink-2'), mut = cssv('--muted'), acc = cssv('--accent'), s2 = cssv('--s2'), s3 = cssv('--s3'), surf = cssv('--surface');
  const pt = (q) => ({ x: q.vol * 100, y: q.mu * 100 });
  const funds = E2.assets.map((a) => ({ ...pt({ mu: subRV(a.k, E2.o)[0], vol: subRV(a.k, E2.o)[1] }), n: a.name, k: a.k }));
  const ds = [
    { type: 'line', label: 'Best possible mixes', data: F.map(pt), borderColor: s3, backgroundColor: alpha(s3, 0.08), fill: 'origin', borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, tension: 0.3, order: 3 },
    { type: 'scatter', label: 'Your funds', data: funds, pointRadius: 4.5, pointHoverRadius: 6, pointBackgroundColor: alpha(ink2, 0.45), pointBorderColor: surf, pointBorderWidth: 1.5, order: 2 },
    { type: 'scatter', label: 'What is invested', data: [pt(me)], pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: s2, pointBorderColor: surf, pointBorderWidth: 2, order: 1 },
    { type: 'scatter', label: 'Your whole portfolio', data: [pt(total)], pointRadius: 8, pointHoverRadius: 9, pointBackgroundColor: acc, pointBorderColor: surf, pointBorderWidth: 2, order: 0 },
  ];
  const xs = ds.flatMap((d) => d.data.map((q) => q.x)), ys = ds.flatMap((d) => d.data.map((q) => q.y));
  const labelsPlugin = { id: 'effLabels', afterDatasetsDraw(ch) {
    const c = ch.ctx; c.save(); c.font = `600 12px ${cssv('--f-ui') || 'system-ui'}`; c.textBaseline = 'middle'; c.lineJoin = 'round';
    const lab = (di, txt, dx, dy) => { const e = ch.getDatasetMeta(di).data[0]; if (!e) return; c.textAlign = dx < 0 ? 'right' : 'left'; c.strokeStyle = surf; c.lineWidth = 4; c.strokeText(txt, e.x + dx, e.y + dy); c.fillStyle = ink; c.fillText(txt, e.x + dx, e.y + dy); };
    lab(3, 'Your whole portfolio', 12, 0); lab(2, 'What is invested', -12, -12);
    c.restore();
  } };
  const ch = mkChart(C, cv, { type: 'scatter', data: { labels: [], datasets: ds }, options: {
    responsive: true, maintainAspectRatio: false, layout: { padding: { right: 12, top: 10 } },
    interaction: { mode: 'nearest', intersect: true },
    plugins: { legend: { display: false }, tooltip: tip((v) => pct(v / 100, 1), { filter: (c) => c.datasetIndex > 0, callbacks: {
      title: (it) => (it.length ? (it[0].datasetIndex === 1 ? `${funds[it[0].dataIndex].n} · ${SUBS[funds[it[0].dataIndex].k][0]}` : it[0].dataset.label) : ''),
      label: (c) => ` Expected return ${pct(c.parsed.y / 100, 1)} · volatility ${pct(c.parsed.x / 100, 0)}`,
    } }) },
    scales: {
      x: { type: 'linear', min: 0, suggestedMax: Math.ceil((Math.max(...xs) + 1) / 5) * 5, title: { display: true, text: 'Risk: expected volatility a year', color: mut }, grid: { color: gridZero }, border: { display: false }, ticks: { callback: (v) => `${v} %` } },
      y: { type: 'linear', min: 0, suggestedMax: Math.ceil(Math.max(...ys)) + 1, title: { display: true, text: 'Expected return a year', color: mut }, grid: { color: gridZero }, border: { display: false }, ticks: { callback: (v) => `${v} %` } },
    } }, plugins: [labelsPlugin] });
  charts.push(ch);
  const lg = $('#effLegend'); if (lg) lg.innerHTML = `<span><i style="background:${acc};border-radius:50%"></i>Your whole portfolio</span><span><i style="background:${s2};border-radius:50%"></i>What is invested</span><span><i style="background:${alpha(ink2, 0.45)};border-radius:50%"></i>Each fund</span><span><i class="line" style="background:${s3}"></i>The most you can expect at each risk</span>`;
}
