/* ================= Cash, asset classes, patrimony ================= */
const CLASSES = [['rv', 'Equities', '--s1'], ['rf', 'Bonds', '--s3'], ['oro', 'Gold', '--s4'], ['cripto', 'Crypto', '--s2'], ['otro', 'Other', '--s9'], ['cash', 'Cash', '--s7']];
const CLS_LABEL = Object.fromEntries(CLASSES.map(([k, l]) => [k, l]));
const clsColor = (k) => cssv((CLASSES.find((c) => c[0] === k) || CLASSES[4])[2]);
const clsOf = (a) => a.cls || (a.type === 'crypto' ? 'cripto' : a.type === 'cash' ? 'cash' : 'rv');
function cashList() { return (DEMO ? demoData.cash : Object.values(S.cash)).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
const MV_TYPES = { open: 'Opening balance', in: 'Deposit', out: 'Withdrawal', interest: 'Interest', adjust: 'Adjustment' };
/** Movements of an account, oldest first: [{id, d, a, t, n}]. Older docs that only have snapshots (h) are read as opening + adjustments. */
function cashMoves(c) {
  let mv = Object.entries(c.mv || {}).map(([id, m]) => ({ id, d: m.d, a: +m.a || 0, t: m.t || (m.a >= 0 ? 'in' : 'out'), n: m.n || '' })).filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.d));
  if (!mv.length) {
    const hs = Object.entries(c.h || {}).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(+v)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let prev = 0; hs.forEach(([d, v], i) => { mv.push({ id: 'h' + i, d, a: +v - prev, t: i ? 'adjust' : 'open', n: '' }); prev = +v; });
    if (!mv.length && Number.isFinite(+c.balance)) mv.push({ id: 'b', d: c.updated || todayStr(), a: +c.balance, t: 'open', n: '' });
  }
  const order = { open: 0, in: 1, interest: 2, adjust: 3, out: 4 };
  return mv.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : (order[x.t] ?? 5) - (order[y.t] ?? 5)));
}
function cashPts(c) { const out = []; let b = 0; for (const m of cashMoves(c)) { b += m.a; if (out.length && out[out.length - 1][0] === m.d) out[out.length - 1][1] = b; else out.push([m.d, b]); } return out; }
const cashBal = (c) => { const p = cashPts(c); return p.length ? p[p.length - 1][1] : 0; };
const cashTotal = () => cashList().reduce((s, c) => s + cashBal(c), 0);
function cashAt(d) { let s = 0; for (const c of cashList()) { let v = 0; for (const [dd, b] of cashPts(c)) { if (dd <= d) v = b; else break; } s += v; } return s; }
const cashRate = () => { const t = cashTotal(); return t > 0 ? cashList().reduce((s, c) => s + cashBal(c) * (+c.rate || 0), 0) / t / 100 : 0; };
/** Savings goal (settings.goal = {name, amount, date?}): progress of total cash, pace of the last 3 months and the date it would be reached. */
function goalInfo() {
  const g = S.settings && S.settings.goal; if (DEMO || !g || !(+g.amount > 0)) return null;
  const cu = cushionInfo(), cash = cu ? cu.free : cashTotal() /* the emergency cushion never counts towards the goal */, amt = +g.amount, left = Math.max(0, amt - cash), today = todayStr();
  const from = E.addDays(today, -91); // pace: what comes from outside (salary, savings, interest), not the money from your own sales
  const pace = cashList().flatMap((c) => cashMoves(c)).filter((m) => m.d > from && m.d <= today && m.t !== 'open' && m.t !== 'adjust' && !(m.t === 'in' && /^sale\b/i.test(m.n || ''))).reduce((s, m) => s + (+m.a || 0), 0) / 3;
  const mLeft = g.date && g.date > today ? (Date.parse(g.date) - Date.parse(today)) / (30.44 * 864e5) : null;
  const need = mLeft ? left / Math.max(mLeft, 0.5) : null;
  const eta = left <= 0 ? today : pace > 0 ? E.addDays(today, Math.ceil(left / pace * 30.44)) : null;
  return { name: g.name || 'Goal', amount: amt, date: g.date || null, cash, left, share: Math.min(1, cash / amt), pace, need, eta, cu: cu || null };
}
function goalPanel(compact) {
  const g = goalInfo();
  if (!g) return compact ? '' : `<section class="panel"><div class="panel-h"><div><h2>Savings goal</h2><span class="small muted">for example, a house deposit</span></div><button class="btn primary small" type="button" data-act="goal-edit">Set a goal</button></div></section>`;
  const done = g.left <= 0;
  const late = g.date && g.eta && g.eta > g.date;
  const lines = done ? [`<b class="gain noarr">Goal reached.</b> You are ${eur(g.cash - g.amount, 0)} above it.`] : [
    `<b class="num">${eur(g.left, 0)}</b> to go${g.date ? ` by ${fdate(g.date)}` : ''}.`,
    g.need != null ? `You need to save about <b class="num">${eur(g.need, 0)}</b> a month.` : '',
    `New savings coming in, last 3 months: <span class="num ${cls(g.pace)}">${eurS(g.pace, 0)}</span>/month${g.pace > 0 ? ` → you would reach it around <b class="${late ? 'loss' : ''}">${fdate(g.eta, { day: undefined })}</b>${late ? ' (after your date)' : ''}` : ' → at this pace you won\'t reach it'}.`];
  return `<section class="panel"><div class="panel-h"><div><h2>${esc(g.name)}</h2><span class="small muted">${g.cu ? `cash excluding the emergency fund (${eur(g.cu.amount, 0)})` : 'cash'} against your goal of ${eur(g.amount, 0)}</span></div>${compact ? '<a href="#cash" data-goto="cash" class="small">See cash</a>' : '<button class="btn ghost small" type="button" data-act="goal-edit">Edit</button>'}</div>
    <div class="goal-row"><span class="num" style="font-size:22px;font-weight:700">${eur(g.cash, 0)}</span><span class="num muted">${pct(g.share, 0)}</span></div>
    <div class="goalbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.share * 100)}" aria-label="Goal progress"><span style="width:${(g.share * 100).toFixed(1)}%"></span></div>
    <p class="small" style="margin:0;line-height:1.6">${lines.filter(Boolean).join(compact ? ' ' : '<br>')}</p>
    ${g.cu ? `<p class="small muted" style="margin:0"><b class="num">${eur(g.cash, 0)}</b> of your ${eur(g.cu.cash, 0)} in cash count towards the goal; the rest is your emergency fund.</p>` : ''}
    ${compact ? '' : '<p class="note" style="margin:0">The pace counts what goes in and out of your accounts, excluding money from selling funds.</p>'}</section>`;
}
/** Emergency cushion (settings.cushion = {months, spend} or {amount}, goal: discount it from the savings goal). */
function cushionInfo() {
  const c = S.settings && S.settings.cushion; if (DEMO || !c) return null;
  const spend = +c.spend > 0 ? +c.spend : null, amount = +c.amount > 0 ? +c.amount : spend && +c.months > 0 ? +c.months * spend : 0; if (!(amount > 0)) return null;
  const cash = cashTotal();
  return { amount, months: +c.months || null, spend, cash, covered: Math.min(Math.max(cash, 0), amount), free: Math.max(0, cash - amount), cover: spend ? cash / spend : null, goal: !!c.goal };
}
function cushionPanel() {
  const c = cushionInfo();
  if (!c) return `<section class="panel"><div class="panel-h"><div><h2>Emergency fund</h2><span class="small muted">money you don't touch, for example 6 months of expenses</span></div><button class="btn small" type="button" data-act="cushion-edit">Set it up</button></div></section>`;
  const full = c.cash >= c.amount;
  return `<section class="panel"><div class="panel-h"><div><h2>Emergency fund</h2><span class="small muted">${c.months && c.spend ? `${NF({ maximumFractionDigits: 1 }).format(c.months)} months × ${eur(c.spend, 0)} of spending` : 'fixed amount'}</span></div><button class="btn ghost small" type="button" data-act="cushion-edit">Edit</button></div>
    <div class="stats">
      <div class="stat"><span class="k">Emergency fund</span><span class="v num">${eur(c.amount, 0)}</span></div>
      <div class="stat"><span class="k">Covered by your cash<small>${pct(c.covered / c.amount, 0)} of the fund${c.cover != null ? ` · your cash covers ${NF({ maximumFractionDigits: 1 }).format(c.cover)} months of expenses` : ''}</small></span><span class="v num noarr ${full ? 'gain' : 'loss'}">${eur(c.covered, 0)}</span></div>
      ${(() => { const g = S.settings && S.settings.goal && +S.settings.goal.amount > 0 ? S.settings.goal : null; if (!g) return `<div class="stat"><span class="k">Available above the emergency fund<small>cash − emergency fund</small></span><span class="v num">${eur(c.free, 0)}</span></div>`;
        const forGoal = Math.min(c.free, +g.amount), libre = Math.max(0, c.free - +g.amount);
        return `<div class="stat"><span class="k">For "${esc(g.name || 'your goal')}"<small>what is left after the emergency fund</small></span><span class="v num">${eur(forGoal, 0)}</span></div><div class="stat"><span class="k">Truly free<small>cash − emergency fund − goal</small></span><span class="v num">${eur(libre, 0)}</span></div>`; })()}
    </div>
    ${full ? '' : `<p class="small" style="margin:8px 0 0">You need <b class="num">${eur(c.amount - c.covered, 0)}</b> more to complete the emergency fund.</p>`}</section>`;
}
function openCushionForm() {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const c = (S.settings && S.settings.cushion) || {}; const n = (v) => (v ? esc(String(v)) : '');
  openModal(`<div class="panel-h"><h2>Emergency fund</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="cuForm" novalidate>
    <label class="f half">Months<input type="text" inputmode="decimal" id="cuM" value="${n(c.months || (c.amount ? '' : 6))}" placeholder="6"></label>
    <label class="f half">Monthly spending (€)<input type="text" inputmode="decimal" id="cuS" value="${n(c.spend)}" placeholder="1,500"></label>
    <label class="f full">Or a fixed amount (€) <span class="hint">if filled in, it overrides months × spending</span><input type="text" inputmode="decimal" id="cuA" value="${n(c.amount)}"></label>
    <label class="full small"><input type="checkbox" id="cuG" ${c.goal ? 'checked' : ''}> Subtract the emergency fund from the savings goal</label>
    <p class="note full">The emergency fund comes out of your cash accounts. If you enter your monthly spending, you will also see how many months your cash covers.</p>
    <div class="err full" id="cuErr"></div>
    <div class="form-actions full">${S.settings && S.settings.cushion ? '<button class="btn danger" type="button" id="cuDel">Remove emergency fund</button>' : ''}<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
  </form>`, () => {
    const del = $('#cuDel'); if (del) del.addEventListener('click', async () => { try { await saveSettings({ cushion: null }); closeModal(); toast('Emergency fund removed.'); } catch (e) { $('#cuErr').textContent = 'Could not save: ' + (e.message || e.code); } });
    $('#cuForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const v = (id) => { const x = $(id).value.trim(); return x ? parseNum(x) : null; };
      const m = v('#cuM'), sp = v('#cuS'), a = v('#cuA');
      if ([m, sp, a].some((x) => x != null && !(Number.isFinite(x) && x > 0))) return ($('#cuErr').textContent = 'Use positive amounts and months.');
      if (!a && !(m && sp)) return ($('#cuErr').textContent = 'Enter months and monthly spending, or a fixed amount.');
      const cu = { goal: $('#cuG').checked }; if (m) cu.months = +m.toFixed(1); if (sp) cu.spend = +sp.toFixed(2); if (a) cu.amount = +a.toFixed(2);
      try { await saveSettings({ cushion: cu }); closeModal(); toast('Emergency fund saved.'); }
      catch (e) { $('#cuErr').textContent = 'Could not save: ' + (e.message || e.code); }
    });
  });
}
function openGoalForm() {
  if (DEMO) return toast('The sample portfolio cannot be edited.');
  const g = (S.settings && S.settings.goal) || {};
  openModal(`<div class="panel-h"><h2>Savings goal</h2><button class="btn ghost" type="button" data-close>Close</button></div>
  <form class="form" id="gForm" novalidate>
    <label class="f full">Name<input type="text" id="gName" value="${esc(g.name || 'House deposit')}"></label>
    <label class="f half">Amount (€)<input type="text" inputmode="decimal" id="gAmt" value="${g.amount ? esc(String(g.amount)) : ''}" required placeholder="40,000"></label>
    <label class="f half">Date <span class="hint">optional</span><input type="date" id="gDate" value="${esc(g.date || '')}"></label>
    ${(() => { const c = S.settings && S.settings.cushion; return `<label class="f half">Your monthly spending (€) <span class="hint">for the emergency fund${c && +c.spend > 0 ? ` · now ${eur(+c.spend, 0)}` : ''}</span><input type="text" inputmode="decimal" id="gSpend" value="" placeholder="e.g. 1,200"></label><label class="f half">Months of emergency fund<input type="text" inputmode="decimal" id="gMonths" value="${esc(String((c && +c.months) || 6))}"></label>`; })()}
    <p class="note full">It counts your cash minus the emergency fund (spending × months), which stays untouched.</p>
    <div class="err full" id="gErr"></div>
    <div class="form-actions full">${g.amount ? '<button class="btn danger" type="button" id="gDel">Remove goal</button>' : ''}<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div>
  </form>`, () => {
    const del = $('#gDel'); if (del) del.addEventListener('click', async () => { try { await saveSettings({ goal: null }); closeModal(); toast('Goal removed.'); } catch (e) { $('#gErr').textContent = 'Could not save: ' + (e.message || e.code); } });
    $('#gForm').addEventListener('submit', async (ev) => {
      ev.preventDefault(); const amt = parseNum($('#gAmt').value); const d = $('#gDate').value;
      if (!Number.isFinite(amt) || amt <= 0) return ($('#gErr').textContent = 'Enter a positive amount.');
      if (d && d <= todayStr()) return ($('#gErr').textContent = 'The date must be in the future.');
      const sp = parseNum($('#gSpend').value), mo = parseNum($('#gMonths').value); const cu0 = (S.settings && S.settings.cushion) || {};
      try { await saveSettings(Object.assign({ goal: { name: $('#gName').value.trim() || 'Goal', amount: +amt.toFixed(2), date: d || null } }, sp > 0 ? { cushion: Object.assign({}, cu0, { spend: +sp.toFixed(2), months: mo > 0 ? mo : +cu0.months || 6, amount: null }) } : {})); closeModal(); toast('Objetivo guardado.'); }
      catch (e) { $('#gErr').textContent = 'Could not save: ' + (e.message || e.code); }
    });
  });
}
async function saveCashMoves(c, mvList) {
  const mv = {}; for (const m of mvList) mv[m.id] = { d: m.d, a: +m.a.toFixed(2), t: m.t, n: m.n || '' };
  const tmp = Object.assign({}, c, { mv }); delete tmp.h; delete tmp.id;
  const bal = cashBal(tmp); const last = mvList.reduce((x, m) => (m.d > x ? m.d : x), '');
  await save('cash', c.id, Object.assign(tmp, { balance: +bal.toFixed(2), updated: last || todayStr() }));
}
/** Adds one movement with a merge-write, so two devices adding movements at the same time never overwrite each other. */
async function addCashMove(c, mvList, id) {
  if (!db || DEMO) return saveCashMoves(c, mvList);
  const m = mvList.find((z) => z.id === id); const tmp = { mv: Object.fromEntries(mvList.map((z) => [z.id, z])) };
  const bal = cashBal(Object.assign({}, c, tmp));
  await retry1(() => db.collection('cash').doc(c.id).update({ mv: { [id]: { d: m.d, a: +(+m.a).toFixed(2), t: m.t, n: m.n || '' } }, balance: +bal.toFixed(2), updated: todayStr() }));
}
function patrimony() { const inv = res ? res.totals.value : 0, cash = cashTotal(); return { inv, cash, total: inv + cash }; }
function classAlloc() {
  const m = {};
  if (res) for (const p of res.positions) if (p.open && p.value > 0) { const k = clsOf(p.asset); m[k] = (m[k] || 0) + p.value; }
  const c = cashTotal(); if (c > 0) m.cash = (m.cash || 0) + c;
  const tot = Object.values(m).reduce((s, v) => s + v, 0);
  return CLASSES.filter(([k]) => m[k] > 0).map(([k, l]) => ({ key: k, label: l, value: m[k], weight: tot ? m[k] / tot : 0, color: clsColor(k) }));
}
function ytdInfo() {
  if (!res || !res.series.length) return null;
  const y0 = res.totals.today.slice(0, 4) + '-01-01';
  const st = E.periodStats(res, y0 <= res.totals.firstDate ? null : y0);
  const S2 = res.series; const i = S2.findIndex((p) => p.date >= y0); const base = i > 0 ? S2[i - 1] : { invested: 0 };
  return st ? { pnl: st.pnl, twr: st.twr, invested: S2[S2.length - 1].invested - base.invested } : null;
}

