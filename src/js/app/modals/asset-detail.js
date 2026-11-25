/* ---------- Asset detail page ---------- */
const DETAIL_CSS = `<style>.modal:has(.adetail){max-width:780px}.adetail{display:flex;flex-direction:column;gap:14px}.adetail>*{flex-shrink:0}
.adetail .fh-sub{font-size:13px;color:var(--muted);margin-top:-8px}
.adetail .fh-px{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.adetail .fh-px b{font-family:var(--f-num);font-size:22px;font-weight:500;color:var(--ink)}
.adetail .fh-info{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px 16px;background:var(--surface-2);border-radius:10px;padding:12px 14px;margin:0}
.adetail .fh-info dt{font-size:13px;color:var(--muted);font-weight:500}.adetail .fh-info dd{margin:2px 0 0;font-size:13px;overflow-wrap:anywhere}
.adetail .fh-h{font-size:13px;color:var(--muted);font-weight:700;margin:4px 0 -6px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.adetail .kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.adetail .kpi .v{font-size:16px}
.adetail .fh-risk{display:inline-flex;gap:2px;margin-left:6px;vertical-align:middle}.adetail .fh-risk i{width:8px;height:8px;border-radius:2px;background:var(--line)}.adetail .fh-risk i.on{background:var(--warn)}
.adetail .fh-ops{display:flex;flex-direction:column}.adetail .fh-op{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:8px 0;border-bottom:1px solid var(--grid);font-size:13px}.adetail .fh-op:last-child{border-bottom:0}
.adetail .fh-op .l2{font-size:13px;color:var(--muted)}.adetail .fh-op .r{text-align:right;font-family:var(--f-num);font-variant-numeric:tabular-nums;white-space:nowrap}
.adetail .fh-leg{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:var(--muted)}.adetail .fh-leg span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px;background:var(--c)}.adetail .fh-leg span.dash::before{height:0;border-radius:0;border-top:2px dashed var(--c);vertical-align:3px}
@media (max-width:640px){.adetail .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.adetail .fh-info{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>`;
const detailUI = { mode: 'value', per: 'MAX' }; let detailChart = null;
function detailTxs(id) { return (DEMO ? demoData.txs : Object.values(S.txs)).filter((x) => x.assetId === id || (x.type === 'transfer' && x.toAssetId === id)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); }
/** "2 years 3 months" since d. */
function detailAge(d) { if (!d) return ''; const t = todayStr(); let m = (+t.slice(0, 4) - +d.slice(0, 4)) * 12 + (+t.slice(5, 7) - +d.slice(5, 7)) - (t.slice(8) < d.slice(8) ? 1 : 0); if (m < 1) { const n = Math.round((Date.parse(t) - Date.parse(d)) / 864e5); return `${n} day${n === 1 ? '' : 's'}`; } const y = Math.floor(m / 12); m %= 12; return [y ? `${y} year${y === 1 ? '' : 's'}` : '', m ? `${m} month${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' '); }
/** Net money put into the asset by date: buys minus sale proceeds, transfers move their cost basis. */
function detailNetIn(id, x) { const e2 = res && res.txEUR[x.id]; if (!e2) return 0; if (x.type === 'buy') return e2.eur; if (x.type === 'sell') return -e2.eur; if (x.type === 'transfer') return (x.toAssetId === id ? 1 : -1) * (e2.cost || 0); return 0; }
function openDetail(id) {
  const a = assetById(id); if (!a) return;
  const p = res && res.positions.find((z) => z.assetId === id);
  const txs = detailTxs(id), ccy = a.currency || 'EUR';
  const first = (txs.find((x) => x.type === 'buy' || (x.type === 'transfer' && x.toAssetId === id)) || {}).date || null;
  const proceeds = res ? res.realized.filter((r) => r.assetId === id).reduce((s, r) => s + r.proceeds, 0) : 0;
  const netIn = p ? p.invested - proceeds : null;
  const hp = histPts(id), lp = p && ok(p.price) ? [p.priceDate, p.price] : hp.length ? hp[hp.length - 1] : null;
  const srcTxt = a.src === 'nav' ? 'NAV by ISIN' : isAuto(a) ? (a.quoteUrl ? 'Automatic · finanzen.net' : `Automatic · ${a.symbol || '?'}`) : 'Manual';
  const info = [['Type', TYPES[a.type] || a.type], ['Class', CLS_LABEL[clsOf(a)]], ['Category', a.category], ['ISIN', a.isin], ['Broker', a.broker], ['Currency', ccy], ['Tag', a.tag],
    ['Annual fee (TER)', a.ter != null && a.ter !== '' && ok(+a.ter) ? pct(+a.ter, 2) : null],
    ['Risk', +a.risk >= 1 && +a.risk <= 7 ? `${+a.risk} of 7<span class="fh-risk" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7].map((k) => `<i class="${k <= +a.risk ? 'on' : ''}"></i>`).join('')}</span>` : null],
    ['Price source', srcTxt], ['Target weight', p && p.target != null ? pct(p.target, 1) : null]].filter((r) => r[1]);
  const k = (l, v, s, c) => kpi(l, v, s, c);
  const kp = !p ? '<p class="note">No transactions in this asset yet.</p>' : `<div class="kpis">${[
    k('Units', p.open ? qn(p.qty, 6) : '<span class="chip">closed</span>'),
    k('Value', eur(p.value), p.open && ok(p.price) ? `at ${money(p.price, ccy, p.price >= 100 ? 2 : 4)}` : null),
    k('Average cost', p.open ? eur(p.avgCost, p.avgCost >= 100 ? 2 : 4) : '—', p.open ? `cost ${eur(p.costBasis)}` : null),
    k('Net contributed', eur(netIn), 'buys − sales', null),
    k('Unrealized gain', p.open ? eurS(p.unrealized) : '—', p.open ? pctS(p.unrealizedPct) : null, cls(p.unrealized)),
    k('Realized', Math.abs(p.realized) > 0.004 ? eurS(p.realized) : '—', null, cls(p.realized)),
    k('Dividends', p.dividends > 0.004 ? eur(p.dividends) : '—', p.dividends > 0.004 ? 'net' : null),
    k('Total gain', eurS(p.totalReturn), p.totalReturnPct != null ? pctS(p.totalReturnPct) + ' on invested' : null, cls(p.totalReturn)),
    k('IRR', pctS(p.xirr, 1), 'annual, with dates', cls(p.xirr)),
    k('Portfolio weight', p.open ? pct(p.weight, 1) : '—'),
    k('First buy', first ? fdate(first) : '—', first ? detailAge(first) : null),
    k('Transactions', String(txs.length), txs.length ? `last ${fdate(txs[txs.length - 1].date)}` : null),
  ].join('')}</div>`;
  const ops = txs.slice().reverse(), LIM = 12;
  const opRow = (x) => {
    const e2 = res && res.txEUR[x.id], inT = x.type === 'transfer' && x.toAssetId === id, o = x.type === 'transfer' ? assetById(inT ? x.assetId : x.toAssetId) : null;
    const lbl = x.type === 'transfer' ? `Switch ${inT ? 'from' : 'to'} ${esc(o ? o.ticker || o.name : '?')}` : TXT[x.type] || x.type;
    const sub = x.type === 'buy' || x.type === 'sell' ? `${qn(+x.qty, 6)} × ${money(+x.price, ccy, 4)}` : x.type === 'transfer' ? `${qn(inT ? +x.toQty : +x.qty, 6)} units` : x.type === 'split' ? `× ${numf(+x.ratio, 4)}` : x.type === 'dividend' ? `${money(+x.amount, ccy)} gross` : '';
    const amt = !e2 ? '—' : x.type === 'buy' || x.type === 'fee' ? eur(-e2.eur) : x.type === 'transfer' ? eur(e2.cost != null ? e2.cost : e2.eur) : eurS(e2.eur);
    return `<div class="fh-op"><div><span class="chip ${x.type === 'transfer' ? 'xfer' : TXCHIP[x.type]}">${lbl}</span> <span class="num">${fdate(x.date)}</span>${sub ? `<div class="l2">${sub}${+x.fees ? ` · fee ${eur(+x.fees)}` : ''}</div>` : ''}</div><div class="r">${amt}${x.type === 'transfer' ? '<div class="l2">cost carried over</div>' : ''}</div></div>`;
  };
  const html = `${DETAIL_CSS}<div class="adetail">
  <div class="panel-h"><h2><span class="sw" style="background:${acolor(id)}"></span>${esc(a.ticker || a.name)}</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <div class="fh-sub">${[esc(a.name || ''), a.isin ? esc(a.isin) : '', a.broker ? esc(a.broker) : ''].filter(Boolean).join(' · ')}</div>
  <div class="fh-px">${lp ? `<b>${money(lp[1], ccy, lp[1] >= 100 ? 2 : 4)}</b><span>${p && p.open && p.priceDate ? priceSub(p) : fdate(lp[0])}</span>` : '<span>No price yet</span>'}</div>
  <dl class="fh-info">${info.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
  <div class="fh-h">Your position</div>${kp}
  <div class="fh-h"><span>Over time</span><span style="display:flex;gap:6px;flex-wrap:wrap"><span class="seg" role="group" aria-label="What to show">${[['value', 'Value'], ['price', 'Price']].map(([v, l]) => `<button type="button" data-fmode="${v}" aria-pressed="${detailUI.mode === v}">${l}</button>`).join('')}</span><span class="seg" role="group" aria-label="Period">${[['1A', '1Y'], ['3A', '3Y'], ['MAX', 'Max']].map(([v, l]) => `<button type="button" data-fper="${v}" aria-pressed="${detailUI.per === v}">${l}</button>`).join('')}</span></span></div>
  <div class="chart sm" id="detailBox"><canvas id="cDetail" role="img" aria-label="${esc(a.ticker || a.name)} over time"></canvas></div><div class="fh-leg" id="detailLeg"></div>
  <div class="fh-h"><span>Transactions (${txs.length})</span></div>
  ${ops.length ? `<div class="fh-ops">${ops.slice(0, LIM).map(opRow).join('')}</div>` : '<p class="note">No transactions.</p>'}
  <div class="rowact" style="flex-wrap:wrap">${p && p.open ? `<button class="btn small primary" type="button" data-trade="${esc(id)}">Trade</button>${p.value > 0 && !DEMO ? `<button class="btn small" type="button" data-act="sell-sim" data-id="${esc(id)}">Simulate a sale</button>` : ''}` : ''}${a.src === 'manual' || a.type === 'fund' ? `<button class="btn small" type="button" data-price="${esc(id)}">Price</button>` : ''}${S.assets[id] ? `<button class="btn small" type="button" data-edit-asset="${esc(id)}">Edit details</button>` : ''}${txs.length ? `<button class="btn small" type="button" data-goto-tx="${esc(id)}">${ops.length > LIM ? `See all ${ops.length} in Transactions` : 'See in Transactions'}</button>` : ''}</div>
  </div>`;
  openModal(html, (m) => {
    m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fmode],[data-fper]'); if (!b) return; if (b.dataset.fmode) detailUI.mode = b.dataset.fmode; else detailUI.per = b.dataset.fper; $$('[data-fmode]', m).forEach((z) => z.setAttribute('aria-pressed', String(z.dataset.fmode === detailUI.mode))); $$('[data-fper]', m).forEach((z) => z.setAttribute('aria-pressed', String(z.dataset.fper === detailUI.per))); detailDraw(id); });
    detailDraw(id);
  });
}
function detailDraw(id) {
  if (detailChart) { try { detailChart.destroy(); } catch (e) {} detailChart = null; }
  const cv = $('#cDetail'), leg = $('#detailLeg'); if (!cv) return;
  const a = assetById(id), ccy = (a && a.currency) || 'EUR', txs = detailTxs(id);
  const t = todayStr(), from = detailUI.per === '1A' ? E.addMonths(t, -12) : detailUI.per === '3A' ? E.addMonths(t, -36) : '';
  const cIn = cssv('--ink'), cOut = cssv('--loss'), col = acolor(id), mut = cssv('--muted');
  const isIn = (x) => x.type === 'buy' || (x.type === 'transfer' && x.toAssetId === id), isOut = (x) => x.type === 'sell' || (x.type === 'transfer' && x.assetId === id);
  const tr = txs.filter((x) => isIn(x) || isOut(x));
  const mkTxt = (x) => { const e2 = res && res.txEUR[x.id]; if (x.type === 'transfer') { const inT = x.toAssetId === id, o = assetById(inT ? x.assetId : x.toAssetId); return `Switch ${inT ? 'from' : 'to'} ${o ? o.ticker || o.name : '?'}: ${numf(inT ? +x.toQty : +x.qty, 4)}`; } return `${TXT[x.type]}: ${numf(+x.qty, 4)} × ${money(+x.price, ccy, 4)}${e2 ? ` = ${eur(e2.eur)}` : ''}`; };
  let labels = [], ds = [], fmt = eur, yfmt;
  const marks = (yAt) => [[isIn, 'In', cIn], [isOut, 'Out', cOut]].map(([f, l, c]) => { const by = {}; tr.filter(f).forEach((x) => { (by[x.date] = by[x.date] || []).push(x); }); return { label: l, mk: labels.map((d) => (by[d] ? by[d].map(mkTxt).join(' · ') : null)), data: labels.map((d, i) => (by[d] ? yAt(i, by[d]) : null)), showLine: false, borderColor: c, backgroundColor: c, pointBackgroundColor: c, pointBorderColor: cssv('--surface'), pointBorderWidth: 1.5, pointRadius: tr.length > 40 ? 3.5 : 5, pointHoverRadius: 6 }; });
  if (detailUI.mode === 'value') {
    if (!res) return;
    const d0 = (txs[0] || {}).date; const pts = res.series.filter((s) => d0 && s.date >= d0 && (!from || s.date >= from));
    let ni = 0, k = 0; const pre = txs.filter((x) => pts.length && x.date < pts[0].date); pre.forEach((x) => { ni += detailNetIn(id, x); }); k = pre.length;
    labels = pts.map((s) => s.date);
    const val = pts.map((s) => s.holdings[id] || 0), inv = pts.map((s) => { while (k < txs.length && txs[k].date <= s.date) ni += detailNetIn(id, txs[k++]); return Math.max(0, ni); });
    ds = [{ label: 'Value', data: val, borderColor: col, backgroundColor: fillGrad(col, .22, .02), fill: 'origin' }, { label: 'Net contributed', data: inv, borderColor: mut, borderDash: [4, 4], borderWidth: 1.5, stepped: true, fill: false }].concat(marks((i) => val[i]));
    leg.innerHTML = `<span style="--c:${col}">Value</span><span class="dash" style="--c:${mut}">Net contributed</span><span style="--c:${cIn}">Buys</span><span style="--c:${cOut}">Sales</span>`;
  } else {
    const hp = histPts(id).filter((z) => ok(+z[1])); const own = tr.filter((x) => x.type !== 'transfer' && ok(+x.price) && +x.price > 0);
    const f0 = from || (txs[0] || {}).date || ''; // "Max" starts at your first trade: older points are sparse anchors
    labels = Array.from(new Set(hp.map((z) => z[0]).concat(own.map((x) => x.date)))).filter((d) => !f0 || d >= f0).sort();
    const hm = new Map(hp.map((z) => [z[0], +z[1]])), om = new Map(own.map((x) => [x.date, +x.price])); const lk = E.lookup(hp);
    const px = labels.map((d) => (hm.has(d) ? hm.get(d) : om.has(d) ? om.get(d) : null));
    ds = [{ label: 'Price', data: px, borderColor: col, backgroundColor: fillGrad(col, .16, .01), fill: 'origin', spanGaps: true }].concat(marks((i, xs) => { const o = xs.find((x) => x.type !== 'transfer'); return o ? +o.price : lk(labels[i]) ?? null; }));
    fmt = (v) => money(v, ccy, v >= 100 ? 2 : 4); yfmt = (v) => numf(v, v >= 100 ? 0 : 2);
    leg.innerHTML = `<span style="--c:${col}">Price (${esc(ccy)})</span><span style="--c:${cIn}">Buys</span><span style="--c:${cOut}">Sales</span>`;
  }
  if (labels.length < 2) { $('#detailBox').innerHTML = `<p class="note">There is not enough data for the chart yet.</p><canvas id="cDetail" hidden></canvas>`; $('#detailBox').style.height = 'auto'; return; }
  $('#detailBox').style.height = '';
  detailChart = mkLine(cv, labels, ds, { fmt: (v, c) => (c && c.dataset.mk ? c.dataset.mk[c.dataIndex] : fmt(v)), yfmt, endDots: [0], suggestedMin: detailUI.mode === 'value' ? 0 : undefined, tooltip: { filter: (c) => c.parsed.y != null } });
  const i = charts.indexOf(detailChart); if (i >= 0) charts.splice(i, 1); // lives with the modal, not with the tab
}
/** Asset-detail links where the rows only carry a transaction or asset id (Transactions, Settings → Assets). */
function detailHooks() {
  const txA = (tid) => { const x = (DEMO ? demoData.txs : Object.values(S.txs)).find((z) => String(z.id) === tid); return x && x.assetId; };
  $$('#view tr').forEach((tr) => { const b = tr.querySelector('[data-edit-tx],[data-edit-asset]'); const td = Array.from(tr.cells).find((c) => c.querySelector(':scope > .sw, :scope > .asset-cell')); if (!b || !td || td.dataset.adetail) return; const id = b.dataset.editAsset || txA(b.dataset.editTx); if (!id || !assetById(id)) return; td.dataset.adetail = id; td.classList.add('fcell'); td.tabIndex = 0; td.setAttribute('role', 'button'); td.title = 'Asset details'; });
  $$('#view .mcard .rowact').forEach((ra) => { const b = ra.querySelector('[data-edit-tx],[data-edit-asset]'); if (!b || ra.querySelector('[data-adetail]')) return; const id = b.dataset.editAsset || txA(b.dataset.editTx); if (!id || !assetById(id)) return; const f = document.createElement('button'); f.type = 'button'; f.className = 'btn small'; f.dataset.adetail = id; f.textContent = 'Details'; ra.insertBefore(f, b); });
}
{ const op = vTransactions.after; vTransactions.after = function () { if (op) op(); detailHooks(); }; const ac = vSettings.after; vSettings.after = function () { if (ac) ac(); detailHooks(); }; }
document.addEventListener('click', (ev) => { const t = ev.target.closest && ev.target.closest('[data-adetail]'); if (!t || (ev.target.closest('button,a') && ev.target.closest('button,a') !== t)) return; ev.preventDefault(); openDetail(t.dataset.adetail); });
document.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('td[data-adetail]')) { ev.preventDefault(); openDetail(ev.target.dataset.adetail); } });

