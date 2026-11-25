/* ---------- Proyección ---------- */
// Expected annual return (pessimistic, base, optimistic) and volatility by asset class, in %. Net of fund costs, before taxes.
const PJ_CLS = { rv: [4, 7, 9, 16], rf: [1.5, 3, 4, 5], oro: [0, 4, 7, 15], cripto: [-5, 8, 20, 65], otro: [2, 5, 7, 10] };
const PJ_KEY = 'cartera-proj3';
const PJ_MS = [25e3, 50e3, 100e3, 150e3, 250e3, 500e3, 750e3, 1e6, 2e6, 5e6];
let projChart = null;
function pjAvgMonthly() {
  if (!res) return 0;
  const t = res.totals; let net = 0;
  // sales whose money went to cash (savings for the flat) are not a lower monthly saving: typical (median) buys of the last 6 months
  const ms = Array.from({ length: 6 }, (_, i) => (res.monthFlows[E.addMonths(t.today, -i).slice(0, 7)] || {}).invested || 0).sort((a, b) => a - b);
  net = (ms[2] + ms[3]) / 2;
  return Math.max(0, Math.round(net / 10) * 10);
}
function pjOpts() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(PJ_KEY) || 'null') || (({ cash, ...o }) => o)(JSON.parse(localStorage.getItem('cartera-proj2') || '{}')); } catch (e) {}
  return Object.assign({ h: 20, m: pjAvgMonthly(), g: 0, cs: 0, inf: 2, cash: false, mode: 'real' }, s, { cls: Object.assign({}, s.cls || {}) });
}
function pjCSHint(cash) { return cash ? `crece a tu TAE media (${pct(cashRate(), 2)})` : 'solo cuenta si incluyes el efectivo'; }
function pjRange(a, b) { const m = Math.max(Math.abs(a), Math.abs(b)); if (!ok(m)) return '—'; if (m < 1e4) return `${eur(a, 0)} – ${eur(b, 0)}`; const M = m >= 1e6; const f = NF({ maximumFractionDigits: M ? (Math.abs(a) < 1e6 ? 2 : 1) : 0 }); const d = M ? 1e6 : 1e3; return `${f.format(a / d)} – ${f.format(b / d)} ${M ? 'M€' : 'k€'}`; }
function pjSave(o) { try { localStorage.setItem(PJ_KEY, JSON.stringify(o)); } catch (e) {} }
function pjRow(o, k) {
  if (k === 'cash') { const r = cashRate() * 100; return [r, r, r, 1]; }
  const d = PJ_CLS[k] || PJ_CLS.otro; const u = o.cls[k];
  return u ? [u[0], u[1], u[2], d[3]] : d;
}
/** Weighted scenario returns and volatility of the invested part, from the current mix by asset class. */
function pjRates(o) {
  const m = {}; let tot = 0;
  for (const p of res.positions) if (p.open && p.value > 0) { const k = clsOf(p.asset); m[k] = (m[k] || 0) + p.value; tot += p.value; }
  const ks = Object.keys(m); const r = [0, 0, 0]; let v2 = 0;
  const rho = (a, b) => (a === b ? 1 : a === 'cash' || b === 'cash' ? 0 : (a === 'rv' && b === 'cripto') || (a === 'cripto' && b === 'rv') ? 0.4 : (a === 'rv' && b === 'otro') || (a === 'otro' && b === 'rv') ? 0.5 : 0.15);
  for (const a of ks) { const wa = tot ? m[a] / tot : 0; const ra = pjRow(o, a); for (let i = 0; i < 3; i++) r[i] += wa * ra[i] / 100; for (const b of ks) { const wb = tot ? m[b] / tot : 0; v2 += wa * wb * ra[3] * pjRow(o, b)[3] * rho(a, b) / 1e4; } }
  return { pess: r[0], base: r[1], opt: r[2], vol: Math.sqrt(Math.max(0, v2)), w: m, tot };
}
function pjRun(o) {
  const R = pjRates(o); const P = patrimony(); const inc = !!o.cash;
  const H = Math.max(1, Math.min(40, Math.round(o.h))); const N = H * 12;
  const cash0 = inc ? P.cash : 0; const crm = Math.pow(1 + cashRate(), 1 / 12) - 1;
  const contrib = (k) => o.m * Math.pow(1 + o.g / 100, Math.floor((k - 1) / 12));
  const cs = inc ? o.cs : 0;
  const det = (r) => { const rm = Math.pow(1 + r, 1 / 12) - 1; const out = new Float64Array(N + 1); let v = P.inv, c = cash0; out[0] = v + c; for (let k = 1; k <= N; k++) { v = v * (1 + rm) + contrib(k); c = c * (1 + crm) + cs; out[k] = v + c; } return out; };
  const put = new Float64Array(N + 1); put[0] = Math.max(0, res.totals.netInvested) + cash0; for (let k = 1; k <= N; k++) put[k] = put[k - 1] + contrib(k) + cs;
  // the same contributions in today's euros: each one deflated in its own month, not all with the final year's inflation
  const dfl = (k) => Math.pow(1 + o.inf / 100, k / 12); const putReal = new Float64Array(N + 1); putReal[0] = put[0]; for (let k = 1; k <= N; k++) putReal[k] = putReal[k - 1] + (put[k] - put[k - 1]) / dfl(k);
  const t = res.totals; const days = t.firstDate ? (Date.parse(t.today) - Date.parse(t.firstDate)) / 864e5 : 0;
  const hr = days >= 365 && ok(t.twrAnn) ? t.twrAnn : null; const hrP = ok(hr) ? Math.max(-0.3, Math.min(0.15, hr)) : null; // strategy return (TWR), not the money-weighted TIR
  // Monte Carlo around the base scenario: monthly log-normal returns with the estimated volatility. Fixed seed so the numbers don't jump.
  let seed = 20261005; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
  const NS = 1000; const s = R.vol / Math.sqrt(12); const mu = Math.log(1 + Math.max(-0.99, R.base)) / 12;
  const yv = Array.from({ length: H + 1 }, () => new Float64Array(NS));
  for (let j = 0; j < NS; j++) { let v = P.inv, c = cash0; yv[0][j] = v + c; for (let k = 1; k <= N; k++) { v = v * Math.exp(mu + s * gauss()) + contrib(k); c = c * (1 + crm) + cs; if (k % 12 === 0) yv[k / 12][j] = v + c; } }
  const q = (arr, p) => { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.floor((a.length - 1) * p)]; };
  const lossProb = yv.map((a, y) => (y ? Array.from(a).filter((v) => v < put[y * 12]).length / NS : 0));
  return { R, H, N, inc, start: P.inv + cash0, base: det(R.base), pess: det(R.pess), opt: det(R.opt), hist: hrP != null ? det(hrP) : null, hr, hrP, put, putReal, p10: yv.map((a) => q(a, 0.1)), p90: yv.map((a) => q(a, 0.9)), lossProb, def: (k) => Math.pow(1 + o.inf / 100, k / 12) };
}
function vProyeccion() {
  if (!res || !res.series.length) return emptyState('Añade activos y operaciones para proyectar tu patrimonio.');
  const o = pjOpts(); const R = pjRates(o); const P = patrimony(); const avg = pjAvgMonthly();
  const present = Object.keys(R.w).filter((k) => k !== 'cash').sort((a, b) => R.w[b] - R.w[a]);
  const cin = (k, i) => `<input type="text" inputmode="decimal" data-pjc="${k}" data-i="${i}" value="${esc(String(pjRow(o, k)[i]).replace('.', ','))}" aria-label="${esc(CLS_LABEL[k] || k)} ${['pesimista', 'base', 'optimista'][i]}">`;
  return `
  <section class="tiles" id="pjTiles"></section>
  <section class="panel">
    <div class="panel-h"><h2 id="pjTitle">Tu patrimonio</h2><div class="seg" role="group" aria-label="Unidades"><button type="button" data-pjmode="real" aria-pressed="${o.mode !== 'nominal'}">Euros de hoy</button><button type="button" data-pjmode="nominal" aria-pressed="${o.mode === 'nominal'}">Nominal</button></div></div>
    <div class="legend" id="pjLegend"></div>
    <div class="chart tall"><canvas id="cProj" role="img" aria-label="Proyección del patrimonio"></canvas></div>
    <div class="small muted" id="pjFoot"></div>
  </section>
  <div class="grid g-2e">
    <section class="panel"><div class="panel-h"><h2>Supuestos</h2><button class="btn ghost small" type="button" data-act="pj-reset">Restablecer</button></div>
      <form class="form" id="pjForm" onsubmit="return false">
        <label class="f full">Horizonte: <b id="pjHv">${o.h} años</b><input type="range" id="pjH" min="1" max="40" step="1" value="${esc(o.h)}" style="accent-color:var(--accent)"></label>
        <label class="f half">Aportación mensual a inversiones (€) <span class="hint">neta de ventas · tu media de 12 meses: ${eur(avg, 0)}</span><input type="text" inputmode="decimal" id="pjM" value="${esc(String(o.m).replace('.', ','))}"></label>
        <label class="f half">Subida anual de la aportación (%) <span class="hint">p. ej. 2 si aportas más cada año</span><input type="text" inputmode="decimal" id="pjG" value="${esc(String(o.g).replace('.', ','))}"></label>
        <label class="f half">Incluir efectivo <span class="hint">no, si lo guardas para un gasto como el piso</span><select id="pjC"><option value="1" ${o.cash ? 'selected' : ''}>Sí (${eur(P.cash, 0)})</option><option value="0" ${o.cash ? '' : 'selected'}>No</option></select></label>
        <label class="f half">Ahorro mensual al efectivo (€) <span class="hint" id="pjCSh">${pjCSHint(o.cash)}</span><input type="text" inputmode="decimal" id="pjCS" value="${esc(String(o.cs).replace('.', ','))}" ${o.cash ? '' : 'disabled'}></label>
        <label class="f half">Inflación anual (%)<input type="text" inputmode="decimal" id="pjI" value="${esc(String(o.inf).replace('.', ','))}"></label>
        <details class="full" ${ui.pjOpen ? 'open' : ''}><summary>Rentabilidad esperada por clase de activo</summary>
          <div class="tbl-wrap" style="margin-top:8px"><table class="pjcls"><thead><tr><th>Clase</th><th class="n">Peso</th><th class="n">Pesim. %</th><th class="n">Base %</th><th class="n">Optim. %</th></tr></thead><tbody>
          ${present.map((k) => `<tr><td><span class="sw" style="background:${clsColor(k)}"></span>${esc(CLS_LABEL[k] || k)}</td><td class="n">${pct(R.tot ? R.w[k] / R.tot : 0, 0)}</td><td class="n">${cin(k, 0)}</td><td class="n">${cin(k, 1)}</td><td class="n">${cin(k, 2)}</td></tr>`).join('')}
          </tbody></table></div>
          <p class="note">Anuales, netas de comisiones y antes de impuestos. Entre −50 % y 50 %, con pesimista ≤ base ≤ optimista.</p><p class="err" id="pjErr" role="alert" hidden></p>
        </details>
      </form>
      <div class="explain" id="pjMix"></div>
    </section>
    <section class="panel"><div class="panel-h"><h2>Hitos</h2><span class="small muted" id="pjMsSub"></span></div><div id="pjMs"></div></section>
  </div>
  <section class="panel"><div class="panel-h"><h2>Año a año</h2><span class="small muted" id="pjTblSub"></span></div><div id="pjTbl"></div></section>
  ${X('Parte de lo que tienes hoy y suma tus aportaciones mes a mes. Cada línea usa una rentabilidad anual fija según tu reparto actual: <b>pesimista</b>, <b>base</b> y <b>optimista</b>. La <b>banda</b> son 1.000 simulaciones con altibajos de mercado alrededor del escenario base: 8 de cada 10 acaban dentro. <b>Tu histórico</b> (oculta al principio; se activa en la leyenda) repite la rentabilidad anual de tu estrategia (TWR) hasta hoy, limitada al 15 %, solo como contraste. «Euros de hoy» descuenta la inflación para que las cifras se puedan comparar con tu poder de compra actual.', 'Es una estimación orientativa, no una previsión: no incluye impuestos al vender (los traspasos entre fondos los difieren), cambios de reparto ni retiradas. Ajusta los supuestos y revísala de vez en cuando.')}`;
}
function pjRead() {
  const o = pjOpts(); const n = (id, d) => { const v = parseNum($('#' + id) ? $('#' + id).value : ''); return Number.isFinite(v) ? v : d; };
  o.h = Math.round(n('pjH', o.h)); o.m = Math.max(0, n('pjM', 0)); o.g = n('pjG', 0); o.cs = n('pjCS', 0); o.inf = n('pjI', 2); o.cash = $('#pjC') ? $('#pjC').value === '1' : o.cash;
  const bad = new Set();
  for (const el of $$('[data-pjc]')) { const k = el.dataset.pjc, i = +el.dataset.i; const v = parseNum(el.value); const cur = (o.cls[k] || pjRow(o, k).slice(0, 3)).slice(); if (Number.isFinite(v)) cur[i] = v; if (!Number.isFinite(v) || v < -50 || v > 50) bad.add(el); o.cls[k] = cur; }
  // no silent reordering: pessimistic ≤ base ≤ optimistic, else flag the fields and keep the last valid projection
  for (const el of $$('[data-pjc]')) { const c = o.cls[el.dataset.pjc], i = +el.dataset.i; if ((i > 0 && c[i - 1] > c[i]) || (i < 2 && c[i] > c[i + 1])) bad.add(el); }
  for (const el of $$('[data-pjc]')) { el.classList.toggle('bad', bad.has(el)); el.setAttribute('aria-invalid', bad.has(el) ? 'true' : 'false'); }
  const er = $('#pjErr'); if (er) { er.hidden = !bad.size; er.textContent = bad.size ? 'Revisa las casillas en rojo: cada valor entre −50 % y 50 %, y pesimista ≤ base ≤ optimista. La proyección no se recalcula hasta corregirlas.' : ''; }
  if (bad.size) return null;
  for (const k of Object.keys(o.cls)) { const d = PJ_CLS[k] || PJ_CLS.otro; if (o.cls[k].every((v, i) => v === d[i])) delete o.cls[k]; }
  return o;
}
/** Y axis upper limit from the visible series except «Tu histórico», so that line never stretches the scale. */
function pjYLimit(sc) { const ch = sc.chart; let mx = 0; ch.data.datasets.forEach((d, i) => { if (d._hist || !ch.isDatasetVisible(i)) return; for (const v of d.data) if (v != null && v > mx) mx = v; }); if (mx > 0) sc.max = mx; }
function renderProj() {
  if (!$('#pjTiles') || !res) return;
  const o = pjOpts(); const r = pjRun(o); const H = r.H, N = r.N; { const ch = $('#pjChips'); if (ch && typeof pjChipsHtml === 'function') ch.innerHTML = pjChipsHtml(o); const as = $('#aportSub'); if (as) { const avg = pjAvgMonthly(); as.textContent = Math.abs(+o.m - avg) < 1 ? `la proyección usa tu media neta: ${eur(avg, 0)}/mes` : `la proyección usa ${eur(+o.m, 0)}/mes (tu media neta es ${eur(avg, 0)})`; } } const real = o.mode !== 'nominal';
  const at = (arr, k) => (arr ? arr[k] / (real ? r.def(k) : 1) : null);
  const atY = (arr, y) => (arr ? arr[y] / (real ? r.def(y * 12) : 1) : null);
  const yr0 = new Date().getFullYear(); const endY = yr0 + H;
  const P = patrimony(); const dN = real ? r.def(N) : 1; const base = at(r.base, N), put = real ? r.putReal[N] : r.put[N], gain = Math.round(base) - Math.round(put); // same rounded figure as the summary card
  const s1 = cssv('--s1'), s2 = cssv('--s2'), s3 = cssv('--s3'), s7 = cssv('--s7'), ink = cssv('--ink'), ink2 = cssv('--ink-2');
  const tile = (l, v, s, c) => `<div class="tile"><span class="l">${l}</span><span class="v ${c || ''}">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  { const putR = Math.round(put), baseR = Math.round(base), gainR = baseR - putR, lo = atY(r.p10, H), hi = atY(r.p90, H);
    $('#pjTiles').innerHTML = `<div class="tile pj-sum"><div class="pj-top"><div><span class="l">En ${endY} · escenario base</span><span class="v pj-big num">${eur(baseR, 0)}</span><span class="s">${r.inc ? 'inversiones y efectivo' : 'solo inversiones'} · ${real ? 'euros de hoy' : `euros de ${endY}`}</span></div><div class="pj-rng"><span class="s">8 de cada 10 simulaciones</span><b class="num" title="${eur(lo, 0)} – ${eur(hi, 0)}">${pjRange(lo, hi)}</b></div></div>
      <div class="pj-eqbar" aria-hidden="true"><i style="flex:${Math.max(0, putR)} 1 0;background:${cssv('--s7')}"></i><i style="flex:${Math.max(0, gainR)} 1 0;background:${cssv('--s1')}"></i></div>
      <div class="pj-eq"><div><span class="l"><i class="dot" style="background:${cssv('--s7')}"></i>Lo que pones tú</span><b class="num">${eur(putR, 0)}</b><span class="s">lo que ya pusiste + ${eur(o.m, 0)}/mes${real ? ', en euros de hoy' : ''}</span></div><span class="op">+</span><div><span class="l"><i class="dot" style="background:${cssv('--s1')}"></i>Rentabilidad</span><b class="num ${cls(gainR)}">${eur(gainR, 0)}</b><span class="s">${pct(baseR ? gainR / baseR : 0, 0)} del final</span></div><span class="op">=</span><div><span class="l">Final</span><b class="num">${eur(baseR, 0)}</b><span class="s">en ${endY}</span></div></div>
      <span class="s">${real ? `En euros de ${endY}, esos ${eur(baseR, 0)} serían ${eur(r.base[N], 0)}.` : `En euros de hoy, esos ${eur(baseR, 0)} serían ${eur(r.base[N] / r.def(N), 0)}.`}${r.inc ? ` Empiezas con ${eur(r.start, 0)}: inversiones ${eurK(P.inv)} y efectivo ${eurK(P.cash)}.` : ''}</span>
      ${r.inc && typeof goalInfo === 'function' && goalInfo() ? `<p class="pj-cash">Incluye todo tu efectivo, también lo que reservas para «${esc(goalInfo().name)}». Si lo vas a gastar, mejor proyectar sin efectivo.</p>` : ''}${!r.inc && P.cash > 0.5 ? `<p class="pj-cash">Tu efectivo (${eur(P.cash, 0)}) no está incluido. Puedes sumarlo en «Cambiar».</p>` : ''}</div>`; }
  $('#pjTitle').textContent = `${r.inc ? 'Tu patrimonio' : 'Tus inversiones'} en ${H} año${H === 1 ? '' : 's'}`;
  $('#pjHv').textContent = `${H} año${H === 1 ? '' : 's'} (${endY})`;
  // Chart: real history (year ends + today) then one point per future year
  const S2 = res.series; const today = res.totals.today; const firstY = +S2[0].date.slice(0, 4);
  const past = [];
  for (let y = firstY; y < +today.slice(0, 4); y++) { const d = `${y}-12-31`; let p = null; for (const z of S2) { if (z.date <= d) p = z; else break; } if (p) past.push({ lab: String(y), v: p.value + (r.inc ? cashAt(p.date) : 0) }); }
  const labels = past.map((p) => p.lab).concat(['Hoy']).concat(Array.from({ length: H }, (_, i) => String(yr0 + i + 1)));
  const np = past.length; const pad = (a) => Array(np).fill(null).concat(a);
  const fut = (arr) => pad(Array.from({ length: H + 1 }, (_, y) => at(arr, y * 12)));
  const band = (arr) => pad(Array.from({ length: H + 1 }, (_, y) => atY(arr, y)));
  const ds = [
    { label: 'Banda baja (p10)', data: band(r.p10), borderColor: 'transparent', pointRadius: 0, fill: false, _band: true },
    { label: 'Banda alta (p90)', data: band(r.p90), borderColor: 'transparent', backgroundColor: alpha(s1, darkUI() ? 0.24 : 0.13), pointRadius: 0, fill: '-1', _band: true },
    { label: 'Optimista', data: fut(r.opt), borderColor: s3 },
    { label: 'Base', data: fut(r.base), borderColor: s1, borderWidth: 3 },
    { label: 'Pesimista', data: fut(r.pess), borderColor: s2 },
  ];
  if (r.hist) ds.push({ label: 'Tu histórico', data: fut(r.hist), borderColor: s7, borderDash: [2, 3], hidden: !ui.pjHist, _hist: true });
  ds.push({ label: 'Aportado', data: pad(Array.from({ length: H + 1 }, (_, y) => (real ? r.putReal[y * 12] : r.put[y * 12]))), borderColor: ink2, borderDash: [5, 4], borderWidth: 1.5 });
  ds.push({ label: 'Real hasta hoy', data: past.map((p) => p.v).concat([r.start]).concat(Array(H).fill(null)), borderColor: ink, borderWidth: 2.5, pointRadius: 2 });
  if (projChart) { try { projChart.destroy(); } catch (e) {} const i = charts.indexOf(projChart); if (i >= 0) charts.splice(i, 1); projChart = null; }
  const C = chartBase(); lineHover(ds);
  if (C && $('#cProj')) {
    projChart = mkChart(C, $('#cProj'), {
      type: 'line', data: { labels, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        elements: { point: { radius: 0, hoverRadius: 4, hitRadius: 6 }, line: { borderWidth: 2, tension: 0.25 } },
        plugins: { legend: { display: false }, tooltip: tip((v) => eur(v, 0), { itemSort: (a, b) => b.parsed.y - a.parsed.y, filter: (it) => it.parsed.y != null && (it.label !== 'Hoy' || it.dataset.label === 'Real hasta hoy'), callbacks: { title: (it) => { if (!it.length) return ''; const l = it[0].label; const i = it[0].dataIndex - np; return l === 'Hoy' ? 'Hoy' : i > 0 ? `${l} · dentro de ${i} año${i === 1 ? '' : 's'}` : `Final de ${l}`; }, label: (c) => ` ${c.dataset.label}: ${eur(c.parsed.y, 0)}` } }) },
        scales: { x: { grid: { display: false }, border: { color: cssv('--line') }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: window.innerWidth < 640 ? 5 : 11 } }, y: { grid: { color: cssv('--grid') }, border: { display: false }, suggestedMin: 0, ticks: { maxTicksLimit: 6, callback: (v) => eurK(v) }, afterDataLimits: pjYLimit } },
      }, plugins: [crosshair],
    }, { relabel: false });
    charts.push(projChart);
  }
  $('#pjLegend').innerHTML = `<span><i class="line" style="background:${ink}"></i>Real hasta hoy</span><span><i class="line" style="background:${s3}"></i>Optimista ${pctS(r.R.opt, 1)}</span><span><i class="line" style="background:${s1}"></i>Base ${pctS(r.R.base, 1)}</span><span><i class="line" style="background:${s2}"></i>Pesimista ${pctS(r.R.pess, 1)}</span>${r.hist ? `<button type="button" class="lgbtn" id="pjHistBtn" aria-pressed="${!!ui.pjHist}" title="${ui.pjHist ? 'Ocultar' : 'Mostrar'} la línea de tu histórico"><i class="dash" style="border-color:${s7}"></i>Tu histórico ${pctS(r.hrP, 1)}/año${r.hrP !== r.hr ? ` (limitada al ${pct(r.hrP, 0)})` : ''}${ui.pjHist ? '' : ' · mostrar'}</button>` : ''}<span><i style="background:${alpha(s1, 0.25)}"></i>Rango probable</span><span><i class="dash" style="border-color:${ink2}"></i>Aportado</span>`;
  const lp = r.lossProb[Math.min(H, 10)];
  $('#pjFoot').innerHTML = `${real ? `Cifras en euros de hoy (inflación ${pct(o.inf / 100, 1)}). ` : 'Cifras nominales, sin descontar inflación. '}En el escenario base, en ${endY} la rentabilidad habría generado <b class="num gain">${eurS(gain, 0)}</b> sobre lo aportado. Probabilidad de tener menos de lo aportado a ${Math.min(H, 10)} año${Math.min(H, 10) === 1 ? '' : 's'}: <b class="num">${pct(lp, 0)}</b>.`;
  // Mix explanation
  const ks = Object.keys(r.R.w).filter((k) => k !== 'cash').sort((a, b) => r.R.w[b] - r.R.w[a]);
  const t = res.totals; const months = t.firstDate ? Math.round((Date.parse(t.today) - Date.parse(t.firstDate)) / 864e5 / 30.4) : 0;
  $('#pjMix').innerHTML = `<p><b>Tu cartera.</b> Con tu reparto (${ks.map((k) => `${esc(CLS_LABEL[k] || k)} ${pct(r.R.tot ? r.R.w[k] / r.R.tot : 0, 0)}`).join(', ')}) sale un <b>${pctS(r.R.base, 1)}</b> anual en el escenario base (${pctS(r.R.pess, 1)} a ${pctS(r.R.opt, 1)}) y una volatilidad estimada del <b>${pct(r.R.vol, 0)}</b>.</p><p>${r.hist ? `La rentabilidad de tu estrategia (TWR) hasta hoy es <b>${pctS(r.hr, 1)}</b> anual en ${months} meses${months < 60 ? ': poco tiempo para extrapolarla' : ''}${Math.abs(r.hr - r.R.base) > 0.03 ? `, ${r.hr > r.R.base ? 'bastante por encima' : 'bastante por debajo'} de lo que cabe esperar a largo plazo` : ''}.${r.hrP !== r.hr ? ` La línea «Tu histórico» la limita al ${pct(r.hrP, 0)}.` : ''}` : `Con menos de un año de historial no se muestra la línea de tu histórico.`}</p>`;
  // Milestones (in the chosen units, base scenario; earliest = optimistic, latest = pessimistic)
  const reach = (arr, x) => { for (let k = 0; k <= N; k++) if (at(arr, k) >= x) return k; return null; };
  const now = at(r.base, 0); const ms = PJ_MS.filter((x) => x > now).slice(0, 5);
  const when = (k) => { if (k == null) return null; const d = new Date(); d.setMonth(d.getMonth() + k); return d; };
  const mlab = (k) => { const d = when(k); return d ? d.toLocaleDateString(L, { month: 'short', year: 'numeric' }) : '—'; };
  const yrs = (k) => (k < 12 ? `${k} mes${k === 1 ? '' : 'es'}` : k === 12 ? '1 año' : `${NF({ maximumFractionDigits: 1 }).format(k / 12)} años`);
  $('#pjMsSub').textContent = real ? 'en euros de hoy' : 'nominal';
  $('#pjMs').innerHTML = (ms.length ? `<ol class="mstl">${ms.map((x, j) => { const kb = reach(r.base, x), ko = reach(r.opt, x), kp = reach(r.pess, x); const prog = j === 0 && now > 0 ? `<div class="ms-prog"><div class="bar"><span style="width:${Math.min(100, now / x * 100).toFixed(1)}%"></span></div><span>llevas el ${pct(now / x, 0)}</span></div>` : ''; return `<li class="${j === 0 ? 'next' : kb == null ? 'far' : ''}"><span class="k"><b>${eurK(x)}</b><small>${kb != null ? `entre ${mlab(ko)} y ${kp != null ? mlab(kp) : `después de ${endY}`}` : ko != null ? `solo en el optimista: ${mlab(ko)}` : `no se alcanza antes de ${endY}`}</small>${prog}</span><span class="v">${kb != null ? `${mlab(kb)}<div class="small muted">en ${yrs(kb)}</div>` : '—'}</span></li>`; }).join('')}</ol>` : '<p class="muted">Ya superas todos los hitos.</p>')
    + `<div class="explain" style="margin-top:8px"><p><b>Renta que podría darte.</b> Con la regla del 4 % (retirar un 4 % al año, ajustado por inflación), el escenario base en ${endY} permitiría unos <b>${eur(r.base[N] / r.def(N) * 0.04 / 12, 0)} al mes</b> en euros de hoy (${eur(r.pess[N] / r.def(N) * 0.04 / 12, 0)} en el pesimista).</p></div>`;
  // Table
  const ys = Array.from(new Set([1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40].filter((y) => y < H).concat([H])));
  $('#pjTblSub').textContent = real ? 'euros de hoy' : 'nominal';
  $('#pjTbl').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Año</th><th class="n">Aportado</th><th class="n">Pesimista</th><th class="n">Base</th><th class="n">Optimista</th><th class="n">Rango probable</th>${r.hist ? '<th class="n">Tu histórico</th>' : ''}</tr></thead><tbody>${ys.map((y) => { const k = y * 12; return `<tr><td>${yr0 + y} <span class="muted small">(${y} a.)</span></td><td class="n">${eur((real ? r.putReal[k] : r.put[k]), 0)}</td><td class="n">${eur(at(r.pess, k), 0)}</td><td class="n"><b>${eur(at(r.base, k), 0)}</b></td><td class="n">${eur(at(r.opt, k), 0)}</td><td class="n muted">${eurK(atY(r.p10, y))} – ${eurK(atY(r.p90, y))}</td>${r.hist ? `<td class="n">${eur(at(r.hist, k), 0)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
}
vProyeccion.after = function () {
  const form = $('#pjForm'); if (!form) return;
  let pjT = null;
  form.addEventListener('input', () => { const cs = $('#pjCS'); if (cs && $('#pjC')) { cs.disabled = $('#pjC').value !== '1'; $('#pjCSh').textContent = pjCSHint(!cs.disabled); } clearTimeout(pjT); pjT = setTimeout(() => { const o = pjRead(); if (!o) return; o.mode = pjOpts().mode; pjSave(o); renderProj(); }, 120); });
  $('#pjLegend').addEventListener('click', (e) => { const b = e.target.closest('#pjHistBtn'); if (!b) return; ui.pjHist = !ui.pjHist; renderProj(); const nb = $('#pjHistBtn'); if (nb) nb.focus(); });
  const det = form.querySelector('details'); if (det) det.addEventListener('toggle', () => { ui.pjOpen = det.open; });
  renderProj();
};

function divColor(v, max) {
  if (!ok(v)) return 'transparent';
  const a = Math.min(1, Math.abs(v) / max);
  const c = v >= 0 ? cssv('--div-pos') : cssv('--div-neg');
  return `color-mix(in srgb, ${c} ${Math.round(12 + a * (themeEff() === 'dark' ? 40 : 58))}%, ${cssv('--div-mid')})`;
}
function heatmap() {
  const byYear = {};
  for (const [m, r] of Object.entries(res.monthly)) { const [y, mo] = m.split('-'); (byYear[y] = byYear[y] || {})[+mo] = r; }
  const ys = Object.keys(byYear).sort().reverse();
  const nd = monthNoData(); const mk = (y, i) => `${y}-${String(i + 1).padStart(2, '0')}`;
  const vals = Object.entries(res.monthly).filter(([m, v]) => ok(v) && !nd.has(m)).map(([, v]) => Math.abs(v)); const max = Math.max(0.03, ...vals);
  const yNd = (y) => Object.keys(byYear[y]).every((mo) => nd.has(mk(y, mo - 1)));
  const mn = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const cell = (y, i) => { const v = byYear[y] && byYear[y][i + 1]; if (v != null && nd.has(mk(y, i))) return '<td class="cell nd" title="Sin precios de mercado este mes">s/d</td>'; return `<td class="cell" style="background:${v != null ? divColor(v, max) : 'transparent'}" title="${v != null ? pctS(v) : ''}">${v != null ? pctS(v, 1) : ''}</td>`; };
  const yCell = (y) => (yNd(y) ? '<td class="cell y nd">s/d</td>' : `<td class="cell y" style="background:${divColor(res.yearly[y], max * 3)}">${pctS(res.yearly[y], 1)}</td>`);
  // On a phone the months go down and the years across, so the whole year fits without scrolling sideways
  if (window.innerWidth < 640 && ys.length <= 4) return `<div class="tbl-wrap"><table class="heat heatv"><thead><tr><th></th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>${mn.map((m, i) => `<tr><th>${m}</th>${ys.map((y) => cell(y, i)).join('')}</tr>`).join('')}<tr class="yr"><th>Año</th>${ys.map(yCell).join('')}</tr></tbody></table></div>`;
  return `<div class="tbl-wrap"><table class="heat"><thead><tr><th></th>${mn.map((m) => `<th>${m}</th>`).join('')}<th>Año</th></tr></thead><tbody>${ys.map((y) => `<tr><th>${y}</th>${mn.map((_, i) => { const v = byYear[y][i + 1]; if (v != null && nd.has(mk(y, i))) return '<td class="cell nd" title="Sin precios de mercado este mes">s/d</td>'; return `<td class="cell" style="background:${divColor(v, max)}" title="${v != null ? pctS(v) : ''}">${v != null ? pctS(v, 1) : ''}</td>`; }).join('')}${yNd(y) ? '<td class="cell y nd">s/d</td>' : `<td class="cell y" style="background:${divColor(res.yearly[y], max * 3)}">${pctS(res.yearly[y], 1)}</td>`}</tr>`).join('')}</tbody></table></div>`;
}

