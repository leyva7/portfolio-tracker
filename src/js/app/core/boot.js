/* ================= Boot ================= */
const h0 = (location.hash || '').slice(1); if (['home', 'portfolio', 'cash', 'transactions', 'analysis', 'plan', 'taxes', 'settings'].includes(h0)) ui.tab = h0;
demoData = makeDemo();
render();
if (!window.Chart) { let n = 0; const iv = setInterval(() => { if (window.Chart || ++n > 40) { clearInterval(iv); render(); } }, 150); }
initCaps();
})();
