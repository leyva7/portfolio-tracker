/* ---------- "My analyst" (Home › Claude's analysis) ----------
 * Hybrid adviser: an investor profile (settings.profile, a short questionnaire) gives a risk level 1–5; fixed rules compare the
 * portfolio with the band of that level and check goal money, cash, diversification, crypto and complexity. Claude then gives
 * a verdict (keep / adjust / review) from that diagnosis plus the portfolio digest. Rules decide the numbers; Claude explains.
 * The verdict is stored in insights/analyst. It is not regulated advice and never names products.
 */
const PF_Q = [
  ['horizon', 'Leaving aside the money for your goal (a home deposit, for example), when do you think you will need what you have invested?', [['lt3', 'In less than 3 years'], ['3to5', 'In 3 to 5 years'], ['5to10', 'In 5 to 10 years'], ['gt10', 'In more than 10 years']]],
  ['drop', 'If your investments fell 25 % in a few months, what would you do?', [['sell_all', 'Sell everything so as not to lose more'], ['sell_some', 'Sell part of them'], ['hold', 'Do nothing'], ['buy', 'Take the chance to buy more']]],
  ['maxDD', 'How big a fall in your investments could you watch without losing sleep? (in 2008–09 world stocks fell ≈ 50 %)', [['10', 'Up to 10 %'], ['20', 'Up to 20 %'], ['30', 'Up to 30 %'], ['40', 'Up to 40 %'], ['50', '50 % or more']]],
  ['aim', 'What do you mainly want from your investments?', [['preserve', 'Keep what I have'], ['balance', 'Grow carefully'], ['grow', 'Grow as much as possible over the long term']]],
  ['income', 'What is your income like?', [['stable', 'Stable (a regular salary or similar)'], ['variable', 'Variable'], ['uncertain', 'Uncertain right now']]],
  ['experience', 'How much investing experience do you have?', [['low', 'Little (less than 2 years)'], ['mid', 'Some (2 to 5 years)'], ['high', 'A lot (more than 5 years or several crises)']]],
  ['crypto', 'Would you accept crypto (bitcoin, for example) in your portfolio?', [['no', 'No'], ['small', 'Only a little'], ['yes', 'Yes, no problem']]],
  ['active', 'And actively managed funds?', [['index', 'I prefer index funds only'], ['open', 'I am open to them if they make sense']]],
  ['simple', 'How many products do you want to manage?', [['few', 'As few as possible'], ['any', 'I do not mind if there is a reason']]],
];
const PF_LEVELS = [null, ['Conservative', 0.1, 0.3], ['Moderate', 0.3, 0.5], ['Balanced', 0.5, 0.7], ['Dynamic', 0.7, 0.9], ['Aggressive', 0.85, 1]];
const PF_CRYPTO = { no: [0, 0, 0, 0, 0], small: [0, 0, 0.02, 0.03, 0.05], yes: [0, 0, 0.03, 0.05, 0.1] };
// Share of each equity sub-class that is US companies (MSCI ACWI IMI ≈ 62 %)
const US_SHARE = { world: 0.62, us: 1, dev: 0, em: 0, small: 0.6, sector: 0.6, single: 0.7 };
const AN_VERDICT = { keep: ['For your profile, I would leave it as it is', 'good'], adjust: ['A minor adjustment', 'info'], review: ['Worth reviewing', 'warn'] };
// Stylised crisis like 2008–09 for an EUR investor: loss of each class (equities ≈ −50 %, crypto ≈ −75 %…). With these, a
// band's upper equity share × 0.5 is its crisis drop, so maxDD 10/20/30/40/50 % lines up with levels 1–5.
const AN_CRISIS = { rv: 0.5, cripto: 0.75, oro: 0.1, rf: 0.05, otro: 0.3 };
const PF_VER = 2; // v2: horizon excludes the goal money, maxDD has 5 steps (calibrated to the bands)
const AN_RANK = { keep: 0, adjust: 1, review: 2 };
const AN_ACT = { keep: 'Keep', add: 'Add', reduce: 'Reduce', watch: 'Watch' };

