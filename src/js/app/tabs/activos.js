/* ---------- Activos y ajustes ---------- */
/** Yearly management cost in € of a position: TER (asset.ter, a fraction like target) × value. null without TER. */
function terCost(p) { const t = p && p.asset ? p.asset.ter : null; return t != null && t !== '' && Number.isFinite(+t) && +t >= 0 && p.value > 0 ? p.value * +t : null; }
function feesPanel() {
  if (!res) return ''; const ps = res.positions.filter((p) => p.open && p.value > 0); if (!ps.length) return '';
  const w = ps.filter((p) => terCost(p) != null), y = w.reduce((s, p) => s + terCost(p), 0), v = w.reduce((s, p) => s + p.value, 0), vAll = ps.reduce((s, p) => s + p.value, 0);
  const fees = res.totals.tradingFees || 0;
  return `<section class="panel"><h2>Lo que pagas en gestión</h2>
    ${w.length ? `<div class="tbl-wrap" style="max-width:760px"><table style="margin-top:8px"><thead><tr><th>Activo</th><th class="n">Valor</th><th class="n">TER</th><th class="n">€/año</th></tr></thead><tbody>${ps.map((p) => { const c = terCost(p); return `<tr><td><span class="sw" style="background:${acolor(p.assetId)};display:inline-block;margin-right:6px"></span>${esc(p.asset.ticker || p.asset.name)}</td><td class="n">${eur(p.value, 0)}</td><td class="n">${c != null ? pct(+p.asset.ter, 2) : '<span class="muted">—</span>'}</td><td class="n">${c != null ? eur(c) : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="stats" style="margin-top:10px;max-width:760px"><div class="stat"><span class="k">Al año</span><span class="v">${eur(y)}</span></div><div class="stat"><span class="k">Al mes</span><span class="v">${eur(y / 12)}</span></div><div class="stat"><span class="k">TER medio<small>ponderado por valor</small></span><span class="v">${pct(v > 0 ? y / v : null, 3)}</span></div></div>
    ${w.length < ps.length ? `<p class="note">Sin TER: ${ps.filter((p) => terCost(p) == null).map((p) => esc(p.asset.ticker || p.asset.name)).join(', ')} (${eur(vAll - v, 0)}). No cuentan en el total ni en la media.</p>` : ''}`
    : `<p class="note">Apunta el TER (comisión anual) de cada fondo en «Editar» para ver cuánto te cuesta al año.</p>`}
    <p class="note">Aparte, comisiones de compraventa pagadas desde el inicio: <b>${eur(fees)}</b>. El TER ya va descontado del valor liquidativo: es un coste que no ves, no un cargo.</p></section>`;
}
function vActivos() {
  const as = assetList();
  const setv = S.settings;
  return `<section class="panel" id="aspectoPanel"><div class="panel-h"><div><h2>Aspecto</h2><span class="small muted">tema ${themeEff() === 'dark' ? 'oscuro' : 'claro'}${themePref === 'auto' ? ', el del sistema' : ''}; el ojo de arriba oculta los importes</span></div><div class="toolbar"><button class="btn small" type="button" data-act="sheet-theme">Pasar a ${themeEff() === 'dark' ? 'claro' : 'oscuro'}</button><button class="btn small" type="button" data-act="sheet-refresh">Actualizar precios ahora</button></div></div></section>

  <section class="panel">
    <div class="panel-h"><h2>Activos</h2><button class="btn primary" type="button" data-act="add-asset">Añadir activo</button></div>
    ${as.length ? `<div class="mlist">${as.map((a) => { const lp = DEMO ? null : lastPx(a.id); const srcTxt = a.src === 'nav' ? `VL por ISIN · ${esc(a.isin || 'sin ISIN')}` : isAuto(a) ? (a.quoteUrl ? 'Auto · finanzen.net' : `Auto · ${esc(a.symbol || '?')}`) : 'Manual'; return `<details class="mcard"><summary><div class="mrow"><div><div class="l1"><span class="sw" style="background:${acolor(a.id)}"></span><span class="tk">${esc(a.ticker || a.name)}</span>${a.inactive ? ' <span class="chip">cerrado</span>' : ''}</div><div class="l2">${esc(TYPES[a.type] || a.type)} · ${esc(a.currency)} · ${srcTxt}</div></div><div><div class="r1">${lp ? money(lp[1], a.currency, lp[1] >= 100 ? 2 : 4) : '—'}</div><div class="r2 muted">${lp ? fdate(lp[0], { year: undefined }) : ''}</div></div></div></summary><div class="mc-body"><div class="small muted">${esc(a.name || '')}${a.broker ? ' · ' + esc(a.broker) : ''}${a.target != null && a.target !== '' ? ' · objetivo ' + pct(+a.target, 1) : ''}${a.ter != null && a.ter !== '' && ok(+a.ter) ? ' · TER ' + pct(+a.ter, 2) : ''}</div><div class="rowact"><button class="btn small" type="button" data-price="${esc(a.id)}">Precio</button><button class="btn small" type="button" data-edit-asset="${esc(a.id)}">Editar</button><button class="btn small danger" type="button" data-del-asset="${esc(a.id)}">Borrar</button></div></div></details>`; }).join('')}</div><div class="tbl-wrap only-desk"><table class="acttbl"><thead><tr><th>Activo</th><th>Tipo</th><th>Divisa</th><th>Broker</th><th>Etiqueta</th><th class="n">Objetivo</th><th class="n">TER</th><th>Precio desde</th><th class="n">Último precio</th><th></th></tr></thead><tbody>
    ${as.map((a) => { const h = DEMO ? { points: demoData.history[a.id] } : S.history[a.id]; const lp = DEMO ? (h && h.points && h.points.length ? h.points[h.points.length - 1] : null) : lastPx(a.id); return `<tr><td>${assetCell(a)}</td><td>${esc(TYPES[a.type] || a.type)}</td><td>${esc(a.currency)}</td><td>${esc(a.broker || '')}</td><td>${esc(a.tag || '')}</td><td class="n">${a.target != null && a.target !== '' ? pct(+a.target, 1) : ''}</td><td class="n">${a.ter != null && a.ter !== '' && ok(+a.ter) ? pct(+a.ter, 2) : ''}</td><td>${a.src === 'nav' ? `<span class="chip" title="Valor liquidativo leído por Claude en quefondos.com">VL · ${esc(a.isin || 'sin ISIN')}</span>${S.navs[a.id] && S.navs[a.id].checked ? `<div class="small muted">consultado ${new Date(S.navs[a.id].checked).toLocaleString(L, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : ''}` : isAuto(a) ? `<span class="chip">Auto · ${esc(a.quoteUrl ? 'finanzen.net' : a.symbol || '?')}</span>${S.navs[a.id] && S.navs[a.id].source ? `<div class="small muted">último vía ${esc(S.navs[a.id].source)}</div>` : ''}` : '<span class="chip">Manual</span>'}</td><td class="n">${lp ? `${money(lp[1], a.currency, 4)}<div class="small muted">${fdate(lp[0])}</div>` : '—'}</td><td><div class="rowact"><button class="btn ghost small" type="button" data-price="${esc(a.id)}">Precio</button><button class="btn ghost small" type="button" data-edit-asset="${esc(a.id)}">Editar</button><button class="btn ghost small danger" type="button" data-del-asset="${esc(a.id)}">Borrar</button></div></td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="empty">Sin activos. Empieza añadiendo uno.</div>'}
    <p class="note">Los precios los trae la tarea de Claude «Cartera · actualizar precios». Fondos: por ISIN. ETF: símbolo de Alpha Vantage (Xetra con <b>.DEX</b>, p. ej. SXR8.DEX). Acciones y cripto: página de finanzen.net (si la dejas vacía, Claude la busca). Si no hay cotización, usa precios manuales.</p>
  </section>
  ${feesPanel()}
  <section class="panel only-mob"><h2>Operaciones en CSV</h2><div class="toolbar" style="margin-top:8px"><button class="btn" type="button" data-act="import">Importar CSV</button><button class="btn" type="button" data-act="export-csv" ${downloads ? '' : 'disabled title="Descargas no disponibles en esta vista"'}>Exportar CSV</button></div></section>
  <div class="grid g-2e">
    <section class="panel"><h2>Ajustes de análisis</h2>
      <form class="form" id="setForm">
        <label class="f">Tipo libre de riesgo anual <span class="hint">para medir la eficiencia de la cartera</span><input type="text" inputmode="decimal" id="setRf" value="${esc(((setv.riskFree ?? 0.02) * 100).toFixed(2).replace('.', ','))}"></label>
        <label class="f">Benchmark <span class="hint">símbolo de Alpha Vantage (p. ej. SXR8.DEX)</span><input type="text" id="setBench" placeholder="EUNL.DE" value="${esc(setv.benchSymbol || '')}"></label>
        <label class="f">Nombre del benchmark<input type="text" id="setBenchName" placeholder="MSCI World" value="${esc(setv.benchName || '')}"></label>
        <label class="f">Divisa del benchmark<select id="setBenchCcy">${['EUR', 'USD', 'GBP', 'CHF'].map((c) => `<option ${((setv.benchCcy || 'EUR') === c) ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <div class="form-actions full"><button class="btn primary" type="submit">Guardar ajustes</button></div>
      </form>
    </section>
    <section class="panel"><h2>Actualización de precios</h2>
      <div class="stats" style="grid-template-columns:1fr">
        <div class="stat"><span class="k">Tarea «Cartera · actualizar precios»<small>L–V a las 21:40 y al pulsar «Actualizar precios»</small></span><span class="v"><span class="chip ${S.job && S.job.state === 'done' ? 'inc' : S.job && (S.job.state === 'error' || jobStale()) ? 'warn' : ''}">${S.job ? (S.job.state === 'done' ? (lastPxDate() ? `OK · precios del ${fdate(lastPxDate(), { year: undefined })}` : 'OK ' + ago(Date.parse(S.job.finishedAt))) : S.job.state === 'error' ? 'Error' : jobStale() ? 'Sin respuesta' : 'En curso') : 'Sin ejecutar'}</span>${jobStale() ? `<small class="small muted" style="display:block;font-weight:500">La actualización no terminó (lanzada ${ago(Date.parse(S.job.startedAt || 0))}). Vuelve a intentarlo.${lastPxDate() ? ` Últimos precios del ${fdate(lastPxDate())}.` : ''}</small>` : ''}</span></div>
      </div>
    </section>
    ${safetyPanel()}
  </div>`;
}

