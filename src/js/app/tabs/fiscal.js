/* ---------- Fiscal ---------- */
const TRAMOS = [[6000, 0.19], [50000, 0.21], [200000, 0.23], [300000, 0.27], [Infinity, 0.30]];
function cuota(base) { let rest = Math.max(0, base), prev = 0, tax = 0; for (const [lim, r] of TRAMOS) { const chunk = Math.min(rest, lim - prev); if (chunk <= 0) break; tax += chunk * r; rest -= chunk; prev = lim; } return tax; }
// Renta Web sections for capital gains (by asset type)
const FGROUPS = [
  { k: 'fund', name: 'Fondos de inversión (IIC)', rw: 'Transmisión de acciones o participaciones de instituciones de inversión colectiva', t: ['fund'] },
  { k: 'listed', name: 'Acciones y ETF admitidos a negociación', rw: 'Transmisión de acciones admitidas a negociación', t: ['stock', 'etf'] },
  { k: 'crypto', name: 'Monedas virtuales', rw: 'Transmisión de monedas virtuales', t: ['crypto'] },
  { k: 'other', name: 'Otros elementos patrimoniales', rw: 'Transmisión de otros elementos patrimoniales', t: null },
];
const fgroupOf = (a) => FGROUPS.find((g) => g.t && a && g.t.includes(a.type)) || FGROUPS[3];
function fiscalGroups(y) {
  const sales = res.realized.filter((s) => String(s.year) === String(y));
  return FGROUPS.map((g) => { const ss = sales.filter((s) => fgroupOf(assetById(s.assetId)) === g); return { g, sales: ss, proceeds: ss.reduce((t, s) => t + s.proceeds, 0), cost: ss.reduce((t, s) => t + s.cost, 0), gain: ss.reduce((t, s) => t + s.gain, 0) }; }).filter((x) => x.sales.length);
}
/** Deferred losses (repurchase rule) integrated in year y, one row per origin sale and releasing sale. */
function fiscalReleased(y) {
  const m = new Map();
  for (const s of res.realized.filter((z) => String(z.year) === String(y))) for (const r of s.released || []) { const k = r.fromId + '|' + s.id; const o = m.get(k) || { ...r, amount: 0, byDate: s.date, byAssetId: s.assetId }; o.amount += r.amount; m.set(k, o); }
  return [...m.values()].filter((r) => Math.abs(r.amount) >= 0.005);
}
function fiscalCalc(y) {
  const f = res.fiscal[y];
  const rcm = f.dividendsGross + f.interestGross;
  const g = f.gains + f.losses - f.flaggedLoss + f.deferredReleased;
  let base, carry = 0;
  if (g >= 0) base = rcm + g; else { const off = Math.min(-g, 0.25 * rcm); base = rcm - off; carry = g + off; }
  return { f, rcm, g, base, carry, tax: cuota(base), wh: f.withholding + f.interestWithholding };
}
/** Interest that remunerated cash accounts should have paid in year y (full months only, lower balance of each month), when no interest is recorded. */
/** FIFO buys of a sale; long lists (many small crypto buys) fold after the first 4. */
function lotsList(lots, dq) { const li = (l) => `${fdate(l.buyDate)}: ${qn(l.qty, dq)} · ${eur(l.cost)}`; return lots.length <= 6 ? lots.map(li).join('<br>') : `${lots.slice(0, 4).map(li).join('<br>')}<details class="lots-more"><summary>y ${lots.length - 4} compras más</summary>${lots.slice(4).map(li).join('<br>')}</details>`; }
function interestHints(y) {
  const td = todayStr(); const out = [];
  for (const c of cashList()) {
    const rate = +c.rate || 0; if (!(rate > 0)) continue;
    const pts = cashPts(c); const at = (d) => { let v = 0; for (const [dd, b] of pts) { if (dd <= d) v = b; else break; } return v; };
    let n = 0, months = 0; const done = new Set(cashMoves(c).filter((m) => m.t === 'interest' && String(m.d).startsWith(String(y))).map((m) => m.d.slice(0, 7)));
    for (let m = 1; m <= 12; m++) { const s = `${y}-${String(m).padStart(2, '0')}-01`, e = E.addDays(E.addMonths(s, 1), -1); if (e >= td) break; if (done.has(s.slice(0, 7))) continue; n += Math.max(0, Math.min(at(E.addDays(s, -1)), at(e))) * rate / 100 / 12; months++; }
    n = n >= 100 ? Math.floor(n / 10) * 10 : Math.floor(n);
    if (n >= 5) out.push({ c, n, months });
  }
  return out;
}
const nSales = (n) => `${n} ${n === 1 ? 'venta' : 'ventas'}`;
function vFiscal() {
  if (!res) return emptyState('Sin datos.');
  const years = Array.from(new Set([...Object.keys(res.fiscal)])).sort().reverse();
  if (!years.length) return emptyState('Todavía no hay ventas, dividendos ni intereses: no hay nada que declarar.');
  const y = ui.fiscalYear && years.includes(ui.fiscalYear) ? ui.fiscalYear : years[0];
  const { f, g, base, carry, tax, wh } = fiscalCalc(y);
  const sales = res.realized.filter((s) => String(s.year) === y);
  const groups = fiscalGroups(y); const rel = fiscalReleased(y); const hints = interestHints(y);
  const inc = res.incomeRows.filter((r) => String(r.year) === y);
  const pend = f.deferredPending, isCur = y === todayStr().slice(0, 4);
  const k = [
    kpi('Ganancias', eur(f.gains), nSales(sales.filter((s) => s.gain >= 0).length), 'gain'),
    kpi('Pérdidas', eur(f.losses), f.flaggedLoss ? `${eur(f.flaggedLoss)} diferidas por recompra` : nSales(sales.filter((s) => s.gain < 0).length), f.losses < 0 ? 'loss' : ''),
    kpi('Saldo transmisiones', eurS(g), f.deferredReleased ? `incluye ${eur(f.deferredReleased)} de pérdidas diferidas integradas` : f.flaggedLoss ? 'sin las pérdidas diferidas' : 'ganancias menos pérdidas', cls(g)),
    kpi('Pérdidas diferidas pendientes', eur(pend), pend ? `${isCur ? 'aún no cuentan' : 'al cierre de ' + y} · se aplican al vender lo recomprado` : 'ninguna', pend < 0 ? 'loss' : '', 'Pérdidas que la regla de recompra (art. 33.5 LIRPF) aún no deja computar: se integrarán el año en que vendas los valores homogéneos que compraste.'),
    kpi('Dividendos brutos', eur(f.dividendsGross), `retención ${eur(f.withholding)}`),
    kpi('Intereses brutos', eur(f.interestGross), `retención ${eur(f.interestWithholding)}`),
    kpi('Base del ahorro', eur(base), carry < 0 ? `${eur(carry)} a compensar en 4 años` : 'estimada'),
    kpi('Cuota estimada', eur(tax), `A pagar tras retenciones: ${eur(tax - wh)}`, '', 'Tramos del ahorro: 19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 €, 30 % a partir de ahí'),
  ].join('');
  const blkTxt = (s) => s.blocking && s.blocking.length ? s.blocking.map((p) => `${fdate(p.date)} (${qn(p.qty, 4)} uds.)`).join(', ') : fdate(s.washSaleDate);
  const blkLeft = (s) => (s.blocking || []).reduce((t, p) => t + p.left, 0);
  const chipTitle = (s) => `Valores homogéneos comprados en los ${s.washSaleWindow} meses anteriores o posteriores a esta venta con pérdidas y que siguen en cartera: ${blkTxt(s)}. Según el art. 33.5 LIRPF la pérdida (${eur(s.deferred)}) no se imputa hasta que vendas esos valores${blkLeft(s) < -0.005 ? `; pendiente: ${eur(blkLeft(s))}` : '; ya integrada'}.`;
  const chip = (s) => `<span class="chip warn" role="button" tabindex="0" data-toast="${esc(chipTitle(s).replace(/<[^>]+>/g, ''))}" title="${esc(chipTitle(s).replace(/<[^>]+>/g, ''))}">Regla ${s.washSaleWindow === 12 ? '1 año' : '2 meses'}</span>`;
  const relOf = (s) => (s.released || []).length ? `<div class="small muted">Integra pérdidas diferidas: ${eur(s.released.reduce((t, r) => t + r.amount, 0))}</div>` : '';
  const card = (s) => { const a = assetById(s.assetId); return `<details class="mcard"><summary><div class="mrow"><div><div class="l1"><span class="sw" style="background:${a ? acolor(a.id) : 'var(--s9)'}"></span><span class="tk">${a ? esc(a.ticker || a.name) : '—'}</span>${s.washSale ? ` <span class="chip warn">Regla ${s.washSaleWindow === 12 ? '1 año' : '2 meses'}</span>` : ''}</div><div class="l2">${fdate(s.date)} · ${qn(s.qty, 8)} uds.</div></div><div><div class="r1 ${cls(s.gain)}">${eurS(s.gain)}</div></div></div></summary><div class="mc-body"><div class="mc-grid"><div><span>Transmisión</span><span>${eur(s.proceeds)}</span></div><div><span>Adquisición</span><span>${eur(s.cost)}</span></div>${a && a.isin ? `<div style="grid-column:1/-1"><span>ISIN</span><span>${esc(a.isin)}</span></div>` : ''}</div><div class="small muted">Compras asociadas (FIFO):<br>${lotsList(s.lots, 8)}</div>${s.washSale ? `<div class="small muted">${esc(chipTitle(s).replace(/<[^>]+>/g, ''))}</div>` : ''}${relOf(s)}</div></details>`; };
  const row = (s) => { const a = assetById(s.assetId); return `<tr><td class="num">${fdate(s.date)}</td><td>${a ? `<span class="sw" style="background:${acolor(a.id)}"></span>${esc(a.ticker || a.name)}${a.isin ? `<div class="small muted">${esc(a.isin)}</div>` : ''}` : '—'}</td><td class="n">${qn(s.qty, 6)}</td><td class="n">${eur(s.proceeds)}</td><td class="n">${eur(s.cost)}</td><td class="n ${cls(s.gain)}"><b>${eurS(s.gain)}</b></td><td class="small muted" style="white-space:normal">${lotsList(s.lots, 6)}${relOf(s)}</td><td>${s.washSale ? chip(s) : ''}</td></tr>`; };
  const gh = (x) => `${esc(x.g.name)} · ${nSales(x.sales.length)}`;
  const relName = (r) => { const a = assetById(r.fromAssetId); return a ? esc(a.ticker || a.name) : '—'; };
  return `
  <div class="panel-h"><h2>Declaración de la renta · ejercicio ${y}</h2><button class="btn small" type="button" data-fiscal-csv="${y}" ${downloads ? '' : 'disabled'}>Descargar informe ${y}</button><div class="seg" role="group" aria-label="Ejercicio">${years.map((yy) => `<button type="button" data-fy="${yy}" aria-pressed="${yy === y}">${yy}</button>`).join('')}</div></div>
  ${hints.map((h) => `<div class="banner"><div><b>Intereses sin registrar.</b> Tu cuenta ${h.c.name ? '«' + esc(h.c.name) + '»' : 'de efectivo'} debería haber generado ~${eur(h.n, 0)} de intereses${isCur ? ` hasta ${['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][h.months]}` : ` en ${y}`}; regístralos para que cuenten en la base del ahorro.</div></div>`).join('')}
  <section class="kpis k4">${k}</section>
  <section class="panel"><div class="panel-h"><h2>Ganancias y pérdidas patrimoniales</h2><span class="small muted">FIFO · comisiones incluidas en valores de adquisición y transmisión</span></div>
  ${sales.length ? `<div class="mlist">${groups.map((x) => `<div class="mmonth">${gh(x)}</div><div class="small muted">Renta Web: ${esc(x.g.rw)}</div>${x.sales.map(card).join('')}<div class="mrow fgs"><div><div class="l1">Subtotal</div><div class="l2">transmisión ${eur(x.proceeds)}<br>adquisición ${eur(x.cost)}</div></div><div><div class="r1 ${cls(x.gain)}">${eurS(x.gain)}</div></div></div>`).join('')}</div><div class="tbl-wrap only-desk"><table><thead><tr><th>Fecha venta</th><th>Activo</th><th class="n">Cantidad</th><th class="n">V. transmisión</th><th class="n">V. adquisición</th><th class="n">Resultado</th><th>Compras asociadas (FIFO)</th><th></th></tr></thead>
  ${groups.map((x) => `<tbody><tr class="fgh"><td colspan="8"><b>${gh(x)}</b> <span class="small muted">· Renta Web: ${esc(x.g.rw)}</span></td></tr>${x.sales.map(row).join('')}<tr class="fgs"><td colspan="3">Subtotal ${esc(x.g.name)}</td><td class="n">${eur(x.proceeds)}</td><td class="n">${eur(x.cost)}</td><td class="n ${cls(x.gain)}">${eurS(x.gain)}</td><td colspan="2"></td></tr></tbody>`).join('')}
  </table></div>` : '<p class="muted">Sin ventas en este ejercicio.</p>'}
  ${rel.length ? `<h3 class="fsub">Pérdidas diferidas integradas en ${y}</h3><p class="small muted">Pérdidas que la regla de recompra bloqueó en su día y que se integran ahora porque has vendido los valores homogéneos que las bloqueaban.</p><div class="tbl-wrap"><table><thead><tr><th>Venta de origen</th><th>Activo</th><th class="n">Pérdida original</th><th>Se integra al vender</th><th class="n">Integrada</th></tr></thead><tbody>${rel.map((r) => `<tr><td class="num">${fdate(r.fromDate)}</td><td>${relName(r)}</td><td class="n loss">${eurS(r.fromGain)}</td><td>${fdate(r.byDate)} · ${esc((assetById(r.byAssetId) || {}).ticker || '')}</td><td class="n loss"><b>${eurS(r.amount)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>
  <section class="panel"><div class="panel-h"><h2>Rendimientos del capital mobiliario</h2></div>
  ${inc.length ? `<div class="mlist">${inc.map((r) => { const a = assetById(r.assetId); return `<div class="mrow"><div><div class="l1"><span class="chip inc">${TXT[r.type]}</span><span class="tk">${a ? esc(a.ticker || a.name) : ''}</span></div><div class="l2">${fdate(r.date)} · retención ${eur(r.withholding)}</div></div><div><div class="r1">${eur(r.gross)}</div><div class="r2 muted">neto ${eur(r.net)}</div></div></div>`; }).join('')}</div><div class="tbl-wrap only-desk"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Activo</th><th class="n">Bruto</th><th class="n">Retención</th><th class="n">Neto</th></tr></thead><tbody>${inc.map((r) => { const a = assetById(r.assetId); return `<tr><td class="num">${fdate(r.date)}</td><td><span class="chip inc">${TXT[r.type]}</span></td><td>${a ? esc(a.ticker || a.name) : '—'}</td><td class="n">${eur(r.gross)}</td><td class="n">${eur(r.withholding)}</td><td class="n">${eur(r.net)}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Sin dividendos ni intereses en este ejercicio.</p>'}
  </section>
  <p class="note">Estimación orientativa para preparar el borrador, no asesoramiento fiscal. No incluye saldos negativos de ejercicios anteriores ni el límite de deducción por doble imposición internacional de las retenciones en origen. Los traspasos entre fondos registrados como Traspaso no tributan; su coste y su antigüedad pasan al fondo de destino. Revisa con el borrador de la AEAT o con un asesor.</p>`;
}

