/* ================= Accessibility ================= */
document.head.insertAdjacentHTML('beforeend', `<style id="a11y">.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#pjLegend .lgbtn.lgbtn[aria-pressed=false]{opacity:1}#pjLegend .lgbtn.lgbtn[aria-pressed=false] i{opacity:.55}</style>`);
// Charts: append a short reading of the data to the canvas label, for screen readers
function chartAria(ch, fmt) {
  const cv = ch && ch.canvas; if (!cv) return;
  try {
    const base = cv.dataset.al != null ? cv.dataset.al : (cv.dataset.al = cv.getAttribute('aria-label') || '');
    const f = (v) => { let r; try { r = fmt ? fmt(v) : null; } catch (e) {} return typeof r === 'string' ? r : eur(v, 0); };
    const L = ch.data.labels || [], num = (d) => (d && typeof d === 'object' ? d.y : d);
    const lab = (l) => (/^\d{4}-\d{2}-\d{2}$/.test(l) ? fdate(l) : /^\d{4}-\d{2}$/.test(l) ? mmName(l) : String(l));
    const ds = ch.data.datasets.filter((d) => !d.hidden); let s = '';
    if (ch.config.type === 'doughnut') { const d = ds[0].data, tot = d.reduce((a, b) => a + (+b || 0), 0); s = L.map((l, i) => `${l} ${f(d[i])} (${pct(d[i] / tot, 0)})`).join(', '); }
    else if (ch.config.type === 'bar') {
      if (L.length <= 12 && ds.length === 1) s = L.map((l, i) => `${lab(l)} ${f(num(ds[0].data[i]))}`).join(', ');
      else s = (L.length > 1 ? `De ${lab(L[0])} a ${lab(L[L.length - 1])}. ` : '') + ds.filter((d) => d.label).slice(0, 4).map((d) => { const v = d.data.map(num); const tot = v.reduce((a, b) => a + (ok(b) ? b : 0), 0); let m = -1; v.forEach((x, i) => { if (ok(x) && (m < 0 || Math.abs(x) > Math.abs(v[m]))) m = i; }); return `${d.label}: total ${f(tot)}${m >= 0 ? `, máximo ${f(v[m])} en ${lab(L[m])}` : ''}`; }).join('. ');
    } else {
      const parts = ds.filter((d) => d.label && d.borderColor !== 'transparent' && d.data.some((x) => num(x))).slice(0, 6).map((d) => { const v = d.data.map(num); if (d.mk) return `${d.label}: ${v.filter(ok).length}`; let a = -1, b = -1; v.forEach((x, i) => { if (ok(x)) { if (a < 0) a = i; b = i; } }); return a < 0 ? '' : a === b ? `${d.label}: ${f(v[b])}` : `${d.label}: de ${f(v[a])} a ${f(v[b])}`; }).filter(Boolean);
      s = (L.length > 1 ? `Del ${lab(L[0])} al ${lab(L[L.length - 1])}. ` : '') + parts.join('. ');
    }
    cv.setAttribute('aria-label', (base ? base + '. ' : '') + s);
  } catch (e) {}
}
// Tabs: roving tabindex, tab/panel links and arrow keys (reads whatever tabs #tabs holds)
function tabsA11y() {
  const tabs = $$('#tabs [role=tab]'), v = $('#view'); if (!tabs.length || !v) return; let sel = null;
  tabs.forEach((b) => { if (!b.id) b.id = 'tab-' + b.dataset.tab; b.setAttribute('aria-controls', 'view'); const on = b.getAttribute('aria-selected') === 'true'; if (on) sel = b; b.tabIndex = on ? 0 : -1; });
  if (!sel) tabs[0].tabIndex = 0;
  v.setAttribute('role', 'tabpanel'); if (sel) v.setAttribute('aria-labelledby', sel.id);
}
document.addEventListener('keydown', (ev) => {
  const t = ev.target; if (!t.matches || !t.matches('#tabs [role=tab]')) return;
  const tabs = $$('#tabs [role=tab]').filter((b) => !b.hidden), i = tabs.indexOf(t), n = tabs.length, k = ev.key;
  const j = k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % n : k === 'ArrowLeft' || k === 'ArrowUp' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
  if (j < 0) return; ev.preventDefault(); const tab = tabs[j].dataset.tab; tabs[j].click();
  const f = $(`#tabs [data-tab="${tab}"]`); if (f) { f.focus(); f.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
});
new MutationObserver(tabsA11y).observe($('#tabs'), { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
tabsA11y();

