/* ---- Recurring contributions (settings.recurring, optional) ---- */
const RECUR_NOTE = 'Aportación periódica';
const WDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
/** NAV/price of `id` on date d, or the previous one; known = that day is settled (exact point, or a later point exists). */
function navOn(id, d, pts) { pts = pts || histPts(id) || []; let p = null; for (const x of pts) { if (x[0] <= d) p = x; else break; } return p ? { d: p[0], v: +p[1], known: p[0] === d || pts[pts.length - 1][0] > d } : null; }
function recurPlans() { return DEMO ? [] : (((S.settings || {}).recurring) || []).filter((p) => p && p.id && p.assetId && assetById(p.assetId)); }
const recurTxt = (p) => `${eur(+p.amount, +p.amount % 1 ? 2 : 0)} ${p.freq === 'm' ? `el día ${p.day} de cada mes` : `cada ${WDAYS[(+p.day || 1) - 1]}`}`;
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
  if (nw.length) h += `<div class="banner info"><div><b>Toca anotar ${nw.length} ${nw.length === 1 ? 'aportación periódica' : 'aportaciones periódicas'}</b> (${Array.from(new Set(nw.map((r) => tk(r.plan.assetId)))).join(', ')}).</div><div class="toolbar"><button class="btn small primary" type="button" data-recurring="review">Revisar</button><button class="btn small" type="button" data-recurring="pause">Pausar</button></div></div>`;
  for (const { p, xs } of recurPausedBuys()) h += `<div class="banner info"><div><b>Compra de ${tk(p.assetId)} con su aportación periódica en pausa</b> (${xs.map((x) => fdate(x.date, { year: undefined })).join(', ')}). ¿Sigue viva la orden periódica en el banco?</div><div class="toolbar"><button class="btn small" type="button" data-recurring="resume:${esc(p.id)}">Reanudar el plan</button><button class="btn small" type="button" data-recurring="ack:${esc(p.id)}">Sigue en pausa</button></div></div>`;
  return h;
}
async function saveRecurring(list, msg, prev) {
  try { await saveSettings({ recurring: list }); if (msg) toast(msg, prev ? 7000 : 3200, prev ? { label: 'Deshacer', fn: () => saveSettings({ recurring: prev }).then(() => toast('Hecho.')) } : null); return true; }
  catch (e) { toast('No se pudo guardar: ' + (e.message || e.code)); return false; }
}
async function recurringAct(v) {
  if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
  const [k, id] = v.split(':'); const all = ((S.settings || {}).recurring || []).slice(); const prev = JSON.parse(JSON.stringify(all)); const now = new Date().toISOString();
  const set = (f) => all.map((p) => (f(p) ? Object.assign({}, p, k === 'resume' ? { paused: false, pausedAt: null, ack: null } : k === 'ack' ? { ack: now } : { paused: true, pausedAt: now }) : p));
  if (k === 'review') return openRecurringReview(id || null);
  if (k === 'manage') { closeModal(); return openRecurringList(); }
  if (k === 'new') return openRecurring(null);
  if (k === 'edit') return openRecurring(all.find((p) => p.id === id));
  if (k === 'pause') { const ids = id ? [id] : Array.from(new Set(recurringPending().filter((r) => r.st === 'new').map((r) => r.plan.id))); await saveRecurring(set((p) => ids.includes(p.id)), ids.length === 1 ? 'Aportación periódica en pausa.' : `${ids.length} aportaciones periódicas en pausa.`, prev); }
  else if (k === 'resume') await saveRecurring(set((p) => p.id === id), 'Aportación periódica reanudada.', prev);
  else if (k === 'ack') await saveRecurring(set((p) => p.id === id), 'Anotado: el plan sigue en pausa.');
  if ($('#recList')) setTimeout(openRecurringList, 120);
}
function openRecurringList() {
  if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
  const ps = recurPlans(); const pend = recurringPending();
  openModal(`<div class="panel-h"><h2>Aportaciones periódicas</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <style>.rec-plan{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:12px;padding:10px 14px}.rec-plan .rec-act{display:flex;gap:6px;flex-wrap:wrap}</style><p class="note" id="recList">Las órdenes que tienes programadas en el banco. La app te recuerda las que tocan, con el VL de su fecha, y no anota nada sin que lo confirmes.</p>
  <div style="display:flex;flex-direction:column;gap:8px;margin:10px 0 8px">${ps.map((p) => { const a = assetById(p.assetId); const n = pend.filter((r) => r.plan.id === p.id && r.st === 'new').length;
    return `<div class="rec-plan"><div><b>${esc(a.ticker || a.name)}</b> <span class="small">${recurTxt(p)}</span>${p.paused ? ' <span class="chip warn">en pausa</span>' : n ? ` <span class="chip buy">${n} por anotar</span>` : ''}<div class="small muted">desde ${fdate(p.from)}</div></div><div class="rec-act">${n && !p.paused ? `<button class="btn small primary" type="button" data-recurring="review:${esc(p.id)}">Revisar</button>` : ''}<button class="btn small" type="button" data-recurring="${p.paused ? 'resume' : 'pause'}:${esc(p.id)}">${p.paused ? 'Reanudar' : 'Pausar'}</button><button class="btn small" type="button" data-recurring="edit:${esc(p.id)}">Editar</button></div></div>`; }).join('') || '<p class="note">Aún no tienes ninguna.</p>'}</div>
  <div class="sheet-list"><button type="button" data-recurring="new"><span class="ic rep">+</span><span>Nueva aportación periódica<small>fondo, importe y día de la semana o del mes</small></span></button></div>`);
}
/** Add / edit a plan. Nothing here creates operations. */
function openRecurring(p0) {
  const assets = assetList().filter((a) => !a.inactive && a.currency === 'EUR' && a.type !== 'cash'); if (!assets.length) return toast('No tienes activos en euros para una aportación periódica.');
  const rb = recentBuys(); const p = Object.assign({ freq: 'w', day: 1, from: todayStr(), amount: '', assetId: (rb[0] && assets.some((a) => a.id === rb[0].assetId) ? rb[0].assetId : assets[0].id) }, p0 || {});
  const dayOpts = (f, v) => f === 'm' ? Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${i + 1}${i === 30 ? ' (o el último)' : ''}</option>`).join('') : WDAYS.map((w, i) => `<option value="${i + 1}" ${+v === i + 1 ? 'selected' : ''}>${w}</option>`).join('');
  openModal(`<div class="panel-h"><h2>${p0 ? 'Editar aportación periódica' : 'Nueva aportación periódica'}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="recForm" novalidate>
    <label class="f">Activo<select id="recA">${assets.map((a) => `<option value="${esc(a.id)}" ${a.id === p.assetId ? 'selected' : ''}>${esc(a.ticker || a.name)}</option>`).join('')}</select></label>
    <label class="f">Importe <span class="hint">€ por aportación</span><input type="text" inputmode="decimal" autocomplete="off" id="recAmt" value="${esc(String(p.amount).replace('.', ','))}" placeholder="p. ej. 100" required></label>
    <label class="f half">Frecuencia<select id="recF"><option value="w" ${p.freq !== 'm' ? 'selected' : ''}>Semanal</option><option value="m" ${p.freq === 'm' ? 'selected' : ''}>Mensual</option></select></label>
    <label class="f half">Día<select id="recD">${dayOpts(p.freq, p.day)}</select></label>
    <label class="f">Desde <span class="hint">primera orden</span><input type="date" id="recFrom" value="${esc(p.from)}" required></label>
    <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="recP" ${p.paused ? 'checked' : ''} style="width:18px;height:18px"> En pausa</label>
    <p class="note full">Cada compra se propone con el VL de su fecha (o el anterior si ese día no hubo); las que ya tienes anotadas no se repiten.</p>
    <div class="err full" id="recErr"></div>
    <div class="form-actions full">${p0 ? '<button class="btn danger" type="button" id="recDel">Borrar</button>' : ''}<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">${p0 ? 'Guardar' : 'Añadir'}</button></div>
  </form>`, () => {
    $('#recF').addEventListener('change', () => { $('#recD').innerHTML = dayOpts($('#recF').value, 1); });
    const list = () => ((S.settings || {}).recurring || []).slice();
    if ($('#recDel')) $('#recDel').addEventListener('click', async (ev) => { const b = ev.currentTarget; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Borrar?'; return; } const prev = list(); if (await saveRecurring(prev.filter((z) => z.id !== p0.id), 'Aportación periódica borrada.', prev)) openRecurringList(); });
    $('#recForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#recErr'); const amt = parseNum($('#recAmt').value); const from = $('#recFrom').value; const paused = $('#recP').checked;
      if (!(amt > 0)) return (err.textContent = 'Indica el importe.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || from < '1990-01-01') return (err.textContent = 'Indica la fecha de la primera orden.');
      const prev = list(); const was = p0 && prev.find((z) => z.id === p0.id) || {};
      const o = Object.assign({}, was, { id: p0 ? p0.id : 'r' + uid().slice(0, 8), assetId: $('#recA').value, amount: +amt.toFixed(2), freq: $('#recF').value, day: +$('#recD').value, from, paused });
      if (paused && !was.paused) o.pausedAt = new Date().toISOString(); if (!paused) { delete o.pausedAt; delete o.ack; }
      if (p0 && (was.assetId !== o.assetId || was.freq !== o.freq || was.day !== o.day)) delete o.skip;
      if (await saveRecurring(p0 ? prev.map((z) => (z.id === o.id ? o : z)) : prev.concat([o]), p0 ? 'Aportación periódica guardada.' : 'Aportación periódica añadida.')) openRecurringList();
    });
  });
}
/** Review the pending dates of one plan (or all): each confirmed row becomes a buy at the NAV of its date. */
function openRecurringReview(planId) {
  if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
  const plans = recurPlans().filter((p) => (planId ? p.id === planId : !p.paused));
  const rows = recurringPending(null, plans); const show = rows.filter((r) => r.st !== 'have'); const have = rows.length - show.length;
  const cm = (n) => String(n).replace('.', ',');
  const html = show.map((r, i) => { const a = assetById(r.plan.assetId); const wt = r.st === 'wait';
    return `<div class="rep-row${wt ? ' off' : ''}" data-i="${i}"><label class="rep-ck"><input type="checkbox" ${wt ? 'disabled' : 'checked'}> <span><b>${esc(a.ticker || a.name)}</b> · ${fdate(r.date)} ${wt ? '<span class="chip warn">sin VL todavía</span>' : '<span class="chip buy">nueva</span>'}</span></label>
      ${wt ? `<div class="small muted rQ">Queda pendiente hasta que llegue el VL de ese día.</div>` : `<label class="f">Importe (€)<input type="text" inputmode="decimal" autocomplete="off" class="rAmt" value="${esc(cm(+r.plan.amount))}"></label><div class="small rVl"><span class="muted">VL del ${fdate(r.pxDate, { year: undefined })}</span><br><b class="num">${money(r.px, a.currency, 4)}</b></div><div class="small muted rQ"></div>`}
      <div class="rep-skip"><label class="small muted"><input type="checkbox" class="rSkip"> No la hice: no volver a proponerla</label></div></div>`; }).join('');
  openModal(`<style>.rep-row{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;padding:10px 0;border-top:1px solid var(--line)}.rep-row .rep-ck{grid-column:1/-1;display:flex;align-items:center;gap:8px;font-size:15px;flex-wrap:wrap}.rep-row .rep-ck input{width:18px;height:18px}.rep-row .rQ,.rep-row .rep-skip{grid-column:1/-1}.rep-row .rVl{align-self:end;padding-bottom:6px}.rep-row.off .f,.rep-row.off .rQ,.rep-row.off .rVl{opacity:.45}.rep-skip label{display:flex;align-items:center;gap:6px}</style>
  <div class="panel-h"><h2>Aportaciones periódicas</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="rrForm" novalidate>
    <p class="note full">${show.length ? 'Revisa y confirma: cada compra usa el VL de su fecha. ' : 'No hay nada por anotar. '}${have ? `${have} ${have === 1 ? 'fecha ya está anotada' : 'fechas ya están anotadas'} (compra a ±3 días con un importe a ±10 %).` : ''}</p>
    <div class="full" id="rrRows">${html}</div>
    <div class="full" id="rrTotal" style="font-weight:700"></div>
    <div class="err full" id="rrErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-recurring="manage">Planes</button><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit" id="rrSave">Guardar</button></div>
  </form>`, () => {
    const calc = () => $$('#rrRows .rep-row').map((el) => { const r = show[+el.dataset.i]; const amt = el.querySelector('.rAmt') ? parseNum($('.rAmt', el).value) : NaN; const skip = $('.rSkip', el).checked; return { el, r, amt, skip, on: r.st === 'new' && !skip && $('input[type=checkbox]', el).checked, q: r.px > 0 && amt > 0 ? amt / r.px : NaN }; });
    const upd = () => { let n = 0, s = 0, tot = 0; for (const c of calc()) { c.el.classList.toggle('off', !c.on); const q = $('.rQ', c.el); if (c.r.st === 'new' && q) q.textContent = c.skip ? 'no se anotará y no se volverá a proponer' : !c.on ? 'más tarde' : Number.isFinite(c.q) ? `≈ ${numf(c.q, 6)} participaciones` : 'revisa el importe'; if (c.on) { n++; tot += Number.isFinite(c.amt) ? c.amt : 0; } if (c.skip) s++; }
      $('#rrTotal').textContent = n ? `Total: ${eur(tot)} en ${n} ${n === 1 ? 'compra' : 'compras'}` : ''; $('#rrSave').textContent = n ? `Anotar ${n} ${n === 1 ? 'compra' : 'compras'}` : 'Guardar'; $('#rrSave').disabled = !n && !s; };
    $('#rrRows').addEventListener('input', upd); $('#rrRows').addEventListener('change', upd); upd();
    $('#rrForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const err = $('#rrErr'); err.textContent = ''; const cs = calc(); const on = cs.filter((c) => c.on); const sk = cs.filter((c) => c.skip);
      for (const c of on) if (!(c.amt > 0) || !Number.isFinite(c.q)) return (err.textContent = `${(assetById(c.r.plan.assetId) || {}).ticker || ''} del ${fdate(c.r.date)}: indica un importe válido.`);
      $('#rrSave').disabled = true; const ids = []; const now = new Date().toISOString(); const prev = JSON.parse(JSON.stringify((S.settings || {}).recurring || []));
      try {
        for (const c of on) { const id = uid(); await save('txs', id, { type: 'buy', date: c.r.date, assetId: c.r.plan.assetId, qty: +c.q.toFixed(6), price: c.r.px, fees: 0, note: RECUR_NOTE, created: now }); ids.push(id); }
        if (sk.length) await saveSettings({ recurring: prev.map((p) => { const d = sk.filter((c) => c.r.plan.id === p.id).map((c) => c.r.date); return d.length ? Object.assign({}, p, { skip: Array.from(new Set((p.skip || []).concat(d))).sort().slice(-120) }) : p; }) });
      } catch (e) { $('#rrSave').disabled = false; err.textContent = (ids.length ? `Se guardaron ${ids.length}; ` : '') + (e.code === 'quota_exceeded' ? 'se ha llenado la base de datos de la página (5.000 documentos).' : e.code === 'invalid_argument' ? 'no tienes permiso para guardar en esta página.' : 'no se pudo guardar: ' + (e.message || e.code)); return; }
      closeModal(); const tot = on.reduce((s, c) => s + c.amt, 0);
      toast(ids.length ? `${ids.length} ${ids.length === 1 ? 'aportación anotada' : 'aportaciones anotadas'} · ${eur(tot)}` : `${sk.length} ${sk.length === 1 ? 'fecha descartada' : 'fechas descartadas'}.`, 8000, { label: 'Deshacer', fn: async () => { try { for (const id of ids) { if (!S.txs[id]) continue; await toTrash('tx', id, S.txs[id], 'deshacer'); await remove('txs', id); } if (sk.length) await saveSettings({ recurring: prev }); toast('Deshecho.'); } catch (e) { toast('No se pudo deshacer: ' + (e.message || e.code)); } } });
    });
  });
}

