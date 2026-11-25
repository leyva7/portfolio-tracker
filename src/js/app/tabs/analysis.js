/* ---------- Analysis (with plain-language explanations) ---------- */
// Only the reading of the user's own numbers; the generic definitions were dropped.
const X = (what, reading) => (reading ? `<div class="explain"><p>${reading}</p></div>` : '');
const benchName = () => (DEMO ? 'VWCE (sample)' : (S.settings.benchName || S.settings.benchSymbol || 'the benchmark'));
function volWord(v) { return !ok(v) ? '' : v < 0.06 ? 'very low, typical of bonds' : v < 0.12 ? 'moderate, like a mixed portfolio' : v < 0.2 ? 'high, similar to world stocks' : 'very high, above the stock market'; }
function ratioWord(r) { return !ok(r) ? '' : r < 0 ? 'negative: the risk has not paid off' : r < 0.5 ? 'low' : r < 1 ? 'acceptable' : r < 2 ? 'good' : 'excellent (over short periods it is often partly luck)'; }
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
    const toCash = sum(mm.filter((x) => x.a > 0 && x.t !== 'interest' && (linked.has(x.id) || /^sale\b/i.test(x.n))), (x) => x.a);
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
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1); const aName = (id) => { const a = assetById(id); return a ? esc(a.ticker || a.name) : 'Fees (separate)'; };
  const inv = { start: c.inv0, put: c.put - c.internal, market: c.market, end: c.inv1 };
  const tr = (r, nm, b) => `<tr${b ? ' class="tot"' : ''}><td>${b ? `<b>${nm}</b>` : `<span class="sw" style="background:${r.id ? acolor(r.id) : 'var(--muted)'}"></span>${nm}`}</td><td class="n xm">${eur(r.start, 0)}</td><td class="n ${cls(r.put)}">${eurS(r.put, 0)}</td><td class="n ${cls(r.market)}">${eurS(r.market, 0)}</td><td class="n">${eur(r.end, 0)}</td><td class="n xm ${cls(r.end - r.start)}">${eurS(r.end - r.start, 0)}</td></tr>`;
  const bars = all.slice(-18); const mx = Math.max(1, ...bars.flatMap((x) => [x.put + x.ext, x.market])), mn = Math.min(0, ...bars.flatMap((x) => [x.put + x.ext, x.market])); const rg = mx - mn, z = mx / rg * 100;
  const bar = (v, k2) => `<i class="${k2}" style="${v >= 0 ? `bottom:${(100 - z).toFixed(2)}%` : `top:${z.toFixed(2)}%`};height:${(Math.abs(v) / rg * 100).toFixed(2)}%"></i>`;
  return `<section class="panel" id="mmPanel"><div class="panel-h"><h2>What moved your net worth</h2><div class="seg" role="group" aria-label="Period">${MB_W.map(([id, l]) => `<button type="button" data-mbw="${id}" aria-pressed="${id === 'N'}">${l}</button>`).join('')}</div></div>
    <div class="mm-nav">${nav(ci - 1, '‹', 'Previous month')}<select id="mmSel" aria-label="Month">${all.slice().reverse().map((x) => `<option value="${x.m}"${x === c ? ' selected' : ''}>${cap(mmName(x.m))}</option>`).join('')}</select>${nav(ci + 1, '›', 'Next month')}
      <span class="small muted">${c.partial ? `in progress, up to ${fdate(c.d1, { year: undefined })}` : ''}${ok(c.ret) ? `${c.partial ? ' · ' : ''}return for the month <span class="num ${cls(c.ret)}">${pctS(c.ret, 1)}</span>` : ''}</span></div>
    <p class="small" style="margin:0 0 6px">From <b class="num">${eur(c.start, 0)}</b> to <b class="num">${eur(c.end, 0)}</b>: <b class="num ${cls(c.end - c.start)}">${eurS(c.end - c.start, 0)}</b>.</p>
    <div class="stats">
      ${row('At the start', c.start, `close of ${fdate(c.d0)}`, 1)}
      ${row('You put into investments', c.put, 'buys with new money, minus sales that did not go to cash')}
      ${Math.abs(c.ext) > 0.5 ? row('Outside money into cash', c.ext, 'deposits, withdrawals and adjustments of your accounts') : ''}
      ${row('The market added', c.market, 'what your investments gained or lost through price')}
      ${Math.abs(c.interest) > 0.5 ? row('Interest on cash', c.interest, 'recorded in Cash') : ''}
      ${row('<b>At the close</b>', c.end, c.partial ? `on ${fdate(c.d1)}` : `close of ${fdate(c.d1)}`, 1)}
      ${c.internal > 0.5 ? `<div class="stat"><span class="k">Internal movement<small>sales whose money went to Cash: net worth does not change</small></span><span class="v num muted">${eur(c.internal, 0)}</span></div>` : ''}
    </div>
    ${c.rows.length ? `<div class="tbl-wrap" style="margin-top:10px"><table class="mmt"><thead><tr><th>Investments</th><th class="n xm">At the start</th><th class="n">You added</th><th class="n">Market</th><th class="n">At the close</th><th class="n xm">Change</th></tr></thead><tbody>${c.rows.map((r) => tr(r, aName(r.id))).join('')}${c.rows.length > 1 ? tr(inv, 'Total', 1) : ''}</tbody></table></div>${c.internal > 0.5 ? `<p class="note" style="margin:6px 0 0">In the table, sales subtract from "You added"; ${eur(c.internal, 0)} of them went to Cash and do not count as money going out.</p>` : ''}` : ''}
    <h3 class="eyebrow" style="margin:14px 0 2px">Your effort and the market's, month by month</h3>
    <div class="legend"><span><i style="background:var(--s1)"></i>You put in (investments + cash)</span><span><i style="background:var(--s2)"></i>The market added</span></div>
    <div class="mm-bars" role="group" aria-label="What you put in and what the market added in the last ${bars.length} months">${bars.map((x, j) => `<button type="button" class="mm-g${x === c ? ' on' : ''}${j < bars.length - 12 ? ' old' : ''}" data-mmonth="${x.m}" title="${cap(mmName(x.m))}: you ${eurS(x.put + x.ext, 0)} · market ${eurS(x.market, 0)}"><span class="mm-b"><span class="z" style="top:${z.toFixed(2)}%"></span>${bar(x.put + x.ext, 't')}${bar(x.market, 'k')}</span><small>${mmName(x.m, { month: 'short', year: undefined }).replace('.', '')}</small></button>`).join('')}</div>
    <p class="note" style="margin:8px 0 0">These are euros per month, not returns. Tap a month to see it above.</p>
  </section>`;
}
/** "With the index you would have": the same net money, on the same days, in the benchmark (res.benchmark simValue), in euros and with its IRR. */
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
  const verdict = same ? `<b>Practically the same</b> as with ${esc(benchName())}: the difference is ${eur(Math.abs(x.d), 0)}.` : x.d > 0 ? `<b class="gain">You are ${eur(x.d, 0)} ahead</b> of ${esc(benchName())}.` : `<b class="loss">With ${esc(benchName())} you would have ${eur(-x.d, 0)} more.</b>`;
  return `<section class="panel"><div class="panel-h"><div><h2>With the index you would have</h2><span class="small muted">the same money, on the same dates, in ${esc(benchName())}</span></div><div class="legend"><span><i class="line" style="background:${cssv('--s1')}"></i>Your investments</span><span><i class="line" style="background:${cssv('--s2')}"></i>Same money in the index</span><span><i class="dash" style="border-color:${cssv('--ink-2')}"></i>Out of your pocket</span></div></div>
    <div class="idx3">${box('Your investments today', eur(x.V, 0), `IRR ${pctS(x.irr, 1)}`)}${box('With the index', eur(x.sim, 0), `IRR ${pctS(x.simIrr, 1)}`)}${box('Out of your pocket', eur(x.pocket, 0), 'buys − sales, net')}</div>
    <p class="small" style="margin:0 0 8px">${verdict}</p>
    <div class="chart sm"><canvas id="cIdx" role="img" aria-label="Your investments against the same money in the index, in euros"></canvas></div>
    <p class="note" style="margin:6px 0 0">The index is chosen in Settings. The chart uses the period above; the boxes, your whole history.</p></section>`;
}
function indexChart(from) {
  if (!$('#cIdx') || !res.benchmark) return;
  const { pts, i0 } = sliceFrom(from); const B = res.benchmark.slice(from ? Math.max(0, i0) : 0); const s1 = cssv('--s1'), s2 = cssv('--s2'), ink2 = cssv('--ink-2');
  mkLine($('#cIdx'), pts.map((q) => q.date), [
    { label: 'Your investments', data: pts.map((q) => q.value), borderColor: s1, backgroundColor: fillGrad(s1, .14, .01), fill: 'origin' },
    { label: 'Same money in the index', data: B.map((b) => (b ? b.simValue : null)), borderColor: s2 },
    { label: 'Out of your pocket', data: pts.map((q) => q.invested - q.income + q.fees), borderColor: ink2, borderDash: [5, 4], borderWidth: 1.5, stepped: true },
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
    if (!o) return ks.some((k) => k < y) ? '<td class="n muted small">sold</td>' : '<td></td>';
    const sold = o.end <= 0.005 && o.to < yEnd(y); const sub = [o.fresh && o.from > y + '-01-01' ? `from ${sd(o.from)}` : '', sold ? `until ${sd(o.to)}` : ''].filter(Boolean).join('</small><small>');
    if (!o.mv) return `<td class="n muted small">no data${sub ? `<small>${sub}</small>` : ''}</td>`;
    return `<td class="n ${cls(o.g - 1)}">${pctS(o.g - 1, 1)}${sub ? `<small>${sub}</small>` : ''}</td>`;
  };
  const nm = (id) => { const a = assetById(id); return a ? `<span class="sw" style="background:${acolor(id)}"></span>${esc(a.ticker || a.name)}` : esc(id); };
  return `<section class="panel"><div class="panel-h"><div><h2>Returns by year and fund</h2><span class="small muted">TWR of your position in each asset; ${lastY} up to today</span></div></div>
    <div class="tbl-wrap"><table class="ay"><thead><tr><th>Asset</th>${ys.map((y) => `<th class="n">${y}</th>`).join('')}</tr></thead><tbody>
    ${ids.map((id) => `<tr${pos(id) && pos(id).open ? '' : ' class="muted"'}><td>${nm(id)}</td>${ys.map((y) => cell(id, y)).join('')}</tr>`).join('')}
    <tr class="tot"><td><b>Cartera</b></td>${ys.map((y) => `<td class="n ${cls(res.yearly[y])}"><b>${pctS(res.yearly[y], 1)}</b></td>`).join('')}</tr></tbody></table></div>
    <p class="note" style="margin:6px 0 0">Each row chains the days you held the asset: the first year starts at your first buy, at the price you paid, and how much you added later does not affect it.</p></section>`;
}
function vAnalysisDetail() {
  if (!res || res.series.length < 3) return emptyState('A bit more history is needed to compute statistics.');
  const from = periodFrom(ui.aPeriod);
  const st = E.periodStats(res, from);
  if (!st) return emptyState('No data in this period.');
  const b = st.bench; const t = res.totals; const V = t.value;
  const S2 = (k, v, c, sub) => `<div class="stat"><span class="k">${k}${sub ? `<small>${sub}</small>` : ''}</span><span class="v ${c || ''}">${v}</span></div>`;
  const lastB = res.benchmark ? res.benchmark[res.benchmark.length - 1] : null;
  const short = st.days < 365;
  const cov = priceCoverage(from); const low = !!(cov && cov.low); const dimC = '';
  const S3 = (...a) => (low ? '' : S2(...a)); // daily-price metrics: hidden while prices are mostly interpolated
  const k = [
    kpi('TWR return', pctS(t.twr), t.twrAnn != null ? `annual TWR ${pctS(t.twrAnn)}` : 'less than 1 year', cls(t.twr), 'Return of the strategy, without the effect of when you add money'),
    kpi('Annual IRR (XIRR)', pctS(t.xirr), 'money-weighted', cls(t.xirr), 'Your real return taking into account when and how much you contributed'),
    kpi('Dividends', eur(t.dividends), `net interest on cash: ${eur(t.interest, 0)}`),
    kpi('Fees', eur(t.fees), `${pct(t.grossInvested ? t.fees / t.grossInvested : null, 2)} of the amount invested`),
  ].join('');
  const diff = b && ok(b.twr) ? st.twr - b.twr : null;
  // monthly stats for reading
  const nd = monthNoData(); const mAll = Object.entries(res.monthly).filter(([m]) => !from || m >= from.slice(0, 7)); const mv = mAll.filter(([m]) => !nd.has(m)); const mPos = mv.filter(([, r]) => r > 0).length;
  const pLbl = { '1M': 'last month', '3M': 'last 3 months', YTD: 'this year', '1A': 'last year', '3A': 'last 3 years' }[from ? ui.aPeriod : ''] || 'the whole history';
  const volIds = res.correlations.ids.filter((id) => assetVol()[id] != null && res.positions.some((p) => p.assetId === id));
  const bestM = mv.slice().sort((a, c) => c[1] - a[1])[0], worstM = mv.slice().sort((a, c) => a[1] - c[1])[0];
  const mName = (m) => { const [y, mo] = m.split('-'); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleDateString(L, { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
  const last12 = Array.from({ length: 12 }, (_, i) => E.addMonths(t.today, -i).slice(0, 7)); const inv12 = last12.reduce((s, m) => s + ((res.monthFlows[m] || {}).invested || 0), 0);
  return `
  <section class="kpis">${k}</section>
  ${effPanel()}
  ${zonePanel()}
  <div class="panel-h"><h2>Statistics · ${fdate(st.from)} – ${fdate(st.to)}</h2>${periodSeg(ui.aPeriod, 'ap')}</div>
  ${short ? '<div class="banner info"><div><b>Short period.</b> With less than a year of data, annualised figures and ratios change a lot from one week to the next: take them as a guide.</div></div>' : ''}
  ${low ? `<div class="banner" id="covWarn"><div><b>Few daily prices:</b> in ${pct(cov.share, 0)} of the sessions in the period (${cov.flat} of ${cov.n}) most of the value has no quote for that day and is interpolated or repeated. That is why volatility, VaR, Sharpe, Sortino, beta, alpha and the daily figures are hidden: they would be distorted${cov.since ? `. Choose a period from ${fdate(cov.since)} to see them` : ''}.</div></div>` : ''}
  <div class="grid g-2e">
    <section class="panel"><h3 class="eyebrow">Return</h3><div class="stats">
      ${S2('TWR for the period', pctS(st.twr), cls(st.twr))}
      ${S2('Annualised (CAGR)', st.cagr != null ? pctS(st.cagr) : '—', cls(st.cagr), st.cagr == null ? 'needs ≥ 1 year' : '')}
      ${S2('Result in €', eurS(st.pnl, 0), cls(st.pnl))}
      ${S3('Best day', pctS(st.best), 'gain', fdate(st.bestDate))}
      ${S3('Worst day', pctS(st.worst), 'loss', fdate(st.worstDate))}
      ${S3('Positive days', pct(st.positiveDays, 0), '', `${st.n} sessions`)}
    </div>
    ${X('<b>TWR</b> measures how your strategy has performed regardless of when you put money in or take it out: it is the figure you can compare with a fund or an index. <b>CAGR</b> is that return expressed per year.',
      `Since ${fdate(st.from)} your investments have returned <b>${pctS(st.twr, 1)}</b>${st.cagr != null ? ` (${pctS(st.cagr, 1)} a year)` : ''}, <b>${eurS(st.pnl, 0)}</b> in euros.${low ? '' : ` ${pct(st.positiveDays, 0)} of days closed positive; the worst was ${fdate(st.worstDate)} (${pctS(st.worst, 2)}).`}`)}</section>
    <section class="panel"><h3 class="eyebrow">Risk</h3><div class="stats">
      ${S3('Annual volatility', pct(st.vol, 1), dimC, st.nw ? `from ${st.nw} weekly returns` : '')}
      ${S2('Maximum drawdown', pct(st.maxDD, 1), 'loss', st.maxDDPeak ? `${fdate(st.maxDDPeak)} → ${fdate(st.maxDDTrough)}` : '')}
      ${S2('Recovered', st.maxDDTrough ? (st.maxDDRecovery ? fdate(st.maxDDRecovery) : 'not yet') : '—')}
      ${S3('Weekly VaR 95 %', pct(st.var95), dimC, ok(st.var95) ? `≈ ${eur(st.var95 * V, 0)} today` : 'needs ≥ 20 weeks')}
      ${S3('Weekly CVaR 95 %', pct(st.cvar95), dimC, ok(st.cvar95) ? `≈ ${eur(st.cvar95 * V, 0)}` : '')}
    </div>
    ${X('<b>Volatility</b> shows how much your portfolio swings in a normal year. The <b>maximum drawdown</b> is the worst you have lived through, from a high to the next low. <b>VaR 95 %</b> is the weekly loss exceeded only 1 week in 20, and <b>CVaR</b> is what you lose on average in those bad weeks.',
      low ? (st.maxDD < 0 ? `The worst stretch was ${pct(st.maxDD, 1)} and ${st.maxDDRecovery ? `it recovered on ${fdate(st.maxDDRecovery)}` : 'it has not fully recovered yet'}. With so few daily prices, volatility and VaR cannot be interpreted yet.` : 'With so few daily prices, volatility and VaR cannot be interpreted yet.') : ok(st.vol) ? `Your volatility of <b>${pct(st.vol, 1)}</b> is ${volWord(st.vol)}. At your current size, a bad but normal year (two standard deviations) could take away about <b>${eur(2 * st.vol * V, 0)}</b>. ${ok(st.var95) ? `One week in 20 you can lose <b>${eur(st.var95 * V, 0)}</b> or more. ` : ''}${st.maxDD < 0 ? `The worst stretch was ${pct(st.maxDD, 1)} and ${st.maxDDRecovery ? `it recovered on ${fdate(st.maxDDRecovery)}` : 'it has not fully recovered yet'}.` : ''}` : '')}</section>
    <section class="panel"><h3 class="eyebrow">Ratios</h3><div class="stats">
      ${S3('Sharpe', ratio(st.sharpe), dimC, `risk-free ${pct(res.rf, 1)}`)}
      ${S3('Sortino', ratio(st.sortino), dimC)}
      ${S2('Calmar', ratio(st.calmar))}
    </div>
    ${X(`All three say whether the return makes up for the risk. <b>Sharpe</b>: return above a risk-free asset (${pct(res.rf, 1)}, adjustable in Settings) per unit of volatility. <b>Sortino</b>: the same, but it only penalises falls. <b>Calmar</b>: annual return divided by the worst drawdown. Above 1 is good.`,
      low ? 'With so few daily prices only Calmar is shown, since it uses the maximum drawdown.' : ok(st.sharpe) ? `Your Sharpe of <b>${ratio(st.sharpe)}</b> is ${ratioWord(st.sharpe)}.${ok(st.sortino) && st.sortino > st.sharpe * 1.3 ? ' Sortino is quite a bit higher: much of your volatility is rises, not falls.' : ''}` : '')}</section>
    <section class="panel"><h3 class="eyebrow">Against ${esc(benchName())}</h3>${b ? `<div class="stats">
      ${S2(`Return of ${esc(benchName())}`, pctS(b.twr), cls(b.twr))}
      ${S2('Difference', ppt(diff, 1, true), cls(diff), 'your TWR − the index\'s, in points')}
      ${S3('Beta', ratio(b.beta))}
      ${S3('Annual alpha', pctS(b.alpha), cls(b.alpha))}
      ${S3('Correlation', ratio(b.corr))}
      ${S3('Tracking error', pct(b.trackingError, 1))}
      ${S3('Upside capture', pct(b.upCapture, 0))}
      ${S3('Downside capture', pct(b.downCapture, 0))}
      ${lastB ? S2('Same money in the index', eur(lastB.simValue, 0), '', `your investments: ${eur(V, 0)}`) : ''}
    </div>
    ${X(`A week-by-week comparison (${b.weeks} weeks) with ${esc(benchName())}. <b>Beta</b>: how much you move when the index moves (1 = the same). <b>Alpha</b>: annual return the index does not explain. <b>Correlation</b>: 1 = you move together. <b>Tracking error</b>: how far you drift from it. <b>Captures</b>: what share of its rises and of its falls you get.`,
      `In the period the index did <b>${pctS(b.twr, 1)}</b> and you <b>${pctS(st.twr, 1)}</b>: ${diff >= 0 ? 'you beat it' : 'you trail it'} by <b>${ppt(Math.abs(diff), 1)}</b>${low ? '. ' : `; with a beta of ${ratio(b.beta)}, if ${esc(benchName())} falls 10 % your portfolio tends to fall ~${pct(Math.abs((b.beta || 0) * 0.1), 1)}. You get ${pct(b.upCapture, 0)} of its rises and ${pct(b.downCapture, 0)} of its falls${ok(b.upCapture) && ok(b.downCapture) && b.upCapture > b.downCapture ? ', a favourable profile' : ''}. `}${lastB ? `If you had put each euro you contributed into the index on the same day, today you would have <b>${eur(lastB.simValue, 0)}</b> against your ${eur(V, 0)}.${eurGapNote(lastB.simValue, V, diff)}` : ''}`)}` : `<p class="note">There are not enough weeks in common with the index yet.</p>`}</section>
  </div>
  ${res.benchmark ? `<section class="panel"><div class="panel-h"><h2>You against ${esc(benchName())}</h2><div class="legend"><span><i class="line" style="background:${cssv('--s1')}"></i>Your investments (TWR)</span><span><i class="line" style="background:${cssv('--s2')}"></i>${esc(benchName())}</span></div></div><div class="chart"><canvas id="cVsB" role="img" aria-label="Comparison with the benchmark"></canvas></div>
    ${X('Both lines start at 0 % at the beginning of the period and show how much each euro would have grown. That compares the strategy, regardless of when you contributed.', '')}</section>` : ''}
  <section class="panel"><div class="panel-h"><h2>Drawdown from highs</h2><span class="small muted" id="ddInfo"></span></div><div class="chart sm"><canvas id="cDD" role="img" aria-label="Drawdown from highs"></canvas></div>
    ${X('At each moment, how far your portfolio was below its previous high (with TWR, not counting contributions). It helps you know which falls you have really been through.', st.maxDD < 0 ? `The largest was <b>${pct(st.maxDD, 1)}</b> between ${fdate(st.maxDDPeak)} and ${fdate(st.maxDDTrough)}; in today's euros that would be about ${eur(-st.maxDD * V, 0)}.` : '')}
    ${dropHistory()}</section>
  <section class="panel"><div class="panel-h"><h2>Monthly returns</h2><span class="small muted">TWR per month; in the last column, the year</span></div>${heatmap()}
    ${X('Each cell is the return for that month (green up, red down; the deeper the colour, the bigger). The last column chains the months of the year.', mv.length ? `In the chosen period (${pLbl}): ${mPos} of ${mv.length} months positive${mAll.length > mv.length ? ` (not counting ${mAll.length - mv.length} with no data, "n/a")` : ''}. Best month: ${mName(bestM[0])} (${pctS(bestM[1], 1)}); worst: ${mName(worstM[0])} (${pctS(worstM[1], 1)}).` : '')}</section>
  <section class="panel"><div class="panel-h"><h2>Contributions by month</h2><div class="legend"><span><i style="background:${cssv('--s1')}"></i>Invested</span><span><i style="background:${cssv('--s2')}"></i>Withdrawn (sales)</span><span><i style="background:${cssv('--s3')}"></i>Dividends</span></div></div><div class="chart sm"><canvas id="cFlows" role="img" aria-label="Monthly contributions"></canvas></div>
    ${X('Money you have put into or taken out of your investments each month (buys and sales), and dividends received. It does not include cash.', `In the last 12 months you have invested <b>${eur(inv12, 0)}</b>: an average of <b>${eur(inv12 / 12, 0)} bought a month</b> (${eur(pjAvgMonthly(), 0)} net of sales).`)}</section>
  <section class="panel"><div class="panel-h"><h2>Risk by asset</h2>${volIds.length ? `<div class="legend"><span><i style="background:${cssv('--s1')}"></i>Volatility (asset colour)</span><span><i style="background:${alpha(cssv('--muted'), .35)}"></i>Weight</span></div>` : ''}</div>${volIds.length ? '<div class="chart sm" id="volBox"><canvas id="cAVol" role="img" aria-label="Volatility by asset"></canvas></div>' : volLow() ? '<p class="note" id="volBox">Most of your daily prices are estimated (the funds only have a few scattered NAVs), so the volatility of each asset would be distorted. It will be shown when there are enough real prices.</p>' : `<p class="note" id="volBox">The volatility of each asset needs 20 daily closes in a row; there are ${maxDailyRun()} now. It will fill in by itself with the daily updates.</p>`}
</section>
  ${indexPanel()}
  ${assetYearPanel()}`;
}
vAnalysisDetail.after = function () {
  if (!res || res.series.length < 3) return;
  effChart();
  const from = periodFrom(ui.aPeriod);
  const s1 = cssv('--s1'), s2 = cssv('--s2'), s3 = cssv('--s3'), g = cssv('--gain-fill'), l = cssv('--loss');
  { const { base, pts } = sliceFrom(from); let pk = base ? base.index : 1; const dd = pts.map((q) => { pk = Math.max(pk, q.index); return q.index / pk - 1; }); const lc = cssv('--loss');
    mkLine($('#cDD'), pts.map((q) => q.date), [{ label: 'Drawdown', data: dd, borderColor: lc, backgroundColor: fillGrad(lc, .04, .26), fill: 'origin', borderWidth: 1.5 }], { fmt: (v) => pct(v), yfmt: (v) => pct(v, 0), suggestedMax: 0, suggestedMin: -0.02 });
    const el = $('#ddInfo'); if (el) el.innerHTML = `max <span class="num loss">${pct(Math.min(0, ...dd), 1)}</span> · now <span class="num">${pct(dd[dd.length - 1], 1)}</span>`;
    if (res.benchmark && $('#cVsB')) {
      const i0 = from ? res.series.findIndex((p) => p.date >= from) : 0; const bi = base ? base.index : 1;
      const B = res.benchmark; const bb = B[Math.max(0, i0 - 1)] || B.find((x) => x && x.has);
      const b0 = bb ? bb.level : null;
      mkLine($('#cVsB'), pts.map((q) => q.date), [
        { label: 'Your investments', data: pts.map((q) => q.index / bi - 1), borderColor: s1, backgroundColor: fillGrad(s1, .16, .01), fill: 'origin' },
        { label: benchName(), data: B.slice(Math.max(0, i0)).map((x) => (x && b0 ? x.level / b0 - 1 : null)), borderColor: s2 },
      ], { fmt: (v) => pctS(v, 1), yfmt: (v) => pct(v, 0), endDots: [0, 1], tooltip: { callbacks: { footer: (it) => { const a = it.find((x) => x.datasetIndex === 0), b = it.find((x) => x.datasetIndex === 1); return a && b && b.parsed.y != null ? `Difference: ${pctS(a.parsed.y - b.parsed.y, 1).replace(/\s?%/, ' pp')}` : ''; } } } });
    }
  }
  const months = Object.keys(res.monthFlows).sort().slice(-24);
  const mlab = (m) => { const [y, mo] = m.split('-'); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleDateString(L, { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
  mkBar($('#cFlows'), months, [
    { label: 'Invested', data: months.map((m) => res.monthFlows[m].invested), backgroundColor: s1 },
    { label: 'Withdrawn', data: months.map((m) => -res.monthFlows[m].withdrawn), backgroundColor: s2 },
    { label: 'Dividends', data: months.map((m) => res.monthFlows[m].income), backgroundColor: s3 },
  ], { xlab: mlab, titleFmt: mlab, stacked: false });
  indexChart(from);
  const ids = res.correlations.ids.filter((id) => assetVol()[id] != null);
  const rows = ids.map((id) => res.positions.find((p) => p.assetId === id)).filter(Boolean);
  const hw = $('table.heat'); if (hw && hw.parentElement) hw.parentElement.scrollLeft = hw.parentElement.scrollWidth; // the year column is sticky, so the latest months show with their year
  const box = $('#volBox'); if (!box || !$('#cAVol')) return;
  if (box) box.style.height = Math.max(160, rows.length * 34 + 50) + 'px';
  mkBar($('#cAVol'), rows.map((p) => p.asset.ticker || p.asset.name), [
    { label: 'Volatility', data: rows.map((p) => res.correlations.vol[p.assetId]), backgroundColor: rows.map((p) => acolor(p.assetId)) },
    { label: 'Weight', data: rows.map((p) => p.weight), backgroundColor: rows.map(() => alpha(cssv('--muted'), .35)) },
  ], { horizontal: true, fmt: (v) => pct(v, 1), yfmt: (v) => pct(v, 0) });
};

