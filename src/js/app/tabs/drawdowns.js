/* ---------- Drawdowns in your own history (idea 17) ----------
 * Weeks in which your portfolio (TWR, not counting contributions) fell more than a threshold, how far it fell from the high
 * and how long it took to get back to it. Only data from your history: no forecasts.
 * Home shows it when the current week (or the previous one, on Monday and Tuesday) falls more than 3 %; Analysis lists them with a selectable threshold.
 */
const DROP_TH = [0.02, 0.03, 0.05];
const ddTh = () => (DROP_TH.includes(ui.ddth) ? ui.ddth : 0.03);
const monOf = (d) => { const x = new Date(d + 'T00:00:00Z'); return E.addDays(d, -((x.getUTCDay() + 6) % 7)); };
/** Weekly TWR changes: the last series point of each calendar week against the previous week's last point. */
function weekRets() {
  const S2 = res ? res.series : []; const last = {}; const order = [];
  S2.forEach((p, i) => { const m = monOf(p.date); if (!(m in last)) order.push(m); last[m] = i; });
  const out = [];
  for (let j = 1; j < order.length; j++) { const a = S2[last[order[j - 1]]], b = S2[last[order[j]]]; if (!a.active && !b.active) continue; out.push({ mon: order[j], end: b.date, i: last[order[j]], prevI: last[order[j - 1]], r: b.index / a.index - 1 }); }
  return out;
}
/** Episodes: weeks falling more than th; weeks that share an unrecovered peak join the same episode. */
function dropEpisodes(th) {
  const S2 = res.series; const W = weekRets(); const eps = [];
  for (const w of W) {
    if (!(w.r <= -th)) continue;
    let pk = -Infinity, pkI = 0; for (let i = 0; i <= w.prevI; i++) if (S2[i].index > pk) { pk = S2[i].index; pkI = i; }
    const prev = eps[eps.length - 1];
    if (prev && prev.peakI === pkI && (!prev.rec || prev.rec > w.end)) { prev.weeks.push(w); continue; }
    let rec = null, tr = Infinity, trI = w.i;
    for (let i = w.i; i < S2.length; i++) { if (S2[i].index >= pk - 1e-12) { rec = S2[i].date; break; } if (S2[i].index < tr) { tr = S2[i].index; trI = i; } }
    if (S2[w.i].index < tr) { tr = S2[w.i].index; trI = w.i; }
    eps.push({ weeks: [w], peakI: pkI, peak: S2[pkI].date, low: tr / pk - 1, lowDate: S2[trI].date, rec, recWeeks: rec ? Math.max(1, Math.ceil((Date.parse(rec) - Date.parse(w.end)) / 6048e5)) : null });
  }
  return eps;
}
const wkLbl = (n) => `${n} week${n === 1 ? '' : 's'}`;
const mShort = (d) => fdate(d, { day: undefined, month: 'short', year: 'numeric' });
function epLine(e, since) {
  const w = e.weeks.reduce((m, x) => (x.r < m.r ? x : m), e.weeks[0]);
  const thin = since && w.end < since ? ' <span class="muted">(with few daily prices)</span>' : '';
  return `<li><span class="k"><b>${mShort(e.weeks[0].end)}${e.weeks.length > 1 && mShort(e.weeks[e.weeks.length - 1].end) !== mShort(e.weeks[0].end) ? ` – ${mShort(e.weeks[e.weeks.length - 1].end)}` : ''}</b><small>${e.weeks.length > 1 ? `${e.weeks.length} weeks of falls; the worst ` : 'week '}<span class="num loss">${pctS(w.r, 1)}</span> · it reached <span class="num">${pct(e.low, 1)}</span> from the high${thin}</small></span><span class="v">${e.rec ? `<b>${wkLbl(e.recWeeks)}</b><small>to get back to the high</small>` : '<b>not back</b><small>to the high yet</small>'}</span></li>`;
}
/** Home: only when this week (or last week, early in the week) fell more than 3 %. */
function dropPanel() {
  if (!res || DEMO || res.series.length < 30) return '';
  const th = 0.03; const W = weekRets(); if (!W.length) return '';
  const today = res.totals.today; const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  let cur = W[W.length - 1]; if (!(cur.r <= -th) && dow <= 1 && W.length > 1 && W[W.length - 2].mon === E.addDays(monOf(today), -7)) cur = W[W.length - 2];
  if (!(cur.r <= -th) || cur.mon < E.addDays(monOf(today), -7)) return '';
  const eps = dropEpisodes(th); const past = eps.filter((e) => !e.weeks.includes(cur) && e.weeks.every((x) => x.mon !== cur.mon));
  const nWeeks = past.reduce((s, e) => s + e.weeks.length, 0); const now = eps.find((e) => e.weeks.some((x) => x.mon === cur.mon));
  const recs = past.filter((e) => e.rec).map((e) => e.recWeeks);
  const cov = priceCoverage(); const since = cov && cov.since;
  const isThis = cur.mon === monOf(today);
  return `<section class="panel" id="dropPanel"><div class="panel-h"><div><h2>${isThis ? 'This week' : 'Last week'} your portfolio is down <span class="loss noarr num">${pct(-cur.r, 1)}</span></h2><div class="small muted">what happened the other times, only from your history</div></div></div>
    <p style="margin:0">${nWeeks ? `Since ${mShort(res.series[0].date)} it has had <b>${wkLbl(nWeeks)}</b> that fell more than 3 %${past.length < nWeeks ? `, ${past.length === 1 ? 'all in the same run' : `in ${past.length} runs`}` : ''}.${recs.length ? (past.length === 1 ? ` That time it took <b>${wkLbl(recs[0])}</b> to get back to its previous high.` : ` ${recs.length === past.length ? 'It always got back' : `In ${recs.length} of ${past.length} it got back`} to its previous high, in ${recs.length === 1 ? wkLbl(recs[0]) : `between ${wkLbl(Math.min(...recs))} and ${wkLbl(Math.max(...recs))}`}.`) : ''}` : 'It is the first week with a fall of more than 3 % in your history.'}</p>
    ${past.length ? `<ul class="drop-list">${past.slice().reverse().map((e) => epLine(e, since)).join('')}</ul>` : ''}
    ${cov && cov.low ? '<p class="small muted" style="margin:0">Many older prices of your funds are scattered, not daily: the exact week of each fall may vary slightly.</p>' : ''}
    ${now ? `<p class="small muted" style="margin:0">You are now <span class="num">${pct(-(res.series[res.series.length - 1].index / res.series[now.peakI].index - 1), 1)}</span> below the high of ${fdate(now.peak)}. This is what has happened before in your portfolio, not a forecast.</p>` : ''}
  </section>`;
}
/** Analysis: list under "Drawdown from highs", with a threshold selector. */
function dropHistory() {
  if (!res || res.series.length < 30) return '';
  const th = ddTh(); const eps = dropEpisodes(th); const cov = priceCoverage(); const since = cov && cov.since;
  const n = eps.reduce((s, e) => s + e.weeks.length, 0);
  return `<div class="drop-hist" id="dropHist"><div class="panel-h"><h3>Weeks that fell more than ${pct(th, 0)}</h3><div class="seg" role="group" aria-label="Threshold">${DROP_TH.map((t) => `<button type="button" data-ddth="${t}" aria-pressed="${t === th}">${pct(t, 0)}</button>`).join('')}</div></div>
    ${eps.length ? `<p class="small muted" style="margin:0">${wkLbl(n)} in your history; how far it fell each time from the previous high and how long it took to get back to it.</p><ul class="drop-list">${eps.slice().reverse().map((e) => epLine(e, since)).join('')}</ul>${cov && cov.low ? '<p class="small muted" style="margin:0">Many older prices of your funds are scattered, not daily: the exact week of each fall may vary slightly.</p>' : ''}` : `<p class="small muted" style="margin:0">No week in your history has fallen more than ${pct(th, 0)}.</p>`}</div>`;
}
