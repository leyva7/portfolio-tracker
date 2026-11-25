/* ================= Render: header & banners ================= */
function renderHeader() {
  const t = res && res.totals;
  const P = patrimony();
  $('#heroValue').textContent = t ? eur(P.total) : '—';
  if (window.__motion) __motion.count($('#heroValue'), t ? P.total : null, eur);
  const day = $('#heroDay');
  const ls = t ? lastSession() : null;
  if (ls) { const flat = ls.rows.every((r) => Math.abs(r.chg) < 0.005); day.className = 'pill ' + (flat ? 'flat' : cls(ls.chg)); day.textContent = flat ? `no change · prices from ${sdate(ls.date)}` : `${eurS(ls.chg, 0)} · ${pctS(P.total - ls.chg > 0 ? ls.chg / (P.total - ls.chg) : ls.pct)} · prices from ${sdate(ls.date)}`; day.title = `Change in each asset's last session (latest close against the previous one), over your whole net worth. Over what is invested: ${pctS(ls.pct)}`; day.hidden = false; } else day.hidden = true;
  const hr = $('#heroRes'); const dbWait = DEMO && (dbState === 'pending' || (dbState === 'ready' && !Object.values(loaded).every(Boolean)));
  if (hr) { const on = !!(t && t.firstDate && !dbWait && ok(t.twr)); hr.hidden = !on; const ciT = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest').reduce((q, m) => q + (+m.a || 0), 0); if (on) hr.innerHTML = `<span class="pill ${cls(t.pnl + ciT) || 'flat'}" title="Total result, including interest on cash">${eurS(t.pnl + ciT, 0)}</span> <span class="hr-twr" title="Return of your strategy (TWR) since ${fdate(t.firstDate)}, without the effect of when you invested">return <span class="${cls(t.twr)}">${pctS(t.twr, 1)}</span> since ${fdate(t.firstDate, { day: undefined })}${ok(t.twrAnn) && Date.parse(res.totals.today) - Date.parse(t.firstDate) > 400 * 864e5 ? ` <span class="hr-ann">(≈ ${pctS(t.twrAnn, 0)} a year)</span>` : ''}</span>`; }
  document.body.dataset.tab = ui.tab; const hp = $('#heroPnl'); if (hp) { const ciH = t ? cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest').reduce((q, m) => q + (+m.a || 0), 0) : 0; hp.className = 'num ' + cls(t && t.pnl + ciH); hp.textContent = t && t.firstDate ? eurS(t.pnl + ciH, 0) : ''; }
  { const inv = Math.max(0, P.inv || 0), cash = Math.max(0, P.cash || 0), sum = inv + cash;
    $('#heroSub').innerHTML = t && t.firstDate ? `<span class="hs-from">Total result since ${fdate(t.firstDate)}${(() => { const u = res.positions.filter((p) => p.open).reduce((s, p) => s + (p.unrealized || 0), 0), rest = t.pnl - u; const ci = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest').reduce((s, m) => s + (+m.a || 0), 0); const parts = [`${eurS(u, 0)} on what you hold`].concat(Math.abs(rest) >= 1 ? [`${eurS(rest, 0)} from sales and income`] : [], ci >= 1 ? [`${eurS(ci, 0)} of interest on cash`] : []); return parts.length > 1 ? `: ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : ''; })()}</span><div class="hs-alloc">${sum > 0 ? `<div class="hs-bar" aria-hidden="true"><i style="flex:${(inv / sum).toFixed(4)} 1 0"></i><i style="flex:${(cash / sum).toFixed(4)} 1 0"></i></div>` : ''}<div class="hs-lg"><span><i class="hs-dot"></i>Investments <b class="num">${eur(P.inv, 0)}</b></span><span><i class="hs-dot c"></i>Cash <b class="num">${eur(P.cash, 0)}</b></span></div></div>` : ''; }
  $('#brandLine').textContent = DEMO ? 'Sample net worth' : 'Total net worth';
  { const g = TAB_GROUP[ui.tab] || ui.tab, name = { home: 'Home', portfolio: 'Portfolio', cash: 'Cash', analysis: 'Analysis', transactions: 'Transactions', plan: 'Plan', taxes: 'Taxes', settings: 'Settings' }[ui.tab] || '';
    $('#sideName').textContent = DEMO ? 'Sample portfolio' : (S.settings && S.settings.displayName ? `${S.settings.displayName}'s portfolio` : 'My portfolio');
    $('#mHello').textContent = ui.tab === 'home' || !t ? (DEMO ? 'Sample portfolio' : (S.settings && S.settings.displayName ? `Hi, ${S.settings.displayName}` : 'Hi')) : `Net worth ${eur(P.total)}`;
    $('#mTitle').textContent = ui.tab === 'home' ? 'Your net worth' : name; $('#dTitle').textContent = name;
    const td = DF({ weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()); $('#dToday').textContent = (ui.tab !== 'home' && t ? `Net worth ${eur(P.total)} · ` : '') + td.charAt(0).toUpperCase() + td.slice(1); }
  const btn = $('#btnRefresh'); btn.disabled = ui.refreshing; btn.querySelector('span').textContent = ui.refreshing ? 'Downloading…' : 'Update prices';
  const prog = $('#refreshProg'); prog.hidden = !ui.refreshing; prog.firstElementChild.style.width = Math.round(ui.progress * 100) + '%';
  let info = '';
  const lastJob = S.job && S.job.finishedAt ? Date.parse(S.job.finishedAt) : 0;
  if (DEMO) info = 'Sample prices';
  else if (jobBusy()) info = 'Claude is updating prices…';
  else if (jobStale()) { const lp = lastPxDate(); info = `No response · started ${ago(Date.parse(S.job.startedAt || 0))}${lp ? ` · latest prices from ${fdate(lp, { year: undefined })}` : ''}`; }
  else if (lastJob || lastPxDate()) { const lp = lastPxDate(); info = lp ? `Prices from ${fdate(lp, { year: undefined })} · auto Mon–Fri 21:40` : `Prices ${ago(lastJob)} · auto Mon–Fri 21:40`; }
  else info = 'Updated automatically Mon–Fri at 21:40';
  $('#refreshInfo').textContent = info;
}
function renderBanners() {
  const out = [];
  const dbStuck = DEMO && dbState === 'ready' && !Object.values(loaded).every(Boolean) && Date.now() - bootT > 4900;
  if (dbState === 'error' || dbStuck) out.push(`<div class="banner"><div><b>Your data could not be loaded</b>${dbErr ? ` (${esc(dbErr)})` : ''}. What you see is the sample portfolio, not yours: don't add anything here. Reload the page; if nothing changes, open it from claude.ai.</div></div>`);
  else if (DEMO) out.push(`<div class="banner info"><div><b>Sample portfolio.</b> It disappears when you add your first asset.</div><button class="btn primary" type="button" data-act="start">Add my first asset</button></div>`);
  if (dbState === 'none' && !DEMO) out.push(`<div class="banner"><div><b>No storage.</b> This view cannot save data; anything you add will be lost when you close it. Open it from claude.ai to save.</div></div>`);
  if (res && !DEMO) {
    const stale = res.positions.filter((p) => p.open && p.priceDate && (Date.parse(res.totals.today) - Date.parse(p.priceDate)) / 864e5 > 7 && p.asset.type !== 'cash');
    const noPrice = res.positions.filter((p) => p.open && !p.priceDate);
    if (noPrice.length) out.push(`<div class="banner"><div><b>No price:</b> ${noPrice.map((p) => esc(p.asset.ticker || p.asset.name)).join(', ')}. They are valued at 0 until you download or enter a price.</div></div>`);
    const dust = dustPositions();
    if (dust.length) out.push(`<div class="banner info"><div><b>Leftovers:</b> ${dust.map((p) => `${esc(p.asset.ticker || p.asset.name)} ${qn(p.qty, 8)} (${eur(p.value)})`).join(', ')}. They usually remain after selling "everything" because of rounding or fees.</div><div class="toolbar">${dust.map((p) => `<button class="btn small" type="button" data-dust="${esc(p.assetId)}">Close ${esc(p.asset.ticker || p.asset.name)}</button>`).join('')}</div></div>`);
    const ph = priceHealthChip(stale);
    if (ph) out.push(ph);
    else if (stale.length) { const dd = stale.map((p) => Math.round((Date.parse(res.totals.today) - Date.parse(p.priceDate)) / 864e5)), lo = Math.min(...dd), hi = Math.max(...dd);
      out.push(`<details class="stale-chip"${ui.staleOpen ? ' open' : ''}><summary><span class="chip warn">${stale.length === 1 ? '1 price' : `${stale.length} prices`} ${lo === hi ? lo : `${lo}–${hi}`} days old</span></summary><div class="stale-body"><b style="color:var(--warn)">Old prices:</b> ${stale.map((p) => `${esc(p.asset.ticker || p.asset.name)} (${fdate(p.priceDate, { year: undefined })})`).join(', ')}. ${stale.some((p) => p.asset.src === 'manual') ? 'Manual assets are updated from Positions → Price.' : ''}</div></details>`); }
    const w = res.warnings.filter((x) => x.kind !== 'fx' || !x.date); const fxw = res.warnings.filter((x) => x.kind === 'fx' && x.date);
    if (w.length) out.push(`<div class="banner"><div><b>Check:</b> ${w.map((x) => esc(x.msg)).join(' · ')}</div></div>`);
    if (fxw.length) out.push(`<div class="banner"><div><b>Exchange rate:</b> ${fxw.length} transaction(s) without an exchange rate; 1 was used. Download prices or enter the rate in the transaction.</div></div>`);
  }
  if (!DEMO && S.job && S.job.state === 'error') out.push(`<div class="banner"><div><b>Price update:</b> ${esc(S.job.error || 'the request failed')}</div></div>`);
  if (!DEMO && S.job && S.job.state === 'done') { const bad = (S.job.results || []).filter((r) => !r.ok); if (bad.length) out.push(`<div class="banner"><div><b>No new price:</b> ${bad.map((r) => `${esc((assetById(r.assetId) || {}).ticker || r.isin)} (${esc(r.error || 'no data')})`).join(' · ')}. Check the ISIN or symbol, or enter the price by hand.</div></div>`); }
  { const rh = recurBanner(); if (rh) out.push(rh); }
  for (const m of Object.values(bannersExtra)) if (m) out.push(`<div class="banner"><div>${esc(m)}</div></div>`);
  const el = $('#banners'); el.innerHTML = out.join(''); el.hidden = !out.length;
}

