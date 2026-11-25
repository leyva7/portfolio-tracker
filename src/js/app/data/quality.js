/* ================= Data quality: buys vs NAV of their date, price task health, extra checks ================= */
const NAV_TOL = 0.001; // fund NAVs come with 2–4 decimals: below 0.1 % it is rounding
/** Price equals the NAV of the previous NAV day: the order ran overnight and the date is the one of the bank email. Not an error. */
function navDayBefore(aId, date, p) { const m = (S.navs[aId] || {}).m || {}; const pd = Object.keys(m).filter((d) => d < date).sort().pop(); return !!(pd && p > 0 && Math.abs(+m[pd] / p - 1) <= 5e-4); }
/** Fund buys whose price is not the NAV of their own date (only when navs/* has that exact date). */
function navIssues() {
  if (DEMO || !res) return [];
  const out = [];
  for (const [id, x] of Object.entries(S.txs)) {
    if (x.type !== 'buy') continue; const a = S.assets[x.assetId]; if (!a || a.type !== 'fund') continue;
    const m = (S.navs[a.id] || {}).m || {}; const v = +m[x.date], p = +x.price, q = +x.qty;
    if (!(v > 0) || !(p > 0) || !(q > 0) || Math.abs(p / v - 1) <= NAV_TOL || (x.navOk != null && +x.navOk === p) || navDayBefore(a.id, x.date, p)) continue;
    const pd = Object.keys(m).filter((d) => d < x.date).sort().pop(); const prev = pd && Math.abs(+m[pd] / p - 1) <= 5e-4 ? pd : null;
    const qN = +(q * p / v).toFixed(6); const o = Object.assign({}, x, { qty: qN, price: v }); delete o.id; delete o.navOk; // same amount invested, at the NAV
    const why = qN < q && unbackedSell([a.id], id, o) ? 'it would leave a later sale uncovered: fix it by hand' : null;
    out.push({ id, x, a, v, d: p / v - 1, prev, qN, o, why });
  }
  return out.sort((A, B) => (A.x.date < B.x.date ? 1 : A.x.date > B.x.date ? -1 : 0));
}
function navReviewPanel() {
  const L0 = navIssues(); if (!L0.length) return '';
  const nf = L0.filter((r) => !r.why).length; const dp = (v) => (v >= 100 ? 2 : 4);
  return `<style>.navrev{margin:0 0 12px;padding:9px 12px;border-radius:var(--r);background:var(--warn-bg)}.navrev>summary{cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}.navrev ul{list-style:none;margin:8px 0 0;padding:0}.navrev li{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 12px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--warn) 20%,transparent);font-size:13px}.navrev li .rowact{display:flex;gap:6px;flex-wrap:wrap}</style>
  <details class="navrev"${ui.navrevOpen ? ' open' : ''}><summary><span class="chip warn">Review buys · ${L0.length}</span><span class="small">${L0.length === 1 ? 'One fund buy has' : `${L0.length} fund buys have`} a price different from the NAV on its date</span></summary>
  <p class="note" style="margin:8px 0 0">${esc((L0[0].a.broker) || 'Your bank')} executes each order at the NAV of the order date. "Fix" sets that NAV and recalculates the units with the same amount invested; the previous version goes to the trash. "Keep" accepts it as is (e.g. if it comes from a transfer).</p>
  <ul>${L0.map((r) => `<li><div><b>${esc(r.a.ticker || r.a.name)}</b> · ${fdate(r.x.date, { year: undefined })} · <span class="num">${qn(+r.x.qty, 6)} × ${money(+r.x.price, r.a.currency, 4)}</span> <span class="muted">(${eur(+r.x.qty * +r.x.price)})</span><br><span class="small">NAV that day <b class="num">${money(r.v, r.a.currency, dp(r.v))}</b> · your price differs by <b class="num">${pctS(r.d, 1)}</b>${r.prev ? ` · it is the NAV of ${fdate(r.prev, { year: undefined })}` : ''}</span></div><div class="rowact">${r.why ? `<span class="small muted">${esc(r.why)}</span>` : `<button class="btn small primary" type="button" data-navfix="${esc(r.id)}">Fix</button>`}<button class="btn small" type="button" data-navok="${esc(r.id)}">Keep</button></div></li>`).join('')}</ul>
  ${nf > 1 ? `<div class="toolbar" style="margin-top:8px"><button class="btn small" type="button" data-navfix="*">Fix all ${nf}</button></div>` : ''}</details>`;
}
async function navAct(b) {
  const fix = b.dataset.navfix != null; const key = fix ? b.dataset.navfix : b.dataset.navok; const L0 = navIssues();
  const list = key === '*' ? L0.filter((r) => !r.why) : L0.filter((r) => r.id === key && !(fix && r.why)); if (!list.length) return;
  if (fix && b.dataset.armed !== '1') { const lbl = b.textContent, r = list[0]; b.dataset.armed = '1'; b.textContent = list.length === 1 ? `Change to ${numf(r.qN, 6)} × ${money(r.v, r.a.currency, 4)}?` : `Fix ${list.length} buys?`; setTimeout(() => { if (b.isConnected && b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = lbl; } }, 5000); return; }
  b.disabled = true; const tids = [];
  try {
    if (list.length > 1) await maybeSnapshot(true);
    for (const r of list) { const cur = S.txs[r.id]; const tid = await toTrash('tx', r.id, cur, 'edited'); if (tid) tids.push(tid); const o = fix ? r.o : Object.assign({}, cur, { navOk: +cur.price }); delete o.id; await save('txs', r.id, o); }
    const r = list[0];
    toast(!fix ? 'Buy accepted as is.' : list.length === 1 ? `${r.a.ticker || r.a.name} buy fixed: ${numf(r.qN, 6)} × ${money(r.v, r.a.currency, 4)}.` : `${list.length} buys fixed to the NAV of their date.`, 7000, tids.length ? { label: 'Undo', fn: async () => { try { for (const t of tids) await restoreTrash(t, true); toast(list.length === 1 ? 'Buy restored.' : `${list.length} buys restored.`); } catch (e) { toast('Could not undo: ' + (e.message || e.code)); } } } : null);
  } catch (e) { b.disabled = false; toast('Could not save: ' + (e.message || e.code)); }
}
document.addEventListener('click', (ev) => { const b = ev.target.closest && ev.target.closest('[data-navfix],[data-navok]'); if (b) navAct(b); });
document.addEventListener('toggle', (ev) => { if (ev.target.classList && ev.target.classList.contains('navrev')) ui.navrevOpen = ev.target.open; }, true);