function profile() { const p = S.settings && S.settings.profile; return p && p.horizon ? p : null; }
/** Weekly market facts (insights/market) if they are less than 3 weeks old; facts only, never forecasts. */
function market() { const m = S.market; if (!m || !m.date || DEMO) return null; const age = (Date.parse(todayStr()) - Date.parse(m.date)) / 864e5; return age <= 21 ? Object.assign({ age }, m) : null; }
function marketHtml(M) {
  if (!M) return '';
  const n = (v, d = 2) => (Number.isFinite(+v) && v !== null ? pct(+v / 100, d) : '—');
  const b = M.equities || {}, r = [];
  if (M.ecb && M.ecb.depositPct != null) r.push(['ECB rate (deposit facility)', n(M.ecb.depositPct)]);
  if (M.tbill12m && M.tbill12m.pct != null) r.push(['Spanish 12-month T-bills', n(M.tbill12m.pct, 2)]);
  r.push(['Your cash (average AER)', pct(cashRate(), 2)]);
  if (M.inflation && M.inflation.pct != null) r.push([`Inflation in Spain${M.inflation.month ? ` (${esc(M.inflation.month)})` : ''}`, n(M.inflation.pct, 1)]);
  if (b.fromHighPct != null) r.push(['World stocks against their high', b.fromHighPct > -0.5 ? 'at highs' : n(b.fromHighPct, 1)]);
  if (b.change12mPct != null) r.push(['World stocks, last 12 months', `${b.change12mPct > 0 ? '+' : ''}${n(b.change12mPct, 1)}`]);
  if (M.cape && M.cape.value != null) r.push([`US valuation (CAPE)<small>historical mean ${numf(+M.cape.mean || 17, 0)}</small>`, numf(+M.cape.value, 1)]);
  return `<details class="an-mkt"><summary>Market context <span class="small muted">· data from ${fdate(M.date)}</span></summary><div class="stats">${r.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div><p class="note" style="margin:6px 0 0">Facts, not forecasts: they help you compare where your safe money earns more and put falls in context. Neither the diagnosis nor Claude changes your risk level because of them, and nobody can predict the market.</p></details>`;
}
/** Risk level 1–5: the lower of tolerance (reaction, drawdown, aim) and capacity (horizon, income); little experience caps it at 4.
 * The drawdown answer also caps tolerance (ddS), so "I can take 30 %" never lands on a band whose crisis drop is 45 %. */
