/* ================= Sections (v3 "simplified"): Home, Portfolio, Analysis and Plan =================
 * Each section answers one question: how am I doing?, what do I have?, am I doing it right?, where am I heading?
 * It reuses the usual panels; they are only grouped here. Cash, Transactions and Taxes
 * become details of Portfolio and Analysis, and Settings opens from the gear icon.
 */
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const since = () => '<span class="since">since the start</span>';

/* ---------- Home ---------- */
const RV_TAG = { 'Concentration': 'Weight', 'Disproportionate risk': 'Risk', 'Off your plan': 'Target', 'Your cash': 'Cash' };
/** Warnings that ask for something: interest not recorded, deferred losses and the "warn" insights. */
function reviewItems() {
  const out = []; if (!res || DEMO) return out;
  const y = res.totals.today.slice(0, 4);
  for (const h of interestHints(y)) out.push({ prio: 0, tag: 'Interest', title: `${res.incomeRows.some((r) => r.type === 'interest' && String(r.year) === String(y)) ? 'Missing interest' : 'Interest not recorded'} in ${esc(h.c.name)}`, sub: `${(() => { const got = res.incomeRows.filter((r) => r.type === 'interest' && String(r.year) === String(y)).reduce((t, r) => t + (+r.gross || +r.amount || 0), 0); return got >= 1 ? `you have ${eur(got, 0)} gross recorded; about ${eur(h.n, 0)} from ${h.months} month${h.months === 1 ? '' : 's'} is missing` : `it would be around ${eur(h.n, 0)} over ${h.months} month${h.months === 1 ? '' : 's'} of ${y}`; })()} · it counts for your tax return`, act: `<button class="btn small" type="button" data-mv="interest" data-acc="${esc(h.c.id)}">Record</button>` });
  const f = res.fiscal[y];
  if (f && f.deferredPending < -0.004) out.push({ prio: 3, tag: 'Taxes', title: 'Losses deferred by the wash-sale rule', sub: `${eur(-f.deferredPending)} you cannot offset yet (wash-sale rule)`, act: '<a href="#taxes" data-goto="taxes" class="small">View</a>' });
  for (const i of buildInsights()) if (i.tone === 'warn') {
    if (/^Against/.test(i.title)) { out.push({ prio: i.prio, tag: 'Index', title: `You are behind ${esc(benchName())}`, sub: (() => { const ix = typeof indexInfo === 'function' && indexInfo(); return ix && ix.sim > ix.V ? `since you started: with the index you would have ${eur(ix.sim - ix.V, 0)} more` : 'since you started'; })(), act: '<a href="#analysis" data-goto="analysis" data-period="MAX" data-to="idxPanel" class="small">View</a>' }); continue; }
    out.push({ prio: i.prio, tag: RV_TAG[i.title] || 'Warning', title: i.title, sub: i.text });
  }
  return out.sort((a, b) => a.prio - b.prio);
}
function toReview() {
  if (!res || DEMO) return '';
  const it = reviewItems(), top = it.slice(0, 3), more = it.slice(3), rest = buildInsights().filter((i) => i.tone !== 'warn');
  const nb = (t) => String(t).replace(/(\d) %/g, '$1\u00a0%').replace(/(\d) €/g, '$1\u00a0€');
  const li = (x) => `<div class="rv-i"><span class="rv-tag">${x.tag}</span><div class="rv-b"><div class="rv-t">${nb(x.title)}</div><div class="small muted">${nb(x.sub)}</div></div>${x.act || ''}</div>`;
  const sum = [more.length ? `${more.length} more warning${more.length === 1 ? '' : 's'}` : '', rest.length ? `${rest.length} fact${rest.length === 1 ? '' : 's'} about your portfolio` : ''].filter(Boolean).join(' and ');
  return `<section class="panel" id="revPanel"><div class="panel-h"><h2>To review</h2><span class="small muted">${it.length ? (it.length === 1 ? '1 warning' : `${it.length} warnings`) : 'nothing pending'}</span></div>
    ${top.length ? `<div class="rv-list">${top.map(li).join('')}</div>` : '<p class="small muted" style="margin:0">All in order: there is nothing to review.</p>'}
    ${sum ? `<details class="rv-more"><summary>${sum}</summary>${more.length ? `<div class="rv-list">${more.map(li).join('')}</div>` : ''}${rest.length ? `<div class="ins-list" style="margin-top:10px">${rest.map(insightCard).join('')}</div>` : ''}</details>` : ''}
  </section>`;
}
function vHome() {
  if (!res || !res.series.length) return emptyState('Add assets and transactions to see your portfolio.');
  return `<div class="grid g-2e">${moveBreakdown() || ''}${toReview()}</div>
  ${estPanel()}
  ${dropLine()}
  ${goalLine()}
  <section class="panel">
    <div class="panel-h"><h2>Over time</h2>${periodSeg(ui.period, 'p')}</div>
    <div class="evo-bar">${evoSeg()}<div class="legend" id="mainLegend"></div></div>
    <div class="chart tall"><canvas id="cMain" role="img" aria-label="Net worth over time"></canvas></div>
    <div class="small muted" id="mainFoot"></div>
  </section>`;
}
vHome.after = function () { vSummary.after(); };
/** The savings goal in one line (the detail lives in Plan). */
function goalLine() {
  const g = typeof goalInfo === 'function' && goalInfo(); if (!g) return '';
  return `<section class="panel" id="goalLine"><div class="rv-i rv-solo"><span class="rv-tag">Goal</span><div class="rv-b"><div class="rv-t">${esc(g.name)}: ${pct(g.share, 0)}</div><div class="small muted">${g.left > 0 ? `${eur(g.cash, 0)} of ${eur(g.amount, 0)}${g.cu ? ` (without your ${eur(g.cu.amount, 0)} emergency fund)` : ''} · ${eur(g.left, 0)} to go${g.eta && g.pace > 0 ? ` · at your pace, around ${fdate(g.eta, { day: undefined })}` : ''}` : 'goal reached'}</div><div class="goalbar" style="margin-top:6px" aria-hidden="true"><span style="width:${(g.share * 100).toFixed(1)}%"></span></div></div><a href="#plan" data-goto="plan" class="small">View</a></div></section>`;
}
/** The drop warning in one line (the history of drops lives in Analysis › Risk and drawdowns). Same rule as dropPanel: a week down 3 % or more. */
function dropLine() {
  if (!res || DEMO || res.series.length < 30) return '';
  const th = 0.03; const W = weekRets(); if (!W.length) return '';
  const today = res.totals.today; const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  let cur = W[W.length - 1]; if (!(cur.r <= -th) && dow <= 1 && W.length > 1 && W[W.length - 2].mon === E.addDays(monOf(today), -7)) cur = W[W.length - 2];
  if (!(cur.r <= -th) || cur.mon < E.addDays(monOf(today), -7)) return '';
  const isThis = cur.mon === monOf(today);
    return `<section class="panel" id="dropPanel"><div class="rv-i rv-solo"><span class="rv-tag">Drop</span><div class="rv-b"><div class="rv-t">${isThis ? 'This week your investments have fallen' : 'Last week your investments fell'} ${pct(-cur.r, 1)}</div><div class="small muted">from ${fdate(cur.mon, { year: undefined })} to ${fdate([cur.end || E.addDays(cur.mon, 4), lastMktDate() || '9999'].sort()[0], { year: undefined })} · not counting cash</div></div><a href="#analysis" data-goto="analysis" data-to="riskPanel" class="small">View</a></div></section>`;
}