/** Last scheduled run of the price task (weekdays 21:40, local time) that should have happened by now. */
function lastPriceSlot(now) { const t = new Date(now); t.setHours(21, 40, 0, 0); while (t.getTime() > now - 60 * 60e3 || [0, 6].includes(t.getDay())) t.setDate(t.getDate() - 1); return t.getTime(); }
/** Health of the daily price update: newest real market price of the tracked open positions and when the task last ran. */
function priceHealth(now) {
  if (DEMO || !res || jobBusy()) return null; now = now || Date.now();
  const ps = res.positions.filter((p) => p.open && p.asset.type !== 'cash' && p.asset.src !== 'manual' && !p.asset.inactive && S.navs[p.assetId]); if (!ps.length) return null;
  let last = '', chk = ''; const td = todayStr();
  for (const p of ps) { const n = S.navs[p.assetId]; for (const d of Object.keys(n.m || {})) if (d > last && d <= td && /^\d{4}-\d{2}-\d{2}$/.test(d) && +n.m[d] > 0) last = d; if ((n.checked || '') > chk) chk = n.checked; }
  if (!last) return null;
  const run = [S.job && S.job.state === 'done' && S.job.finishedAt, chk].filter(Boolean).sort().pop() || '';
  const lag = bizLag(last), missed = !run || Date.parse(run) < lastPriceSlot(now) - 15 * 60e3;
  return lag >= 3 || (lag >= 2 && missed) ? { last, lag, run, missed } : null;
}
function priceHealthChip(stale) {
  const h = priceHealth(); if (!h) return '';
  const at = h.run ? `${fdate(new Date(h.run).toLocaleDateString('sv-SE'), { year: undefined })} at ${new Date(h.run).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} (${ago(Date.parse(h.run))})` : '';
  const old = stale && stale.length ? ` <b style="color:var(--warn)">Old prices:</b> ${stale.map((p) => `${esc(p.asset.ticker || p.asset.name)} (${fdate(p.priceDate, { year: undefined })})`).join(', ')}.` : '';
  return `<details class="stale-chip"${ui.staleOpen ? ' open' : ''}><summary><span class="chip warn">Prices not updated since ${fdate(h.last, { year: undefined })}</span></summary><div class="stale-body"><b style="color:var(--warn)">${h.missed ? 'The daily price update has not arrived.' : 'The price update brought no new prices.'}</b> The latest price is from ${fdate(h.last, { year: undefined })} (${h.lag} business days ago)${h.run ? `; the task last ran on ${at}` : '; there is no record of the task running'}.${h.missed ? '' : ' The source may be running late, or it may have been a holiday.'} <b>What to do:</b> tap "Update prices". If nothing changes tomorrow, check in claude.ai/code that the scheduled price-update task is still active and allowed. Meanwhile, net worth is calculated with those prices.${old}</div></details>`;
}
/** Close-out of a leftover ("Close" on a leftover): it has no cash income, so it does not count in the sales/cash check. */
function isDustSale(r) { const x = S.txs[r.id] || {}; return x.note === 'Leftover close-out' || (r.proceeds < 5 && !x.cashMv); }
/** Backup NAV doc merged with the current one: NAVs from both, current fields when they are newer. */
function mergeNavDoc(n, cur) {
  const o = Object.assign({}, n); delete o.id; if (!cur) return o;
  const newer = (cur.navDate || '') > (n.navDate || '') || (cur.checked || '') > (n.checked || '');
  const r = newer ? Object.assign(o, cur) : o; delete r.id; r.m = Object.assign({}, n.m, cur.m); return r;
}
/** Soft checks before saving an operation; the user confirms by pressing again. Returns [{ k, msg }]. */
function txSoftWarn(o, tx, amtIn) {
  const a = assetById(o.assetId); const tk = a ? esc(a.ticker || a.name) : ''; const W = { 0: 'a Sunday', 6: 'a Saturday' };
  const dow = new Date(o.date + 'T00:00:00Z').getUTCDay(); const isT = o.type === 'buy' || o.type === 'sell';
  const amt = (z) => (z.type === 'buy' || z.type === 'sell' ? +z.qty * +z.price : z.type === 'transfer' ? +z.qty : +z.amount) || 0;
  const out = [];
  if (a && a.type === 'fund' && (isT || o.type === 'transfer') && W[dow] && !(tx && tx.date === o.date)) { let n = o.date; do n = E.addDays(n, 1); while ([0, 6].includes(new Date(n + 'T00:00:00Z').getUTCDay()));
    out.push({ k: 'wk|' + o.date, msg: `${fdate(o.date)} is ${W[dow]}: funds have no NAV at weekends and the order is executed on ${fdate(n, { year: undefined })} at its NAV. Use that date if it is the trade date at your bank.` }); }
  if (isT && amtIn > 0) { const fx = o.fx || (a && a.currency !== 'EUR' ? fxFor(a.currency, o.date) : 1) || 1; const tot = o.qty * o.price * fx + (o.type === 'buy' ? o.fees : -o.fees);
    if (Math.abs(tot - amtIn) > Math.max(0.05, amtIn * 0.005)) out.push({ k: `amt|${o.qty}|${o.price}|${amtIn}`, msg: `Quantity × price gives ${eur(tot)}, but the amount says ${eur(amtIn)}. Check the quantity or the price.` }); }
  if (o.type === 'buy' && a) { const prevB = Object.values(S.txs).filter((z) => z.type === 'buy' && z.assetId === o.assetId && (!tx || z.id !== tx.id)).sort((p, q) => (p.date < q.date ? 1 : -1)).slice(0, 12).map(amt).filter((v) => v > 0).sort((p, q) => p - q);
    const med = prevB.length >= 3 ? prevB[Math.floor(prevB.length / 2)] : 0; const tot = o.qty * o.price;
    if (med > 0 && tot > 10 * med && !(tx && Math.abs(amt(tx) - tot) < 0.01)) out.push({ k: `big|${o.qty}|${o.price}`, msg: `This buy adds up to ${money(tot, a.currency)}, more than 10 times your usual ${tk} buy (${money(med, a.currency)}). Check the quantity and the price.` }); }
  if (isT && a && a.type === 'fund') { const n = navOn(a.id, o.date); if (n && n.known && o.price > 0 && Math.abs(n.v / o.price - 1) > 0.01 && !navDayBefore(a.id, o.date, o.price) && !(tx && +tx.price === o.price && tx.date === o.date)) out.push({ k: `navMap|${o.date}|${o.price}`, msg: `The price is not the NAV of ${fdate(n.d, { year: undefined })} (${money(n.v, a.currency, 4)}): tap "use" to fill it in.` }); }
  { const mine = amt(o); const dup = Object.entries(S.txs).find(([id, z]) => (!tx || id !== tx.id) && z.type === o.type && z.date === o.date && (z.assetId || null) === (o.assetId || null) && Math.abs(amt(z) - mine) <= Math.max(0.5, mine * 0.01));
    if (dup) out.push({ k: 'dup|' + dup[0], msg: `You already have a ${(TXT[o.type] || '').toLowerCase()}${tk ? ` of ${tk}` : ''} on ${fdate(o.date, { year: undefined })} for ${o.type === 'transfer' ? `${qn(amt(dup[1]), 6)} units` : money(amt(dup[1]), a ? a.currency : 'EUR')}: it may be a duplicate.` }); }
  return out;
}

