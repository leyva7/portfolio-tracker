/* ================= Charts ================= */
const charts = [];
const chartMem = {}; let chartTab = null;
function killCharts() { if (chartTab !== ui.tab) { chartTab = ui.tab; for (const k in chartMem) delete chartMem[k]; } while (charts.length) { try { charts.pop().destroy(); } catch (e) {} } }
const darkUI = () => getComputedStyle(document.documentElement).colorScheme === 'dark';
const chartMotion = () => !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function chartBase() {
  const C = window.Chart; if (!C) return null;
  C.defaults.font.family = cssv('--f-ui') || 'system-ui';
  C.defaults.font.size = 13;
  C.defaults.font.weight = 500;
  C.defaults.color = cssv('--muted');
  C.defaults.borderColor = cssv('--grid');
  return C;
}
const crosshair = { id: 'crosshair', afterDatasetsDraw(ch) { const a = ch.tooltip && ch.tooltip.getActiveElements && ch.tooltip.getActiveElements(); if (!a || !a.length || ch.config.type !== 'line') return; const x = a[0].element.x; const { top, bottom } = ch.chartArea; const c = ch.ctx; c.save(); c.strokeStyle = cssv('--muted'); c.globalAlpha = .5; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, top); c.lineTo(x, bottom); c.stroke(); c.restore(); } };
// Solid colour of a dataset (for dots and tooltip swatches), skipping gradients and transparent bands
function dsColor(d, i) { const b = d.borderColor, g = Array.isArray(d.backgroundColor) ? d.backgroundColor[i] : d.backgroundColor; return b && b !== 'transparent' && typeof b === 'string' ? b : typeof g === 'string' ? g : cssv('--muted'); }
function dot(c, x, y, col, r) { c.save(); c.fillStyle = alpha(col, .18); c.beginPath(); c.arc(x, y, r * 2.2, 0, 7); c.fill(); c.fillStyle = col; c.strokeStyle = cssv('--surface'); c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); c.restore(); }
// Line charts draw in from left to right: clip to a growing width, with a dot riding the leading edge
const reveal = { id: 'reveal',
  beforeInit(ch, a, o) { if (o.start) ch.$reveal = 0; },
  beforeDatasetsDraw(ch) { const p = ch.$reveal; if (p == null || p >= 1) return; const a = ch.chartArea; ch.ctx.save(); ch.ctx.beginPath(); ch.ctx.rect(0, 0, a.left + (a.right - a.left) * p, ch.height); ch.ctx.clip(); },
  afterDatasetsDraw(ch) {
    const p = ch.$reveal; if (p == null || p >= 1) return; ch.ctx.restore();
    const a = ch.chartArea, x = a.left + (a.right - a.left) * p;
    const i = ch.data.datasets.findIndex((d, k) => ch.isDatasetVisible(k) && !d.borderDash && d.borderColor && d.borderColor !== 'transparent'); if (i < 0) return;
    const pts = ch.getDatasetMeta(i).data; let lo = 0, hi = pts.length - 1; if (hi < 1) return;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].x < x) lo = m + 1; else hi = m; }
    const e = pts[Math.max(0, lo - 1)]; if (e && !e.skip && isFinite(e.y)) dot(ch.ctx, Math.min(e.x, x), e.y, dsColor(ch.data.datasets[i]), 3.5);
  } };
