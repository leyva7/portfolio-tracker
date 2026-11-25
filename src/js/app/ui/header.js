/* ================= Render: header & banners ================= */
function renderHeader() {
  const t = res && res.totals;
  const P = patrimony();
  $('#heroValue').textContent = t ? eur(P.total) : '—';
  if (window.__motion) __motion.count($('#heroValue'), t ? P.total : null, eur);
  const day = $('#heroDay');
  const ls = t ? lastSession() : null;
  if (ls) { const flat = ls.rows.every((r) => Math.abs(r.chg) < 0.005); day.className = 'pill ' + (flat ? 'flat' : cls(ls.chg)); day.textContent = flat ? `sin cambios · precios del ${sdate(ls.date)}` : `${eurS(ls.chg, 0)} · ${pctS(P.total - ls.chg > 0 ? ls.chg / (P.total - ls.chg) : ls.pct)} · precios del ${sdate(ls.date)}`; day.title = `Variación de la última sesión de cada activo (último cierre frente al anterior), sobre todo tu patrimonio. Sobre lo invertido: ${pctS(ls.pct)}`; day.hidden = false; } else day.hidden = true;
  const hr = $('#heroRes'); const dbWait = DEMO && (dbState === 'pending' || (dbState === 'ready' && !Object.values(loaded).every(Boolean)));
  if (hr) { const on = !!(t && t.firstDate && !dbWait && ok(t.twr)); hr.hidden = !on; const ciT = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest').reduce((q, m) => q + (+m.a || 0), 0); if (on) hr.innerHTML = `<span class="pill ${cls(t.pnl + ciT) || 'flat'}" title="Resultado total, con los intereses del efectivo">${eurS(t.pnl + ciT, 0)}</span> <span class="hr-twr" title="Rentabilidad de tu estrategia (TWR) desde el ${fdate(t.firstDate)}, sin el efecto de cuándo aportaste">rentabilidad <span class="${cls(t.twr)}">${pctS(t.twr, 1)}</span> desde ${fdate(t.firstDate, { day: undefined })}${ok(t.twrAnn) && Date.parse(res.totals.today) - Date.parse(t.firstDate) > 400 * 864e5 ? ` <span class="hr-ann">(≈ ${pctS(t.twrAnn, 0)} al año)</span>` : ''}</span>`; }
  document.body.dataset.tab = ui.tab; const hp = $('#heroPnl'); if (hp) { const ciH = t ? cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest').reduce((q, m) => q + (+m.a || 0), 0) : 0; hp.className = 'num ' + cls(t && t.pnl + ciH); hp.textContent = t && t.firstDate ? eurS(t.pnl + ciH, 0) : ''; }
  { const inv = Math.max(0, P.inv || 0), cash = Math.max(0, P.cash || 0), sum = inv + cash;
    $('#heroSub').innerHTML = t && t.firstDate ? `<span class="hs-from">Resultado total desde el ${fdate(t.firstDate)}${(() => { const u = res.positions.filter((p) => p.open).reduce((s, p) => s + (p.unrealized || 0), 0), rest = t.pnl - u; const ci = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.t === 'interest').reduce((s, m) => s + (+m.a || 0), 0); const parts = [`${eurS(u, 0)} en lo que tienes`].concat(Math.abs(rest) >= 1 ? [`${eurS(rest, 0)} de lo vendido y rentas`] : [], ci >= 1 ? [`${eurS(ci, 0)} de intereses del efectivo`] : []); return parts.length > 1 ? `: ${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : ''; })()}</span><div class="hs-alloc">${sum > 0 ? `<div class="hs-bar" aria-hidden="true"><i style="flex:${(inv / sum).toFixed(4)} 1 0"></i><i style="flex:${(cash / sum).toFixed(4)} 1 0"></i></div>` : ''}<div class="hs-lg"><span><i class="hs-dot"></i>Inversiones <b class="num">${eur(P.inv, 0)}</b></span><span><i class="hs-dot c"></i>Efectivo <b class="num">${eur(P.cash, 0)}</b></span></div></div>` : ''; }
  $('#brandLine').textContent = DEMO ? 'Patrimonio de ejemplo' : 'Patrimonio total';
  { const g = TAB_GROUP[ui.tab] || ui.tab, name = { resumen: 'Inicio', posiciones: 'Cartera', efectivo: 'Efectivo', analisis: 'Análisis', operaciones: 'Movimientos', proyeccion: 'Plan', fiscal: 'Impuestos', activos: 'Ajustes' }[ui.tab] || '';
    $('#sideName').textContent = DEMO ? 'Cartera de ejemplo' : (S.settings && S.settings.nombre ? `Cartera de ${S.settings.nombre}` : 'Mi cartera');
    $('#mHello').textContent = ui.tab === 'resumen' || !t ? (DEMO ? 'Cartera de ejemplo' : (S.settings && S.settings.nombre ? `Hola, ${S.settings.nombre}` : 'Hola')) : `Patrimonio ${eur(P.total)}`;
    $('#mTitle').textContent = ui.tab === 'resumen' ? 'Tu patrimonio' : name; $('#dTitle').textContent = name;
    const td = DF({ weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date()); $('#dToday').textContent = (ui.tab !== 'resumen' && t ? `Patrimonio ${eur(P.total)} · ` : '') + td.charAt(0).toUpperCase() + td.slice(1); }
  const btn = $('#btnRefresh'); btn.disabled = ui.refreshing; btn.querySelector('span').textContent = ui.refreshing ? 'Descargando…' : 'Actualizar precios';
  const prog = $('#refreshProg'); prog.hidden = !ui.refreshing; prog.firstElementChild.style.width = Math.round(ui.progress * 100) + '%';
  let info = '';
  const lastJob = S.job && S.job.finishedAt ? Date.parse(S.job.finishedAt) : 0;
  if (DEMO) info = 'Precios de ejemplo';
  else if (jobBusy()) info = 'Claude está actualizando los precios…';
  else if (jobStale()) { const lp = lastPxDate(); info = `Sin respuesta · lanzada ${ago(Date.parse(S.job.startedAt || 0))}${lp ? ` · últimos precios del ${fdate(lp, { year: undefined })}` : ''}`; }
  else if (lastJob || lastPxDate()) { const lp = lastPxDate(); info = lp ? `Precios del ${fdate(lp, { year: undefined })} · auto L–V 21:40` : `Precios ${ago(lastJob)} · auto L–V 21:40`; }
  else info = 'Se actualizan solos L–V a las 21:40';
  $('#refreshInfo').textContent = info;
}
function renderBanners() {
  const out = [];
  const dbStuck = DEMO && dbState === 'ready' && !Object.values(loaded).every(Boolean) && Date.now() - bootT > 4900;
  if (dbState === 'error' || dbStuck) out.push(`<div class="banner"><div><b>No se han podido cargar tus datos</b>${dbErr ? ` (${esc(dbErr)})` : ''}. Lo que ves es la cartera de ejemplo, no la tuya: no añadas nada aquí. Recarga la página; si sigue igual, ábrela desde claude.ai.</div></div>`);
  else if (DEMO) out.push(`<div class="banner info"><div><b>Cartera de ejemplo.</b> Desaparece al añadir tu primer activo.</div><button class="btn primary" type="button" data-act="start">Añadir mi primer activo</button></div>`);
  if (dbState === 'none' && !DEMO) out.push(`<div class="banner"><div><b>Sin almacenamiento.</b> Esta vista no puede guardar datos; lo que añadas se perderá al cerrar. Ábrela desde claude.ai para guardar.</div></div>`);
  if (res && !DEMO) {
    const stale = res.positions.filter((p) => p.open && p.priceDate && (Date.parse(res.totals.today) - Date.parse(p.priceDate)) / 864e5 > 7 && p.asset.type !== 'cash');
    const noPrice = res.positions.filter((p) => p.open && !p.priceDate);
    if (noPrice.length) out.push(`<div class="banner"><div><b>Sin precio:</b> ${noPrice.map((p) => esc(p.asset.ticker || p.asset.name)).join(', ')}. Se valoran a 0 hasta que descargues o introduzcas un precio.</div></div>`);
    const dust = dustPositions();
    if (dust.length) out.push(`<div class="banner info"><div><b>Restos:</b> ${dust.map((p) => `${esc(p.asset.ticker || p.asset.name)} ${qn(p.qty, 8)} (${eur(p.value)})`).join(', ')}. Suelen quedar al vender «todo» por redondeos o comisiones.</div><div class="toolbar">${dust.map((p) => `<button class="btn small" type="button" data-dust="${esc(p.assetId)}">Cerrar ${esc(p.asset.ticker || p.asset.name)}</button>`).join('')}</div></div>`);
    const ph = priceHealthChip(stale);
    if (ph) out.push(ph);
    else if (stale.length) { const dd = stale.map((p) => Math.round((Date.parse(res.totals.today) - Date.parse(p.priceDate)) / 864e5)), lo = Math.min(...dd), hi = Math.max(...dd);
      out.push(`<details class="stale-chip"${ui.staleOpen ? ' open' : ''}><summary><span class="chip warn">${stale.length === 1 ? '1 precio' : `${stale.length} precios`} de hace ${lo === hi ? lo : `${lo}–${hi}`} días</span></summary><div class="stale-body"><b style="color:var(--warn)">Precios antiguos:</b> ${stale.map((p) => `${esc(p.asset.ticker || p.asset.name)} (${fdate(p.priceDate, { year: undefined })})`).join(', ')}. ${stale.some((p) => p.asset.src === 'manual') ? 'Los activos manuales se actualizan desde Posiciones → Precio.' : ''}</div></details>`); }
    const w = res.warnings.filter((x) => x.kind !== 'fx' || !x.date); const fxw = res.warnings.filter((x) => x.kind === 'fx' && x.date);
    if (w.length) out.push(`<div class="banner"><div><b>Revisa:</b> ${w.map((x) => esc(x.msg)).join(' · ')}</div></div>`);
    if (fxw.length) out.push(`<div class="banner"><div><b>Tipo de cambio:</b> ${fxw.length} operación(es) sin tipo de cambio; se ha usado 1. Descarga precios o indica el tipo en la operación.</div></div>`);
  }
  if (!DEMO && S.job && S.job.state === 'error') out.push(`<div class="banner"><div><b>Actualización de precios:</b> ${esc(S.job.error || 'la consulta falló')}</div></div>`);
  if (!DEMO && S.job && S.job.state === 'done') { const bad = (S.job.results || []).filter((r) => !r.ok); if (bad.length) out.push(`<div class="banner"><div><b>Sin precio nuevo:</b> ${bad.map((r) => `${esc((assetById(r.assetId) || {}).ticker || r.isin)} (${esc(r.error || 'sin datos')})`).join(' · ')}. Revisa el ISIN o símbolo, o mete el precio a mano.</div></div>`); }
  { const rh = recurBanner(); if (rh) out.push(rh); }
  for (const m of Object.values(bannersExtra)) if (m) out.push(`<div class="banner"><div>${esc(m)}</div></div>`);
  const el = $('#banners'); el.innerHTML = out.join(''); el.hidden = !out.length;
}

/** Open positions worth less than 5 € (leftovers after selling "everything"). */
function dustPositions() { return res && !DEMO ? res.positions.filter((p) => p.open && p.priceDate && ok(p.value) && p.value < 5 && p.asset.type !== 'cash') : []; }
async function closeDust(id, btn) {
  const p = dustPositions().find((z) => z.assetId === id); if (!p) return;
  if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = `¿Vender ${numf(p.qty, 8)} a ${money(p.price, p.asset.currency)}?`; setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = `Cerrar ${p.asset.ticker || p.asset.name}`; } }, 4000); return; }
  btn.disabled = true;
  const d = p.priceDate > todayStr() ? todayStr() : p.priceDate;
  const o = { type: 'sell', date: d, assetId: id, qty: +p.qty.toFixed(10), price: p.price, fees: 0, note: 'Cierre de resto', created: new Date().toISOString() };
  if (p.asset.currency && p.asset.currency !== 'EUR') { const f = fxFor(p.asset.currency, d); if (f) o.fx = f; }
  const tid = uid();
  try { await save('txs', tid, o); toast(`Posición cerrada (${eur(p.value)}).`, 7000, { label: 'Deshacer', fn: async () => { await remove('txs', tid); toast('Cierre deshecho.'); } }); }
  catch (e) { btn.disabled = false; toast('No se pudo guardar: ' + (e.message || e.code)); }
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
  const fn = { resumen: vInicio, posiciones: vCartera, efectivo: vEfectivo, operaciones: vOperaciones, analisis: vAnalisis3, proyeccion: vPlan, fiscal: vFiscal, activos: vActivos }[ui.tab] || vInicio;
  const skel = window.__motion && __motion.loading(v, DEMO && (dbState === 'pending' || (dbState === 'ready' && !Object.values(loaded).every(Boolean))), render);
  if (!skel) try { v.innerHTML = subTabs() + fn(); (fn.after || (() => {}))(); foldPanels(v); }
  catch (e) { console.error(e); v.innerHTML = `<div class="panel empty">No se pudo dibujar esta vista: ${esc(e.message)}</div>`; }
  if (!skel && window.__motion) __motion.view(v, ui.tab);
  maybeSnapshot();
}

function kpi(label, value, sub, c, title) { return `<div class="kpi"><span class="l">${title ? `<abbr title="${esc(title)}">${label}</abbr>` : label}</span><span class="v ${c || ''}">${value}</span>${sub != null ? `<span class="s">${sub}</span>` : ''}</div>`; }

function emptyState(msg) { return `<div class="panel empty">${msg}</div>`; }

