/* ---------- Positions ---------- */
const POSCOLS = [
  ['asset', 'Asset', false], ['qty', 'Quantity', true], ['price', 'Price', true], ['avgCost', 'Average cost €', true], ['costBasis', 'Cost', true], ['value', 'Value', true], ['weight', 'Weight', true],
  ['unrealized', 'Unrealized', true], ['realized', 'Realized', true], ['dividends', 'Income', true], ['xirr', 'IRR', true],
];
/** Closes and NAVs on record for an asset (without the prices of your own trades). */
function histPts(id) { return DEMO ? ((demoData.history || {})[id] || []) : mergePts(((S.history[id] || {}).points) || [], navPoints(S.navs[id])); }
/** Sub-label under a position's price: its date, and whether it is the price of your own trade rather than a close. */
function priceSub(p) {
  if (!p.open || !p.priceDate) return '';
  const own = !histPts(p.assetId).some((z) => z[0] === p.priceDate);
  const tx = own ? (DEMO ? demoData.txs : Object.values(S.txs)).find((x) => x.assetId === p.assetId && x.date === p.priceDate && (x.type === 'buy' || x.type === 'sell')) : null;
  const lag = bizLag(p.priceDate);
  return fdate(p.priceDate, { year: undefined }) + (lag > 2 ? ` <span class="chip warn" title="Last price from ${lag} business days ago">${lag} bus. d</span>` : '') + (tx ? `<span class="pown" title="It is the price of your ${tx.type === 'sell' ? 'sale' : 'buy'}, not a market close" aria-label="price of your ${tx.type === 'sell' ? 'sale' : 'buy'}">*</span>` : '');
}
/** 30-day mini line of an asset's closes, in its colour. */
function spark(id) {
  const from = E.addDays(todayStr(), -30), pts = histPts(id).filter((z) => z[0] >= from && ok(+z[1])); if (pts.length < 3) return '';
  const ys = pts.map((z) => +z[1]), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const d = ys.map((y, k) => `${(k / (ys.length - 1) * 46).toFixed(1)},${(14 - (y - lo) / span * 12).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 46 16" aria-hidden="true"><polyline points="${d}" fill="none" stroke="${acolor(id)}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function vPositions() {
  if (!res || !res.positions.length) return emptyState('There are no positions yet. Record a buy in Transactions.');
  let rows = res.positions.filter((p) => ui.showClosed || p.open);
  const { key, dir } = ui.sort;
  rows = rows.slice().sort((a, b) => { const va = key === 'asset' ? String(a.asset.ticker || a.asset.name) : a[key], vb = key === 'asset' ? String(b.asset.ticker || b.asset.name) : b[key]; if (typeof va === 'string') return dir * va.localeCompare(vb); return dir * ((va ?? -Infinity) - (vb ?? -Infinity)); });
  const t = res.totals;
  const closedN = res.positions.filter((p) => !p.open).length;
  const body = rows.map((p) => `<tr>
    <td><button type="button" class="alink" data-adetail="${esc(p.assetId)}" title="Asset details">${assetCell(p.asset)}</button></td>
    <td class="n">${p.open ? qn(p.qty, 6) : '<span class="chip">cerrada</span>'}</td>
    <td class="n">${p.open ? money(p.price, p.asset.currency) : '—'}${p.open && p.priceDate ? `<div class="small muted pdate">${priceSub(p)}</div>` : ''}</td>
    <td class="n">${p.open ? eur(p.avgCost) : '—'}</td>
    <td class="n">${p.open ? eur(p.costBasis) : '—'}</td>
    <td class="n"${p.open ? ` data-fv="d:${esc(p.assetId)}" data-fn="${p.value}"` : ''}><b>${p.open ? eur(p.value) : '—'}</b></td>
    <td class="n">${p.open ? pct(p.weight, 1) : '—'}</td>
    <td class="n ${cls(p.unrealized)}">${p.open ? `${eurS(p.unrealized)}<div class="small">${pctS(p.unrealizedPct)}</div>` : '—'}</td>
    <td class="n ${cls(p.realized)}">${Math.abs(p.realized) > 0.004 ? eurS(p.realized) : '—'}${(() => { const d = res.realized.filter((x) => x.assetId === p.assetId && x.washSale).reduce((t, x) => t + (x.blocking || []).reduce((u, b) => u + (b.left || 0), 0), 0); return d < -0.004 ? `<div class="small muted">${eur(-d)} diferida</div>` : ''; })()}</td>
    <td class="n">${p.dividends > 0.004 ? eur(p.dividends) : '—'}</td>
    <td class="n ${cls(p.xirr)}">${pctS(p.xirr, 1)}</td>
    <td><div class="rowact">${p.asset.src === 'manual' || p.asset.type === 'fund' ? `<button class="btn ghost small" type="button" data-price="${esc(p.assetId)}">Price</button>` : ''}<button class="btn ghost small" type="button" data-trade="${esc(p.assetId)}">Trade</button></div></td>
  </tr>`).join('');
  const kv = (k, v, c) => `<div><span>${k}</span><span class="${c || ''}">${v}</span></div>`;
  const lsM = Object.fromEntries(((lastSession() || {}).rows || []).map((r) => [r.assetId, r])); const mvT = moversTable();
  const mob = `<div class="mlist">${rows.map((p, i) => `<details class="mcard"><summary><div class="mrow"><div><div class="l1"><span class="sw" style="background:${acolor(p.assetId)}"></span><span class="tk">${esc(p.asset.ticker || p.asset.name)}</span>${p.open ? spark(p.assetId) : ' <span class="chip">closed</span>'}</div><div class="l2">${esc(p.asset.name || '')}</div></div><div><div class="r1"${p.open ? ` data-fv="m:${esc(p.assetId)}" data-fn="${p.value}"` : ''}>${p.open ? eur(p.value, 0) : eurS(p.totalReturn, 0)}</div><div class="r2 ${cls(p.open ? p.unrealized : p.totalReturn)}${p.open ? ' noarr' : ''}">${p.open ? `<span class="${cls(p.unrealized)}">${eurS(p.unrealized, 0)}</span> · ${pctS(p.unrealizedPct, 1)}` : 'result'}</div></div></div>${p.open && p.weight > 0 ? `<div class="mw" aria-hidden="true"><span style="--mj:${Math.min(i, 10)};width:${(p.weight * 100).toFixed(1)}%;background:${acolor(p.assetId)}"></span></div>` : ''}</summary>
    <div class="mc-body"><div class="mc-grid">${p.open ? kv('Quantity', qn(p.qty, 4)) + kv('Price', money(p.price, p.asset.currency)) + kv('Price date', p.priceDate ? priceSub(p) : '—') + kv('Average cost', eur(p.avgCost)) + kv('Invested', eur(p.costBasis, 0)) + kv('Weight', pct(p.weight, 1)) + kv('Last session', lsM[p.assetId] ? `${pctS(lsM[p.assetId].pct)} · ${sdate(lsM[p.assetId].date)}` : '—', lsM[p.assetId] ? cls(lsM[p.assetId].pct) : '') : ''}${kv('Realized', Math.abs(p.realized) > 0.004 ? eurS(p.realized, 0) : '—', cls(p.realized))}${kv('Income', p.dividends > 0.004 ? eur(p.dividends, 0) : '—')}${kv('IRR', pctS(p.xirr, 1), cls(p.xirr))}</div>
    <div class="rowact">${p.open ? `<button class="btn small primary" type="button" data-trade="${esc(p.assetId)}">Trade</button>` : ''}${p.asset.src === 'manual' || p.asset.type === 'fund' ? `<button class="btn small" type="button" data-price="${esc(p.assetId)}">Price</button>` : ''}<button class="btn small" type="button" data-adetail="${esc(p.assetId)}">Details</button><button class="btn small" type="button" data-goto-tx="${esc(p.assetId)}">See transactions</button></div></div></details>`).join('')}
    <div class="mtotal"><span>Total</span><span class="num">${eur(t.value, 0)} · <span class="${cls(t.unrealized)}">${eurS(t.unrealized, 0)}</span></span></div></div>`;
  const reb = res.rebalance.length ? rebalancePanel() : `<section class="panel"><h2>Rebalancing</h2><p class="note">No target weights. Set them in <a href="#settings" data-goto="settings">Settings</a>.</p></section>`;
  const posMain = `
  <section class="panel">
    <div class="panel-h"><div><h2>Investments</h2><span class="small muted">${res.positions.filter((p) => p.open).length} open · ${eur(t.value, 0)} · <span class="${cls(t.unrealized)}">${eurS(t.unrealized, 0)}</span></span></div><label class="small muted"><input type="checkbox" id="chkClosed" ${ui.showClosed ? 'checked' : ''}> Show closed (${closedN})</label></div>
    ${mob}<div class="tbl-wrap only-desk"><table class="postbl${t.dividends > 0.004 ? '' : ' nodiv'}">
      <thead><tr>${POSCOLS.map(([k, l, n]) => { const ar = (kk) => (ui.sort.key === kk ? `<span aria-hidden="true">${ui.sort.dir > 0 ? ' ↑' : ' ↓'}</span>` : ''); const as = (...kk) => (kk.includes(ui.sort.key) ? ` aria-sort="${ui.sort.dir > 0 ? 'ascending' : 'descending'}"` : ''); return k === 'unrealized' ? `<th class="n"${as('unrealized', 'unrealizedPct')}><button type="button" class="thsort" data-sort="unrealized">Unrealized €${ar('unrealized')}</button> · <button type="button" class="thsort" data-sort="unrealizedPct" aria-label="Unrealized %">%${ar('unrealizedPct')}</button></th>` : `<th class="${n ? 'n' : ''}"${as(k)}><button type="button" class="thsort" data-sort="${k}">${l}${ar(k)}</button></th>`; }).join('')}<th><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Total</td><td></td><td></td><td></td><td class="n">${eur(t.costBasis)}</td><td class="n">${eur(t.value)}</td><td class="n">100 %</td><td class="n ${cls(t.unrealized)}">${eurS(t.unrealized)}<div class="small">${pctS(t.costBasis ? t.unrealized / t.costBasis : null)}</div></td><td class="n ${cls(t.realized)}">${eurS(t.realized)}${!ui.showClosed && closedN ? '<div class="small muted">includes closed</div>' : ''}</td><td class="n">${eur(t.dividends)}</td><td class="n ${cls(t.xirr)}">${pctS(t.xirr, 1)}</td><td></td></tr></tfoot>
    </table></div>
    ${(() => { const st = rows.filter((p) => p.open && p.priceDate && bizLag(p.priceDate) > 2); return st.length ? `<p class="note"><span class="chip warn">stale price</span> ${st.map((p) => esc(p.asset.ticker || p.asset.name)).join(', ')}: its last price is more than 2 business days old; the value may not reflect the market.</p>` : ''; })()}
    <div class="pos-foot"><p class="note" style="margin:0">FIFO, fees included in cost. Tap a fund to see its details.${res.positions.some((p) => p.open && /pown/.test(priceSub(p))) ? ' <span class="pown">*</span> Price of your buy: that fund has no close for that day yet.' : ''}</p>${res.positions.some((p) => p.open && p.value > 0) && !DEMO ? '<button class="btn small" type="button" data-act="sell-sim">How much is left if I sell?</button>' : ''}</div>
  </section>`;
  const last = `<section class="panel"><div class="panel-h"><h2>Last session</h2><span class="small muted">each asset's last close against the previous one</span></div>${mvT}</section>`;
  vPositions.parts = { main: posMain, last, reb };
  return posMain + last + reb;
}
vPositions.after = function () {
  if (!res || !$('#contribBox')) return;
  const all = res.positions.slice().sort((a, b) => b.totalReturn - a.totalReturn);
  const tiny = all.filter((p) => !p.open && Math.abs(p.totalReturn) < 20);
  const rows = all.filter((p) => !tiny.includes(p)); if (tiny.length) rows.push({ open: false, asset: { ticker: `Otras ${tiny.length} cerradas` }, totalReturn: tiny.reduce((s, p) => s + p.totalReturn, 0) });
  $('#contribBox').style.height = Math.max(160, rows.length * 30 + 40) + 'px';
  const g = cssv('--gain-fill'), l = cssv('--loss');
  mkBar($('#cContrib'), rows.map((p) => p.asset.ticker || p.asset.name), [{ label: 'Result', data: rows.map((p) => p.totalReturn), backgroundColor: rows.map((p) => (p.open ? alpha(p.totalReturn >= 0 ? cssv('--s1') : l, .85) : alpha(cssv('--muted'), .45))) }], { horizontal: true, fmt: eurS, labels: (v) => eurS(v, 0) });
};
function rebalancePanel() {
  const rows = res.rebalance.slice().sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  const sumT = rows.reduce((s, r) => s + r.target, 0);
  return `<section class="panel"><div class="panel-h"><h2>Rebalancing</h2><span class="small muted">targets add up to ${pct(sumT, 0)}</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Asset</th><th class="n">Current</th><th class="n">Target</th><th class="n">Drift</th><th class="n">To rebalance</th></tr></thead><tbody>
  ${rows.map((r) => `<tr><td><span class="sw" style="background:${acolor(r.assetId)}"></span>${esc(r.label)}</td><td class="n">${pct(r.weight, 1)}</td><td class="n">${pct(r.target, 1)}</td><td class="n ${Math.abs(r.drift) > 0.05 ? 'loss noarr' : ''}">${pctS(r.drift, 1)} ${rbChip(r.drift)}</td><td class="n">${r.trade >= 0 ? 'Buy ' : 'Sell '}${eur(Math.abs(r.trade), 0)}</td></tr>`).join('')}
  </tbody></table></div>${Math.abs(sumT - 1) > 0.001 ? '<p class="note">The targets do not add up to 100 %: the rest is treated as outside the plan.</p>' : ''}<p class="note">OK up to ±3 pp · Watch up to ±5 · Rebalance above that.</p>${contribBlock()}</section>`;
}