/** Open positions worth less than 5 € (leftovers after selling "everything"). */
function dustPositions() { return res && !DEMO ? res.positions.filter((p) => p.open && p.priceDate && ok(p.value) && p.value < 5 && p.asset.type !== 'cash') : []; }
async function closeDust(id, btn) {
  const p = dustPositions().find((z) => z.assetId === id); if (!p) return;
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = `Sell ${numf(p.qty, 8)} at ${money(p.price, p.asset.currency)}?`; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = `Close ${p.asset.ticker || p.asset.name}`; } }, 4000); return; }
  btn.disabled = true;
  const d = p.priceDate > todayStr() ? todayStr() : p.priceDate;
  const o = { type: 'sell', date: d, assetId: id, qty: +p.qty.toFixed(10), price: p.price, fees: 0, note: 'Leftover close-out', created: new Date().toISOString() };
  if (p.asset.currency && p.asset.currency !== 'EUR') { const f = fxFor(p.asset.currency, d); if (f) o.fx = f; }
  const tid = uid();
  try { await save('txs', tid, o); toast(`Position closed (${eur(p.value)}).`, 7000, { label: 'Undo', fn: async () => { await remove('txs', tid); toast('Close-out undone.'); } }); }
  catch (e) { btn.disabled = false; toast('Could not save: ' + (e.message || e.code)); }
}

