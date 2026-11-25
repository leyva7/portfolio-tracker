/* ---------- Analysis: "Where in the world is your money?" (idea 16) ----------
 * The real split of what is invested in stocks by region, looking inside each fund with the approximate weights of its index.
 * Each asset can store its own weights (asset.zones, in %, adding up to 100) from "Edit details"; otherwise they come from its equity type (subOf).
 * Gold, bonds, crypto and other have no region: they are shown separately. Cash does not count (it is not invested).
 */
const ZONES = [['us', 'US'], ['eu', 'Europe'], ['jp', 'Japan'], ['dev', 'Other developed'], ['em', 'Emerging markets']];
const ZONE_LABEL = Object.fromEntries(ZONES);
// Approximate weights (%) of the reference indices of each equity type, rounded (end of 2026)
const ZONE_DEF = {
  us: { us: 100 },
  em: { em: 100 },
  small: { us: 62, eu: 15, jp: 12, dev: 11 }, // MSCI World Small Cap
  dev: { eu: 58, jp: 22, dev: 20 }, // MSCI World ex USA
  world: { us: 62, eu: 15, jp: 5, dev: 7, em: 11 }, // MSCI ACWI IMI, same as ZONE_WORLD
};
// Reference world stocks (MSCI ACWI IMI, approx.) for the mark on each bar
const ZONE_WORLD = { us: 62, eu: 15, jp: 5, dev: 7, em: 11 };
/** Regional weights of an asset (fractions adding up to 1) if it is equity; null if it has no region. */
function zonesOf(a, auto) {
  if (!a) return null;
  if (!auto && a.zones && typeof a.zones === 'object') { const t = ZONES.reduce((s, [k]) => s + (+a.zones[k] || 0), 0); if (t > 0) return Object.fromEntries(ZONES.map(([k]) => [k, (+a.zones[k] || 0) / t])); }
  const k = subOf(a);
  if (!SUB_EQ.includes(k)) return null;
  let d = ZONE_DEF[k];
  if (!d) { // sector fund or single stock: by its currency or its name
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
    if (!w) { none += p.value; noneN.push(CLS_LABEL[clsOf(p.asset)] || 'other'); continue; }
    for (const [k] of ZONES) by[k] += p.value * w[k];
    funds.push({ name: shortName(p.asset), w, own: !!(p.asset.zones && Object.keys(p.asset.zones).length), value: p.value });
  }
  const eq = tot - none;
  return { by, eq, tot, none, noneN: [...new Set(noneN)], funds: funds.sort((a, b) => b.value - a.value) };
}
function zonePanel() { const b = zoneBody(); return b ? `<section class="panel" id="zonePanel"><div class="panel-h"><div><h2>Where in the world is your money?</h2><div class="small muted">the money in stocks, looking inside each fund</div></div><span class="small muted num">${eur(zoneSplit().eq, 0)}</span></div>${b}</section>` : ''; }
function zoneBody(map) {
  if (!res || DEMO) return '';
  const z = zoneSplit(); if (!(z.eq > 0)) return '';
  const rows = ZONES.map(([k, l]) => ({ k, l, v: z.by[k], w: z.by[k] / z.eq })).sort((a, b) => b.v - a.v);
  const maxW = Math.max(...rows.map((r) => r.w), ...rows.map((r) => ZONE_WORLD[r.k] / 100));
  const top = rows[0];
  const fmtW = (w) => ZONES.filter(([k]) => w[k] > 0.004).sort((a, b) => w[b[0]] - w[a[0]]).map(([k, l]) => `${l} ${pct(w[k], 0)}`).join(' · ');
  return `${map ? zoneMap(rows) : `<div class="zone-list" role="list">${rows.map((r) => `<div class="zone-r" role="listitem"><span class="zl">${r.l}</span><span class="zb" aria-hidden="true"><span style="width:${(r.w / maxW * 100).toFixed(1)}%"></span><i style="left:${(ZONE_WORLD[r.k] / 100 / maxW * 100).toFixed(1)}%" title="World stocks: ${ZONE_WORLD[r.k]} %"></i></span><span class="num zv">${eur(r.v, 0)}</span><span class="num zp">${pct(r.w, 0)}</span></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Your money</span><span><i class="zone-tick"></i>World stocks (MSCI ACWI IMI, approx.)</span></div>`}
    <p class="small" style="margin:0">${top.l} holds <b>${pct(top.w, 0)}</b> of your stocks (${eur(top.v, 0)}); in world stocks it weighs about ${ZONE_WORLD[top.k]} %.${(() => { const gp = (r) => r.w * 100 - ZONE_WORLD[r.k]; const more = rows.filter((r) => gp(r) >= 5 && r !== top), less = rows.filter((r) => gp(r) <= -5); const f = (r) => `${r.l} (${pct(r.w, 0)} against ${ZONE_WORLD[r.k]} %)`; return more.length || less.length ? ` Compared with the world you hold ${[more.length ? `more ${more.map(f).join(' and ')}` : '', less.length ? `less ${less.map(f).join(' and ')}` : ''].filter(Boolean).join(' and ')}. It is not a mistake: it is a bet on those regions.` : ' Your split looks like that of world stocks.'; })()}${z.none > 0.5 ? ` You also have ${eur(z.none, 0)} with no region (${z.noneN.join(', ').toLowerCase()}).` : ''}</p>
    <details class="an-not"><summary>How it is calculated</summary><ul>${z.funds.map((f) => `<li><b>${esc(f.name)}</b>: ${fmtW(f.w)}${f.own ? ' (your weights)' : ''}</li>`).join('')}</ul>
      <p class="small muted" style="margin:6px 0 0">These are the approximate weights of each index (S&amp;P 500, MSCI Emerging Markets, MSCI World Small Cap…), which change slowly. If your fund is different, change them on its page › Edit details › Regions.</p></details>`;
}