function profileLevel(p) {
  if (!p) return null;
  const dS = { sell_all: 1, sell_some: 2, hold: 4, buy: 5 }[p.drop] || 3, ddS = { 10: 1, 20: 2, 30: 3, 40: 4, 50: 5 }[p.maxDD] || 3;
  const tol = Math.min((dS + ddS + ({ preserve: 1, balance: 3, grow: 5 }[p.aim] || 3)) / 3, ddS);
  const cap = ({ lt3: 1, '3to5': 2, '5to10': 4, gt10: 5 }[p.horizon] || 3) - (p.income === 'uncertain' ? 1 : p.income === 'variable' ? 0.5 : 0);
  const lv = Math.max(1, Math.min(p.experience === 'low' ? 4 : 5, Math.round(Math.min(tol, cap))));
  const by = tol + 0.75 < cap ? 'tolerance' : cap + 0.75 < tol ? 'capacity' : null;
  // contradictory answers: reaction to a 25 % fall vs the drawdown you say you can bear
  const incoherent = Math.abs(dS - ddS) >= 3 ? (dS > ddS ? 'You say you would not sell after a 25 % fall, but also that you can only bear a small fall.' : 'You say you can bear big falls, but that you would sell after a 25 % one.') : null;
  return { lv, name: PF_LEVELS[lv][0], lo: PF_LEVELS[lv][1], hi: PF_LEVELS[lv][2], tol, cap, by, cryptoCap: PF_CRYPTO[p.crypto || 'no'][lv - 1], maxDD: (+p.maxDD || 30) / 100, incoherent };
}
/** Rules: the diagnosis that Claude has to respect. */
function analystRules() {
  const p = profile(); const L = profileLevel(p); if (!L || !res || !res.positions.length) return null;
  const open = res.positions.filter((z) => z.open && z.value > 0); const inv = open.reduce((s, z) => s + z.value, 0); if (!(inv > 0)) return null;
  const val = (f) => open.filter(f).reduce((s, z) => s + z.value, 0);
  const byCls = {}; for (const z of open) { const k = clsOf(z.asset); byCls[k] = (byCls[k] || 0) + z.value; }
  const crypto = byCls.cripto || 0, rfV = byCls.rf || 0, oroV = byCls.oro || 0, def = rfV + oroV, risk = inv - def;
  const earmark = Math.min(inv, Math.max(0, +p.goalInvested || 0));
  // goal money is covered by fixed income first, then gold, then risky assets; only fixed income counts as safe for it
  const inGold = Math.min(oroV, Math.max(0, earmark - rfV)), atRisk = Math.max(0, earmark - rfV);
  const inRisk = Math.max(0, earmark - def);
  const ltRisk = risk - inRisk, ltDef = Math.max(0, def - earmark), lt = ltRisk + ltDef;
  const riskW = lt > 0 ? ltRisk / lt : 0, cryptoW = lt > 0 ? crypto / lt : 0;
  const eq = open.filter((z) => clsOf(z.asset) === 'rv'); const eqV = eq.reduce((s, z) => s + z.value, 0);
  const sub = {}; for (const z of eq) { const k = subOf(z.asset); sub[k] = (sub[k] || 0) + z.value / (eqV || 1); }
  const usW = Object.entries(sub).reduce((s, [k, w]) => s + w * (US_SHARE[k] ?? 0.5), 0);
  const P = patrimony(); const cu = cushionInfo(); const g = goalInfo();
  const goalCash = g ? Math.min(g.amount, g.cu ? g.cash : P.cash) : 0;
  const idle = cu ? Math.max(0, P.cash - goalCash - cu.amount) : 0; // cash with no job (needs a cushion to tell)
  const riskWAll = lt + idle > 0 ? ltRisk / (lt + idle) : 0;
  // crisis drop of the long-term money (goal money excluded), with the AN_CRISIS losses by class
  const ltByCls = Object.assign({}, byCls); let take = earmark; for (const k of ['rf', 'oro', 'rv', 'cripto', 'otro']) { const t = Math.min(ltByCls[k] || 0, take); ltByCls[k] = (ltByCls[k] || 0) - t; take -= t; }
  const crisis = lt > 0 ? Object.entries(ltByCls).reduce((s, [k, v]) => s + v * (AN_CRISIS[k] ?? 0.3), 0) / lt : 0;
  const yrs = g && g.date ? (Date.parse(g.date) - Date.parse(todayStr())) / (365.25 * 864e5) : null;
  const out = []; const add = (r) => out.push(r);
  const band = `${pct(L.lo, 0)}–${pct(L.hi, 0)}`;
  // 0. coherence of the answers
  if (L.incoherent) add({ id: 'profile', sev: 0, tone: 'info', act: 'watch', title: 'Answers that do not add up', text: `${L.incoherent} I have taken the more cautious option; if it does not fit you, review the questionnaire.` });
  // 1. risk level of the long-term money
  const cashNote = idle > 0 ? ` Counting the ${eur(idle, 0)} of cash with no purpose, your long-term risk would be ${pct(riskWAll, 0)}.` : !cu && P.cash > 0.25 * P.total ? ` I am not counting your ${eur(P.cash, 0)} of cash: if you set your emergency fund in Cash, I will know which part is idle.` : '';
  if (riskW > L.hi + 0.005) {
    if (idle > 0 && riskWAll <= L.hi + 0.005) add({ id: 'level', sev: 1, tone: 'info', act: 'add', title: 'High in stocks, but with idle cash', text: `${pct(riskW, 0)} of your long-term investments is in risky assets (${L.name.toLowerCase()} profile: ${band}).${cashNote} There is no need to sell or slow down on stocks: if that cash is for the long term, the consistent move is to put part of it in bonds.` });
    else add({ id: 'level', sev: riskW - L.hi > 0.15 ? 2 : 1, tone: 'warn', act: 'reduce', title: 'More risk than suits you', text: `${pct(riskW, 0)} of your long-term money is in stocks${crypto ? ' and crypto' : ''}; for a ${L.name.toLowerCase()} profile a reasonable range is ${band}.${cashNote} The gentle way to correct it is to direct your next contributions (or a tax-free fund switch) to bonds.` });
  } else if (riskW < L.lo - 0.005) add({ id: 'level', sev: L.lo - riskW > 0.15 ? 2 : 1, tone: 'info', act: 'add', title: 'Less risk than you could take', text: `Only ${pct(riskW, 0)} of your long-term money is in risky assets; your ${L.name.toLowerCase()} profile allows ${band}. Over the long term, that usually means a lower expected return.` });
  else add({ id: 'level', sev: 0, tone: 'good', act: 'keep', title: 'Risk in line with your profile', text: `${pct(riskW, 0)} of your long-term money is in risky assets, within the range of a ${L.name.toLowerCase()} profile (${band}).${cashNote}` });
  // 1b. crisis test against the drop you said you can bear
  if (lt > 0) {
    const t = `In a crisis like 2008–09 (stocks ≈ −50 %, crypto ≈ −75 %) your long-term money would fall by around <b>${pct(crisis, 0)}</b>, about ${eur(crisis * lt, 0)}.`;
    if (crisis > L.maxDD + 0.05) add({ id: 'crash', sev: 1, tone: 'warn', act: 'reduce', title: 'It would fall more than you can bear', text: `${t} You said you could watch up to ${pct(L.maxDD, 0)} without losing sleep. Selling in the middle of a fall turns a temporary loss into a permanent one: better to adjust the mix now, calmly.` });
    else add({ id: 'crash', sev: 0, tone: 'good', act: 'keep', title: 'Falls within what you can bear', text: `${t} That is compatible with the ${pct(L.maxDD, 0)} you said you could bear.` });
  }
  // 2. money for the goal (only fixed income is safe for it; the sooner the goal, the more serious)
  if (atRisk > 1) {
    const when = yrs == null ? 'With no date set, I treat it as a near-term expense.' : yrs < 3 ? `Your goal is ${yrs < 1 ? 'less than a year away' : `about ${Math.round(yrs)} years away`}.` : `Your goal is about ${Math.round(yrs)} years away.`;
    const sev = yrs == null || yrs < 3 ? 2 : yrs < 5 ? 1 : 0;
    add({ id: 'goal', sev, tone: sev ? 'warn' : 'info', act: sev ? 'reduce' : 'watch', title: sev ? 'Goal money in stocks' : 'Distant goal, still in stocks', text: `You say ${eur(earmark, 0)} of your investments is for your goal, but only ${eur(rfV, 0)} is in bonds: about <b>${eur(atRisk, 0)}</b> depends on the stock market${inGold ? ` or on gold (${eur(inGold, 0)}; gold has fallen as much as 40 %)` : ''}. ${when} ${sev ? `A 25 % fall would take ${eur(atRisk * 0.25, 0)} just when you need it.` : 'There is time, but it is worth moving it to short-term bonds as the date gets closer (out of stocks by 3 years before).'}` });
  } else if (earmark > 0) add({ id: 'goal', sev: 0, tone: 'good', act: 'keep', title: 'The goal money is safe', text: `The ${eur(earmark, 0)} you set aside for your goal fits within your bonds (${eur(rfV, 0)}).` });
  // 3. cash
  if (P.cash > 0) {
    if (!cu) add({ id: 'cushion', sev: 0, tone: 'info', act: 'watch', title: 'No emergency fund set', text: 'You have not set an emergency fund (in Cash). Without it I cannot tell the cash you need from the cash that is idle.' });
    else if (cu.cash < cu.amount) add({ id: 'cushion', sev: 1, tone: 'warn', act: 'add', title: 'Emergency fund incomplete', text: `You are ${eur(cu.amount - cu.cash, 0)} short of your ${eur(cu.amount, 0)} emergency fund. Completing it comes before investing more.` });
    if (cu && idle > Math.max(3000, 0.1 * P.total)) add({ id: 'cash', sev: 1, tone: 'info', act: 'watch', title: 'Cash with no purpose', text: `After ${g ? 'your goal and ' : ''}the emergency fund, ${eur(idle, 0)} of cash is left at an AER of ${pct(cashRate(), 1)}. If it is for something specific (a home, a car…), note it in Plan › Savings goal and I will stop counting it. If it has no planned use, it could go to the long-term part according to your profile (all at once or over several contributions). ${cu.spend ? `The emergency fund counts ${eur(cu.spend, 0)} of spending a month: change it in Plan › Emergency fund if that is not your figure.` : ''}` });
    else if (g) add({ id: 'cash', sev: 0, tone: 'good', act: 'keep', title: 'Cash with a purpose', text: `Your ${eur(P.cash, 0)} of cash is set aside for ${cu ? 'the emergency fund and ' : ''}your goal "${esc(g.name)}"${g.left > 0 ? ` (you have ${pct(g.share, 0)}; ${eur(g.left, 0)} to go)` : ''}, so I do not count it as idle money. For a near-term expense, cash is the prudent choice even if it earns little.` });
  }
  // 4. diversification of the equity part
  if (eqV > 0) {
    if (usW > 0.8) add({ id: 'us', sev: 1, tone: 'warn', act: 'watch', title: 'Heavy weight in the US', text: `About ${pct(usW, 0)} of your stocks are US companies; in a world index they are ≈ 62 %. That is a bet on a single country and a single currency (the dollar).` });
    const em = sub.em || 0; if (em > 0.2) add({ id: 'emerging', sev: 0, tone: 'info', act: 'watch', title: 'Emerging markets above the world weight', text: `Emerging markets are ${pct(em, 0)} of your stocks, against ≈ 11 % in a world index. It is not a mistake, but it is a bet: more volatility in exchange for a possible premium.` });
    const conc = (sub.single || 0) + (sub.sector || 0); if (conc > 0.15) add({ id: 'concentrated', sev: 1, tone: 'warn', act: 'reduce', title: 'Single stocks and sectors', text: `Individual stocks and sector funds add up to ${pct(conc, 0)} of your stocks. In an index portfolio they usually stay below 10–15 %.` });
    if (usW <= 0.8 && em <= 0.2 && conc <= 0.15) add({ id: 'diversif', sev: 0, tone: 'good', act: 'keep', title: 'Well spread stocks', text: `The US is ≈ ${pct(usW, 0)} of your stocks (≈ 62 % in the world) and you do not depend on single stocks or sectors.` });
  }
  // 5. costs (TER from the asset settings; only when known for most of the money)
  const withTer = open.filter((z) => z.asset.ter != null && z.asset.ter !== '' && Number.isFinite(+z.asset.ter) && z.asset.type !== 'crypto' && z.asset.type !== 'stock');
  const terV = withTer.reduce((s, z) => s + z.value, 0), fundV = val((z) => z.asset.type !== 'crypto' && z.asset.type !== 'stock');
  const ter = terV > 0 ? withTer.reduce((s, z) => s + z.value * +z.asset.ter, 0) / terV / 100 : null;
  if (ter != null && terV >= 0.6 * fundV) {
    const dear = withTer.filter((z) => +z.asset.ter > 0.6).map((z) => z.asset.ticker || z.asset.name);
    if (ter > 0.004 || dear.length) add({ id: 'costs', sev: ter > 0.006 ? 1 : 0, tone: 'warn', act: 'watch', title: 'Costs could be lower', text: `Your funds cost ${pct(ter, 2)} a year on average${dear.length ? `; the most expensive: ${esc(dear.slice(0, 3).join(', '))}` : ''}. A global index fund costs 0.1–0.3 %: over 20 years, the difference eats a noticeable part of the result.` });
    else add({ id: 'costs', sev: 0, tone: 'good', act: 'keep', title: 'Low costs', text: `Your funds cost ${pct(ter, 2)} a year on average, in line with index investing.` });
  }
  // 6. crypto
  if (cryptoW > L.cryptoCap + 0.005) add({ id: 'crypto', sev: L.cryptoCap === 0 ? 2 : 1, tone: 'warn', act: 'reduce', title: L.cryptoCap === 0 ? 'Crypto outside your profile' : 'Too much crypto', text: `Crypto is ${pct(cryptoW, 1)} of your long-term money; for your profile${p.crypto === 'no' ? ' (you said you do not want it)' : ''} the cap would be ${pct(L.cryptoCap, 0)}.` });
  else if (!crypto && L.cryptoCap > 0) add({ id: 'crypto', sev: 0, tone: 'info', act: 'watch', title: 'Crypto: optional', text: `You have no crypto. Your profile would allow up to ${pct(L.cryptoCap, 0)}, but it is not needed: it adds volatility and has no demonstrable expected return.` });
  // 7. market facts (insights/market, written weekly by the market-data routine): never change the level, only context
  const M = market();
  if (M) {
    const lt12 = M.tbill12m && +M.tbill12m.pct, tae = cashRate() * 100;
    if (lt12 > 0 && P.cash > 0 && (g || idle > 0) && lt12 - tae >= 0.5) add({ id: 'rates', sev: 0, tone: 'info', act: 'watch', title: 'Your cash could earn a bit more', text: `Your cash earns ${pct(tae / 100, 2)} AER and 12-month T-bills pay ${pct(lt12 / 100, 2)} (auction of ${fdate(M.tbill12m.date || M.date)}). For money you will not need in the next year (${g && (yrs == null || yrs > 1) ? 'part of the goal, for example' : 'the cash with no purpose'}), short-term government debt or a money market fund earn more without going through the stock market.` });
    const dd = M.equities && +M.equities.fromHighPct;
    if (dd <= -10) add({ id: 'market-fall', sev: 0, tone: 'info', act: 'keep', title: 'Stocks are falling', text: `World stocks are ${pct(-dd / 100, 0)} below their high (${esc(M.equities.highDate || '')}). ${-dd / 100 <= L.maxDD ? `That is within what you said you can bear (${pct(L.maxDD, 0)}): this is the time to follow your plan, not to change it.` : `It already exceeds what you said you can bear (${pct(L.maxDD, 0)}). Selling now would lock in the loss; if it keeps you up at night, calmly review your profile and adjust with contributions, not with sales.`}` });
  }
  // 8. complexity
  const small = open.filter((z) => z.value / inv < 0.03).length;
  if (open.length > (p.simple === 'few' ? 4 : 7) || small >= 2) add({ id: 'complexity', sev: p.simple === 'few' ? 1 : 0, tone: 'info', act: 'watch', title: 'Many products', text: `You have ${open.length} positions${small ? `, ${small} of them below 3 %` : ''}. ${p.simple === 'few' ? 'You prefer few products: ' : ''}2–4 funds are enough for a complete global portfolio.` });
  const sev = out.reduce((m, r) => Math.max(m, r.sev), 0);
  return { M, p, L, inv, def, rfV, risk, crypto, earmark, atRisk, lt, riskW, riskWAll, idle, crisis, yrs, ter, cryptoW, usW, sub, rules: out, verdict: sev >= 2 ? 'review' : sev === 1 ? 'adjust' : 'keep' };
}

