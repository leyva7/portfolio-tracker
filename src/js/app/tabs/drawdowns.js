/* ---------- Caídas en tu propia historia (idea 17) ----------
 * Semanas en las que tu cartera (TWR, sin contar aportaciones) cayó más de un umbral, cuánto llegó a caer desde el máximo
 * y cuánto tardó en volver a él. Solo datos de tu historial: nada de previsiones.
 * Resumen lo enseña cuando la semana en curso (o la anterior, lunes y martes) cae más del 3 %; Análisis lo lista con umbral elegible.
 */
const DROP_TH = [0.02, 0.03, 0.05];
const ddTh = () => (DROP_TH.includes(ui.ddth) ? ui.ddth : 0.03);
const monOf = (d) => { const x = new Date(d + 'T00:00:00Z'); return E.addDays(d, -((x.getUTCDay() + 6) % 7)); };
/** Weekly TWR changes: the last series point of each calendar week against the previous week's last point. */
function weekRets() {
  const S2 = res ? res.series : []; const last = {}; const order = [];
  S2.forEach((p, i) => { const m = monOf(p.date); if (!(m in last)) order.push(m); last[m] = i; });
  const out = [];
  for (let j = 1; j < order.length; j++) { const a = S2[last[order[j - 1]]], b = S2[last[order[j]]]; if (!a.active && !b.active) continue; out.push({ mon: order[j], end: b.date, i: last[order[j]], prevI: last[order[j - 1]], r: b.index / a.index - 1 }); }
  return out;
}
/** Episodes: weeks falling more than th; weeks that share an unrecovered peak join the same episode. */
function dropEpisodes(th) {
  const S2 = res.series; const W = weekRets(); const eps = [];
  for (const w of W) {
    if (!(w.r <= -th)) continue;
    let pk = -Infinity, pkI = 0; for (let i = 0; i <= w.prevI; i++) if (S2[i].index > pk) { pk = S2[i].index; pkI = i; }
    const prev = eps[eps.length - 1];
    if (prev && prev.peakI === pkI && (!prev.rec || prev.rec > w.end)) { prev.weeks.push(w); continue; }
    let rec = null, tr = Infinity, trI = w.i;
    for (let i = w.i; i < S2.length; i++) { if (S2[i].index >= pk - 1e-12) { rec = S2[i].date; break; } if (S2[i].index < tr) { tr = S2[i].index; trI = i; } }
    if (S2[w.i].index < tr) { tr = S2[w.i].index; trI = w.i; }
    eps.push({ weeks: [w], peakI: pkI, peak: S2[pkI].date, low: tr / pk - 1, lowDate: S2[trI].date, rec, recWeeks: rec ? Math.max(1, Math.ceil((Date.parse(rec) - Date.parse(w.end)) / 6048e5)) : null });
  }
  return eps;
}
const wkLbl = (n) => `${n} semana${n === 1 ? '' : 's'}`;
const mShort = (d) => fdate(d, { day: undefined, month: 'short', year: 'numeric' });
function epLine(e, since) {
  const w = e.weeks.reduce((m, x) => (x.r < m.r ? x : m), e.weeks[0]);
  const thin = since && w.end < since ? ' <span class="muted">(con pocos precios diarios)</span>' : '';
  return `<li><span class="k"><b>${mShort(e.weeks[0].end)}${e.weeks.length > 1 && mShort(e.weeks[e.weeks.length - 1].end) !== mShort(e.weeks[0].end) ? ` – ${mShort(e.weeks[e.weeks.length - 1].end)}` : ''}</b><small>${e.weeks.length > 1 ? `${e.weeks.length} semanas de caída; la peor ` : 'semana '}<span class="num loss">${pctS(w.r, 1)}</span> · llegó a <span class="num">${pct(e.low, 1)}</span> desde el máximo${thin}</small></span><span class="v">${e.rec ? `<b>${wkLbl(e.recWeeks)}</b><small>en volver al máximo</small>` : '<b>sin volver</b><small>al máximo todavía</small>'}</span></li>`;
}
/** Resumen: only when this week (or last week, early in the week) fell more than 3 %. */
function dropPanel() {
  if (!res || DEMO || res.series.length < 30) return '';
  const th = 0.03; const W = weekRets(); if (!W.length) return '';
  const today = res.totals.today; const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  let cur = W[W.length - 1]; if (!(cur.r <= -th) && dow <= 1 && W.length > 1 && W[W.length - 2].mon === E.addDays(monOf(today), -7)) cur = W[W.length - 2];
  if (!(cur.r <= -th) || cur.mon < E.addDays(monOf(today), -7)) return '';
  const eps = dropEpisodes(th); const past = eps.filter((e) => !e.weeks.includes(cur) && e.weeks.every((x) => x.mon !== cur.mon));
  const nWeeks = past.reduce((s, e) => s + e.weeks.length, 0); const now = eps.find((e) => e.weeks.some((x) => x.mon === cur.mon));
  const recs = past.filter((e) => e.rec).map((e) => e.recWeeks);
  const cov = priceCoverage(); const since = cov && cov.since;
  const isThis = cur.mon === monOf(today);
  return `<section class="panel" id="dropPanel"><div class="panel-h"><div><h2>${isThis ? 'Esta semana' : 'La semana pasada'} tu cartera cae un <span class="loss noarr num">${pct(-cur.r, 1)}</span></h2><div class="small muted">qué pasó las otras veces, solo con tu historial</div></div></div>
    <p style="margin:0">${nWeeks ? `Desde ${mShort(res.series[0].date)} ha tenido <b>${wkLbl(nWeeks)}</b> que cayeron más de un 3 %${past.length < nWeeks ? `, ${past.length === 1 ? 'todas en la misma racha' : `en ${past.length} rachas`}` : ''}.${recs.length ? (past.length === 1 ? ` Aquella vez tardó <b>${wkLbl(recs[0])}</b> en volver a su máximo anterior.` : ` ${recs.length === past.length ? 'Siempre volvió' : `En ${recs.length} de ${past.length} volvió`} a su máximo anterior, en ${recs.length === 1 ? wkLbl(recs[0]) : `entre ${wkLbl(Math.min(...recs))} y ${wkLbl(Math.max(...recs))}`}.`) : ''}` : 'Es la primera semana con una caída de más del 3 % en tu historial.'}</p>
    ${past.length ? `<ul class="drop-list">${past.slice().reverse().map((e) => epLine(e, since)).join('')}</ul>` : ''}
    ${cov && cov.low ? '<p class="small muted" style="margin:0">Muchos precios antiguos de tus fondos son sueltos, no diarios: la semana exacta de cada caída puede variar un poco.</p>' : ''}
    ${now ? `<p class="small muted" style="margin:0">Ahora estás un <span class="num">${pct(-(res.series[res.series.length - 1].index / res.series[now.peakI].index - 1), 1)}</span> por debajo del máximo del ${fdate(now.peak)}. Es lo que ha pasado antes en tu cartera, no una previsión.</p>` : ''}
  </section>`;
}
/** Análisis: list under «Caída desde máximos», with a threshold selector. */
function dropHistory() {
  if (!res || res.series.length < 30) return '';
  const th = ddTh(); const eps = dropEpisodes(th); const cov = priceCoverage(); const since = cov && cov.since;
  const n = eps.reduce((s, e) => s + e.weeks.length, 0);
  return `<div class="drop-hist" id="dropHist"><div class="panel-h"><h3>Semanas que cayeron más de un ${pct(th, 0)}</h3><div class="seg" role="group" aria-label="Umbral">${DROP_TH.map((t) => `<button type="button" data-ddth="${t}" aria-pressed="${t === th}">${pct(t, 0)}</button>`).join('')}</div></div>
    ${eps.length ? `<p class="small muted" style="margin:0">${wkLbl(n)} en tu historial; cuánto llegó a caer cada vez desde el máximo anterior y cuánto tardó en volver a él.</p><ul class="drop-list">${eps.slice().reverse().map((e) => epLine(e, since)).join('')}</ul>${cov && cov.low ? '<p class="small muted" style="margin:0">Muchos precios antiguos de tus fondos son sueltos, no diarios: la semana exacta de cada caída puede variar un poco.</p>' : ''}` : `<p class="small muted" style="margin:0">Ninguna semana de tu historial ha caído más de un ${pct(th, 0)}.</p>`}</div>`;
}
