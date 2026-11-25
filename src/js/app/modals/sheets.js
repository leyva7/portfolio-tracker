function dupTx(id) {
  const x = S.txs[id]; if (!x) return toast('The sample portfolio cannot be edited.');
  const { id: _i, created, seq, note, ...rest } = x;
  let tot = +(+x.qty * +x.price * (+x.fx || 1) + (+x.fees || 0)).toFixed(2); if (Math.abs(tot - Math.round(tot)) < 0.06) tot = Math.round(tot);
  const lp = lastPx(x.assetId); const wd = new Date(todayStr() + 'T12:00:00Z').getUTCDay();
  return openTxForm(Object.assign(rest, { date: todayStr(), price: lp ? String(lp[1]) : '', qty: '', _amt: String(tot), _wkHint: (wd === 0 || wd === 6) && lp ? `there is no quote today; the last price is from ${fdate(lp[0])}` : '' }), null, true);
}
function recentBuys() {
  const seen = new Set(); const out = [];
  const since = E.addDays(todayStr(), -60);
  for (const x of Object.values(S.txs).filter((z) => z.type === 'buy').sort((a, b) => (a.date < b.date ? 1 : -1))) { if (seen.has(x.assetId) || !assetById(x.assetId) || assetById(x.assetId).inactive) continue; if (out.length >= 6 || (out.length >= 3 && x.date < since)) break; seen.add(x.assetId); out.push(x); }
  return out;
}
function bottomNav(k) {
  if (k === 'add') return quickSheet();
  if (k === 'more') return moreSheet();
  ui.tab = k; try { history.replaceState(null, '', '#' + k); } catch (e) {} render(); window.scrollTo(0, 0);
}
function quickSheet() {
  if (DEMO) return openTxForm();
  const rb = recentBuys(); const cash = cashList(); const mb = monthBuys();
  const it = (attrs, ic, t, sub, pri, tone) => `<button type="button" ${attrs}${pri ? ' class="pri"' : ''}><span class="ic${tone ? ' ' + tone : ''}">${ic}</span><span>${t}${sub ? `<small>${sub}</small>` : ''}</span></button>`;
  openModal(`<div class="panel-h"><h2>Add</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <div class="sheet-list">
    ${mb.length ? it('data-rep-month="1"', '↻', 'Repeat your last buys', `${mb.length} assets · ${eur(mb.reduce((s, x) => s + buyTot(x), 0), 0)} · check the amounts and save in one go`, true) : ''}
    ${(() => { const n = recurPlans().length ? recurringPending().filter((r) => r.st === 'new').length : 0; return n ? it('data-recurring="review"', '↻', `Record ${n} ${n === 1 ? 'recurring buy' : 'recurring buys'}`, 'with the NAV of each date · check and confirm', true) : ''; })()}
    ${it('data-qtx="buy"', '+', 'Buy', 'fund, ETF, share or crypto', true)}
    ${it('data-qtx="sell"', '−', 'Sale', '', false, 'tsell')}
    ${cash.length ? it(`data-mv="interest" data-acc="${esc(cash[0].id)}"`, '€', `Interest · ${esc(cash[0].name)}`, 'what you have received; it counts for your tax return', false, 'cash') : ''}
    ${it('data-qtx="transfer"', '⇄', 'Switch between funds', 'tax-free', false, 'xfer')}
    ${it('data-qtx="dividend"', '↓', 'Dividend', '', false, 'inc')}
    ${rb.length ? `<div class="sheet-h">Repeat a buy dated today</div>${rb.map((x) => { const a = assetById(x.assetId); return it(`data-dup-tx="${esc(x.id)}"`, '↻', esc(a.ticker || a.name), `last: ${fdate(x.date, { year: undefined })} · ${eur(+x.qty * +x.price * (+x.fx || 1) + (+x.fees || 0), 0)}`, false, 'rep'); }).join('')}` : ''}
    ${it('data-recurring="manage"', '⟳', 'Recurring buys', recurPlans().length ? recurPlans().map((p) => `${esc((assetById(p.assetId) || {}).ticker || '')} ${recurTxt(p)}${p.paused ? ' (paused)' : ''}`).join(' · ') : 'your weekly or monthly orders at the bank', false, 'rep')}
    ${cash.length ? `<div class="sheet-h">Cash</div>${cash.map((c) => it(`data-mv="in" data-acc="${esc(c.id)}"`, '€', `Deposit · ${esc(c.name)}`, `balance ${eur(cashBal(c), 0)}`, false, 'cash') + it(`data-mv="out" data-acc="${esc(c.id)}"`, '€', `Withdrawal · ${esc(c.name)}`, '', false, 'cash')).join('')}` : `<div class="sheet-h">Cash</div>${it('data-act="add-cash"', '€', 'Add a cash account', 'so it counts in your net worth', false, 'cash')}`}
  </div>`);
}
const buyTot = (x) => { let t = +(+x.qty * +x.price * (+x.fx || 1) + (+x.fees || 0)).toFixed(2); if (Math.abs(t - Math.round(t)) < 0.06) t = Math.round(t); return t; };
/** Latest buy of each open asset bought in the last 45 days (max 8). */
function monthBuys() {
  const since = E.addDays(todayStr(), -45); const seen = new Set(); const out = [];
  for (const x of Object.values(S.txs).filter((z) => z.type === 'buy' && z.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1))) { const a = assetById(x.assetId); if (seen.has(x.assetId) || !a || a.inactive) continue; seen.add(x.assetId); out.push(x); if (out.length >= 8) break; }
  return out;
}
function openRepeatBuys() {
  const mb = monthBuys(); if (!mb.length) return openTxForm();
  const cm = (n) => String(n);
  const lps = mb.map((x) => lastPx(x.assetId)); const lastD = lps.reduce((m, l) => (l && l[0] > m ? l[0] : m), '');
  const wkHint = (d) => { const wd = new Date(d + 'T12:00:00Z').getUTCDay(); return (wd === 0 || wd === 6) && lastD ? `there is no quote ${d === todayStr() ? 'today' : 'that day'}; the last price is from ${fdate(lastD)}` : ''; };
  const rows = mb.map((x, i) => { const a = assetById(x.assetId); const lp = lps[i]; const px = lp ? lp[1] : +x.price;
    return `<div class="rep-row" data-i="${i}"><label class="rep-ck"><input type="checkbox" checked> <span><b>${esc(a.ticker || a.name)}</b> <small class="muted">last ${fdate(x.date, { year: undefined })}${+x.fees ? ` · fee ${eur(+x.fees)}` : ''}</small></span></label>
      <label class="f">Amount (€)<input type="text" inputmode="decimal" autocomplete="off" class="rAmt" value="${esc(cm(buyTot(x)))}"></label>
      <label class="f">Price <span class="hint">in ${esc(a.currency)}${lp ? ` · ${fdate(lp[0], { year: undefined })}` : ' · the one from your last buy'}</span><input type="text" inputmode="decimal" autocomplete="off" class="rPx" value="${esc(cm(px))}"></label>
      <div class="small muted rQ"></div></div>`; }).join('');
  openModal(`<style>.rep-row{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;padding:10px 0;border-top:1px solid var(--line)}.rep-row .rep-ck{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:15px}.rep-row .rep-ck input{width:18px;height:18px}.rep-row .rQ{grid-column:1/-1}.rep-row.off .f,.rep-row.off .rQ{opacity:.45}</style>
  <div class="panel-h"><h2>Repeat your last buys</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="repForm" novalidate>
    <label class="f full">Date for all <span class="hint" id="repDateHint">${esc(wkHint(todayStr()))}</span><input type="date" id="repDate" value="${todayStr()}" required></label>
    <div class="full" id="repRows">${rows}</div>
    <div class="full" id="repTotal" style="font-weight:700"></div>
    <div class="err full" id="repErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit" id="repSave">Save</button></div>
  </form>`, () => {
    const date = () => $('#repDate').value;
    const calc = () => { const d = date() || todayStr(); return $$('#repRows .rep-row').map((r) => { const x = mb[+r.dataset.i]; const a = assetById(x.assetId); const fee = +x.fees || 0; const fx = a.currency === 'EUR' ? 1 : (fxFor(a.currency, d) || +x.fx || null); const amt = parseNum($('.rAmt', r).value), px = parseNum($('.rPx', r).value); const q = fx && px > 0 && amt > fee ? (amt - fee) / (px * fx) : NaN; return { r, x, a, fee, fx, amt, px, q, on: $('input[type=checkbox]', r).checked }; }); };
    const upd = () => { const cs = calc(); let tot = 0, n = 0; for (const c of cs) { c.r.classList.toggle('off', !c.on); $('.rQ', c.r).textContent = !c.on ? 'it will not be recorded' : !c.fx ? `no exchange rate for ${c.a.currency}` : Number.isFinite(c.q) ? `≈ ${numf(c.q, 6)} units` : 'check the amount and price'; if (c.on) { n++; tot += Number.isFinite(c.amt) ? c.amt : 0; } } $('#repTotal').textContent = `Total: ${eur(tot)} in ${n} ${n === 1 ? 'buy' : 'buys'}`; $('#repSave').textContent = n ? `Save ${n} ${n === 1 ? 'buy' : 'buys'}` : 'Save'; $('#repSave').disabled = !n; };
    $('#repRows').addEventListener('input', upd); $('#repRows').addEventListener('change', upd);
    $('#repDate').addEventListener('change', () => { const d = date(); $('#repDateHint').textContent = d ? wkHint(d) : ''; upd(); });
    upd();
    $('#repForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#repErr'); err.textContent = ''; const d = date();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return (err.textContent = 'Enter the date.');
      if (d > todayStr()) return (err.textContent = 'The date cannot be in the future.');
      if (d < '1990-01-01') return (err.textContent = 'The date must be 1990 or later.');
      const cs = calc().filter((c) => c.on); if (!cs.length) return (err.textContent = 'Tick at least one buy.');
      for (const c of cs) { const tk = c.a.ticker || c.a.name; if (!(c.amt > 0)) return (err.textContent = `${tk}: enter a valid amount.`); if (!(c.px > 0)) return (err.textContent = `${tk}: enter a valid price.`); if (!(c.amt > c.fee)) return (err.textContent = `${tk}: the amount must be larger than the fee (${eur(c.fee)}).`); if (!c.fx) return (err.textContent = `${tk}: there is no exchange rate for ${c.a.currency}; record it from "Buy".`); }
      $('#repSave').disabled = true; const ids = []; const now = new Date().toISOString();
      try {
        for (const c of cs) { const o = { type: 'buy', date: d, assetId: c.x.assetId, qty: +c.q.toFixed(8), price: c.px, fees: c.fee, note: '', created: now }; if (c.a.currency !== 'EUR' && !fxFor(c.a.currency, d)) o.fx = c.fx; const id = uid(); await save('txs', id, o); ids.push(id); }
      } catch (e) { $('#repSave').disabled = false; err.textContent = (ids.length ? `${ids.length} were saved; ` : '') + (e.code === 'quota_exceeded' ? 'the page\'s database is full (5,000 documents).' : e.code === 'invalid_argument' ? 'you do not have permission to save on this page.' : 'could not save: ' + (e.message || e.code)); return; }
      closeModal();
      const tot = cs.reduce((s, c) => s + c.amt, 0);
      toast(`${ids.length} ${ids.length === 1 ? 'buy added' : 'buys added'} · ${eur(tot)}`, 8000, { label: 'Undo', fn: async () => { try { for (const id of ids) { if (!S.txs[id]) continue; if (typeof toTrash === 'function') await toTrash('tx', id, S.txs[id], 'undo'); await remove('txs', id); } toast('Buys undone.'); } catch (e) { toast('Could not undo: ' + (e.message || e.code)); } } });
    });
  });
}
