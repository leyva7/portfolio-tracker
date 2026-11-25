/* ================= Cash, asset classes, patrimony ================= */
const CLASSES = [['rv', 'Renta variable', '--s1'], ['rf', 'Renta fija', '--s3'], ['oro', 'Oro', '--s4'], ['cripto', 'Cripto', '--s2'], ['otro', 'Otros', '--s9'], ['cash', 'Efectivo', '--s7']];
const CLS_LABEL = Object.fromEntries(CLASSES.map(([k, l]) => [k, l]));
const clsColor = (k) => cssv((CLASSES.find((c) => c[0] === k) || CLASSES[4])[2]);
const clsOf = (a) => a.cls || (a.type === 'crypto' ? 'cripto' : a.type === 'cash' ? 'cash' : 'rv');
function cashList() { return (DEMO ? demoData.cash : Object.values(S.cash)).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
const MV_TYPES = { open: 'Saldo inicial', in: 'Ingreso', out: 'Retirada', interest: 'Intereses', adjust: 'Ajuste' };
/** Movements of an account, oldest first: [{id, d, a, t, n}]. Older docs that only have snapshots (h) are read as opening + adjustments. */
function cashMoves(c) {
  let mv = Object.entries(c.mv || {}).map(([id, m]) => ({ id, d: m.d, a: +m.a || 0, t: m.t || (m.a >= 0 ? 'in' : 'out'), n: m.n || '' })).filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.d));
  if (!mv.length) {
    const hs = Object.entries(c.h || {}).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(+v)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let prev = 0; hs.forEach(([d, v], i) => { mv.push({ id: 'h' + i, d, a: +v - prev, t: i ? 'adjust' : 'open', n: '' }); prev = +v; });
    if (!mv.length && Number.isFinite(+c.balance)) mv.push({ id: 'b', d: c.updated || todayStr(), a: +c.balance, t: 'open', n: '' });
  }
  const order = { open: 0, in: 1, interest: 2, adjust: 3, out: 4 };
  return mv.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : (order[x.t] ?? 5) - (order[y.t] ?? 5)));
}
function cashPts(c) { const out = []; let b = 0; for (const m of cashMoves(c)) { b += m.a; if (out.length && out[out.length - 1][0] === m.d) out[out.length - 1][1] = b; else out.push([m.d, b]); } return out; }
const cashBal = (c) => { const p = cashPts(c); return p.length ? p[p.length - 1][1] : 0; };
const cashTotal = () => cashList().reduce((s, c) => s + cashBal(c), 0);
function cashAt(d) { let s = 0; for (const c of cashList()) { let v = 0; for (const [dd, b] of cashPts(c)) { if (dd <= d) v = b; else break; } s += v; } return s; }
const cashRate = () => { const t = cashTotal(); return t > 0 ? cashList().reduce((s, c) => s + cashBal(c) * (+c.rate || 0), 0) / t / 100 : 0; };
/** Savings goal (settings.goal = {name, amount, date?}): progress of total cash, pace of the last 3 months and the date it would be reached. */
function goalInfo() {
  const g = S.settings && S.settings.goal; if (DEMO || !g || !(+g.amount > 0)) return null;
  const cu = cushionInfo(), cash = cu ? cu.free : cashTotal() /* the emergency cushion never counts towards the goal */, amt = +g.amount, left = Math.max(0, amt - cash), today = todayStr();
  const from = E.addDays(today, -91); // pace: what comes from outside (salary, savings, interest), not the money from your own sales
  const pace = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.d > from && m.d <= today && m.t !== 'open' && m.t !== 'adjust' && !(m.t === 'in' && /^venta\b/i.test(m.n || ''))).reduce((s, m) => s + (+m.a || 0), 0) / 3;
  const mLeft = g.date && g.date > today ? (Date.parse(g.date) - Date.parse(today)) / (30.44 * 864e5) : null;
  const need = mLeft ? left / Math.max(mLeft, 0.5) : null;
  const eta = left <= 0 ? today : pace > 0 ? E.addDays(today, Math.ceil(left / pace * 30.44)) : null;
  return { name: g.name || 'Objetivo', amount: amt, date: g.date || null, cash, left, share: Math.min(1, cash / amt), pace, need, eta, cu: cu || null };
}
function goalPanel(compact) {
  const g = goalInfo();
  if (!g) return compact ? '' : `<section class="panel"><div class="panel-h"><div><h2>Objetivo de ahorro</h2><span class="small muted">por ejemplo, la entrada del piso</span></div><button class="btn primary small" type="button" data-act="goal-edit">Fijar objetivo</button></div></section>`;
  const done = g.left <= 0;
  const late = g.date && g.eta && g.eta > g.date;
  const lines = done ? [`<b class="gain noarr">Objetivo alcanzado.</b> Tienes ${eur(g.cash - g.amount, 0)} por encima.`] : [
    `Faltan <b class="num">${eur(g.left, 0)}</b>${g.date ? ` para el ${fdate(g.date)}` : ''}.`,
    g.need != null ? `Necesitas ahorrar unos <b class="num">${eur(g.need, 0)}</b> al mes.` : '',
    `Ahorro que entra de fuera, últimos 3 meses: <span class="num ${cls(g.pace)}">${eurS(g.pace, 0)}</span>/mes${g.pace > 0 ? ` → lo alcanzarías hacia <b class="${late ? 'loss' : ''}">${fdate(g.eta, { day: undefined })}</b>${late ? ' (después de tu fecha)' : ''}` : ' → a este ritmo no se alcanza'}.`];
  return `<section class="panel"><div class="panel-h"><div><h2>${esc(g.name)}</h2><span class="small muted">${g.cu ? `efectivo sin el colchón (${eur(g.cu.amount, 0)})` : 'efectivo'} frente a tu objetivo de ${eur(g.amount, 0)}</span></div>${compact ? '<a href="#efectivo" data-goto="efectivo" class="small">Ver efectivo</a>' : '<button class="btn ghost small" type="button" data-act="goal-edit">Editar</button>'}</div>
    <div class="goal-row"><span class="num" style="font-size:22px;font-weight:700">${eur(g.cash, 0)}</span><span class="num muted">${pct(g.share, 0)}</span></div>
    <div class="goalbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.share * 100)}" aria-label="Progreso del objetivo"><span style="width:${(g.share * 100).toFixed(1)}%"></span></div>
    <p class="small" style="margin:0;line-height:1.6">${lines.filter(Boolean).join(compact ? ' ' : '<br>')}</p>
    ${g.cu ? `<p class="small muted" style="margin:0">Para el objetivo cuentan <b class="num">${eur(g.cash, 0)}</b> de tus ${eur(g.cu.cash, 0)} de efectivo; el resto es tu colchón de emergencia.</p>` : ''}
    ${compact ? '' : '<p class="note" style="margin:0">El ritmo cuenta lo que entra y sale de tus cuentas, sin el dinero de tus ventas de fondos.</p>'}</section>`;
}
/** Emergency cushion (settings.cushion = {months, spend} or {amount}, goal: discount it from the savings goal). */
function cushionInfo() {
  const c = S.settings && S.settings.cushion; if (DEMO || !c) return null;
  const spend = +c.spend > 0 ? +c.spend : null, amount = +c.amount > 0 ? +c.amount : spend && +c.months > 0 ? +c.months * spend : 0; if (!(amount > 0)) return null;
  const cash = cashTotal();
  return { amount, months: +c.months || null, spend, cash, covered: Math.min(Math.max(cash, 0), amount), free: Math.max(0, cash - amount), cover: spend ? cash / spend : null, goal: !!c.goal };
}
function cushionPanel() {
  const c = cushionInfo();
  if (!c) return `<section class="panel"><div class="panel-h"><div><h2>Colchón de emergencia</h2><span class="small muted">lo que no tocas, por ejemplo 6 meses de gastos</span></div><button class="btn small" type="button" data-act="cushion-edit">Fijar colchón</button></div></section>`;
  const full = c.cash >= c.amount;
  return `<section class="panel"><div class="panel-h"><div><h2>Colchón de emergencia</h2><span class="small muted">${c.months && c.spend ? `${NF({ maximumFractionDigits: 1 }).format(c.months)} meses × ${eur(c.spend, 0)} de gasto` : 'importe fijo'}</span></div><button class="btn ghost small" type="button" data-act="cushion-edit">Editar</button></div>
    <div class="stats">
      <div class="stat"><span class="k">Colchón</span><span class="v num">${eur(c.amount, 0)}</span></div>
      <div class="stat"><span class="k">Cubierto con tu efectivo<small>${pct(c.covered / c.amount, 0)} del colchón${c.cover != null ? ` · tu efectivo da para ${NF({ maximumFractionDigits: 1 }).format(c.cover)} meses de gastos` : ''}</small></span><span class="v num noarr ${full ? 'gain' : 'loss'}">${eur(c.covered, 0)}</span></div>
      ${(() => { const g = S.settings && S.settings.goal && +S.settings.goal.amount > 0 ? S.settings.goal : null; if (!g) return `<div class="stat"><span class="k">Disponible por encima del colchón<small>efectivo − colchón</small></span><span class="v num">${eur(c.free, 0)}</span></div>`;
        const forGoal = Math.min(c.free, +g.amount), libre = Math.max(0, c.free - +g.amount);
        return `<div class="stat"><span class="k">Para «${esc(g.name || 'tu objetivo')}»<small>lo que queda tras el colchón</small></span><span class="v num">${eur(forGoal, 0)}</span></div><div class="stat"><span class="k">Libre de verdad<small>efectivo − colchón − objetivo</small></span><span class="v num">${eur(libre, 0)}</span></div>`; })()}
    </div>
    ${full ? '' : `<p class="small" style="margin:8px 0 0">Te faltan <b class="num">${eur(c.amount - c.covered, 0)}</b> para completar el colchón.</p>`}</section>`;
}
function openCushionForm() {
  if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
  const c = (S.settings && S.settings.cushion) || {}; const n = (v) => (v ? esc(String(v).replace('.', ',')) : '');
  openModal(`<div class="panel-h"><h2>Colchón de emergencia</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="cuForm" novalidate>
    <label class="f half">Meses<input type="text" inputmode="decimal" id="cuM" value="${n(c.months || (c.amount ? '' : 6))}" placeholder="6"></label>
    <label class="f half">Gasto mensual (€)<input type="text" inputmode="decimal" id="cuS" value="${n(c.spend)}" placeholder="1.500"></label>
    <label class="f full">O un importe fijo (€) <span class="hint">si lo rellenas, manda sobre meses × gasto</span><input type="text" inputmode="decimal" id="cuA" value="${n(c.amount)}"></label>
    <label class="full small"><input type="checkbox" id="cuG" ${c.goal ? 'checked' : ''}> Descontar el colchón del objetivo de ahorro (el piso)</label>
    <p class="note full">El colchón sale de tus cuentas de efectivo. Si indicas el gasto mensual, también verás cuántos meses cubre tu efectivo.</p>
    <div class="err full" id="cuErr"></div>
    <div class="form-actions full">${S.settings && S.settings.cushion ? '<button class="btn danger" type="button" id="cuDel">Quitar colchón</button>' : ''}<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`, () => {
    const del = $('#cuDel'); if (del) del.addEventListener('click', async () => { try { await saveSettings({ cushion: null }); closeModal(); toast('Colchón quitado.'); } catch (e) { $('#cuErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); } });
    $('#cuForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const v = (id) => { const x = $(id).value.trim(); return x ? parseNum(x) : null; };
      const m = v('#cuM'), sp = v('#cuS'), a = v('#cuA');
      if ([m, sp, a].some((x) => x != null && !(Number.isFinite(x) && x > 0))) return ($('#cuErr').textContent = 'Usa importes y meses positivos.');
      if (!a && !(m && sp)) return ($('#cuErr').textContent = 'Indica meses y gasto mensual, o un importe fijo.');
      const cu = { goal: $('#cuG').checked }; if (m) cu.months = +m.toFixed(1); if (sp) cu.spend = +sp.toFixed(2); if (a) cu.amount = +a.toFixed(2);
      try { await saveSettings({ cushion: cu }); closeModal(); toast('Colchón guardado.'); }
      catch (e) { $('#cuErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); }
    });
  });
}
function openGoalForm() {
  if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
  const g = (S.settings && S.settings.goal) || {};
  openModal(`<div class="panel-h"><h2>Objetivo de ahorro</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="gForm" novalidate>
    <label class="f full">Nombre<input type="text" id="gName" value="${esc(g.name || 'Entrada del piso')}"></label>
    <label class="f half">Importe (€)<input type="text" inputmode="decimal" id="gAmt" value="${g.amount ? esc(String(g.amount).replace('.', ',')) : ''}" required placeholder="40.000"></label>
    <label class="f half">Fecha <span class="hint">opcional</span><input type="date" id="gDate" value="${esc(g.date || '')}"></label>
    ${(() => { const c = S.settings && S.settings.cushion; return `<label class="f half">Tu gasto al mes (€) <span class="hint">para el colchón${c && +c.spend > 0 ? ` · ahora ${eur(+c.spend, 0)}` : ''}</span><input type="text" inputmode="decimal" id="gSpend" value="" placeholder="p. ej. 1.200"></label><label class="f half">Meses de colchón<input type="text" inputmode="decimal" id="gMonths" value="${esc(String((c && +c.months) || 6))}"></label>`; })()}
    <p class="note full">Cuenta tu efectivo menos el colchón (gasto × meses), que no se toca.</p>
    <div class="err full" id="gErr"></div>
    <div class="form-actions full">${g.amount ? '<button class="btn danger" type="button" id="gDel">Quitar objetivo</button>' : ''}<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`, () => {
    const del = $('#gDel'); if (del) del.addEventListener('click', async () => { try { await saveSettings({ goal: null }); closeModal(); toast('Objetivo quitado.'); } catch (e) { $('#gErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); } });
    $('#gForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const amt = parseNum($('#gAmt').value); const d = $('#gDate').value;
      if (!Number.isFinite(amt) || amt <= 0) return ($('#gErr').textContent = 'Indica un importe positivo.');
      if (d && d <= todayStr()) return ($('#gErr').textContent = 'La fecha tiene que ser futura.');
      const sp = parseNum($('#gSpend').value), mo = parseNum($('#gMonths').value); const cu0 = (S.settings && S.settings.cushion) || {};
      try { await saveSettings(Object.assign({ goal: { name: $('#gName').value.trim() || 'Objetivo', amount: +amt.toFixed(2), date: d || null } }, sp > 0 ? { cushion: Object.assign({}, cu0, { spend: +sp.toFixed(2), months: mo > 0 ? mo : +cu0.months || 6, amount: null }) } : {})); closeModal(); toast('Objetivo guardado.'); }
      catch (e) { $('#gErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); }
    });
  });
}
async function saveCashMoves(c, mvList) {
  const mv = {}; for (const m of mvList) mv[m.id] = { d: m.d, a: +m.a.toFixed(2), t: m.t, n: m.n || '' };
  const tmp = Object.assign({}, c, { mv }); delete tmp.h; delete tmp.id;
  const bal = cashBal(tmp); const last = mvList.reduce((x, m) => (m.d > x ? m.d : x), '');
  await save('cash', c.id, Object.assign(tmp, { balance: +bal.toFixed(2), updated: last || todayStr() }));
}
/** Adds one movement with a merge-write, so two devices adding movements at the same time never overwrite each other. */
async function addCashMove(c, mvList, id) {
  if (!db || DEMO) return saveCashMoves(c, mvList);
  const m = mvList.find((z) => z.id === id); const tmp = { mv: Object.fromEntries(mvList.map((z) => [z.id, z])) };
  const bal = cashBal(Object.assign({}, c, tmp));
  await retry1(() => db.collection('cash').doc(c.id).update({ mv: { [id]: { d: m.d, a: +(+m.a).toFixed(2), t: m.t, n: m.n || '' } }, balance: +bal.toFixed(2), updated: todayStr() }));
}
function patrimony() { const inv = res ? res.totals.value : 0, cash = cashTotal(); return { inv, cash, total: inv + cash }; }
function classAlloc() {
  const m = {};
  if (res) for (const p of res.positions) if (p.open && p.value > 0) { const k = clsOf(p.asset); m[k] = (m[k] || 0) + p.value; }
  const c = cashTotal(); if (c > 0) m.cash = (m.cash || 0) + c;
  const tot = Object.values(m).reduce((s, v) => s + v, 0);
  return CLASSES.filter(([k]) => m[k] > 0).map(([k, l]) => ({ key: k, label: l, value: m[k], weight: tot ? m[k] / tot : 0, color: clsColor(k) }));
}
function ytdInfo() {
  if (!res || !res.series.length) return null;
  const y0 = res.totals.today.slice(0, 4) + '-01-01';
  const st = E.periodStats(res, y0 <= res.totals.firstDate ? null : y0);
  const S2 = res.series; const i = S2.findIndex((p) => p.date >= y0); const base = i > 0 ? S2[i - 1] : { invested: 0 };
  return st ? { pnl: st.pnl, twr: st.twr, invested: S2[S2.length - 1].invested - base.invested } : null;
}

