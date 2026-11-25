/* ---- Recurring contributions (settings.recurring, optional) ---- */
const RECUR_NOTE = 'Recurring buy';
const WDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** NAV/price of `id` on date d, or the previous one; known = that day is settled (exact point, or a later point exists). */
function navOn(id, d, pts) { pts = pts || histPts(id) || []; let p = null; for (const x of pts) { if (x[0] <= d) p = x; else break; } return p ? { d: p[0], v: +p[1], known: p[0] === d || pts[pts.length - 1][0] > d } : null; }
function recurPlans() { return DEMO ? [] : (((S.settings || {}).recurring) || []).filter((p) => p && p.id && p.assetId && assetById(p.assetId)); }
const recurTxt = (p) => `${eur(+p.amount, +p.amount % 1 ? 2 : 0)} ${p.freq === 'm' ? `on day ${p.day} of each month` : `every ${WDAYS[(+p.day || 1) - 1]}`}`;
/** Expected order dates of a plan from p.from up to `to` (last 400 days at most). Day 31 → last day of short months. */
function recurDates(p, to) {
  const out = []; let d = p.from; if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return out; const lim = E.addDays(to, -400); if (d < lim) d = lim;
  if (p.freq === 'm') { for (let ym = d.slice(0, 7) + '-01'; ym <= to; ym = E.addMonths(ym, 1)) { const [y, m] = ym.split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); const x = ym.slice(0, 8) + String(Math.min(Math.max(1, +p.day || 1), last)).padStart(2, '0'); if (x >= d && x <= to) out.push(x); } }
  else { const wd = (+p.day || 1) % 7; let x = d; while (new Date(x + 'T00:00:00Z').getUTCDay() !== wd) x = E.addDays(x, 1); for (; x <= to; x = E.addDays(x, 7)) out.push(x); }
  return out;
}
/** One row per expected date: new (NAV known), have (a buy of the asset ±3 days and ±10 % amount) or wait (no NAV yet). Skipped dates are left out. */
function recurringPending(today, plans) {
  today = today || todayStr(); const out = []; const byA = {};
  for (const x of Object.values(S.txs)) if (x.type === 'buy') (byA[x.assetId] = byA[x.assetId] || []).push(x);
  for (const p of plans || recurPlans().filter((z) => !z.paused)) {
    const used = new Set(); const skip = new Set(p.skip || []); const amt = +p.amount; const pts = histPts(p.assetId) || [];
    for (const d of recurDates(p, today)) {
      if (skip.has(d)) continue;
      let best = null, bd = 9; for (const x of byA[p.assetId] || []) { if (used.has(x.id)) continue; const dd = Math.abs(Date.parse(x.date) - Date.parse(d)) / 864e5; if (dd <= 3 && Math.abs(buyTot(x) / amt - 1) <= 0.1 && dd < bd) { best = x; bd = dd; } }
      if (best) { used.add(best.id); out.push({ plan: p, date: d, st: 'have', buy: best }); continue; }
      const nv = navOn(p.assetId, d, pts);
      out.push(nv && nv.known && nv.v > 0 ? { plan: p, date: d, st: 'new', px: nv.v, pxDate: nv.d, qty: amt / nv.v } : { plan: p, date: d, st: 'wait' });
    }
  }
  return out;
}
/** Buys of a paused plan's asset entered after the pause: the bank order may still be running (backlog idea 7). */
function recurPausedBuys() { return recurPlans().filter((p) => p.paused && p.pausedAt).map((p) => ({ p, xs: Object.values(S.txs).filter((x) => x.type === 'buy' && x.assetId === p.assetId && (x.created || '') > (p.ack || p.pausedAt) && x.note !== RECUR_NOTE) })).filter((z) => z.xs.length); }
function recurBanner() {
  if (DEMO || !res) return '';
  const tk = (id) => esc((assetById(id) || {}).ticker || (assetById(id) || {}).name || '');
  const nw = recurringPending().filter((r) => r.st === 'new'); let h = '';
  if (nw.length) h += `<div class="banner info"><div><b>Time to record ${nw.length} ${nw.length === 1 ? 'recurring buy' : 'recurring buys'}</b> (${Array.from(new Set(nw.map((r) => tk(r.plan.assetId)))).join(', ')}).</div><div class="toolbar"><button class="btn small primary" type="button" data-recurring="review">Review</button><button class="btn small" type="button" data-recurring="pause">Pause</button></div></div>`;
  for (const { p, xs } of recurPausedBuys()) h += `<div class="banner info"><div><b>A buy of ${tk(p.assetId)} while its recurring buy is paused</b> (${xs.map((x) => fdate(x.date, { year: undefined })).join(', ')}). Is the recurring order still active at your bank?</div><div class="toolbar"><button class="btn small" type="button" data-recurring="resume:${esc(p.id)}">Resume the plan</button><button class="btn small" type="button" data-recurring="ack:${esc(p.id)}">Still paused</button></div></div>`;
  return h;
}
async function saveRecurring(list, msg, prev) {
  try { await saveSettings({ recurring: list }); if (msg) toast(msg, prev ? 7000 : 3200, prev ? { label: 'Undo', fn: () => saveSettings({ recurring: prev }).then(() => toast('Done.')) } : null); return true; }
  catch (e) { toast('Could not save: ' + (e.message || e.code)); return false; }
}
async function recurringAct(v) {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const [k, id] = v.split(':'); const all = ((S.settings || {}).recurring || []).slice(); const prev = JSON.parse(JSON.stringify(all)); const now = new Date().toISOString();
  const set = (f) => all.map((p) => (f(p) ? Object.assign({}, p, k === 'resume' ? { paused: false, pausedAt: null, ack: null } : k === 'ack' ? { ack: now } : { paused: true, pausedAt: now }) : p));
  if (k === 'review') return openRecurringReview(id || null);
  if (k === 'manage') { closeModal(); return openRecurringList(); }
  if (k === 'new') return openRecurring(null);
  if (k === 'edit') return openRecurring(all.find((p) => p.id === id));
  if (k === 'pause') { const ids = id ? [id] : Array.from(new Set(recurringPending().filter((r) => r.st === 'new').map((r) => r.plan.id))); await saveRecurring(set((p) => ids.includes(p.id)), ids.length === 1 ? 'Recurring buy paused.' : `${ids.length} recurring buys paused.`, prev); }
  else if (k === 'resume') await saveRecurring(set((p) => p.id === id), 'Recurring buy resumed.', prev);
  else if (k === 'ack') await saveRecurring(set((p) => p.id === id), 'Noted: the plan stays paused.');
  if ($('#recList')) setTimeout(openRecurringList, 120);
}
function openRecurringList() {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const ps = recurPlans(); const pend = recurringPending();
  openModal(`<div class="panel-h"><h2>Recurring buys</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <style>.rec-plan{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;padding:10px 14px}.rec-plan .rec-act{display:flex;gap:6px;flex-wrap:wrap}</style><p class="note" id="recList">The orders you have scheduled at your bank. The app reminds you of the ones that are due, with the NAV of their date, and records nothing until you confirm.</p>
  <div style="display:flex;flex-direction:column;gap:8px;margin:10px 0 8px">${ps.map((p) => { const a = assetById(p.assetId); const n = pend.filter((r) => r.plan.id === p.id && r.st === 'new').length;
    return `<div class="rec-plan"><div><b>${esc(a.ticker || a.name)}</b> <span class="small">${recurTxt(p)}</span>${p.paused ? ' <span class="chip warn">paused</span>' : n ? ` <span class="chip buy">${n} to record</span>` : ''}<div class="small muted">since ${fdate(p.from)}</div></div><div class="rec-act">${n && !p.paused ? `<button class="btn small primary" type="button" data-recurring="review:${esc(p.id)}">Review</button>` : ''}<button class="btn small" type="button" data-recurring="${p.paused ? 'resume' : 'pause'}:${esc(p.id)}">${p.paused ? 'Resume' : 'Pause'}</button><button class="btn small" type="button" data-recurring="edit:${esc(p.id)}">Edit</button></div></div>`; }).join('') || '<p class="note">You do not have any yet.</p>'}</div>
  <div class="sheet-list"><button type="button" data-recurring="new"><span class="ic rep">+</span><span>New recurring buy<small>fund, amount and day of the week or month</small></span></button></div>`);
}
/** Add / edit a plan. Nothing here creates operations. */
function openRecurring(p0) {
  const assets = assetList().filter((a) => !a.inactive && a.currency === 'EUR' && a.type !== 'cash'); if (!assets.length) return toast('You have no assets in euros for a recurring buy.');
  const rb = recentBuys(); const p = Object.assign({ freq: 'w', day: 1, from: todayStr(), amount: '', assetId: (rb[0] && assets.some((a) => a.id === rb[0].assetId) ? rb[0].assetId : assets[0].id) }, p0 || {});
  const dayOpts = (f, v) => f === 'm' ? Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${i + 1}${i === 30 ? ' (or the last)' : ''}</option>`).join('') : WDAYS.map((w, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${w}</option>`).join('');
  openModal(`<div class="panel-h"><h2>${p0 ? 'Edit recurring buy' : 'New recurring buy'}</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="recForm" novalidate>
    <label class="f">Asset<select id="recA">${assets.map((a) => `<option value="${esc(a.id)}" ${a.id === p.assetId ? 'selected' : ''}>${esc(a.ticker || a.name)}</option>`).join('')}</select></label>
    <label class="f">Amount <span class="hint">€ per buy</span><input type="text" inputmode="decimal" autocomplete="off" id="recAmt" value="${esc(String(p.amount))}" placeholder="e.g. 100" required></label>
    <label class="f half">Frequency<select id="recF"><option value="w" ${p.freq !== 'm' ? 'selected' : ''}>Weekly</option><option value="m" ${p.freq === 'm' ? 'selected' : ''}>Monthly</option></select></label>
    <label class="f half">Day<select id="recD">${dayOpts(p.freq, p.day)}</select></label>
    <label class="f">From <span class="hint">first order</span><input type="date" id="recFrom" value="${esc(p.from)}" required></label>
    <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="recP" ${p.paused ? 'checked' : ''} style="width:18px;height:18px"> Paused</label>
    <p class="note full">Each buy is proposed with the NAV of its date (or the previous one if there was none that day); the ones you have already recorded are not repeated.</p>
    <div class="err full" id="recErr"></div>
    <div class="form-actions full">${p0 ? '<button class="btn danger" type="button" id="recDel">Delete</button>' : ''}<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">${p0 ? 'Save' : 'Add'}</button></div>
  </form>`, () => {
    $('#recF').addEventListener('change', () => { $('#recD').innerHTML = dayOpts($('#recF').value, 1); });
    const list = () => ((S.settings || {}).recurring || []).slice();
    if ($('#recDel')) $('#recDel').addEventListener('click', async (ev) => { const b = ev.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Delete?'; return; } const prev = list(); if (await saveRecurring(prev.filter((z) => z.id !== p0.id), 'Recurring buy deleted.', prev)) openRecurringList(); });
    $('#recForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#recErr'); const amt = parseNum($('#recAmt').value); const from = $('#recFrom').value; const paused = $('#recP').checked;
      if (!(amt > 0)) return (err.textContent = 'Enter the amount.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || from < '1990-01-01') return (err.textContent = 'Enter the date of the first order.');
      const prev = list(); const was = p0 && prev.find((z) => z.id === p0.id) || {};
      const o = Object.assign({}, was, { id: p0 ? p0.id : 'r' + uid().slice(0, 8), assetId: $('#recA').value, amount: +amt.toFixed(2), freq: $('#recF').value, day: +$('#recD').value, from, paused });
      if (paused && !was.paused) o.pausedAt = new Date().toISOString(); if (!paused) { delete o.pausedAt; delete o.ack; }
      if (p0 && (was.assetId !== o.assetId || was.freq !== o.freq || was.day !== o.day)) delete o.skip;
      if (await saveRecurring(p0 ? prev.map((z) => (z.id === o.id ? o : z)) : prev.concat([o]), p0 ? 'Recurring buy saved.' : 'Recurring buy added.')) openRecurringList();
    });
  });
}
/** Review the pending dates of one plan (or all): each confirmed row becomes a buy at the NAV of its date. */
function openRecurringReview(planId) {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const plans = recurPlans().filter((p) => (planId ? p.id === planId : !p.paused));
  const rows = recurringPending(null, plans); const show = rows.filter((r) => r.st !== 'have'); const have = rows.length - show.length;
  const cm = (n) => String(n);
  const html = show.map((r, i) => { const a = assetById(r.plan.assetId); const wt = r.st === 'wait';
    return `<div class="rep-row${wt ? ' off' : ''}" data-i="${i}"><label class="rep-ck"><input type="checkbox" ${wt ? 'disabled' : 'checked'}> <span><b>${esc(a.ticker || a.name)}</b> · ${fdate(r.date)} ${wt ? '<span class="chip warn">no NAV yet</span>' : '<span class="chip buy">new</span>'}</span></label>
      ${wt ? `<div class="small muted rQ">It stays pending until that day's NAV arrives.</div>` : `<label class="f">Amount (€)<input type="text" inputmode="decimal" autocomplete="off" class="rAmt" value="${esc(cm(+r.plan.amount))}"></label><div class="small rNav"><span class="muted">NAV on ${fdate(r.pxDate, { year: undefined })}</span><br><b class="num">${money(r.px, a.currency, 4)}</b></div><div class="small muted rQ"></div>`}
      <div class="rep-skip"><label class="small muted"><input type="checkbox" class="rSkip"> I did not make it: do not propose it again</label></div></div>`; }).join('');
  openModal(`<style>.rep-row{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;padding:10px 0;border-top:1px solid var(--line)}.rep-row .rep-ck{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:15px;flex-wrap:wrap}.rep-row .rep-ck input{width:18px;height:18px}.rep-row .rQ,.rep-row .rep-skip{grid-column:1/-1}.rep-row .rNav{align-self:end;padding-bottom:6px}.rep-row.off .f,.rep-row.off .rQ,.rep-row.off .rNav{opacity:.45}.rep-skip label{display:flex;align-items:center;gap:6px}</style>
  <div class="panel-h"><h2>Recurring buys</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="rrForm" novalidate>
    <p class="note full">${show.length ? 'Review and confirm: each buy uses the NAV of its date. ' : 'There is nothing to record. '}${have ? `${have} ${have === 1 ? 'date is already recorded' : 'dates are already recorded'} (a buy within ±3 days with an amount within ±10 %).` : ''}</p>
    <div class="full" id="rrRows">${html}</div>
    <div class="full" id="rrTotal" style="font-weight:700"></div>
    <div class="err full" id="rrErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-recurring="manage">Plans</button><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit" id="rrSave">Save</button></div>
  </form>`, () => {
    const calc = () => $$('#rrRows .rep-row').map((el) => { const r = show[+el.dataset.i]; const amt = el.querySelector('.rAmt') ? parseNum($('.rAmt', el).value) : NaN; const skip = $('.rSkip', el).checked; return { el, r, amt, skip, on: r.st === 'new' && !skip && $('input[type=checkbox]', el).checked, q: r.px > 0 && amt > 0 ? amt / r.px : NaN }; });
    const upd = () => { let n = 0, s = 0, tot = 0; for (const c of calc()) { c.el.classList.toggle('off', !c.on); const q = $('.rQ', c.el); if (c.r.st === 'new' && q) q.textContent = c.skip ? 'it will not be recorded or proposed again' : !c.on ? 'later' : Number.isFinite(c.q) ? `≈ ${numf(c.q, 6)} units` : 'check the amount'; if (c.on) { n++; tot += Number.isFinite(c.amt) ? c.amt : 0; } if (c.skip) s++; }
      $('#rrTotal').textContent = n ? `Total: ${eur(tot)} in ${n} ${n === 1 ? 'buy' : 'buys'}` : ''; $('#rrSave').textContent = n ? `Record ${n} ${n === 1 ? 'buy' : 'buys'}` : 'Save'; $('#rrSave').disabled = !n && !s; };
    $('#rrRows').addEventListener('input', upd); $('#rrRows').addEventListener('change', upd); upd();
    $('#rrForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#rrErr'); err.textContent = ''; const cs = calc(); const on = cs.filter((c) => c.on); const sk = cs.filter((c) => c.skip);
      for (const c of on) if (!(c.amt > 0) || !Number.isFinite(c.q)) return (err.textContent = `${(assetById(c.r.plan.assetId) || {}).ticker || ''} on ${fdate(c.r.date)}: enter a valid amount.`);
      $('#rrSave').disabled = true; const ids = []; const now = new Date().toISOString(); const prev = JSON.parse(JSON.stringify((S.settings || {}).recurring || []));
      try {
        for (const c of on) { const id = uid(); await save('txs', id, { type: 'buy', date: c.r.date, assetId: c.r.plan.assetId, qty: +c.q.toFixed(6), price: c.r.px, fees: 0, note: RECUR_NOTE, created: now }); ids.push(id); }
        if (sk.length) await saveSettings({ recurring: prev.map((p) => { const d = sk.filter((c) => c.r.plan.id === p.id).map((c) => c.r.date); return d.length ? Object.assign({}, p, { skip: Array.from(new Set((p.skip || []).concat(d))).sort().slice(-120) }) : p; }) });
      } catch (e) { $('#rrSave').disabled = false; err.textContent = (ids.length ? `${ids.length} were saved; ` : '') + (e.code === 'quota_exceeded' ? 'the page\'s database is full (5,000 documents).' : e.code === 'invalid_argument' ? 'you do not have permission to save on this page.' : 'could not save: ' + (e.message || e.code)); return; }
      closeModal(); const tot = on.reduce((s, c) => s + c.amt, 0);
      toast(ids.length ? `${ids.length} ${ids.length === 1 ? 'buy recorded' : 'buys recorded'} · ${eur(tot)}` : `${sk.length} ${sk.length === 1 ? 'date discarded' : 'dates discarded'}.`, 8000, { label: 'Undo', fn: async () => { try { for (const id of ids) { if (!S.txs[id]) continue; await toTrash('tx', id, S.txs[id], 'undo'); await remove('txs', id); } if (sk.length) await saveSettings({ recurring: prev }); toast('Undone.'); } catch (e) { toast('Could not undo: ' + (e.message || e.code)); } } });
    });
  });
}