/* ----- view ----- */
function aiModeSeg() {
  const m = ui.aiMode || 'obs';
  return `<div class="seg" role="group" aria-label="What to show">${[['obs', 'Observations'], ['analyst', 'My analyst']].map(([k, l]) => `<button type="button" data-aimode="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>`;
}
function bandBar(label, w, lo, hi, sub) {
  const x = (v) => (Math.max(0, Math.min(1, v)) * 100).toFixed(1); const inBand = w >= lo - 0.005 && w <= hi + 0.005;
  return `<div class="an-bar"><div class="an-bl"><span>${label}</span><span class="num ${inBand ? '' : 'loss noarr'}">${pct(w, 0)} <small class="muted">· profile ${pct(lo, 0)}–${pct(hi, 0)}</small></span></div>
    <div class="an-track" role="img" aria-label="${esc(label)}: ${pct(w, 0)}; your profile's range ${pct(lo, 0)} to ${pct(hi, 0)}"><span class="an-band" style="left:${x(lo)}%;width:${(x(hi) - x(lo)).toFixed(1)}%"></span><span class="an-fill${inBand ? '' : ' out'}" style="width:${x(w)}%"></span></div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
}
function analystView() {
  if (DEMO) return '<p class="muted">Available with your own portfolio, not with the sample one.</p>';
  const p = profile();
  if (!p) return `<div class="an-cta"><div><h3>First, your profile</h3><p class="small muted">Nine quick questions (horizon, how you handle falls, income, preferences). With them I compare your portfolio with what suits you and Claude gives you its verdict: keep, adjust or review.</p></div><button class="btn primary" type="button" data-act="profile-edit">Take the questionnaire</button></div>`;
  const A = analystRules(); if (!A) return '<p class="muted">Add your investments first.</p>';
  const L = A.L; const ai = S.analyst; const v = AN_VERDICT[A.verdict];
  const stale = ai && ai.date && (ai.profileDate !== p.date || Math.abs((ai.riskW ?? A.riskW) - A.riskW) > 0.03);
  const limit = L.by === 'capacity' ? ' It is limited by your horizon or your income, not your tolerance.' : L.by === 'tolerance' ? ' It is limited by how you handle falls, not your time frame.' : '';
  const old = (p.v || 1) < PF_VER ? 'The questionnaire has changed (time frame and maximum fall): review your profile.' : todayStr() > E.addMonths(p.date, 12) ? 'Your profile is more than a year old: review it in case your situation has changed.' : '';
  return `<div class="an-head"><div><span class="chip">${L.name} · ${L.lv} of 5</span> <span class="small muted">profile from ${fdate(p.date)}.${limit}</span></div><button class="btn ghost small" type="button" data-act="profile-edit">Edit profile</button></div>
  ${old ? `<p class="small warn-t" style="margin:0 0 10px">${old}</p>` : ''}
  <div class="an-verdict ${v[1]}"><span class="k">Rule-based diagnosis</span><b>${v[0]}${(() => { const top = A.verdict !== 'keep' && A.rules.filter((x) => x.sev > 0).sort((x, y) => y.sev - x.sev)[0]; return top ? `: ${esc(top.title.charAt(0).toLowerCase() + top.title.slice(1))}` : ''; })()}</b></div>
  <div class="an-bars"><div class="an-legend"><span><i style="background:color-mix(in srgb,var(--ink) 45%,transparent)"></i>your portfolio</span><span><i style="border:2px solid var(--gain);box-sizing:border-box"></i>your profile's range</span></div>${bandBar('Risky assets (stocks, crypto…)', A.riskW, L.lo, L.hi, A.earmark ? `of your long-term money: ${eur(A.lt, 0)}, without the ${eur(A.earmark, 0)} set aside for your goal` : `of your investments: ${eur(A.lt, 0)}; cash is counted separately`)}${A.crypto || L.cryptoCap ? bandBar('Crypto', A.cryptoW, 0, L.cryptoCap) : ''}</div>
  ${marketHtml(A.M)}
  <div class="ins-grid">${A.rules.slice().sort((a, b) => b.sev - a.sev).map((r) => insightCard({ tone: r.tone, title: `${esc(r.title)} <span class="chip an-act">${AN_ACT[r.act]}</span>`, text: r.text })).join('')}</div>
  <div class="an-ai"><div class="panel-h"><h3>Claude's opinion</h3><div class="toolbar">${ai && ai.date ? `<span class="small muted">${new Date(ai.date).toLocaleString(L_, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}<button class="btn primary" type="button" data-act="ai-analyst" ${sampleFn ? '' : 'disabled title="Not available in this view"'}>${ai && ai.items ? 'Ask again' : 'Ask Claude for a verdict'}</button></div></div>
    <div id="anBox">${ai && ai.items ? analystAiHtml(ai, stale, A.verdict) : '<p class="muted small">Claude reads your profile, this diagnosis and your data, and tells you what it would do: keep, add or reduce something, and what it would not do.</p>'}</div></div>
  <p class="note">Guidance generated by rules and by AI from your data. It is not personalised or regulated financial advice (in Spain that requires CNMV authorisation); it uses market data only as context, with no predictions, and never recommends specific products. The decisions are yours.</p>`;
}
const L_ = 'en-GB';
function analystAiHtml(ai, stale, rulesVerdict) {
  const v = AN_VERDICT[ai.verdict] || AN_VERDICT.adjust;
  const rv = stale ? null : ai.rulesVerdict || rulesVerdict; const d = rv ? (AN_RANK[ai.verdict] ?? 1) - (AN_RANK[rv] ?? 1) : 0;
  const diff = d < 0 ? 'Claude is more optimistic than the rule-based diagnosis; its reason is in the summary.' : d > 0 ? 'Claude is stricter than the rule-based diagnosis.' : '';
  return `${stale ? '<p class="small warn-t">Your profile or your portfolio has changed since this verdict; ask for it again.</p>' : ''}${diff ? `<p class="small muted" style="margin:0 0 6px">${diff}</p>` : ''}
  <div class="an-verdict ${v[1]}"><span class="k">Claude's verdict</span><b>${v[0]}</b><p>${esc(ai.summary || '')}</p></div>
  <div class="ins-grid">${ai.items.map((i) => insightCard({ tone: i.action === 'reduce' ? 'warn' : i.action === 'keep' ? 'good' : 'info', title: `${esc(i.title)} <span class="chip an-act">${AN_ACT[i.action] || 'Watch'}</span>`, text: esc(i.text) })).join('')}</div>
  ${ai.notDo && ai.notDo.length ? `<details class="an-not" open><summary>What I would not do</summary><ul>${ai.notDo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}`;
}

/* ----- questionnaire ----- */
function openProfileForm() {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const p = profile() || {}; const inv = res ? res.totals.value : 0;
  openModal(`<div class="panel-h"><h2>Your investor profile</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form pf-form" id="pfForm" novalidate>
    ${PF_Q.map(([k, q, opts]) => `<fieldset class="full pf-q"><legend>${q}</legend>${opts.map(([v, l]) => `<label class="pf-opt"><input type="radio" name="pf_${k}" value="${v}" ${String(p[k]) === v ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>`).join('')}
    <label class="f full">Of what you have invested, how much do you plan to use for your goal (a home deposit, for example)? <span class="hint">in euros; 0 if you will not touch your investments${inv ? ` · you have ${eur(inv, 0)} invested today` : ''}</span><input type="text" inputmode="decimal" id="pfGoal" value="${p.goalInvested != null ? esc(String(p.goalInvested)) : '0'}"></label>
    <p class="note full">It is saved in your settings and is only used to guide the analysis. You can change it whenever you like.</p>
    <div class="err full" id="pfErr"></div>
    <div class="form-actions full"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save profile</button></div>
  </form>`, () => {
    $('#pfForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const np = { v: PF_VER, date: todayStr() }; const miss = [];
      for (const [k, q] of PF_Q) { const el = document.querySelector(`input[name="pf_${k}"]:checked`); if (el) np[k] = el.value; else miss.push(q); }
      if (miss.length) return ($('#pfErr').textContent = `${miss.length} question${miss.length > 1 ? 's' : ''} missing: "${miss[0]}"`);
      const gi = $('#pfGoal').value.trim() ? parseNum($('#pfGoal').value) : 0;
      if (!Number.isFinite(gi) || gi < 0) return ($('#pfErr').textContent = 'Enter an amount of 0 or more.');
      np.goalInvested = +gi.toFixed(2);
      try { await saveSettings({ profile: np }); closeModal(); ui.aiMode = 'analyst'; toast(`Profile saved: ${profileLevel(np).name.toLowerCase()}.`); render(); }
      catch (e) { $('#pfErr').textContent = 'Could not save: ' + (e.message || e.code); }
    });
  });
}

/* ----- Claude ----- */
async function runAiAnalyst() {
  if (!sampleFn) return toast('Claude is not available in this view.');
  const A = analystRules(); if (!A) return toast('Take the profile questionnaire first.');
  const box = $('#anBox'); const btn = $('[data-act="ai-analyst"]'); if (btn) { btn.disabled = true; btn.textContent = 'Thinking…'; }
  if (box) box.innerHTML = `<div class="m-skel" aria-busy="true"><p class="muted small" style="margin:0 0 6px">Claude is studying your portfolio with your profile…</p><div class="ins sk"><span class="m-sk" style="width:55%;height:13px"></span><span class="m-sk"></span><span class="m-sk" style="width:70%"></span></div></div>`;
  const qa = Object.fromEntries(PF_Q.map(([k, q, opts]) => [q, (opts.find((o) => o[0] === String(A.p[k])) || [])[1] || null]));
  const r2 = (v) => Math.round(v * 1000) / 10;
  const diag = { level: `${A.L.lv} of 5 (${A.L.name})`, limitedBy: A.L.by, riskRangePct: [r2(A.L.lo), r2(A.L.hi)], cryptoCapPct: r2(A.L.cryptoCap),
    currentRiskPct: r2(A.riskW), currentCryptoPct: r2(A.cryptoW), investmentsSetAsideForGoal: Math.round(A.earmark), goalMoneyOutsideBonds: Math.round(A.atRisk), yearsToGoal: A.yrs == null ? null : Math.round(A.yrs * 10) / 10, longTermMoney: Math.round(A.lt),
    cashWithNoPurpose: Math.round(A.idle), riskCountingIdleCashPct: A.idle > 0 ? r2(A.riskWAll) : undefined,
    estimatedCrisisDropPct: r2(A.crisis), maxDropTheyCanBearPct: r2(A.L.maxDD), crisisAssumptions: 'like 2008-09: stocks -50 %, crypto -75 %, gold -10 %, bonds -5 %',
    averageFundTerPct: A.ter == null ? undefined : Math.round(A.ter * 10000) / 100, incoherentAnswers: A.L.incoherent || undefined,
    usShareOfStocksPct: r2(A.usW), stocksByTypePct: Object.fromEntries(Object.entries(A.sub).map(([k, w]) => [SUBS[k] ? SUBS[k][0] : k, r2(w)])),
    rulesVerdict: A.verdict, findings: A.rules.map((x) => ({ topic: x.title, action: x.act, severity: x.sev, detail: x.text.replace(/<[^>]+>/g, '') })) };
  const eff = efficiency(); const g = goalInfo(); const cu = cushionInfo();
  const extra = { efficiency: eff ? { score: eff.score, expectedReturnPct: r2(eff.me.mu), expectedVolatilityPct: r2(eff.me.vol), score_: '0-100 score of the expected return/risk ratio of the invested part against the best mix of its own building blocks' } : undefined,
    savingsGoal: g ? { name: g.name, amount: Math.round(g.amount), date: g.date, cashThatCounts: Math.round(g.cash), remaining: Math.round(g.left) } : null,
    emergencyFund: cu ? { amount: Math.round(cu.amount), covered: Math.round(cu.covered) } : null,
    costs: assetList().filter((a) => a.ter != null && a.ter !== '').map((a) => ({ asset: a.ticker || a.name, terPct: +a.ter })) };
  const prompt = `You are the portfolio analyst of a private investor resident in Spain. Write in clear, direct British English, addressing them as "you". I am giving you their profile (their answers), a DIAGNOSIS made with fixed rules, and their data. Your job: say whether you would keep the portfolio as it is or what you would adjust, reasoning it for THEIR profile.
Return ONLY a JSON: {"verdict":"keep|adjust|review","summary":"…","items":[{"action":"keep|add|reduce|watch","title":"…","text":"…"}],"notDo":["…"]}
- "summary": 1-2 sentences (max 45 words) with your verdict and the main reason.
- "items": 1 to 4 recommendations, from most to least important. A 2- to 6-word title; "text" max 60 words, with figures from the data and the reason for their profile. If the right thing is to change nothing, a single "keep" item explaining it is a perfect answer.
- "notDo": 2 to 4 short sentences with ideas you considered and do NOT recommend for them, with the reason (e.g. adding bitcoin, an actively managed fund, gold, more funds, selling to reallocate).
Rules:
0) Priorities, in this order: emergency fund → goal money out of stocks → risk level (including the crisis drop against the one they say they can bear) → diversification → costs → simplicity. Do not propose something at one level while a more serious earlier one is pending.
1) By default, change nothing. Propose a change only if there is a rule finding or a clear reason tied to their profile. Your "verdict" cannot be milder than "rulesVerdict" unless you justify it in "summary".
2) Respect the figures of the diagnosis; do not recalculate or contradict them.
3) Talk about asset types, not products: "a short-term euro bond index fund", never a brand name, ISIN or fund manager.
4) Explicitly assess these ideas and put them in "items" (if they fit) or in "notDo" (if not): adding crypto, adding an actively managed fund, adding bonds or gold, simplifying. Be sceptical about active management: most active funds return less than their index after fees over the long term; it would only make sense in niches and with low costs.
5) To move money in Spain: it is better to direct new contributions or switch between funds (switches are not taxed) than to sell; ETFs and shares are taxed when sold. Money for a near-term expense (the savings goal) should not be in stocks or gold; under 3 years away, only cash or short-term bonds. If there is "cashWithNoPurpose" and risk is high, the solution is to put that cash to use (bonds or contributions), not to sell stocks.
6) MARKET holds recent dated facts (rates, T-bills, inflation, the fall of stocks from their highs, US valuation), or null. Use them ONLY to: (a) compare where safe money earns more (cash against T-bills or money market funds); (b) put a fall in context and remind them of their plan; (c) explain why to diversify if the US is expensive against its history. Never to predict, to change their risk level, or to recommend getting in, out or waiting. If MARKET is null, do not talk about current conditions. Do not make up data.
7) "weightPct" in positions is over the investments (without cash). Cash has its own role (emergency fund and goal).
8) The profile is the investor's own answers. If "incoherentAnswers" exists, say so in "summary" and do not push big changes until they review the questionnaire.
PROFILE (answers): ${JSON.stringify(qa)}
DIAGNOSIS: ${JSON.stringify(diag)}
CONTEXT: ${JSON.stringify(extra)}
MARKET: ${JSON.stringify(A.M ? { date: A.M.date, ecb: A.M.ecb, tbills12m: A.M.tbill12m, inflationSpain: A.M.inflation, worldStocks: A.M.equities, capeUS: A.M.cape } : null)}
PORTFOLIO DATA: ${JSON.stringify(portfolioDigest())}`;
  try {
    const r = await sampleFn.json(prompt, { modelTier: 'default', cache: false });
    const acts = Object.keys(AN_ACT);
    const items = (r && Array.isArray(r.items) ? r.items : []).slice(0, 4).map((i) => ({ action: acts.includes(i.action) ? i.action : 'watch', title: String(i.title || '').slice(0, 80), text: String(i.text || '').slice(0, 600) })).filter((i) => i.title || i.text);
    if (!items.length) throw { code: 'invalid_json', message: 'Empty answer' };
    const doc = { date: new Date().toISOString(), verdict: AN_VERDICT[r.verdict] ? r.verdict : A.verdict, summary: String(r.summary || '').slice(0, 400), items,
      notDo: (Array.isArray(r.notDo) ? r.notDo : []).slice(0, 5).map((x) => String(x).slice(0, 300)), profileDate: A.p.date, riskW: A.riskW, rulesVerdict: A.verdict };
    if (db && !DEMO) await db.doc('insights/analyst').set(doc); else { S.analyst = doc; render(); }
  } catch (e) {
    const msg = { not_granted: 'You have not given permission to ask Claude from this page.', rate_limited: 'Too many requests in a row; try again in a while.', invalid_json: 'Claude did not return a valid format; try again.' }[e && e.code] || ('Could not finish: ' + ((e && e.message) || e));
    const b2 = $('#anBox'); if (b2) b2.innerHTML = `<p class="err">${esc(msg)}</p>`;
  } finally { const b = $('[data-act="ai-analyst"]'); if (b) { b.disabled = false; b.textContent = 'Ask again'; } }
}
