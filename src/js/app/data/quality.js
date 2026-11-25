/* ================= Data quality: buys vs NAV of their date, price task health, extra checks ================= */
const VL_TOL = 0.001; // fund NAVs come with 2–4 decimals: below 0.1 % it is rounding
/** Price equals the NAV of the previous NAV day: the order ran overnight and the date is the one of the bank email. Not an error. */
function vlDayBefore(aId, date, p) { const m = (S.navs[aId] || {}).m || {}; const pd = Object.keys(m).filter((d) => d < date).sort().pop(); return !!(pd && p > 0 && Math.abs(+m[pd] / p - 1) <= 5e-4); }
/** Fund buys whose price is not the NAV of their own date (only when navs/* has that exact date). */
function vlIssues() {
  if (DEMO || !res) return [];
  const out = [];
  for (const [id, x] of Object.entries(S.txs)) {
    if (x.type !== 'buy') continue; const a = S.assets[x.assetId]; if (!a || a.type !== 'fund') continue;
    const m = (S.navs[a.id] || {}).m || {}; const v = +m[x.date], p = +x.price, q = +x.qty;
    if (!(v > 0) || !(p > 0) || !(q > 0) || Math.abs(p / v - 1) <= VL_TOL || (x.vlOk != null && +x.vlOk === p) || vlDayBefore(a.id, x.date, p)) continue;
    const pd = Object.keys(m).filter((d) => d < x.date).sort().pop(); const prev = pd && Math.abs(+m[pd] / p - 1) <= 5e-4 ? pd : null;
    const qN = +(q * p / v).toFixed(6); const o = Object.assign({}, x, { qty: qN, price: v }); delete o.id; delete o.vlOk; // same amount invested, at the NAV
    const why = qN < q && unbackedSell([a.id], id, o) ? 'dejaría sin respaldo una venta posterior: corrígela a mano' : null;
    out.push({ id, x, a, v, d: p / v - 1, prev, qN, o, why });
  }
  return out.sort((A, B) => (A.x.date < B.x.date ? 1 : A.x.date > B.x.date ? -1 : 0));
}
function vlReviewPanel() {
  const L0 = vlIssues(); if (!L0.length) return '';
  const nf = L0.filter((r) => !r.why).length; const dp = (v) => (v >= 100 ? 2 : 4);
  return `<style>.vlrev{margin:0 0 12px;padding:9px 12px;border-radius:var(--r);background:var(--warn-bg)}.vlrev>summary{cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}.vlrev ul{list-style:none;margin:8px 0 0;padding:0}.vlrev li{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 12px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--warn) 20%,transparent);font-size:13px}.vlrev li .rowact{display:flex;gap:6px;flex-wrap:wrap}</style>
  <details class="vlrev"${ui.vlrevOpen ? ' open' : ''}><summary><span class="chip warn">Revisar compras · ${L0.length}</span><span class="small">${L0.length === 1 ? 'Una compra de fondo lleva' : `${L0.length} compras de fondos llevan`} un precio distinto del VL de su fecha</span></summary>
  <p class="note" style="margin:8px 0 0">${esc((L0[0].a.broker) || 'Tu banco')} ejecuta cada orden al VL del día de la orden. «Corregir» pone ese VL y recalcula las participaciones con el mismo importe invertido; la versión anterior va a la papelera. «Dejar así» la da por buena (p. ej. si viene de un traspaso).</p>
  <ul>${L0.map((r) => `<li><div><b>${esc(r.a.ticker || r.a.name)}</b> · ${fdate(r.x.date, { year: undefined })} · <span class="num">${qn(+r.x.qty, 6)} × ${money(+r.x.price, r.a.currency, 4)}</span> <span class="muted">(${eur(+r.x.qty * +r.x.price)})</span><br><span class="small">VL de ese día <b class="num">${money(r.v, r.a.currency, dp(r.v))}</b> · tu precio difiere un <b class="num">${pctS(r.d, 1)}</b>${r.prev ? ` · es el VL del ${fdate(r.prev, { year: undefined })}` : ''}</span></div><div class="rowact">${r.why ? `<span class="small muted">${esc(r.why)}</span>` : `<button class="btn small primary" type="button" data-vlfix="${esc(r.id)}">Corregir</button>`}<button class="btn small" type="button" data-vlok="${esc(r.id)}">Dejar así</button></div></li>`).join('')}</ul>
  ${nf > 1 ? `<div class="toolbar" style="margin-top:8px"><button class="btn small" type="button" data-vlfix="*">Corregir las ${nf}</button></div>` : ''}</details>`;
}
async function vlAct(b) {
  const fix = b.dataset.vlfix != null; const key = fix ? b.dataset.vlfix : b.dataset.vlok; const L0 = vlIssues();
  const list = key === '*' ? L0.filter((r) => !r.why) : L0.filter((r) => r.id === key && !(fix && r.why)); if (!list.length) return;
  if (fix && b.dataset.armed !== '1') { const lbl = b.textContent, r = list[0]; b.dataset.armed = '1'; b.textContent = list.length === 1 ? `¿Pasar a ${numf(r.qN, 6)} × ${money(r.v, r.a.currency, 4)}?` : `¿Corregir ${list.length} compras?`; setTimeout(() => { if (b.isConnected && b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = lbl; } }, 5000); return; }
  b.disabled = true; const tids = [];
  try {
    if (list.length > 1) await maybeSnapshot(true);
    for (const r of list) { const cur = S.txs[r.id]; const tid = await toTrash('tx', r.id, cur, 'edición'); if (tid) tids.push(tid); const o = fix ? r.o : Object.assign({}, cur, { vlOk: +cur.price }); delete o.id; await save('txs', r.id, o); }
    const r = list[0];
    toast(!fix ? 'Compra dada por buena.' : list.length === 1 ? `Compra de ${r.a.ticker || r.a.name} corregida: ${numf(r.qN, 6)} × ${money(r.v, r.a.currency, 4)}.` : `${list.length} compras corregidas al VL de su fecha.`, 7000, tids.length ? { label: 'Deshacer', fn: async () => { try { for (const t of tids) await restoreTrash(t, true); toast(list.length === 1 ? 'Compra restaurada.' : `${list.length} compras restauradas.`); } catch (e) { toast('No se pudo deshacer: ' + (e.message || e.code)); } } } : null);
  } catch (e) { b.disabled = false; toast('No se pudo guardar: ' + (e.message || e.code)); }
}
document.addEventListener('click', (ev) => { const b = ev.target.closest && ev.target.closest('[data-vlfix],[data-vlok]'); if (b) vlAct(b); });
document.addEventListener('toggle', (ev) => { if (ev.target.classList && ev.target.classList.contains('vlrev')) ui.vlrevOpen = ev.target.open; }, true);

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
  const at = h.run ? `${fdate(new Date(h.run).toLocaleDateString('sv-SE'), { year: undefined })} a las ${new Date(h.run).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (${ago(Date.parse(h.run))})` : '';
  const old = stale && stale.length ? ` <b style="color:var(--warn)">Precios antiguos:</b> ${stale.map((p) => `${esc(p.asset.ticker || p.asset.name)} (${fdate(p.priceDate, { year: undefined })})`).join(', ')}.` : '';
  return `<details class="stale-chip"${ui.staleOpen ? ' open' : ''}><summary><span class="chip warn">Precios sin actualizar desde el ${fdate(h.last, { year: undefined })}</span></summary><div class="stale-body"><b style="color:var(--warn)">${h.missed ? 'La actualización diaria de precios no ha llegado.' : 'La actualización de precios no ha traído precios nuevos.'}</b> El precio más reciente es del ${fdate(h.last, { year: undefined })} (hace ${h.lag} días hábiles)${h.run ? `; la tarea se ejecutó por última vez el ${at}` : '; no consta ninguna ejecución de la tarea'}.${h.missed ? '' : ' Puede que la fuente vaya con retraso o que haya sido festivo.'} <b>Qué hacer:</b> pulsa «Actualizar precios». Si mañana sigue igual, revisa en claude.ai/code que la tarea programada «Cartera · actualizar precios» siga activa y con permiso. Mientras, el patrimonio se calcula con esos precios.${old}</div></details>`;
}
/** Close-out of a leftover («Cerrar resto»): it has no cash income, so it does not count in the sales/cash check. */
function isDustSale(r) { const x = S.txs[r.id] || {}; return x.note === 'Cierre de resto' || (r.proceeds < 5 && !x.cashMv); }
/** Backup NAV doc merged with the current one: NAVs from both, current fields when they are newer. */
function mergeNavDoc(n, cur) {
  const o = Object.assign({}, n); delete o.id; if (!cur) return o;
  const newer = (cur.navDate || '') > (n.navDate || '') || (cur.checked || '') > (n.checked || '');
  const r = newer ? Object.assign(o, cur) : o; delete r.id; r.m = Object.assign({}, n.m, cur.m); return r;
}
/** Soft checks before saving an operation; the user confirms by pressing again. Returns [{ k, msg }]. */
function txSoftWarn(o, tx, amtIn) {
  const a = assetById(o.assetId); const tk = a ? esc(a.ticker || a.name) : ''; const W = { 0: 'domingo', 6: 'sábado' };
  const dow = new Date(o.date + 'T00:00:00Z').getUTCDay(); const isT = o.type === 'buy' || o.type === 'sell';
  const amt = (z) => (z.type === 'buy' || z.type === 'sell' ? +z.qty * +z.price : z.type === 'transfer' ? +z.qty : +z.amount) || 0;
  const out = [];
  if (a && a.type === 'fund' && (isT || o.type === 'transfer') && W[dow] && !(tx && tx.date === o.date)) { let n = o.date; do n = E.addDays(n, 1); while ([0, 6].includes(new Date(n + 'T00:00:00Z').getUTCDay()));
    out.push({ k: 'wk|' + o.date, msg: `El ${fdate(o.date)} es ${W[dow]}: los fondos no tienen VL en fin de semana y la orden se ejecuta el ${fdate(n, { year: undefined })} a su VL. Pon esa fecha si es la de la operación en tu banco.` }); }
  if (isT && amtIn > 0) { const fx = o.fx || (a && a.currency !== 'EUR' ? fxFor(a.currency, o.date) : 1) || 1; const tot = o.qty * o.price * fx + (o.type === 'buy' ? o.fees : -o.fees);
    if (Math.abs(tot - amtIn) > Math.max(0.05, amtIn * 0.005)) out.push({ k: `amt|${o.qty}|${o.price}|${amtIn}`, msg: `Cantidad × precio da ${eur(tot)}, pero el importe dice ${eur(amtIn)}. Revisa la cantidad o el precio.` }); }
  if (o.type === 'buy' && a) { const prevB = Object.values(S.txs).filter((z) => z.type === 'buy' && z.assetId === o.assetId && (!tx || z.id !== tx.id)).sort((p, q) => (p.date < q.date ? 1 : -1)).slice(0, 12).map(amt).filter((v) => v > 0).sort((p, q) => p - q);
    const med = prevB.length >= 3 ? prevB[Math.floor(prevB.length / 2)] : 0; const tot = o.qty * o.price;
    if (med > 0 && tot > 10 * med && !(tx && Math.abs(amt(tx) - tot) < 0.01)) out.push({ k: `big|${o.qty}|${o.price}`, msg: `Esta compra suma ${money(tot, a.currency)}, más de 10 veces tu compra habitual de ${tk} (${money(med, a.currency)}). Comprueba la cantidad y el precio.` }); }
  if (isT && a && a.type === 'fund') { const n = navOn(a.id, o.date); if (n && n.known && o.price > 0 && Math.abs(n.v / o.price - 1) > 0.01 && !vlDayBefore(a.id, o.date, o.price) && !(tx && +tx.price === o.price && tx.date === o.date)) out.push({ k: `vl|${o.date}|${o.price}`, msg: `El precio no es el VL del ${fdate(n.d, { year: undefined })} (${money(n.v, a.currency, 4)}): pulsa «usar» para ponerlo.` }); }
  { const mine = amt(o); const dup = Object.entries(S.txs).find(([id, z]) => (!tx || id !== tx.id) && z.type === o.type && z.date === o.date && (z.assetId || null) === (o.assetId || null) && Math.abs(amt(z) - mine) <= Math.max(0.5, mine * 0.01));
    if (dup) out.push({ k: 'dup|' + dup[0], msg: `Ya tienes ${o.type === 'buy' ? 'una compra' : o.type === 'sell' ? 'una venta' : `un${['transfer', 'dividend', 'interest', 'split'].includes(o.type) ? '' : 'a'} ${(TXT[o.type] || '').toLowerCase()}`}${tk ? ` de ${tk}` : ''} el ${fdate(o.date, { year: undefined })} por ${o.type === 'transfer' ? `${qn(amt(dup[1]), 6)} participaciones` : money(amt(dup[1]), a ? a.currency : 'EUR')}: puede estar repetida.` }); }
  return out;
}

