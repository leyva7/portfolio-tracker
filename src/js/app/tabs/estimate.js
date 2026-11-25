/* ---------- Resumen: «Estimación del día» (idea 18) ----------
 * Mientras no llega el valor liquidativo de un fondo, su movimiento estimado con el cierre de su índice en euros.
 * Los cierres los guarda la tarea del correo diario en insights/estimacion: {updated, days: {fecha: {us|em|small|oro: {name, chg %, via}}}}.
 * Para cada fondo se encadenan los días posteriores a su último precio; al llegar el precio de ese día, deja de contarse.
 */
const EST_KEY = { us: 'us', em: 'em', small: 'small', oro: 'oro' };
function estimRows() {
  if (!res || DEMO || !S.estim || !S.estim.days) return [];
  const days = S.estim.days; const ds = Object.keys(days).sort(); const today = res.totals.today; const out = [];
  for (const p of res.positions) {
    if (!p.open || !(p.value > 0) || !p.priceDate) continue;
    const k = EST_KEY[subOf(p.asset)]; if (!k) continue;
    // last real close: the fund's own price history (a buy recorded the day after carries the previous NAV, so p.priceDate can be later)
    const hp = histPts(p.assetId); const last = hp.length ? hp[hp.length - 1][0] : p.priceDate;
    const use = ds.filter((d) => d > last && d <= today && days[d] && days[d][k] && ok(+days[d][k].chg));
    if (!use.length) continue;
    const f = use.reduce((m, d) => m * (1 + days[d][k].chg / 100), 1) - 1;
    out.push({ p, k, idx: days[use[0]][k].name, dates: use, chg: f, eur: p.value * f, proxy: use.some((d) => /\+/.test(days[d][k].via || '')) });
  }
  return out.sort((a, b) => b.p.value - a.p.value);
}
const dShort = (d) => fdate(d, { weekday: 'short', day: 'numeric', month: 'short', year: undefined }).replace(',', '');
/** Short fund name: drops the share-class tail («Index Fund P-Acc-EUR», «UCITS ETF (Acc)»…). */
const shortName = (a) => { const n = String(a.name || a.ticker || ''); const s = n.replace(/\s+(index\b.*|ucits\b.*|fund\b.*|\(ie\).*|eur acc.*)$/i, '').trim(); return s.length >= 6 ? s : n; };
function estPanel() {
  const R = estimRows(); if (!R.length) return '';
  const tot = R.reduce((s, r) => s + r.eur, 0), base = R.reduce((s, r) => s + r.p.value, 0); const P = patrimony();
  const all = [...new Set(R.flatMap((r) => r.dates))].sort();
  const when = all.length === 1 ? `del ${dShort(all[0])}` : `del ${dShort(all[0])} al ${dShort(all[all.length - 1])}`;
  return `<section class="panel" id="estPanel"><div class="panel-h"><div><h2>Estimación hasta el último cierre <span class="chip">estim.</span></h2><div class="small muted">aún no ha llegado el precio de ${R.length === 1 ? 'un fondo' : `${R.length} fondos`} ${when}</div></div></div>
    <div class="est-tot"><span class="num">≈ <span class="${cls(tot)}">${eurS(tot, 0)}</span></span><span class="small muted">≈ ${pctS(base ? tot / base : null, 1)} en esos fondos · patrimonio ≈ <span class="num">${eur(P.total + tot, 0)}</span></span></div>
    <div class="stats est-list">${R.map((r) => `<div class="stat"><span class="k">${esc(shortName(r.p.asset))}<small>${esc(r.idx)}${r.dates.length > 1 ? ` · ${r.dates.length} sesiones` : ` · ${dShort(r.dates[0])}`} · ${pctS(r.chg, 1)}</small></span><span class="v num">≈ <span class="${cls(r.eur)}">${eurS(r.eur, 0)}</span></span></div>`).join('')}</div>
    <p class="small muted" style="margin:0">Con el cierre del índice de cada fondo pasado a euros${R.some((r) => r.proxy) ? ' (las small caps, con VB y VSS de EE. UU.)' : ''}. El fondo puede diferir unas décimas. Se quita sola al llegar el valor liquidativo.</p>
  </section>`;
}
