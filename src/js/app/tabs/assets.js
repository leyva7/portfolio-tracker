/* ---------- Assets and settings ---------- */
/** Yearly management cost in € of a position: TER (asset.ter, a fraction like target) × value. null without TER. */
function terCost(p) { const t = p && p.asset ? p.asset.ter : null; return t != null && t !== '' && Number.isFinite(+t) && +t >= 0 && p.value > 0 ? p.value * +t : null; }
function feesPanel() {
  if (!res) return ''; const ps = res.positions.filter((p) => p.open && p.value > 0); if (!ps.length) return '';
  const w = ps.filter((p) => terCost(p) != null), y = w.reduce((s, p) => s + terCost(p), 0), v = w.reduce((s, p) => s + p.value, 0), vAll = ps.reduce((s, p) => s + p.value, 0);
  const fees = res.totals.tradingFees || 0;
  return `<section class="panel"><h2>What you pay in management fees</h2>
    ${w.length ? `<div class="tbl-wrap" style="max-width:760px"><table style="margin-top:8px"><thead><tr><th>Asset</th><th class="n">Value</th><th class="n">TER</th><th class="n">€/year</th></tr></thead><tbody>${ps.map((p) => { const c = terCost(p); return `<tr><td><span class="sw" style="background:${acolor(p.assetId)};display:inline-block;margin-right:6px"></span>${esc(p.asset.ticker || p.asset.name)}</td><td class="n">${eur(p.value, 0)}</td><td class="n">${c != null ? pct(+p.asset.ter, 2) : '<span class="muted">—</span>'}</td><td class="n">${c != null ? eur(c) : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="stats" style="margin-top:10px;max-width:760px"><div class="stat"><span class="k">Per year</span><span class="v">${eur(y)}</span></div><div class="stat"><span class="k">Per month</span><span class="v">${eur(y / 12)}</span></div><div class="stat"><span class="k">Average TER<small>weighted by value</small></span><span class="v">${pct(v > 0 ? y / v : null, 3)}</span></div></div>
    ${w.length < ps.length ? `<p class="note">No TER: ${ps.filter((p) => terCost(p) == null).map((p) => esc(p.asset.ticker || p.asset.name)).join(', ')} (${eur(vAll - v, 0)}). They do not count in the total or the average.</p>` : ''}`
    : `<p class="note">Note the TER (annual fee) of each fund in "Edit" to see how much it costs you a year.</p>`}
    <p class="note">Separately, trading fees paid since the start: <b>${eur(fees)}</b>. The TER is already taken out of the NAV: it is a cost you do not see, not a charge.</p></section>`;
}
function vSettings() {
  const as = assetList();
  const setv = S.settings;
  return `<section class="panel" id="aspectoPanel"><div class="panel-h"><div><h2>Appearance</h2><span class="small muted">${themeEff() === 'dark' ? 'dark' : 'light'} theme${themePref === 'auto' ? ', following the system' : ''}; the eye at the top hides the amounts</span></div><div class="toolbar"><button class="btn small" type="button" data-act="sheet-theme">Switch to ${themeEff() === 'dark' ? 'light' : 'dark'}</button><button class="btn small" type="button" data-act="sheet-refresh">Update prices now</button></div></div></section>

  <section class="panel">
    <div class="panel-h"><h2>Assets</h2><button class="btn primary" type="button" data-act="add-asset">Add asset</button></div>
    ${as.length ? `<div class="mlist">${as.map((a) => { const lp = DEMO ? null : lastPx(a.id); const srcTxt = a.src === 'nav' ? `NAV by ISIN · ${esc(a.isin || 'no ISIN')}` : isAuto(a) ? (a.quoteUrl ? 'Auto · finanzen.net' : `Auto · ${esc(a.symbol || '?')}`) : 'Manual'; return `<details class="mcard"><summary><div class="mrow"><div><div class="l1"><span class="sw" style="background:${acolor(a.id)}"></span><span class="tk">${esc(a.ticker || a.name)}</span>${a.inactive ? ' <span class="chip">closed</span>' : ''}</div><div class="l2">${esc(TYPES[a.type] || a.type)} · ${esc(a.currency)} · ${srcTxt}</div></div><div><div class="r1">${lp ? money(lp[1], a.currency, lp[1] >= 100 ? 2 : 4) : '—'}</div><div class="r2 muted">${lp ? fdate(lp[0], { year: undefined }) : ''}</div></div></div></summary><div class="mc-body"><div class="small muted">${esc(a.name || '')}${a.broker ? ' · ' + esc(a.broker) : ''}${a.target != null && a.target !== '' ? ' · target ' + pct(+a.target, 1) : ''}${a.ter != null && a.ter !== '' && ok(+a.ter) ? ' · TER ' + pct(+a.ter, 2) : ''}</div><div class="rowact"><button class="btn small" type="button" data-price="${esc(a.id)}">Price</button><button class="btn small" type="button" data-edit-asset="${esc(a.id)}">Edit</button><button class="btn small danger" type="button" data-del-asset="${esc(a.id)}">Delete</button></div></div></details>`; }).join('')}</div><div class="tbl-wrap only-desk"><table class="acttbl"><thead><tr><th>Asset</th><th>Type</th><th>Currency</th><th>Broker</th><th>Tag</th><th class="n">Target</th><th class="n">TER</th><th>Price from</th><th class="n">Last price</th><th></th></tr></thead><tbody>
    ${as.map((a) => { const h = DEMO ? { points: demoData.history[a.id] } : S.history[a.id]; const lp = DEMO ? (h && h.points && h.points.length ? h.points[h.points.length - 1] : null) : lastPx(a.id); return `<tr><td>${assetCell(a)}</td><td>${esc(TYPES[a.type] || a.type)}</td><td>${esc(a.currency)}</td><td>${esc(a.broker || '')}</td><td>${esc(a.tag || '')}</td><td class="n">${a.target != null && a.target !== '' ? pct(+a.target, 1) : ''}</td><td class="n">${a.ter != null && a.ter !== '' && ok(+a.ter) ? pct(+a.ter, 2) : ''}</td><td>${a.src === 'nav' ? `<span class="chip" title="NAV read by Claude from quefondos.com">NAV · ${esc(a.isin || 'no ISIN')}</span>${S.navs[a.id] && S.navs[a.id].checked ? `<div class="small muted">checked ${new Date(S.navs[a.id].checked).toLocaleString(L, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : ''}` : isAuto(a) ? `<span class="chip">Auto · ${esc(a.quoteUrl ? 'finanzen.net' : a.symbol || '?')}</span>${S.navs[a.id] && S.navs[a.id].source ? `<div class="small muted">last via ${esc(S.navs[a.id].source)}</div>` : ''}` : '<span class="chip">Manual</span>'}</td><td class="n">${lp ? `${money(lp[1], a.currency, 4)}<div class="small muted">${fdate(lp[0])}</div>` : '—'}</td><td><div class="rowact"><button class="btn ghost small" type="button" data-price="${esc(a.id)}">Price</button><button class="btn ghost small" type="button" data-edit-asset="${esc(a.id)}">Edit</button><button class="btn ghost small danger" type="button" data-del-asset="${esc(a.id)}">Delete</button></div></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="empty">No assets. Start by adding one.</div>'}
    <p class="note">Prices are fetched by the Claude routine "Portfolio · update prices". Funds: by ISIN. ETFs: Alpha Vantage symbol (Xetra with <b>.DEX</b>, e.g. SXR8.DEX). Shares and crypto: finanzen.net page (if you leave it empty, Claude looks it up). If there is no quote, use manual prices.</p>
  </section>
  ${feesPanel()}
  <section class="panel only-mob"><h2>Transactions as CSV</h2><div class="toolbar" style="margin-top:8px"><button class="btn" type="button" data-act="import">Import CSV</button><button class="btn" type="button" data-act="export-csv" ${downloads ? '' : 'disabled title="Downloads are not available in this view"'}>Export CSV</button></div></section>
  <div class="grid g-2e">
    <section class="panel"><h2>Analysis settings</h2>
      <form class="form" id="setForm">
        <label class="f">Annual risk-free rate <span class="hint">to measure the portfolio's efficiency</span><input type="text" inputmode="decimal" id="setRf" value="${esc(((setv.riskFree ?? 0.02) * 100).toFixed(2))}"></label>
        <label class="f">Benchmark <span class="hint">Alpha Vantage symbol (e.g. SXR8.DEX)</span><input type="text" id="setBench" placeholder="EUNL.DE" value="${esc(setv.benchSymbol || '')}"></label>
        <label class="f">Benchmark name<input type="text" id="setBenchName" placeholder="MSCI World" value="${esc(setv.benchName || '')}"></label>
        <label class="f">Benchmark currency<select id="setBenchCcy">${['EUR', 'USD', 'GBP', 'CHF'].map((c) => `<option ${((setv.benchCcy || 'EUR') === c) ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <div class="form-actions full"><button class="btn primary" type="submit">Save settings</button></div>
      </form>
    </section>
    <section class="panel"><h2>Price updates</h2>
      <div class="stats" style="grid-template-columns:1fr">
        <div class="stat"><span class="k">Routine "Portfolio · update prices"<small>Mon–Fri at 21:40 and when you press "Update prices"</small></span><span class="v"><span class="chip ${S.job && S.job.state === 'done' ? 'inc' : S.job && (S.job.state === 'error' || jobStale()) ? 'warn' : ''}">${S.job ? (S.job.state === 'done' ? (lastPxDate() ? `OK · prices from ${fdate(lastPxDate(), { year: undefined })}` : 'OK ' + ago(Date.parse(S.job.finishedAt))) : S.job.state === 'error' ? 'Error' : jobStale() ? 'No response' : 'Running') : 'Never run'}</span>${jobStale() ? `<small class="small muted" style="display:block;font-weight:500">The update did not finish (started ${ago(Date.parse(S.job.startedAt || 0))}). Try again.${lastPxDate() ? ` Latest prices from ${fdate(lastPxDate())}.` : ''}</small>` : ''}</span></div>
      </div>
    </section>
    ${safetyPanel()}
  </div>`;
}