/* ---------- Portfolio ---------- */
const repView = () => (ui.rep = ui.rep || lsGet('portfolio-rep', 'class'));
const zMapOn = () => (ui.zmap == null ? (ui.zmap = lsGet('portfolio-zmap', '0') === '1') : ui.zmap);
const zDevOn = () => (ui.zdev == null ? (ui.zdev = lsGet('portfolio-zdev', '0') === '1') : ui.zdev);
document.addEventListener('click', (e) => {
  const z = e.target.closest('.zmap [data-z]'); if (z) { const box = $('#zmInfo'); if (box) box.innerHTML = z.dataset.info; $$('.zmap [data-z]').forEach((x) => x.classList.toggle('on', x.dataset.z === z.dataset.z)); return; }
  const b = e.target.closest('[data-rep],[data-zmap],[data-taxy],[data-zdev]'); if (!b) return;
  if (b.dataset.zdev) { ui.zdev = b.dataset.zdev === '1'; lsSet('portfolio-zdev', ui.zdev ? '1' : '0'); render(); return; }
  if (b.dataset.rep) { ui.rep = b.dataset.rep; lsSet('portfolio-rep', ui.rep); }
  else if (b.dataset.zmap) { ui.zmap = b.dataset.zmap === '1'; lsSet('portfolio-zmap', ui.zmap ? '1' : '0'); }
  else { ui.taxY = b.dataset.taxy; ui.fiscalYear = ui.taxY; }
  render();
});
/** World map of the money in equities: each MSCI zone is shaded by its weight; the legend shows the world weight next to it. */
function zoneMap(rows) {
  const W = WORLD_MAP; const dev = true; const w = Object.fromEntries(rows.map((r) => [r.k, r]));
  const gap = (r) => r.w * 100 - ZONE_WORLD[r.k]; const maxW = Math.max(...rows.map((r) => r.w), 0.01), maxG = Math.max(...rows.map((r) => Math.abs(gap(r))), 1);
  const paint = (r) => (dev ? { c: gap(r) >= 0 ? 'var(--accent)' : 'var(--s4)', o: (0.3 + 0.65 * Math.abs(gap(r)) / maxG).toFixed(2) } : { c: 'var(--accent)', o: (0.3 + 0.65 * r.w / maxW).toFixed(2) });
  const g = (r) => { const d = gap(r); return `${d >= 0 ? '+' : '−'}${numf(Math.abs(d), 0)} p. p.`; };
  const info = (r) => `<b>${r.l}</b>: ${pct(r.w, 0)} of your stocks (${eur(r.v, 0)}); in world stocks, ${ZONE_WORLD[r.k]} %. ${gap(r) >= 0 ? 'It weighs more' : 'It weighs less'} than in the world: ${g(r)}`;
  return `<figure class="zmap">
    <svg viewBox="0 0 800 ${W.h}" role="img" aria-label="World map: ${rows.map((r) => `${r.l} ${pct(r.w, 0)}, world ${ZONE_WORLD[r.k]} %`).join('; ')}">
      <path d="${W.p.rest}" class="zm-rest"><title>No weight in your funds</title></path>
      ${ZONES.map(([k]) => { const p = paint(w[k]); return `<path d="${W.p[k]}" class="zm-z" style="fill:${p.c};fill-opacity:${p.o}" data-z="${k}" data-info="${esc(info(w[k]))}"><title>${esc(info(w[k]).replace(/<[^>]+>/g, ''))}</title></path>`; }).join('')}
    </svg>
    <p class="small" id="zmInfo" aria-live="polite">Tap a region to see its detail.</p>
    <figcaption class="zm-lg">${rows.map((r) => { const p = paint(r); return `<span class="zm-li"><i style="background:${p.c};opacity:${p.o}"></i><span class="zm-n">${r.l}</span><b class="num">${dev ? g(r) : pct(r.w, 0)}</b><span class="small muted num">${dev ? `you ${pct(r.w, 0)} · world ${ZONE_WORLD[r.k]} %` : `world ${ZONE_WORLD[r.k]} %`}</span></span>`; }).join('')}</figcaption>
    <p class="small muted" style="margin:4px 0 0">Each region is compared with its weight in world stocks. Blue: it weighs more in your stocks. Ochre: it weighs less. The deeper the colour, the bigger the difference. "Other developed" is Canada, Australia, Israel, New Zealand, Hong Kong and Singapore; the last two are not visible at this scale.</p></figure>`;
}
function fundBars() {
  const open = res.positions.filter((p) => p.open && p.value > 0).sort((a, b) => b.value - a.value); if (!open.length) return '';
  const maxW = open[0].value;
  return `<div class="toppos">${open.map((p, i) => `<button type="button" class="tp-row alink" data-adetail="${esc(p.assetId)}"><div class="tp-name"><span class="sw" style="background:${acolor(p.assetId)}"></span><span>${esc(p.asset.ticker || p.asset.name)}</span></div><div class="tp-bar"><span style="--mj:${i};width:${(p.value / maxW * 100).toFixed(1)}%;background:${acolor(p.assetId)}"></span>${p.target != null ? `<i class="tp-tgt" style="left:${Math.min(100, p.target * res.totals.value / maxW * 100).toFixed(1)}%" title="Target ${pct(p.target, 0)}"></i>` : ''}</div><span class="num tp-v">${eur(p.value, 0)}</span><span class="num muted tp-w">${pct(p.weight, 0)}${p.target != null ? ` <small>target ${pct(p.target, 0)}</small>` : ''}</span></button>`).join('')}</div>${mixBar(open)}`;
}
function allocationPanel() {
  const P = patrimony(); const z = zoneBody(false); const v = repView() === 'zone' && !z ? 'class' : repView();
  const al = classAlloc();
  const seg = `<div class="seg" role="group" aria-label="Show the allocation by">${[['class', 'Class'], ['zone', 'Region'], ['fund', 'Fund']].filter(([k]) => k !== 'zone' || z).map(([k, l]) => `<button type="button" data-rep="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div>`;
  let body;
  if (v === 'zone') body = `<div class="rep-sub"><span class="small muted">the money in stocks, looking inside each fund</span><div class="seg seg-sm" role="group" aria-label="View">${[['0', 'Bars'], ['1', 'Map']].map(([k, l]) => `<button type="button" data-zmap="${k}" aria-pressed="${zMapOn() === (k === '1')}">${l}</button>`).join('')}</div></div>${zoneBody(zMapOn())}`;
  else if (v === 'fund') body = `<p class="small muted" style="margin:0 0 8px">the money invested, by fund; tap one to see its details</p>${fundBars()}`;
  else body = `<div class="donut-wrap"><div class="chart donut"><canvas id="cAlloc" role="img" aria-label="Allocation by asset class"></canvas></div>
      <ul class="alloc-list">${al.map((a, i) => `<li data-di="${i}" tabindex="0"><span class="sw" style="background:${a.color}"></span><span>${a.label}</span><span class="num">${eur(a.value, 0)}</span><span class="num muted">${pct(a.weight, 0)}</span></li>`).join('')}</ul></div>`;
  const tgt = res.rebalance.length ? '' : `<div class="rv-i rep-tgt"><div class="rv-b"><div class="rv-t">Target weights</div><div class="small muted">set them on each asset to see how far off you are and where to put your next contribution</div></div><a href="#settings" data-goto="settings" class="small">Set</a></div>`;
  return `<section class="panel" id="repPanel"><div class="panel-h"><h2>Allocation</h2><span class="small muted num">${eur(v === 'class' ? P.total : v === 'zone' ? zoneSplit().eq : P.inv, 0)}</span></div>${seg}<div class="rep-body">${body}</div>${tgt}</section>`;
}
function cashCard() {
  const list = cashList(), tot = cashTotal(), P = patrimony(), one = list.length === 1 && !DEMO ? list[0] : null;
  const rows = list.map((c) => { const bal = cashBal(c); return `<a class="cc-row" href="#cash" data-goto="cash"><span class="cc-ic" aria-hidden="true">€</span><span class="cc-b"><b>${esc(c.name)}</b><span class="small muted">${[esc(c.entity || ''), +c.rate ? `AER ${pct(+c.rate / 100, 2)} · ~${eur(bal * c.rate / 100, 0)}/year` : ''].filter(Boolean).join(' · ')}</span></span><b class="num">${eur(bal, 0)}</b>${CHEV}</a>`; }).join('');
  return `<section class="panel" id="cashCard"><div class="panel-h"><div><h2>Cash</h2><span class="small muted">${list.length} account${list.length === 1 ? '' : 's'} · ${pct(P.total ? tot / P.total : 0, 0)} of net worth</span></div><b class="num cc-tot">${eur(tot, 0)}</b></div>
    ${list.length ? `<div class="cc-list">${rows}</div>` : '<p class="small muted" style="margin:0">No cash accounts.</p>'}
    ${one ? `<div class="toolbar"><button class="btn primary small" type="button" data-mv="in" data-acc="${esc(one.id)}">+ Deposit</button><button class="btn small" type="button" data-mv="out" data-acc="${esc(one.id)}">− Withdrawal</button><button class="btn small" type="button" data-mv="interest" data-acc="${esc(one.id)}">Interest</button></div>` : ''}
    <div class="pos-foot"><button class="btn ghost small" type="button" data-act="add-cash">Add account</button>${list.length ? '<a href="#cash" data-goto="cash" class="small">Movements, balance and history</a>' : ''}</div></section>`;
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
  return `<section class="panel" id="movCard"><div class="panel-h"><div><h2>Activity</h2><span class="small muted">the latest; transactions and cash together</span></div></div>
    <div class="mv-list">${rows.slice(0, 5).map(it).join('')}</div>
    <div class="pos-foot"><span class="small muted">${nTx} transactions and ${nC} cash movements</span><a href="#transactions" data-goto="transactions" class="small">See all ${rows.length}</a></div></section>`;
}
function vPortfolio() {
  if (!res || !res.positions.length) return vPositions();
  vPositions(); const P = vPositions.parts;
  return `${P.main}
  <div class="grid g-2e">${allocationPanel()}<div class="col-stack">${cashCard()}${movCard()}</div></div>
  ${res.rebalance.length ? P.reb : ''}
  ${P.last}`;
}
vPortfolio.after = function () {
  const c = $('#cAlloc'); if (!c) return; const al = classAlloc();
  donutLegend(mkDonut(c, al.map((a) => a.label), al.map((a) => a.value), al.map((a) => a.color)), $('.alloc-list'));
};

