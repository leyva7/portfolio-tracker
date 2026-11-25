/* ================= Period helpers ================= */
const PERIODS = [['1M', '1M'], ['3M', '3M'], ['YTD', 'Año'], ['1A', '1A'], ['3A', '3A'], ['MAX', 'Máx']];
function periodFrom(p) {
  if (!res || !res.totals.firstDate) return null;
  const t = res.totals.today; let d = null;
  if (p === '1M') d = E.addMonths(t, -1); else if (p === '3M') d = E.addMonths(t, -3); else if (p === 'YTD') d = t.slice(0, 4) + '-01-01'; else if (p === '1A') d = E.addMonths(t, -12); else if (p === '3A') d = E.addMonths(t, -36); else if (p === '5A') d = E.addMonths(t, -60);
  if (!d || d <= res.totals.firstDate) return null;
  return d;
}
function periodSeg(cur, attr) { const off = (k) => k !== 'MAX' && !periodFrom(k); const eff = off(cur) ? 'MAX' : cur; return `<div class="seg" role="group" aria-label="Periodo">${PERIODS.filter(([k]) => !off(k) || k === cur).map(([k, l]) => `<button type="button" data-${attr}="${k}" aria-pressed="${eff === k}"${off(k) ? ' disabled title="Tu historial es más corto que este periodo"' : ''}>${k === 'YTD' && res ? res.totals.today.slice(0, 4) : l}</button>`).join('')}</div>`; }
function sliceFrom(from) { const S2 = res.series; if (!from) return { base: null, pts: S2 }; const i = S2.findIndex((p) => p.date >= from); return { base: i > 0 ? S2[i - 1] : null, pts: i < 0 ? [] : S2.slice(i), i0: i }; }