// Last-value markers for the datasets listed in options.plugins.endDots.ids
const endDots = { id: 'endDots', afterDatasetsDraw(ch, a, o) {
  if (!o.ids || (ch.$reveal != null && ch.$reveal < 1)) return;
  for (const i of o.ids) { if (!ch.isDatasetVisible(i)) continue; const pts = ch.getDatasetMeta(i).data; let k = pts.length - 1; while (k >= 0 && (pts[k].skip || !isFinite(pts[k].y))) k--; if (k >= 0) dot(ch.ctx, pts[k].x, pts[k].y, dsColor(ch.data.datasets[i]), 3.5); }
} };
// Doughnut centre: total, or the hovered slice and its share
const donutCenter = { id: 'donutCenter', afterDatasetsDraw(ch) {
  const m = ch.getDatasetMeta(0), e = m.data[0]; if (!e) return;
  const d = ch.data.datasets[0], tot = d.data.reduce((s, x) => s + x, 0), act = ch.getActiveElements()[0];
  const r = e.innerRadius, c = ch.ctx, x = e.x, y = e.y; if (r < 30) return;
  const v = act ? d.data[act.index] : tot, l1 = act ? pct(v / tot, 0) : eur(tot, 0), l2 = act ? ch.data.labels[act.index] : 'Total';
  c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = act ? d.backgroundColor[act.index] : cssv('--ink'); c.font = `700 ${Math.round(Math.min(22, r * .3))}px ${cssv('--f-num') || 'system-ui'}`; c.fillText(l1, x, y - 7);
  c.fillStyle = cssv('--muted'); c.font = `500 13px ${cssv('--f-ui') || 'system-ui'}`; c.fillText(act ? `${l2} · ${eur(v, 0)}` : l2, x, y + 13, r * 1.8);
  c.restore();
} };
// Vertical gradient for area fills, strong near the line and fading towards the axis (reverse for areas below zero)
function fillGrad(col, a1, a2) { return (c) => { const ch = c.chart, a = ch.chartArea; if (!a) return alpha(col, (a1 + a2) / 2); const g = ch.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, alpha(col, a1)); g.addColorStop(1, alpha(col, a2)); return g; }; }
const gridZero = (c) => (c.tick && c.tick.value === 0 ? cssv('--line') : cssv('--grid'));
function tooltipOpts(fmt) {
  return { backgroundColor: cssv('--surface'), titleColor: cssv('--ink'), bodyColor: cssv('--ink-2'), footerColor: cssv('--ink'), borderColor: cssv('--line'), borderWidth: 1, padding: { x: 12, y: 10 }, cornerRadius: 8, caretSize: 6, caretPadding: 6, boxPadding: 5, boxWidth: 8, boxHeight: 8, usePointStyle: true, titleFont: { weight: '700' }, titleMarginBottom: 6, bodySpacing: 4, bodyFont: { family: cssv('--f-num') }, footerFont: { family: cssv('--f-num'), weight: '700' }, footerMarginTop: 8,
    animation: { duration: chartMotion() ? 120 : 0 },
    callbacks: { title: (it) => it.length ? fdate(it[0].label) : '', label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y, c)}`, labelColor: (c) => { const col = dsColor(c.dataset, c.dataIndex); return { borderColor: col, backgroundColor: col }; } } };
}
// tooltipOpts plus overrides, merging callbacks instead of replacing them
function tip(fmt, x = {}) { const t = tooltipOpts(fmt); return Object.assign(t, x, { callbacks: Object.assign(t.callbacks, x.callbacks || {}) }); }
// How a chart appears: first time in this tab -> 'enter'; new x range -> 'reveal'; same range with new values -> morph from the old ones; unchanged -> instant
function chartPlan(canvas, cfg, relabel) {
  const ds = cfg.data.datasets, key = cfg.data.labels.join('|'), vals = JSON.stringify(ds.map((d) => d.data));
  const id = canvas.id || '', prev = chartMem[id]; chartMem[id] = { key, vals, data: ds.map((d) => d.data.slice()) };
  if (!chartMotion() || (prev && prev.vals === vals && prev.key === key)) return null;
  if (!prev) return 'enter';
  if (prev.key !== key || prev.data.length !== ds.length) return relabel === false ? null : 'reveal';
  return { morph: prev.data };
}
function mkChart(C, canvas, cfg, o = {}) {
  const plan = chartPlan(canvas, cfg, o.relabel), line = cfg.type === 'line', op = cfg.options, mv = chartMotion();
  const stepMs = Math.min(30, 260 / Math.max(1, cfg.data.labels.length)); // whole cascade stays under ~800 ms
  op.animation = !line && (plan === 'enter' || plan === 'reveal') ? { duration: plan === 'enter' ? 520 : 450, easing: 'easeOutQuart', delay: (c) => (plan === 'enter' && c.type === 'data' && c.mode === 'default' ? c.dataIndex * stepMs : 0) } : { duration: 0 };
  op.transitions = { active: { animation: { duration: mv ? 160 : 0 } }, resize: { animation: { duration: 0 } } };
  op.plugins = Object.assign(op.plugins || {}, { reveal: { start: line && (plan === 'enter' || plan === 'reveal') } });
  cfg.plugins = [reveal, endDots].concat(cfg.plugins || []);
  const real = plan && plan.morph ? cfg.data.datasets.map((d, i) => { const r = d.data; if (plan.morph[i] && plan.morph[i].length === r.length) d.data = plan.morph[i]; return r; }) : null;
  const ch = new C(canvas, cfg);
  chartAria(ch);
  if (real) { real.forEach((r, i) => { ch.data.datasets[i].data = r; }); ch.options.animation = { duration: 450, easing: 'easeOutCubic' }; ch.update(); }
  else if (ch.$reveal === 0) { const ms = plan === 'enter' ? 900 : 550, t0 = performance.now(); const step = (now) => { if (!ch.canvas || !ch.ctx) return; const t = Math.min(1, (now - t0) / ms); ch.$reveal = 1 - Math.pow(1 - t, 3); try { ch.draw(); } catch (e) { return; } if (t < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  return ch;
}
// Hover points filled with the line colour and ringed with the surface; none for invisible bands
function lineHover(datasets) { const surf = cssv('--surface'); datasets.forEach((d) => { const t = !d.borderColor || d.borderColor === 'transparent'; Object.assign(d, Object.assign({ pointHoverBackgroundColor: t ? 'transparent' : d.borderColor, pointHoverBorderColor: surf, pointHoverBorderWidth: 2, pointHoverRadius: t ? 0 : 5 }, d)); }); }
function mkLine(canvas, labels, datasets, o = {}) {
  const C = chartBase(); if (!C || !canvas) return;
  lineHover(datasets);
  const ch = mkChart(C, canvas, {
    type: 'line', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, layout: { padding: { right: o.endDots ? 8 : 0, top: o.endDots ? 6 : 0 } },
      plugins: { legend: { display: false }, tooltip: tip(o.fmt || ((v) => eur(v)), o.tooltip), endDots: { ids: o.endDots } },
      elements: { point: { radius: 0, hoverRadius: 4, hitRadius: 6 }, line: { borderWidth: 2, tension: 0, borderJoinStyle: 'round', borderCapStyle: 'round' } },
      scales: {
        x: { grid: { display: false }, border: { display: !o.clean, color: cssv('--line') }, ticks: { maxTicksLimit: window.innerWidth < 640 ? 4 : 7, maxRotation: 0, autoSkip: true, autoSkipPadding: 16, callback: function (v) { const l = this.getLabelForValue(v); return l ? fdate(l, labels.length > 400 || o.clean ? { day: undefined, month: 'short', year: '2-digit' } : { year: '2-digit' }) : ''; } } },
        y: { stacked: !!o.stacked, position: o.clean ? 'right' : 'left', grid: { display: !o.clean, color: gridZero }, border: { display: false }, ticks: { maxTicksLimit: o.clean ? 4 : 6, callback: o.yfmt || ((v) => eurK(v)) }, suggestedMin: o.suggestedMin, suggestedMax: o.suggestedMax },
      },
    }, plugins: [crosshair],
  });
  charts.push(ch); chartAria(ch, o.fmt); return ch;
}
/** Writes each bar's value at its end (horizontal bars), inside the plot so it is never cut. */
function barLabels(fmt) {
  return { id: 'barLabels', afterDatasetsDraw(ch) {
    const c = ch.ctx, ar = ch.chartArea, m = ch.getDatasetMeta(0); c.save(); c.font = `600 11px ${getComputedStyle(document.body).fontFamily}`; c.fillStyle = cssv('--ink-2'); c.textBaseline = 'middle';
    m.data.forEach((b, i) => { const v = ch.data.datasets[0].data[i]; if (v == null) return; const t = fmt(v), w = c.measureText(t).width; const neg = v < 0;
      let x = neg ? Math.min(b.x, b.base) - 6 - w : Math.max(b.x, b.base) + 6; let inside = false; if (x + w > ar.right) { x = Math.max(b.x, b.base) - 6 - w; inside = true; } if (!neg && x < ar.left) x = ar.left + 2; if (neg && x < ar.left) { x = Math.min(b.x, b.base) + 6; inside = true; } c.fillStyle = inside ? '#fff' : cssv('--ink-2'); c.fillText(t, x, b.y); });
    c.restore(); } };
}
function mkBar(canvas, labels, datasets, o = {}) {
  const C = chartBase(); if (!C || !canvas) return;
  const ch = mkChart(C, canvas, {
    type: 'bar', data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: o.horizontal ? 'y' : 'x',
      plugins: { legend: { display: false }, tooltip: tip(o.fmt || ((v) => eur(v)), { callbacks: { title: (it) => it.length ? (o.titleFmt ? o.titleFmt(it[0].label) : it[0].label) : '', label: (c) => ` ${c.dataset.label}: ${(o.fmt || eur)(o.horizontal ? c.parsed.x : c.parsed.y)}` } }) },
      scales: {
        x: { stacked: !!o.stacked, grid: { display: !!o.horizontal, color: gridZero }, border: { color: cssv('--line') }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: o.horizontal ? 6 : 12, callback: o.horizontal ? (o.yfmt || ((v) => eurK(v))) : function (v) { const l = this.getLabelForValue(v); return o.xlab ? o.xlab(l) : l; } } },
        y: { stacked: !!o.stacked, grid: { display: !o.horizontal, color: gridZero }, border: { display: false }, ticks: { callback: o.horizontal ? function (v) { return this.getLabelForValue(v); } : (o.yfmt || ((v) => eurK(v))) } },
      },
      datasets: { bar: { borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28, categoryPercentage: .8, barPercentage: .9 } },
      ...(o.labels ? { layout: { padding: { left: 8, right: 8 } } } : {}),
    },
    plugins: o.labels ? [barLabels(o.labels)] : [],
  });
  charts.push(ch); chartAria(ch, o.fmt); return ch;
}
function mkDonut(canvas, labels, values, colors) {
  const C = chartBase(); if (!C || !canvas) return;
  const ch = mkChart(C, canvas, { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: cssv('--surface'), borderWidth: 2, hoverOffset: 8, hoverBorderColor: cssv('--surface') }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '66%', layout: { padding: 6 }, plugins: { legend: { display: false }, tooltip: { enabled: false } } }, plugins: [donutCenter] });
  charts.push(ch); return ch;
}

