/* Theme: Auto (follow Claude/system) · Claro · Oscuro */
const hostTheme = document.documentElement.getAttribute('data-theme');
let themePref = 'auto'; try { themePref = localStorage.getItem('cartera-theme') || 'auto'; } catch (e) {}
const THEME_ICON = { auto: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11" /><path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>', light: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/></svg>', dark: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>' };
const THEME_LBL = { auto: 'Tema automático', light: 'Tema claro', dark: 'Tema oscuro' };
function applyTheme() {
  const r = document.documentElement;
  if (themePref === 'auto') { if (hostTheme) r.setAttribute('data-theme', hostTheme); else r.removeAttribute('data-theme'); } else r.setAttribute('data-theme', themePref);
  const b = $('#btnTheme'); b.innerHTML = THEME_ICON[themePref]; b.title = THEME_LBL[themePref] + ' · pulsa para cambiar'; b.setAttribute('aria-label', THEME_LBL[themePref]);
}
/** Theme actually on screen, and the one of the system/Claude (what «auto» gives). */
const sysTheme = () => hostTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const themeEff = () => (themePref === 'auto' ? sysTheme() : themePref);
// every press flips what is on screen; landing on the system theme goes back to «auto»
$('#btnTheme').addEventListener('click', () => { const next = themeEff() === 'dark' ? 'light' : 'dark'; themePref = next === sysTheme() ? 'auto' : next; try { localStorage.setItem('cartera-theme', themePref); } catch (e) {} applyTheme(); toast(themePref === 'auto' ? `${THEME_LBL.auto} (${next === 'dark' ? 'oscuro' : 'claro'})` : THEME_LBL[themePref]); });
applyTheme();
$('#btnAddTx').addEventListener('click', () => openTxForm());
/* Privacy: blur every euro amount (percentages stay readable); remembered on this device */
let privOn = false; try { privOn = localStorage.getItem('cartera-priv') === '1'; } catch (e) {}
const EUR_RX = /(?:(?:US|CA|AU|HK)?\$|£)?\s?[+\-−]?\d[\d.]*(?:,\d+)?\s?(?:[kM]\s?)?(?:€|(?:US|CA|AU|HK)?\$|£|CHF|GBX|GBp)(?:\/(?:año|mes))?|(?:US\$|\$|£)\s?[+\-−]?\d[\d.]*(?:,\d+)?/g;
const CCY_HAS = /€|\$|£|CHF|GBX|GBp/;
function markPriv(root) {
  if (!privOn || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (CCY_HAS.test(n.nodeValue) && n.parentElement && !n.parentElement.closest('.pv,script,style') ? 1 : 3) });
  const hits = []; let n; while ((n = w.nextNode())) hits.push(n);
  for (const t of hits) {
    const p = t.parentElement, txt = t.nodeValue;
    if (txt.trim().length <= 24 && p.childNodes.length === 1) { p.classList.add('pv'); continue; }
    const frag = document.createDocumentFragment(); let i = 0; txt.replace(EUR_RX, (m, at) => { if (at > i) frag.appendChild(document.createTextNode(txt.slice(i, at))); const sp = document.createElement('span'); sp.className = 'pv'; sp.textContent = m; frag.appendChild(sp); i = at + m.length; return m; });
    if (i) { if (i < txt.length) frag.appendChild(document.createTextNode(txt.slice(i))); t.replaceWith(frag); }
  }
}
function applyPriv() { document.body.classList.toggle('priv', privOn); const b = $('#btnPriv'); b.setAttribute('aria-pressed', String(privOn)); b.title = privOn ? 'Mostrar importes' : 'Ocultar importes'; b.setAttribute('aria-label', b.title); markPriv(document.body); }
new MutationObserver((recs) => { if (!privOn) return; for (const r of recs) { if (r.type === 'characterData') markPriv(r.target.parentElement); else r.addedNodes.forEach((x) => markPriv(x.nodeType === 3 ? x.parentElement : x)); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
$('#btnPriv').addEventListener('click', () => { privOn = !privOn; try { localStorage.setItem('cartera-priv', privOn ? '1' : '0'); } catch (e) {} applyPriv(); toast(privOn ? 'Importes ocultos. Pulsa el ojo para verlos.' : 'Importes visibles.'); });
applyPriv();
const reTheme = () => { if (!$('#overlay').hidden) return; render(); };
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reTheme); } catch (e) {}
new MutationObserver(reTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

