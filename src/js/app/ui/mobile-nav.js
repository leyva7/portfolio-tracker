/* ================= Mobile: bottom nav & sheets ================= */
const MORE_TABS = [['efectivo', 'Efectivo', '€', 'cuentas, ingresos y retiradas'], ['operaciones', 'Movimientos', '⇅', 'operaciones y efectivo, en una lista'], ['fiscal', 'Impuestos', '%', 'ganancias y rentas por ejercicio'], ['activos', 'Ajustes', '⚙', 'activos, precios, copia de seguridad']];
/* Four sections (Inicio, Cartera, Análisis, Plan) plus detail views that hang from them; Ajustes goes back to where you were */
const MAIN_TABS = ['resumen', 'posiciones', 'analisis', 'proyeccion'];
const TAB_GROUP = { efectivo: 'posiciones', operaciones: 'posiciones', fiscal: 'analisis' };
const TAB_NAME = { resumen: 'Inicio', posiciones: 'Cartera', analisis: 'Análisis', proyeccion: 'Plan' };
function syncBnav() { const g = TAB_GROUP[ui.tab] || (ui.tab === 'activos' ? ui.lastMain || 'resumen' : ui.tab); $$('#bnav button[data-bt]').forEach((b) => { if (b.dataset.bt === g) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }
function syncTabGroups() { const g = TAB_GROUP[ui.tab] || ui.tab; $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === g))); }
/** Detail views show a way back instead of sub-tabs. */
function subTabs() {
  const to = TAB_GROUP[ui.tab] || (ui.tab === 'activos' ? ui.lastMain || 'resumen' : null); if (!to) return '';
  return `<a class="backlink" href="#${to}" data-goto="${to}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>${ui.tab === 'activos' ? 'Volver' : TAB_NAME[to]}</a>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest('.subtabs [data-tab]'); if (!b || b.dataset.tab === ui.tab) return; ui.tab = b.dataset.tab; try { history.replaceState(null, '', '#' + ui.tab); } catch (er) {} render(); });
/* Secondary panels start folded in Resumen and Análisis; the viewer's choice is remembered */
const FOLD = { posiciones: ['Última sesión'], analisis: ['Rentabilidad por año y fondo', '¿Qué tal está construida'], proyeccion: ['Hitos', 'Año a año'] };
let foldPref = null;
const foldGet = () => { if (!foldPref) { try { foldPref = JSON.parse(localStorage.getItem('cartera-fold') || '{}') || {}; } catch (e) { foldPref = {}; } } return foldPref; };
function foldPanels(v) {
  const L = FOLD[ui.tab]; if (!L) return; const P = foldGet();
  v.querySelectorAll('section.panel').forEach((s) => {
    const h = s.querySelector('h2'); if (!h || s.classList.contains('fold')) return; const n = L.find((x) => h.textContent.trim().startsWith(x)); if (!n) return;
    let hd = h; while (hd.parentElement && hd.parentElement !== s) hd = hd.parentElement; if (hd.parentElement !== s) return;
    if (hd === h) { const w = document.createElement('div'); w.className = 'panel-h'; s.insertBefore(w, h); w.appendChild(h); hd = w; }
    const k = ui.tab + ':' + n, open = !!P[k];
    s.classList.add('fold'); s.classList.toggle('folded', !open); hd.classList.add('fold-h');
    hd.insertAdjacentHTML('beforeend', `<button type="button" class="btn ghost small fold-btn" data-fold="${esc(k)}" aria-expanded="${open}">${open ? 'Ocultar' : 'Ver más'}</button>`);
  });
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-fold]'); if (!b) return; const P = foldGet(); P[b.dataset.fold] = b.getAttribute('aria-expanded') === 'true' ? 0 : 1; try { localStorage.setItem('cartera-fold', JSON.stringify(P)); } catch (er) {} render(); const f = $(`[data-fold="${CSS.escape(b.dataset.fold)}"]`); if (f) f.focus({ preventScroll: true }); });
