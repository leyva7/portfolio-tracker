/* ---- How to split a contribution without selling (Rebalancing) ---- */
const RB_OK = 0.03, RB_WATCH = 0.05;
const rbChip = (d) => (Math.abs(d) <= RB_OK + 1e-9 ? '<span class="chip inc">OK</span>' : Math.abs(d) <= RB_WATCH + 1e-9 ? '<span class="chip warn">Watch</span>' : '<span class="chip sell">Rebalance</span>');
/** Split x € among assets with a target: first fill each gap to target·(total+x); any rest goes by target weight; if x can't fill every gap, pro rata to the gaps. */
function contribSplit(x) {
  const rows = res.rebalance.filter((r) => r.target > 0); if (!(x > 0) || !rows.length) return [];
  const val = (id) => { const p = res.positions.find((z) => z.assetId === id); return p && p.open ? p.value || 0 : 0; };
  const T = res.totals.value + x; const sT = rows.reduce((s, r) => s + r.target, 0);
  const need = rows.map((r) => Math.max(0, r.target * T - val(r.assetId))); const sn = need.reduce((s, v) => s + v, 0);
  const raw = sn <= x ? need.map((n, i) => n + (x - sn) * rows[i].target / sT) : need.map((n) => (x * n) / sn);
  const amt = raw.map((v) => Math.round(v * 100) / 100); const fix = Math.round((x - amt.reduce((s, v) => s + v, 0)) * 100) / 100;
  if (fix) { const k = amt.indexOf(Math.max(...amt)); amt[k] = Math.max(0, Math.round((amt[k] + fix) * 100) / 100); }
  return rows.map((r, i) => ({ assetId: r.assetId, label: r.label, target: r.target, amount: amt[i], share: amt[i] / x, after: (val(r.assetId) + amt[i]) / T }));
}
/** Default contribution: median weekly buy total of the target assets (last 8 weeks), else the median monthly investment of the last 6 months. */
function contribDefault() {
  const ids = new Set(res.rebalance.map((r) => r.assetId)); const t0 = todayStr(); const since = E.addDays(t0, -56); const wk = {};
  for (const x of Object.values(S.txs)) if (x.type === 'buy' && ids.has(x.assetId) && x.date > since && x.date <= t0) { const k = Math.floor((Date.parse(t0) - Date.parse(x.date)) / (7 * 864e5)); wk[k] = (wk[k] || 0) + buyTot(x); }
  const med = (a) => { a.sort((p, q) => p - q); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };
  const w = Object.values(wk); if (w.length >= 3) return { v: Math.round(med(w)), per: 'week' };
  const m = Array.from({ length: 6 }, (_, i) => (res.monthFlows[E.addMonths(t0, -i - 1).slice(0, 7)] || {}).invested || 0).filter((v) => v > 0);
  return { v: Math.round(med(m)), per: 'month' };
}
function contribTable(x) {
  const sp = contribSplit(x); if (!sp.length) return `<p class="note">${x > 0 ? 'No asset has a target weight.' : 'Enter how much you are going to invest.'}</p>`;
  return `<div class="tbl-wrap"><table><thead><tr><th>Asset</th><th class="n">Invest</th><th class="n">% of the contribution</th><th class="n">Weight after</th></tr></thead><tbody>
  ${sp.sort((a, b) => b.amount - a.amount).map((r) => `<tr><td><span class="sw" style="background:${acolor(r.assetId)}"></span>${esc(r.label)}</td><td class="n num"><b>${eur(r.amount)}</b></td><td class="n">${pct(r.share, 1)}</td><td class="n">${pct(r.after, 1)} <span class="muted small">/ ${pct(r.target, 0)}</span></td></tr>`).join('')}
  </tbody></table></div>`;
}
function contribBlock() {
  const df = contribDefault(); const x = ui.rbAmt != null ? parseNum(ui.rbAmt) : df.v;
  return `<div class="rb-split"><h3 style="margin:14px 0 6px;font-size:15px">I am going to invest…</h3><label class="f" style="max-width:240px">Amount <span class="hint">${df.v > 0 ? `your median: ${eur(df.v, 0)} per ${df.per}` : 'in €'}</span><input type="text" inputmode="decimal" autocomplete="off" id="rbAmt" value="${esc(ui.rbAmt != null ? ui.rbAmt : df.v > 0 ? String(df.v) : '')}" placeholder="e.g. 200"></label>
  <div id="rbOut">${contribTable(x)}</div><p class="note">How to split it without selling: first to what is below its target; anything left, by target weight. It is a suggestion: it records nothing.</p></div>`;
}
function moreSheet() {
  const chev = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const it = (attrs, ic, t, sub) => `<button type="button" ${attrs}><span class="ic">${ic}</span><span>${t}${sub ? `<small>${sub}</small>` : ''}</span>${chev}</button>`;
  const sv = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICO = { cash: sv('<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 15h2"/>'), analysis: sv('<path d="M4 17l5-5 4 3 7-8"/><path d="M15 7h5v5"/>'), plan: sv('<path d="M4 20h16M6 16l4-5 3 3 5-7"/>'), taxes: sv('<path d="M6 18L18 6"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>'), settings: sv('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'), theme: sv('<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>') };
  const row = (k) => { const [, l, ic, sub] = MORE_TABS.find((m) => m[0] === k); return it(`data-sheet-tab="${k}"`, ICO[k] || ic, l, sub); };
  const info = ($('#refreshInfo') || {}).textContent || '';
  openModal(`<div class="more-sheet"><div class="panel-h"><h2>More</h2><button class="btn ghost xbtn" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="ms-card ms-px"><div class="ms-pxh"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span><b>${esc(info)}</b><small>it uses one Claude run; normally you just wait for the automatic one</small></span></div>
    <button type="button" class="btn primary ms-refresh" data-act="sheet-refresh"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"/></svg>Update prices now</button></div>
  <div class="ms-card sheet-list">${row('cash')}</div>
  <div class="sheet-h">Analysis</div><div class="ms-card sheet-list">${['transactions', 'taxes'].map(row).join('')}</div>
  <div class="sheet-h">Settings</div><div class="ms-card sheet-list">${row('settings')}${it('data-act="sheet-theme"', ICO.theme, `Theme: ${themeEff() === 'dark' ? 'dark' : 'light'}${themePref === 'auto' ? ' (automatic)' : ''}`, `tap to switch to ${themeEff() === 'dark' ? 'light' : 'dark'}`)}</div></div>`);
}

