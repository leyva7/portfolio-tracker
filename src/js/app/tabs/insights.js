/* ================= Insights (local rules, free and instant) ================= */
function buildInsights() {
  const out = []; if (!res || !res.positions.length) return out;
  const t = res.totals; const P = patrimony(); const open = res.positions.filter((p) => p.open && p.value > 0);
  const nm = (p) => p.asset.name || p.asset.ticker;
  // 2. concentration
  const top = open.slice().sort((a, b) => b.weight - a.weight)[0];
  if (top && top.weight > 0.35) out.push({ tone: 'warn', prio: 2, title: 'Concentration', text: `<b>${esc(nm(top))}</b> is <b>${pct(top.weight, 0)}</b> of your investments. If it fell 20 %, your invested portfolio would lose ~${eur(top.value * 0.2, 0)}.` });
  // 3. mix
  const al = classAlloc(); const g = (k) => (al.find((a) => a.key === k) || { weight: 0 }).weight;
  const rvW = g('rv') + g('cripto');
  out.push({ tone: 'info', prio: 3, title: 'How your net worth is split', text: al.map((a) => `${a.label} <b>${pct(a.weight, 0)}</b>`).join(' · ') + (rvW > 0.8 ? `. More than 80 % is in risky assets; the biggest fall of your investments so far has been <b>${pct(res.stats ? res.stats.maxDD : null, 1)}</b>.` : '.') });
  // 4. cash
  if (P.cash > 0) { const r = cashRate(); out.push({ tone: r < 0.015 ? 'warn' : 'info', prio: 4, title: 'Your cash', text: `You have <b>${eur(P.cash, 0)}</b> (${pct(P.cash / P.total, 0)} of net worth) at an average AER of <b>${pct(r, 2)}</b>: about <b>${eur(P.cash * r, 0)}/year</b> gross.${r < 0.015 ? ' With inflation around 2 %, that money loses buying power.' : ''}` }); }
  // 5. YTD
  const y = ytdInfo(); if (y) out.push({ tone: y.pnl >= 0 ? 'good' : 'warn', prio: 1, title: `In ${t.today.slice(0, 4)}`, text: `Your investments are at <b class="${cls(y.pnl)}">${eurS(y.pnl, 0)}</b> (TWR ${pctS(y.twr, 1)}) and you have contributed <b>${eurS(y.invested, 0)}</b> net this year.` });
  // 5b. vs benchmark
  const sb = res.stats && res.stats.bench; const lb = res.benchmark ? res.benchmark[res.benchmark.length - 1] : null;
  if (sb && ok(sb.twr)) { const d = res.stats.twr - sb.twr; out.push({ tone: d >= 0 ? 'good' : 'warn', prio: 1, title: `Against ${esc(benchName())}`, text: `Since you started, your strategy ${d >= 0 ? 'beats' : 'trails'} the index by <b>${ppt(Math.abs(d), 1)}</b> (${pctS(res.stats.twr, 1)} against ${pctS(sb.twr, 1)}).${lb ? ` The same money, on the same dates, in the index would be worth <b>${eur(lb.simValue, 0)}</b> (you: ${eur(t.value, 0)}).${eurGapNote(lb.simValue, t.value, d)}` : ''}` }); }
  // 6. contributions habit
  const months = Object.keys(res.monthFlows).sort(); const last12 = []; for (let i = 0; i < 12; i++) last12.push(E.addMonths(t.today, -i).slice(0, 7));
  const inv12 = last12.reduce((s, m) => s + ((res.monthFlows[m] || {}).invested || 0), 0); const n12 = last12.filter((m) => ((res.monthFlows[m] || {}).invested || 0) > 0).length;
  if (months.length) out.push({ tone: n12 >= 10 ? 'good' : 'info', prio: 5, title: 'Consistency', text: `You have invested in <b>${n12} of the last 12 months</b>, ${eur(inv12, 0)} in total (average ${eur(inv12 / 12, 0)}/month).` });
  // 7. timing: XIRR vs TWR
  if (ok(t.xirr) && ok(t.twrAnn)) { const d = t.xirr - t.twrAnn; if (Math.abs(d) > 0.02) out.push({ tone: d > 0 ? 'good' : 'info', prio: 6, title: 'Timing of your contributions', text: `Your IRR (${pctS(t.xirr, 1)}) is ${d > 0 ? 'above' : 'below'} the return of the strategy (${pctS(t.twrAnn, 1)} a year): ${d > 0 ? 'you put in more money before rises' : 'much of the money came in near highs'}.` }); }
  // 8. best/worst
  const withPct = open.filter((p) => ok(p.unrealizedPct)).sort((a, b) => b.unrealizedPct - a.unrealizedPct);
  if (withPct.length >= 2) { const b = withPct[0], w = withPct[withPct.length - 1]; out.push({ tone: 'info', prio: 7, title: 'Best and worst position', text: `Best: <b>${esc(nm(b))}</b> ${pctS(b.unrealizedPct, 1)} (${eurS(b.unrealized, 0)}). ${w.unrealizedPct < 0 ? 'Worst' : 'The one up the least'}: <b>${esc(nm(w))}</b> ${pctS(w.unrealizedPct, 1)} (${eurS(w.unrealized, 0)}).` }); }
  // 9. risk contribution (weight × volatility, ignores correlation)
  const vol = assetVol(); const rc = open.filter((p) => ok(vol[p.assetId])).map((p) => ({ p, c: p.weight * vol[p.assetId] })); const rcT = rc.reduce((s, x) => s + x.c, 0);
  if (rcT > 0) { const hi = rc.sort((a, b) => b.c - a.c).find((x) => x.c / rcT > x.p.weight * 1.8 && x.c / rcT > 0.15); if (hi) out.push({ tone: 'warn', prio: 3, title: 'Disproportionate risk', text: `<b>${esc(nm(hi.p))}</b> is ${pct(hi.p.weight, 0)} of the investments but brings ~<b>${pct(hi.c / rcT, 0)}</b> of the risk (volatility ${pct(vol[hi.p.assetId], 0)}).` }); }
  // 10. taxes this year + harvesting
  const yr = t.today.slice(0, 4); const f = res.fiscal[yr];
  const losers = open.filter((p) => p.unrealized < -1).sort((a, b) => a.unrealized - b.unrealized);
  const fc = f ? fiscalCalc(yr) : null;
  if (f && Math.abs(fc.g) > 1) { const base = fc.base; out.push({ tone: 'info', prio: 4, title: `Taxes ${yr}`, text: `Net capital gains: <b class="${cls(fc.g)}">${eurS(fc.g, 0)}</b>. Estimated tax on savings income: <b>${eur(cuota(base), 0)}</b>.${fc.g > 0 && losers.length ? ` You have unrealized losses in ${losers.slice(0, 3).map((p) => `${esc(p.asset.ticker)} (${eurS(p.unrealized, 0)})`).join(', ')} that could offset them; mind the wash-sale rule (2 months for listed securities, 1 year for funds).` : ''}` }); }
  // 11. fees
  if (t.fees > 0) out.push({ tone: 'info', prio: 8, title: 'Fees', text: `You have paid <b>${eur(t.fees, 2)}</b> in trading fees (${pct(t.grossInvested ? t.fees / t.grossInvested : 0, 2)} of the amount invested).` });
  // 12. rebalance
  const drift = res.rebalance.filter((r) => Math.abs(r.drift) > 0.05);
  if (drift.length) out.push({ tone: 'warn', prio: 2, title: 'Off your plan', text: drift.map((r) => `${esc(r.label)} ${pctS(r.drift, 0)} vs target`).join(' · ') });
  return out.sort((a, b) => a.prio - b.prio);
}
/** Why the gap in euros is smaller than the gap in TWR points (most money came in recently). */
function eurGapNote(sim, val, d) { return ok(sim) && val > 0 && ok(d) && Math.abs(sim - val) / val < Math.abs(d) * 0.7 ? ' In euros the gap is smaller because much of the money came in recently and has been invested for less time; the gap in points measures the strategy.' : ''; }
function insightCard(i) { return `<article class="ins ${i.tone}"><span class="ins-dot" aria-hidden="true"></span><div><h3>${i.title}</h3><p>${i.text}</p></div></article>`; }

