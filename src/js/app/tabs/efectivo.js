/* ---------- Efectivo ---------- */
function vEfectivo() {
  const list = cashList(); const tot = cashTotal(); const P = patrimony(); const r = cashRate();
    const acc = (c) => {
    const mv = cashMoves(c).slice().reverse(); const bal = cashBal(c);
    return `<section class="panel cash-acc">
      <div class="panel-h"><div><h2>${esc(c.name)}</h2><span class="small muted">${esc(c.entity || '')}${ok(+c.rate) && +c.rate ? ` · TAE ${pct(+c.rate / 100, 2)} · ~${eur(bal * c.rate / 100, 0)}/año` : ''}${c.note ? ' · ' + esc(c.note) : ''}</span></div>
        <div class="cash-bal num">${eur(bal)}</div></div>
      <div class="toolbar">
        <button class="btn primary small" type="button" data-mv="in" data-acc="${esc(c.id)}">+ Ingreso</button>
        <button class="btn small" type="button" data-mv="out" data-acc="${esc(c.id)}">− Retirada</button>
        <button class="btn small" type="button" data-mv="interest" data-acc="${esc(c.id)}">Intereses</button>
        <button class="btn ghost small" type="button" data-mv="adjust" data-acc="${esc(c.id)}">Ajustar saldo</button>
        <span style="flex:1"></span>
        <button class="btn ghost small" type="button" data-edit-cash="${esc(c.id)}">Editar</button><button class="btn ghost small danger" type="button" data-del-cash="${esc(c.id)}">Borrar</button>
      </div>
      <details ${mv.length <= 6 ? 'open' : ''}><summary>${mv.length} movimiento${mv.length === 1 ? '' : 's'}</summary>
        <div class="mlist">${mv.map((m) => `<div class="mrow"><div><div class="l1"><span class="chip ${m.a >= 0 ? 'inc' : 'sell'}">${MV_TYPES[m.t] || m.t}</span><span class="small muted" style="font-weight:500">${fdate(m.d)}</span></div>${m.n ? `<div class="l2">${esc(m.n)}</div>` : ''}</div><div style="display:flex;align-items:center;gap:6px"><span class="r1 ${m.t === 'open' ? '' : cls(m.a)}">${m.t === 'open' ? eur(m.a) : eurS(m.a)}</span>${String(m.id).match(/^h|^b$/) ? '' : `<button class="btn ghost small danger" type="button" data-mv-del="${esc(m.id)}" data-acc="${esc(c.id)}" aria-label="Borrar">✕</button>`}</div></div>`).join('')}</div>
        <div class="tbl-wrap only-desk"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th class="n">Importe</th><th></th></tr></thead><tbody>
        ${mv.map((m) => `<tr><td class="num">${fdate(m.d)}</td><td><span class="chip ${m.a >= 0 ? 'inc' : 'sell'}">${MV_TYPES[m.t] || m.t}</span></td><td class="small muted" style="white-space:normal">${esc(m.n)}</td><td class="n ${m.t === 'open' ? '' : cls(m.a)}">${m.t === 'open' ? eur(m.a) : eurS(m.a)}</td><td>${String(m.id).match(/^h|^b$/) ? '' : `<button class="btn ghost small danger" type="button" data-mv-del="${esc(m.id)}" data-acc="${esc(c.id)}">Borrar</button>`}</td></tr>`).join('')}
        </tbody></table></div></details>
    </section>`;
  };
  return `
  ${saleCashCheck()}
  <div class="panel-h"><div><h2>Efectivo</h2><span class="small muted">${list.length} cuenta${list.length === 1 ? '' : 's'} · ${eur(tot, 0)} · ${pct(P.total ? tot / P.total : 0, 0)} del patrimonio · TAE media ${pct(r, 2)} (~${eur(tot * r, 0)}/año)</span></div><button class="btn primary" type="button" data-act="add-cash">Añadir cuenta</button></div>
  ${list.length ? list.map(acc).join('') : '<section class="panel empty">Sin cuentas de efectivo.</section>'}
  ${list.length ? `<section class="panel"><div class="panel-h"><h2>Evolución del efectivo</h2></div><div class="chart sm"><canvas id="cCash" role="img" aria-label="Evolución del efectivo"></canvas></div></section>` : ''}
`;
}
/** Net proceeds of recent sales (last 90 days, and only since sales started being recorded as cash income) against that income: linked to the sale or labelled «Venta…». */
function saleCashCheck() {
  if (!res || DEMO) return '';
  const linked = new Set(Object.values(S.txs).filter((x) => x.cashMv).map((x) => x.cashMv.mv));
  const mvs = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.a > 0 && (linked.has(m.id) || /^venta\b/i.test(m.n || '')));
  if (!mvs.length) return ''; // sales are not being recorded as cash income: nothing to compare
  const first = mvs.reduce((m, x) => (x.d < m ? x.d : m), mvs[0].d); const lim = E.addDays(todayStr(), -90); const from = E.addDays(first, -5) > lim ? E.addDays(first, -5) : lim;
  const sales = res.realized.filter((r) => r.date >= from && !isDustSale(r)); if (!sales.length) return '';
  const got = sales.reduce((t, r) => t + r.proceeds, 0);
  const adj = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'adjust' && m.d >= from).reduce((t, m) => t + m.a, 0);
  const inc = mvs.filter((m) => m.d >= from).reduce((t, m) => t + m.a, 0) + adj;
  const d = inc - got; if (Math.abs(d) < 1) return '';
  return `<div class="banner"><div><b>Ventas y efectivo no cuadran:</b> desde el ${fdate(from)} tus ventas dejaron <b class="num">${eur(got)}</b> netos y en Efectivo hay <b class="num">${eur(inc)}</b> entre ingresos por ventas (concepto «Venta…») y ajustes de saldo: <b class="num">${eurS(d)}</b>. Mira el saldo real de tu cuenta y, si no coincide, corrígelo con «Ajustar saldo»: el ajuste cuenta y este aviso desaparece.</div></div>`;
}
vEfectivo.after = function () {
  const list = cashList(); if (!list.length) return;
  const dates = Array.from(new Set(list.flatMap((c) => cashPts(c).map((p) => p[0])))).sort(); if (!dates.includes(todayStr())) dates.push(todayStr());
  const ds = list.map((c, i) => { const pts = cashPts(c); const col = cssv(['--s7', '--s6', '--s5', '--s3', '--s4'][i] || '--s9'); return { label: c.name, data: dates.map((d) => { let v = 0; for (const [dd, b] of pts) { if (dd <= d) v = b; else break; } return v; }), borderColor: col, backgroundColor: alpha(col, darkUI() ? .34 : .25), fill: i ? '-1' : 'origin', stepped: true, stack: 'c' }; });
  mkLine($('#cCash'), dates, ds, { stacked: true, suggestedMin: 0 });
};
function openCashForm(c) {
  if (DEMO && dbState !== 'ready' && dbState !== 'none') return toast('La cartera de ejemplo no se puede editar.');
  const x = Object.assign({ name: '', entity: '', rate: '' }, c || {});
  const first = new Date(); first.setMonth(0, 1);
  openModal(`<div class="panel-h"><h2>${c ? 'Editar cuenta' : 'Nueva cuenta de efectivo'}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="cForm" novalidate>
    <label class="f">Nombre<input type="text" id="cName" value="${esc(x.name)}" placeholder="Cuenta remunerada" required></label>
    <label class="f">Entidad<input type="text" id="cEnt" value="${esc(x.entity || '')}" placeholder="Trade Republic" list="banks"><datalist id="banks"><option>Trade Republic</option><option>MyInvestor</option><option>DeGiro</option><option>ING</option><option>Revolut</option></datalist></label>
    ${c ? '' : `<label class="f">Saldo inicial (€)<input type="text" inputmode="decimal" id="cBal" required placeholder="0"></label>
    <label class="f">Fecha de ese saldo <span class="hint">desde cuándo cuenta en el gráfico</span><input type="date" id="cDate" value="${first.toLocaleDateString('sv-SE')}"></label>`}
    <label class="f">TAE (%) <span class="hint">0 si no está remunerada</span><input type="text" inputmode="decimal" id="cRate" value="${esc(x.rate)}" placeholder="2,00"></label>
    <label class="f">Nota<input type="text" id="cNote" value="${esc(x.note || '')}" placeholder="Fondo de emergencia…"></label>
    <div class="err full" id="cErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">${c ? 'Guardar' : 'Crear cuenta'}</button></div>
  </form>`, () => {
    $('#cForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const rate = parseNum($('#cRate').value);
      if (!$('#cName').value.trim()) return ($('#cErr').textContent = 'Ponle un nombre.');
      const meta = { name: $('#cName').value.trim(), entity: $('#cEnt').value.trim(), rate: Number.isFinite(rate) ? rate : 0, note: $('#cNote').value.trim() };
      try {
        if (c) { await saveCashMoves(Object.assign({}, c, meta), cashMoves(c)); }
        else {
          const bal = parseNum($('#cBal').value); const d = $('#cDate').value;
          if (!Number.isFinite(bal)) return ($('#cErr').textContent = 'Indica el saldo inicial (puede ser 0).');
          if (!d || d > todayStr()) return ($('#cErr').textContent = 'La fecha no puede ser futura.');
          await saveCashMoves(Object.assign({ id: 'c-' + uid().slice(0, 8), order: Date.now() }, meta), [{ id: 'm' + uid().slice(0, 8), d, a: bal, t: 'open', n: '' }]);
        }
        closeModal(); toast('Cuenta guardada.');
      } catch (e) { $('#cErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); }
    });
  });
}
function openMoveForm(accId, type) {
  const c = S.cash[accId]; if (!c) return toast('La cartera de ejemplo no se puede editar.');
  const bal = cashBal(c);
  const title = { in: 'Ingreso', out: 'Retirada', interest: 'Intereses cobrados', adjust: 'Ajustar saldo' }[type];
  const body = type === 'adjust'
    ? `<label class="f">Saldo real en esa fecha (€) <span class="hint">ahora figuran ${eur(bal)}</span><input type="text" inputmode="decimal" id="mAmt" required></label>`
    : type === 'interest'
      ? `<label class="f half">Importe (€)<input type="text" inputmode="decimal" id="mAmt" required></label><label class="f half">Es lo que…<select id="mKind"><option value="net" selected>me ha llegado (neto)</option><option value="gross">bruto, antes de retención</option></select></label><label class="f half">Retención (€) <span class="hint">19 % habitual</span><input type="text" inputmode="decimal" id="mWh" placeholder="auto 19 %"></label><p class="small muted full" id="mIntHint" style="margin:0"></p>`
      : `<label class="f">Importe (€)${type === 'out' ? ` <span class="hint" id="mBalHint">saldo ${eur(bal)}</span>` : ''}<input type="text" inputmode="decimal" id="mAmt" required></label>`;
  openModal(`<div class="panel-h"><h2>${title} · ${esc(c.name)}</h2><button class="btn ghost" type="button" data-close>Cerrar</button></div>
  <form class="form" id="mForm" novalidate>
    <label class="f">Fecha<input type="date" id="mDate" value="${todayStr()}"></label>
    ${body}
    <label class="f full">Concepto <span class="hint">opcional</span><input type="text" id="mNote" placeholder="${type === 'out' ? 'Compra de fondos, gasto…' : type === 'in' ? 'Nómina, traspaso…' : ''}"></label>
    ${type === 'interest' ? '<p class="note full">Se suma a la cuenta lo que te ha llegado y se apunta el bruto como «Interés» para la Renta.</p>' : ''}
    <div class="err full" id="mErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
  </form>`, () => {
    // interest: from what reached the account (net) or the gross figure, the other one and the 19 % withholding
    const intSplit = (v) => { const whRaw = parseNum(($('#mWh') || {}).value || ''); const net = ($('#mKind') || {}).value !== 'gross';
      if (Number.isFinite(whRaw)) return net ? { gross: +(v + whRaw).toFixed(2), wh: whRaw } : { gross: v, wh: whRaw };
      if (net) { const gross = +(v / 0.81).toFixed(2); return { gross, wh: +(gross - v).toFixed(2) }; } return { gross: v, wh: +(v * 0.19).toFixed(2) }; };
    if (type === 'interest') { const upd = () => { const v = parseNum($('#mAmt').value); const h = $('#mIntHint'); if (!h) return; if (!(v > 0)) { h.textContent = ''; return; } const s = intSplit(v); h.textContent = `Bruto ${eur(s.gross)} · retención ${eur(s.wh)} · entra en la cuenta ${eur(s.gross - s.wh)}`; }; ['mAmt', 'mKind', 'mWh'].forEach((i) => $('#' + i).addEventListener('input', upd)); $('#mKind').addEventListener('change', upd); }
    const balAt = (d) => { let at = 0; for (const [dd, b] of cashPts(c)) { if (dd <= d) at = b; else break; } return at; };
    if (type === 'out') $('#mDate').addEventListener('change', () => { const d = $('#mDate').value; if (d) $('#mBalHint').textContent = `saldo ${eur(balAt(d))}${d < todayStr() ? ' en esa fecha' : ''}`; });
    $('#mForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const d = $('#mDate').value; const v = parseNum($('#mAmt').value); const n = $('#mNote').value.trim();
      if (!d || d > todayStr()) return ($('#mErr').textContent = 'Indica una fecha que no sea futura.');
      if (!Number.isFinite(v) || (type !== 'adjust' && v <= 0)) return ($('#mErr').textContent = 'Indica un importe positivo.');
      if (type === 'out' && v > balAt(d) + 0.005) return ($('#mErr').textContent = `Solo hay ${eur(Math.max(0, balAt(d)))} en la cuenta en esa fecha.`);
      const mv = cashMoves(c);
      const id = 'm' + uid().slice(0, 8);
      if (type === 'adjust') {
        let at = 0; for (const [dd, b] of cashPts(c)) { if (dd <= d) at = b; else break; }
        const diff = v - at; if (Math.abs(diff) < 0.005) { closeModal(); return toast('El saldo ya coincidía.'); }
        mv.push({ id, d, a: diff, t: 'adjust', n: n || `Saldo real ${eur(v)}` });
      } else if (type === 'interest') {
        const { gross, wh } = intSplit(v); const net = +(gross - wh).toFixed(2);
        mv.push({ id, d, a: net, t: 'interest', n: n || `Bruto ${eur(gross)} · retención ${eur(wh)}` });
        try { await save('txs', 'cash-' + id, { type: 'interest', date: d, amount: gross, withholding: wh, note: `Intereses ${c.name}${n ? ' · ' + n : ''}`, created: new Date().toISOString() }); }
        catch (e) { return ($('#mErr').textContent = 'No se pudo guardar el interés (para Fiscal): ' + (e.message || e.code) + '. No se ha apuntado nada; prueba otra vez.'); }
      } else mv.push({ id, d, a: type === 'out' ? -v : v, t: type, n });
      try { await addCashMove(c, mv, id); closeModal(); toast('Movimiento guardado.'); } catch (e) { if (type === 'interest') remove('txs', 'cash-' + id).catch(() => {}); $('#mErr').textContent = 'No se pudo guardar: ' + (e.message || e.code); }
    });
  });
}
async function deleteMove(accId, mvId, btn) {
  const c = S.cash[accId]; if (!c) return;
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = '¿Borrar?'; return; }
  const old = cashMoves(c).find((m) => m.id === mvId);
  const ltx = S.txs['cash-' + mvId]; const txTid = ltx ? await toTrash('tx', 'cash-' + mvId, ltx, 'borrado') : null; // the linked interest operation (Fiscal) goes back with the movement
  const tid = old ? await toTrash('cashmv', mvId, { d: old.d, a: old.a, t: old.t, n: old.n || '' }, 'borrado', txTid ? { acc: accId, txTid } : { acc: accId }) : null;
  const mv = cashMoves(c).filter((m) => m.id !== mvId);
  await saveCashMoves(c, mv);
  if (ltx) await remove('txs', 'cash-' + mvId);
  toast('Movimiento borrado.', 7000, tid ? { label: 'Deshacer', fn: () => restoreTrash(tid) } : null);
}