/* ---------- Analysis ---------- */
function taxPanel() {
  const years = Object.keys(res.fiscal).sort().reverse(); if (!years.length) return '';
  const y = ui.taxY && years.includes(ui.taxY) ? ui.taxY : years[0];
  const { f, g, rcm, tax } = fiscalCalc(y); const sales = res.realized.filter((s) => String(s.year) === y);
  const nG = sales.filter((s) => s.gain >= 0).length, nL = sales.length - nG; const hints = interestHints(y);
  const r = (l, sub, v, c) => `<div class="stat"><span class="k">${l}${sub ? `<small>${sub}</small>` : ''}</span><span class="v num ${c || ''}">${v}</span></div>`;
  return `<section class="panel" id="taxPanel"><div class="panel-h"><div><h2>Taxes</h2><span class="small muted">by tax year, not by the period</span></div>${years.length > 1 ? `<div class="seg" role="group" aria-label="Tax year">${years.slice(0, 3).map((k) => `<button type="button" data-taxy="${k}" aria-pressed="${k === y}">${k}</button>`).join('')}</div>` : ''}</div>
    <div class="stats">
      ${r('Net gains', sales.length ? `${nSales(nG)} with a gain${nL ? `, ${nL} with a loss` : ''}` : 'no sales', eurS(g), cls(g))}
      ${f.deferredPending ? r('Deferred losses', 'blocked by the wash-sale rule; tap below to see where they come from', eur(-f.deferredPending), 'loss') : ''}
      ${r('Dividends and interest', hints.length ? 'account interest still to record' : 'gross', eur(rcm))}
      ${r('<b>Estimated tax</b>', 'savings income base', `<b>${eur(tax)}</b>`)}
    </div>
    ${f.deferredPending ? `<details class="an-more wash"><summary>Where do the deferred losses come from?</summary>${res.realized.filter((x) => x.washSale && x.deferred).map((x) => `<p class="small" style="margin:6px 0 0">You sold <b>${esc(assetById(x.assetId)?.ticker || assetById(x.assetId)?.name || '')}</b> on ${fdate(x.date)} at a loss of ${eur(-x.gain)}, and ${x.washSaleDate ? `you bought the same fund on ${fdate(x.washSaleDate)}, less than ${x.washSaleWindow === 12 ? 'a year' : '2 months'} from the sale` : `you bought the same fund less than ${x.washSaleWindow === 12 ? 'a year' : '2 months'} from the sale`}. The tax office does not let you deduct ${eur(-x.deferred)} of that loss while you hold those units; when you sell them, it applies. You do not lose it: it is postponed.</p>`).join('')}</details>` : ''}
    <div class="pos-foot"><span class="small muted">Detail per sale for your tax return and a downloadable report</span><a href="#taxes" data-goto="taxes" class="small">Open</a></div></section>`;
}
function vAnalysis() {
  if (!res || res.series.length < 3) return emptyState('A bit more history is needed to compute statistics.');
  const from = periodFrom(ui.aPeriod); const st = E.periodStats(res, from);
  if (!st) return emptyState('No data in this period.');
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
    kpi('Return', pctS(st.twr, 1), st.cagr != null && st.days > 400 ? `TWR · ${pctS(st.cagr, 1)} a year` : `TWR · ${{ '1M': 'last month', '3M': 'last 3 months', YTD: 'in ' + new Date().getFullYear(), '1A': 'last year', '3A': 'last 3 years' }[from ? ui.aPeriod : ''] || 'since the start'}`, cls(st.twr), 'Return of the strategy in the period, without the effect of when you add money'),
    kpi('Result', eurS(st.pnl, 0), 'in euros, in the period', cls(st.pnl)),
    kpi('Costs', eur(fees), 'trading · the TER is on the asset page'),
    kpi('Your money has earned', pctS(t.xirr, 1), 'annual IRR · since the start', cls(t.xirr), `Money-weighted: it takes into account when and how much you contributed. The one on Home (${ok(t.twrAnn) ? `≈ ${pctS(t.twrAnn, 0)} a year` : 'TWR'}) measures the strategy, as if all the money had been there from the start. If you contributed a lot just before rises, the IRR comes out higher.`),
  ].join('');
  const idx = res.benchmark && b ? `<section class="panel" id="idxPanel"><div class="panel-h"><div><h2>Against ${esc(benchName())}</h2><span class="small muted">each euro of your strategy against the index, in the period</span></div><div class="legend"><span><i class="line" style="background:${cssv('--s1')}"></i>You</span><span><i class="line" style="background:${cssv('--s2')}"></i>${esc(benchName())}</span></div></div>
    ${ix ? `<p class="idx-lead">${since()} With the same money in the index you would have <b class="num">${eur(ix.sim, 0)}</b>; you have <b class="num">${eur(ix.V, 0)}</b> (<span class="${cls(ix.V - ix.sim)}">${eurS(ix.V - ix.sim, 0)}</span>). <span class="small muted">The points below measure the strategy, as if all the money had been there from the start; the euros, your real money with its dates. That is why they are not proportional.</span></p>` : ''}
    <div class="chart"><canvas id="cVsB" role="img" aria-label="Your return against the index"></canvas></div>
    <div class="idx3"><div class="tile"><span class="l">You</span><span class="v num ${cls(st.twr)}">${pctS(st.twr, 1)}</span></div><div class="tile"><span class="l">Index</span><span class="v num ${cls(b.twr)}">${pctS(b.twr, 1)}</span></div><div class="tile"><span class="l">Difference</span><span class="v num ${cls(diff)}">${ppt(diff, 1, true)}</span></div></div>
    <p class="small" style="margin:0">In the period ${diff >= 0 ? 'you beat it' : 'you trail it'} by <b>${ppt(Math.abs(diff), 1)}</b>.${!low && ok(b.beta) ? ` With a beta of ${ratio(b.beta)}, if the index falls 10 % your portfolio tends to fall ~${pct(Math.abs(b.beta * 0.1), 1)}.` : ''}</p>
    ${ix ? `<div class="idx-euros">${since()} Out of your pocket (buys − sales): ${eur(ix.pocket, 0)} · index IRR ${pctS(ix.simIrr, 1)}, yours ${pctS(ix.irr, 1)}.</div>` : ''}
    <details class="an-more"><summary>More data against the index</summary><div class="stats">
      ${S3('Beta', ratio(b.beta))}${S3('Annual alpha', pctS(b.alpha), cls(b.alpha))}${S3('Correlation', ratio(b.corr))}${S3('Tracking error', pct(b.trackingError, 1))}${S3('Upside capture', pct(b.upCapture, 0))}${S3('Downside capture', pct(b.downCapture, 0))}${S2('Weeks compared', String(b.weeks))}
    </div>${low ? '<p class="small muted">With so few daily prices, beta, alpha and the captures are hidden: they would be distorted.</p>' : ''}
    ${ix ? `<div class="chart sm" style="margin-top:10px"><canvas id="cIdx" role="img" aria-label="Your investments against the same money in the index, in euros"></canvas></div><p class="note" style="margin:6px 0 0">In euros: your investments, the same money on the same dates in the index, and what came out of your pocket. The index is chosen in Settings.</p>` : ''}</details>
  </section>` : '';
  const monthsPanel = `<section class="panel" id="monthPanel"><div class="panel-h"><h2>Month by month</h2><span class="small muted">TWR per month; ${window.innerWidth < 640 ? 'the last row' : 'the last column'}, the year</span></div>${heatmap()}
    ${mv.length ? `<p class="small muted" style="margin:6px 0 0">The table shows your whole history. In the chosen period (${fdate(st.from)} – ${fdate(st.to)}), ${mPos} of ${mv.length} months were positive${mAll.length > mv.length ? ` (not counting ${mAll.length - mv.length} with no data, "n/a")` : ''}. Best, ${mName(bestM[0])} (${pctS(bestM[1], 1)}); worst, ${mName(worstM[0])} (${pctS(worstM[1], 1)}).</p>` : ''}</section>`;
  const risk = `<section class="panel" id="riskPanel"><div class="panel-h"><h2>Risk and drawdowns</h2><span class="small muted" id="ddInfo"></span></div>
    <div class="chart sm"><canvas id="cDD" role="img" aria-label="Drawdown from highs"></canvas></div>
    <div class="stats">
      ${S2('Maximum drawdown in the period', pct(st.maxDD, 1), 'loss', st.maxDDPeak ? `${fdate(st.maxDDPeak)} → ${fdate(st.maxDDTrough)}${st.maxDDTrough ? (st.maxDDRecovery ? ` · recovered on ${fdate(st.maxDDRecovery)}` : ' · not recovered') : ''}` : '')}
      ${S3('Annual volatility', pct(st.vol, 1), '', ok(st.vol) ? volWord(st.vol) : '')}
      ${S3('Weekly VaR 95 %', pct(st.var95), '', ok(st.var95) ? `≈ ${eur(st.var95 * V, 0)} today · exceeded 1 week in 20` : 'needs ≥ 20 weeks')}
      ${S3('Weekly CVaR 95 %', pct(st.cvar95), '', ok(st.cvar95) ? `≈ ${eur(st.cvar95 * V, 0)} on average in those weeks` : '')}
    </div>
    ${low ? '<p class="small muted" style="margin:6px 0 0">With so few daily prices, volatility and VaR cannot be interpreted yet.</p>' : ''}
    ${dropHistory()}</section>`;
  const contrib = `<section class="panel"><div class="panel-h"><div><h2>What each fund has contributed ${since()}</h2><span class="small muted">unrealized + realized + income; closed ones in grey; those under €20, grouped</span></div></div><div class="chart sm" id="contribBox"><canvas id="cContrib" role="img" aria-label="Contribution by asset"></canvas></div></section>`;
  return `<div class="an-top">${periodSeg(ui.aPeriod, 'ap')}<span class="small muted">Everything in this tab uses this period (${fdate(st.from)} – ${fdate(st.to)}), except what is marked ${since()}</span></div>
  ${st.days < 365 ? '<div class="banner info"><div><b>Short period.</b> With less than a year of data the figures change a lot from one week to the next: take them as a guide.</div></div>' : ''}
  ${low ? `<div class="banner" id="covWarn"><div><b>Few daily prices:</b> in ${pct(cov.share, 0)} of the sessions in the period most of the value has no quote for that day. That is why volatility, VaR, beta and the captures are hidden${cov.since ? `. Choose a period from ${fdate(cov.since)} to see them` : ''}.</div></div>` : ''}
  <section class="kpis">${kp}</section>
  ${idx}
  ${monthsPanel}
  <div class="grid g-2e"><div class="col-stack">${contrib}${taxPanel()}</div><div class="col-stack">${risk}</div></div>
  <div class="grid g-2e"><div class="col-stack">${effPanel()}</div><div class="col-stack">${assetYearPanel()}</div></div>
  ${aiPanel()}`;
}
vAnalysis.after = function () { vAnalysisDetail.after(); vPositions.after(); };