/* ================= Render: views ================= */
function render() {
  if (!demoData) demoData = makeDemo();
  if (!res) { try { res = E.build(engineState()); } catch (e) { console.error(e); } }
  renderHeader(); renderBanners();
  $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab))); syncBnav();
  killCharts(); syncTabGroups();
  const v = $('#view');
  if (MAIN_TABS.includes(ui.tab)) ui.lastMain = ui.tab;
  const fn = { home: vHome, portfolio: vPortfolio, cash: vCash, transactions: vTransactions, analysis: vAnalysis, plan: vPlan, taxes: vTaxes, settings: vSettings }[ui.tab] || vHome;
  const skel = window.__motion && __motion.loading(v, DEMO && (dbState === 'pending' || (dbState === 'ready' && !Object.values(loaded).every(Boolean))), render);
  if (!skel) try { v.innerHTML = subTabs() + fn(); (fn.after || (() => {}))(); foldPanels(v); }
  catch (e) { console.error(e); v.innerHTML = `<div class="panel empty">This view could not be drawn: ${esc(e.message)}</div>`; }
  if (!skel && window.__motion) __motion.view(v, ui.tab);
  maybeSnapshot();
}

function kpi(label, value, sub, c, title) { return `<div class="kpi"><span class="l">${title ? `<abbr title="${esc(title)}">${label}</abbr>` : label}</span><span class="v ${c || ''}">${value}</span>${sub != null ? `<span class="s">${sub}</span>` : ''}</div>`; }

function emptyState(msg) { return `<div class="panel empty">${msg}</div>`; }

