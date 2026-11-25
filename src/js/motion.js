/* Motion helpers shared with the app (window.__motion). Everything is a no-op with prefers-reduced-motion. */
(function () {
  'use strict';
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const TABS = ['home', 'portfolio', 'cash', 'analysis', 'plan', 'transactions', 'taxes', 'settings'];
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const M = window.__motion = { get reduced() { return mq.matches; } };
  let lastTab = null, wasLoading = false, loadT0 = 0, loadTimer = null;
  const prevNums = {}, prevFv = {};
  /** Brief green/red wash behind a figure whose value just changed. */
  function flash(el, up) { if (!el || mq.matches || document.hidden) return; el.classList.remove('m-flash', 'dn'); void el.offsetWidth; el.classList.add('m-flash'); el.classList.toggle('dn', !up); clearTimeout(el._fl); el._fl = setTimeout(() => el.classList.remove('m-flash', 'dn'), 800); }
  M.flash = flash;

  /** Tween el's text from `from` to `to`, writing fmt(v) each frame; the final frame writes `last` (or fmt(to)). */
  function tween(el, from, to, fmt, ms, last) {
    cancelAnimationFrame(el._mf); const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), v = from + (to - from) * ease(k); el._mc = v;
      if (k < 1) { el.textContent = fmt(v); el._mf = requestAnimationFrame(step); }
      else { el.textContent = last != null ? last : fmt(to); el._mf = 0; el._mc = null; }
    };
    el._mf = requestAnimationFrame(step);
  }
  /** Hero value: counts up on first show, then from the previous figure when it changes. */
  M.count = (el, v, fmt) => {
    if (!el) return;
    if (document.body.classList.contains('m-loading') || v == null || !Number.isFinite(v)) { cancelAnimationFrame(el._mf); el._v = null; return; }
    const prev = el._mc != null ? el._mc : el._v; el._v = v;
    if (mq.matches || document.hidden) { cancelAnimationFrame(el._mf); el._mc = null; return; }
    if (prev == null) return tween(el, 0, v, fmt, 900);
    if (Math.abs(v - prev) < 0.005) { if (!el._mf) return; return tween(el, prev, v, fmt, 300); }
    flash(el, v > prev); tween(el, prev, v, fmt, 650);
  };

  // Generic counters for tiles/KPIs: animate the first number of the text and keep its format (en-GB).
  const NUM = /[+\-−]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+\-−]?\d+(?:\.\d+)?/;
  const SKIP = /\d{4}-\d{2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)\b|\d+\s?(years?|months?|days?)\b/i;
  function parseCounter(el) {
    if (el.children.length) return null;
    const txt = el.textContent; if (!txt || SKIP.test(txt)) return null;
    const m = txt.match(NUM); if (!m) return null;
    const tok = m[0], sign = /^[+\-−]/.test(tok) ? tok[0] : '', body = sign ? tok.slice(1) : tok;
    const dec = body.includes('.') ? body.split('.')[1].length : 0, grp = body.includes(',');
    const n = parseFloat(body.replace(/,/g, '')); if (!Number.isFinite(n)) return null;
    const pre = txt.slice(0, m.index) + sign, post = txt.slice(m.index + tok.length);
    const fmt = (v) => { let s = Math.abs(v).toFixed(dec); let [i, d] = s.split('.'); if (grp) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ','); return pre + i + (d ? '.' + d : '') + post; };
    return { n, fmt, txt, neg: sign === '-' || sign === '−' };
  }
  function counters(v, tab, entering) {
    const els = Array.from(v.querySelectorAll('.tile .v, .kpi .v, .cash-bal')).slice(0, 24);
    const vh = innerHeight;
    els.forEach((el, i) => {
      const c = parseCounter(el); const key = tab + ':' + i;
      if (!c) { delete prevNums[key]; return; }
      const old = prevNums[key]; prevNums[key] = { n: c.n, neg: c.neg, txt: c.txt };
      if (mq.matches || document.hidden) return;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > vh) return;
      if (entering) { if (c.n) tween(el, 0, c.n, c.fmt, 700, c.txt); }
      else if (old && old.txt !== c.txt && old.neg === c.neg && old.n !== c.n) tween(el, old.n, c.n, c.fmt, 500, c.txt);
    });
  }

  /** Called by render() after a view is drawn: entrance on tab change, counters, tab indicator. */
  M.view = (v, tab) => {
    const entering = tab !== lastTab || wasLoading;
    const dir = lastTab && tab !== lastTab ? Math.sign(TABS.indexOf(tab) - TABS.indexOf(lastTab)) : 0;
    lastTab = tab; wasLoading = false;
    ink();
    if (entering && !mq.matches) {
      clearTimeout(v._mt); v.classList.remove('m-enter'); void v.offsetWidth;
      v.style.setProperty('--mdx', dir * 14 + 'px'); v.style.setProperty('--mdy', dir ? '0px' : '8px');
      Array.from(v.children).forEach((c, i) => { c.style.setProperty('--mi', Math.min(i, 8)); c.querySelectorAll(':scope .tiles>*, :scope .kpis>*').forEach((t, j) => t.style.setProperty('--mi', Math.min(i + j * 0.6 + 1, 10))); });
      v.classList.add('m-enter'); v._mt = setTimeout(() => v.classList.remove('m-enter'), 1100);
    }
    counters(v, tab, entering);
    v.querySelectorAll('[data-fv]').forEach((el) => { const k = tab + el.dataset.fv, n = +el.dataset.fn, o = prevFv[k]; prevFv[k] = n; if (!entering && o != null && Number.isFinite(n) && Math.abs(n - o) >= 0.005) flash(el, n > o); });
  };

  /** While the saved data is still arriving, show a skeleton instead of the example portfolio. Returns true if shown. */
  M.loading = (v, on, rerender) => {
    if (on && !loadT0) { loadT0 = Date.now(); loadTimer = setTimeout(() => { if (wasLoading && rerender) rerender(); }, 5000); }
    if (!on || Date.now() - loadT0 > 4900) { if (document.body.classList.contains('m-loading')) { document.body.classList.remove('m-loading'); const h = document.getElementById('heroValue'); if (h) h._v = null; } clearTimeout(loadTimer); return false; }
    document.body.classList.add('m-loading'); wasLoading = true;
    if (!v.querySelector('.m-skel')) {
      const tile = '<div class="tile"><span class="m-sk" style="width:45%"></span><span class="m-sk v"></span><span class="m-sk" style="width:35%"></span></div>';
      const rows = (n) => Array.from({ length: n }, (_, i) => `<span class="m-sk r" style="width:${92 - (i * 17) % 40}%"></span>`).join('');
      v.innerHTML = `<div class="m-skel" aria-busy="true" aria-label="Loading your portfolio" style="display:contents"><div class="tiles">${tile.repeat(4)}</div><div class="grid g-2"><section class="panel"><span class="m-sk" style="width:30%;height:16px"></span><span class="m-sk c"></span></section><section class="panel"><span class="m-sk" style="width:40%;height:16px"></span>${rows(6)}</section></div></div>`;
    }
    ink();
    return true;
  };

  /** Sliding underline for the desktop tabs. */
  function ink() {
    const nav = document.getElementById('tabs'); if (!nav || !nav.offsetParent) return;
    const sel = nav.querySelector('button[aria-selected="true"]'); if (!sel) return;
    let k = nav.querySelector('.m-ink');
    if (!k) { k = document.createElement('span'); k.className = 'm-ink'; k.setAttribute('aria-hidden', 'true'); k.style.transition = 'none'; nav.appendChild(k); nav.classList.add('m-ink-on'); requestAnimationFrame(() => requestAnimationFrame(() => { k.style.transition = ''; })); }
    k.style.transform = `translateX(${sel.offsetLeft}px) scaleX(${sel.offsetWidth / 100})`;
  }
  addEventListener('resize', () => { const k = document.querySelector('#tabs .m-ink'); if (k) { k.style.transition = 'none'; ink(); requestAnimationFrame(() => { k.style.transition = ''; }); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ink);

  /** Before the modal is emptied, leave a non-interactive copy that fades/slides out. */
  M.ghost = () => {
    const o = document.getElementById('overlay'); if (!o || o.hidden || mq.matches) return;
    const m = o.querySelector('.modal'); const st = m ? m.scrollTop : 0;
    const g = o.cloneNode(true); g.removeAttribute('id'); g.classList.add('m-ghost'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
    g.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id')); g.querySelectorAll('[name]').forEach((e) => e.removeAttribute('name'));
    document.body.appendChild(g); const gm = g.querySelector('.modal'); if (gm) gm.scrollTop = st;
    let done = false; const rm = () => { if (!done) { done = true; g.remove(); } };
    g.addEventListener('animationend', (e) => { if (e.target === g) rm(); }); setTimeout(rm, 450);
  };

  // Mobile sheet: drag down from its top edge to close (same path as a backdrop tap, so unsaved-changes checks still apply).
  (function sheetDrag() {
    const m = document.getElementById('modal'); if (!m) return;
    let y0 = null, dy = 0;
    m.addEventListener('touchstart', (e) => { if (mq.matches || !matchMedia('(max-width:640px)').matches || m.scrollTop > 0 || e.touches.length !== 1) return; const r = m.getBoundingClientRect(); if (e.touches[0].clientY - r.top > 56) return; y0 = e.touches[0].clientY; dy = 0; m.style.transition = 'none'; }, { passive: true });
    m.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); m.style.transform = dy ? `translateY(${dy}px)` : ''; }, { passive: true });
    const end = () => { if (y0 == null) return; y0 = null; const o = document.getElementById('overlay'); m.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)';
      if (dy > 80 && o) o.click(); m.style.transform = ''; setTimeout(() => { m.style.transition = ''; }, 220); };
    m.addEventListener('touchend', end); m.addEventListener('touchcancel', end);
  })();

  // Theme switch: circular reveal from the button where View Transitions exist (cross-fade if the clip animation fails).
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('#btnTheme');
    if (!b || M._vt || mq.matches) return;
    const turn = () => { b.classList.remove('m-turn'); void b.offsetWidth; b.classList.add('m-turn'); setTimeout(() => b.classList.remove('m-turn'), 500); };
    if (!document.startViewTransition) { requestAnimationFrame(turn); return; }
    ev.stopImmediatePropagation(); ev.preventDefault();
    const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    try {
      const vt = document.startViewTransition(() => { M._vt = true; try { b.click(); turn(); } finally { M._vt = false; } });
      vt.ready.then(() => {
        try { document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] }, { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)' }); }
        catch (e) { document.documentElement.classList.add('m-vt-fade'); vt.finished.finally(() => document.documentElement.classList.remove('m-vt-fade')); }
      }).catch(() => {});
    } catch (e) { M._vt = true; b.click(); M._vt = false; }
  }, true);
})();
