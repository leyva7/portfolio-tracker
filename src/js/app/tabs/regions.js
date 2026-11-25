/* ---------- Análisis: «¿En qué zonas está tu dinero?» (idea 16) ----------
 * Reparto real de lo invertido en bolsa por región, mirando dentro de cada fondo con los pesos aproximados de su índice.
 * Cada activo puede guardar sus propios pesos (asset.zones, en %, suman 100) desde «Editar datos»; si no, se deducen de su tipo de bolsa (subOf).
 * Oro, renta fija, cripto y otros no tienen región: salen aparte. El efectivo no cuenta (no está invertido).
 */
const ZONES = [['us', 'EE. UU.'], ['eu', 'Europa'], ['jp', 'Japón'], ['dev', 'Otros desarrollados'], ['em', 'Emergentes']];
const ZONE_LABEL = Object.fromEntries(ZONES);
// Pesos aproximados (%) de los índices de referencia de cada tipo de bolsa, redondeados (finales de 2026)
const ZONE_DEF = {
  us: { us: 100 },
  em: { em: 100 },
  small: { us: 62, eu: 15, jp: 12, dev: 11 }, // MSCI World Small Cap
  dev: { eu: 58, jp: 22, dev: 20 }, // MSCI World ex USA
  world: { us: 62, eu: 15, jp: 5, dev: 7, em: 11 }, // MSCI ACWI IMI, same as ZONE_WORLD
};
// Bolsa mundial de referencia (MSCI ACWI IMI, aprox.) para la marca de cada barra
const ZONE_WORLD = { us: 62, eu: 15, jp: 5, dev: 7, em: 11 };
/** Pesos por región de un activo (fracciones que suman 1), si es de bolsa; null si no tiene región. */
function zonesOf(a, auto) {
  if (!a) return null;
  if (!auto && a.zones && typeof a.zones === 'object') { const t = ZONES.reduce((s, [k]) => s + (+a.zones[k] || 0), 0); if (t > 0) return Object.fromEntries(ZONES.map(([k]) => [k, (+a.zones[k] || 0) / t])); }
  const k = subOf(a);
  if (!SUB_EQ.includes(k)) return null;
  let d = ZONE_DEF[k];
  if (!d) { // sectorial o acción: por su divisa o su nombre
    const n = `${a.name || ''} ${a.category || ''}`;
    d = a.currency === 'USD' || /s&p|nasdaq|\busa?\b|u\.s\.|america/i.test(n) ? { us: 100 } : /europ|stoxx|ibex|dax|cac/i.test(n) ? { eu: 100 } : ZONE_DEF.world;
  }
  return Object.fromEntries(ZONES.map(([z]) => [z, (d[z] || 0) / 100]));
}
function zoneSplit() {
  const by = Object.fromEntries(ZONES.map(([k]) => [k, 0])); const funds = []; let none = 0, noneN = []; let tot = 0;
  for (const p of res.positions) {
    if (!p.open || !(p.value > 0)) continue; tot += p.value;
    const w = zonesOf(p.asset); const nm = p.asset.ticker || p.asset.name;
    if (!w) { none += p.value; noneN.push(CLS_LABEL[clsOf(p.asset)] || 'otros'); continue; }
    for (const [k] of ZONES) by[k] += p.value * w[k];
    funds.push({ name: shortName(p.asset), w, own: !!(p.asset.zones && Object.keys(p.asset.zones).length), value: p.value });
  }
  const eq = tot - none;
  return { by, eq, tot, none, noneN: [...new Set(noneN)], funds: funds.sort((a, b) => b.value - a.value) };
}
function zonePanel() { const b = zoneBody(); return b ? `<section class="panel" id="zonePanel"><div class="panel-h"><div><h2>¿En qué zonas está tu dinero?</h2><div class="small muted">lo invertido en bolsa, mirando dentro de cada fondo</div></div><span class="small muted num">${eur(zoneSplit().eq, 0)}</span></div>${b}</section>` : ''; }
function zoneBody(map) {
  if (!res || DEMO) return '';
  const z = zoneSplit(); if (!(z.eq > 0)) return '';
  const rows = ZONES.map(([k, l]) => ({ k, l, v: z.by[k], w: z.by[k] / z.eq })).sort((a, b) => b.v - a.v);
  const maxW = Math.max(...rows.map((r) => r.w), ...rows.map((r) => ZONE_WORLD[r.k] / 100));
  const top = rows[0];
  const fmtW = (w) => ZONES.filter(([k]) => w[k] > 0.004).sort((a, b) => w[b[0]] - w[a[0]]).map(([k, l]) => `${l} ${pct(w[k], 0)}`).join(' · ');
  return `${map ? zoneMap(rows) : `<div class="zone-list" role="list">${rows.map((r) => `<div class="zone-r" role="listitem"><span class="zl">${r.l}</span><span class="zb" aria-hidden="true"><span style="width:${(r.w / maxW * 100).toFixed(1)}%"></span><i style="left:${(ZONE_WORLD[r.k] / 100 / maxW * 100).toFixed(1)}%" title="Bolsa mundial: ${ZONE_WORLD[r.k]} %"></i></span><span class="num zv">${eur(r.v, 0)}</span><span class="num zp">${pct(r.w, 0)}</span></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Tu dinero</span><span><i class="zone-tick"></i>Bolsa mundial (MSCI ACWI IMI, aprox.)</span></div>`}
    <p class="small" style="margin:0">${top.l} concentra el <b>${pct(top.w, 0)}</b> de tu bolsa (${eur(top.v, 0)}); en la bolsa mundial pesa alrededor del ${ZONE_WORLD[top.k]} %.${(() => { const gp = (r) => r.w * 100 - ZONE_WORLD[r.k]; const more = rows.filter((r) => gp(r) >= 5 && r !== top), less = rows.filter((r) => gp(r) <= -5); const f = (r) => `${r.l} (${pct(r.w, 0)} frente a ${ZONE_WORLD[r.k]} %)`; return more.length || less.length ? ` Frente al mundo llevas ${[more.length ? `más ${more.map(f).join(' y ')}` : '', less.length ? `menos ${less.map(f).join(' y ')}` : ''].filter(Boolean).join(' y ')}. No es un error: es una apuesta por esas zonas.` : ' Tu reparto se parece al de la bolsa mundial.'; })()}${z.none > 0.5 ? ` Además tienes ${eur(z.none, 0)} sin región (${z.noneN.join(', ').toLowerCase()}).` : ''}</p>
    <details class="an-not"><summary>Cómo se calcula</summary><ul>${z.funds.map((f) => `<li><b>${esc(f.name)}</b>: ${fmtW(f.w)}${f.own ? ' (tus pesos)' : ''}</li>`).join('')}</ul>
      <p class="small muted" style="margin:6px 0 0">Son los pesos aproximados de cada índice (S&amp;P 500, MSCI Emerging Markets, MSCI World Small Cap…), que cambian poco a poco. Si tu fondo es distinto, cámbialos en su ficha › Editar datos › Zonas.</p></details>`;
}