/* ---------- Plan ---------- */
function aportPanel() {
  const t = res.totals; const last12 = Array.from({ length: 12 }, (_, i) => E.addMonths(t.today, -i).slice(0, 7));
  const inv12 = last12.reduce((s, m) => s + ((res.monthFlows[m] || {}).invested || 0), 0), n12 = last12.filter((m) => ((res.monthFlows[m] || {}).invested || 0) > 0).length;
  const box = (l, v, s) => `<div class="tile"><span class="l">${l}</span><span class="v num">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const plans = recurPlans();
  return `<section class="panel" id="aportPanel"><div class="panel-h"><div><h2>Contributions</h2><span class="small muted" id="aportSub">${(() => { const m = +pjOpts().m, avg = pjAvgMonthly(); return Math.abs(m - avg) < 1 ? `the projection uses your net average: ${eur(avg, 0)}/month` : `the projection uses ${eur(m, 0)}/month (your net average is ${eur(avg, 0)})`; })()}</span></div><div class="legend"><span><i style="background:${cssv('--s1')}"></i>Invested</span><span><i style="background:${cssv('--s2')}"></i>Withdrawn (sales)</span><span><i style="background:${cssv('--s3')}"></i>Dividends</span></div></div>
    <div class="idx3">${box('Bought, 12 months', eur(inv12, 0))}${box('Monthly average', eur(inv12 / 12, 0), `${eur(pjAvgMonthly(), 0)} net of sales`)}${box('Consistency', `${n12} of 12`, 'months with buys')}</div>
    <div class="chart sm"><canvas id="cFlows" role="img" aria-label="Monthly contributions"></canvas></div>
    ${res.rebalance.length ? contribBlock() : '<div class="rv-i"><div class="rv-b"><div class="rv-t">I am going to invest…</div><div class="small muted">set target weights on your assets and I will tell you how to split the next buy</div></div><a href="#settings" data-goto="settings" class="small">Set</a></div>'}
    <div class="rv-i"><div class="rv-b"><div class="rv-t">Recurring buys</div><div class="small muted">${plans.length ? `${plans.length} plan${plans.length === 1 ? '' : 's'} · your monthly orders` : 'note your monthly orders and they are recorded automatically'}</div></div><button class="btn small" type="button" data-recurring="${plans.length ? 'manage' : 'new'}">${plans.length ? 'View' : 'Add'}</button></div>
  </section>`;
}
const pjChipsHtml = (o) => `<span class="chip">${eur(o.m, 0)}/month</span><span class="chip">${o.h} years</span><span class="chip">inflation ${numf(+o.inf, 1)} %</span><span class="chip">${o.cash ? 'with' : 'without'} cash</span>`;
function vPlan() {
  if (!res || !res.series.length) return vProjection();
  const o = pjOpts();
  const chips = `<div class="pj-chips"><span id="pjChips" style="display:contents">${pjChipsHtml(o)}</span><button class="btn ghost small" type="button" data-pjopen="1" aria-expanded="${!!ui.pjEdit}" aria-controls="pjSup">${ui.pjEdit ? 'Hide assumptions' : 'Change'}</button></div>`;
  const pj = vProjection().replace('<div class="small muted" id="pjFoot"></div>', `${chips}<div class="small muted" id="pjFoot"></div>`).replace('<section class="panel"><div class="panel-h"><h2>Assumptions</h2>', `<section class="panel" id="pjSup"${ui.pjEdit ? '' : ' hidden'}><div class="panel-h"><h2>Assumptions</h2>`);
  return `${pj}
  <div class="grid g-2e">${aportPanel()}<div class="col-stack">${goalPanel(false)}${cushionPanel()}</div></div>`;
}
vPlan.after = function () {
  vProjection.after();
  const s1 = cssv('--s1'), s2 = cssv('--s2'), s3 = cssv('--s3');
  const months = Object.keys(res.monthFlows).sort().slice(-24);
  const mlab = (m) => { const [y, mo] = m.split('-'); return new Date(Date.UTC(+y, +mo - 1, 1)).toLocaleDateString(L, { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
  mkBar($('#cFlows'), months, [
    { label: 'Invested', data: months.map((m) => res.monthFlows[m].invested), backgroundColor: s1 },
    { label: 'Withdrawn', data: months.map((m) => -res.monthFlows[m].withdrawn), backgroundColor: s2 },
    { label: 'Dividends', data: months.map((m) => res.monthFlows[m].income), backgroundColor: s3 },
  ], { xlab: mlab, titleFmt: mlab, stacked: false });
};
/* "Change" shows the assumptions panel and takes you there */
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-pjopen]')) return; ui.pjEdit = !ui.pjEdit; render();
  if (ui.pjEdit) setTimeout(() => { const p = $('#pjSup'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
});
