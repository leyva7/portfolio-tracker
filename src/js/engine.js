/* Portfolio engine — pure functions, no DOM. Base currency EUR.
 *
 * Input state:
 *  assets:  [{id, name, ticker, type:'etf'|'stock'|'crypto'|'fund'|'cash'|'other', currency:'EUR'|'USD'|..., broker, tag, target (0..1)}]
 *  txs:     [{id, date:'YYYY-MM-DD', type, assetId, qty, price, fees, fx, amount, withholding, ratio, seq}]
 *           buy/sell: qty, price (asset ccy), fees (EUR), fx (EUR per 1 unit of asset ccy; optional)
 *           dividend: amount (gross, asset ccy), withholding (asset ccy), fx
 *           interest: amount (gross EUR), withholding (EUR)          — assetId optional
 *           fee:      amount (EUR)                                   — assetId optional
 *           split:    ratio (new units per old unit)
 *  history: {assetId: [[date, close], ...]}  close in asset currency
 *  fx:      {USD: [[date, eurPerUnit], ...], ...}
 *  benchmark: [[date, valueEUR], ...] (optional)
 *  settings: {riskFree: 0.02 (annual), today: 'YYYY-MM-DD'}
 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const BASE = 'EUR';
  const t = (d) => Date.parse(d + 'T00:00:00Z');
  const ds = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (d, n) => ds(t(d) + n * DAY);
  const dow = (d) => new Date(t(d)).getUTCDay();
  const num = (x, dflt = 0) => { const v = typeof x === 'string' ? parseFloat(x.replace(',', '.')) : x; return Number.isFinite(v) ? v : dflt; };
  const EPS = 1e-9;

  function addMonths(d, n) {
    const dt = new Date(t(d));
    const day = dt.getUTCDate();
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() + n);
    const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(day, last));
    return ds(dt.getTime());
  }

  /** Step lookup over a [[date,value]] series: last value with date <= d. */
  function lookup(series, interp) {
    const s = (series || []).filter((p) => p && p[0] && Number.isFinite(+p[1]) && +p[1] > 0)
      .map((p) => [p[0], +p[1]]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const dates = s.map((p) => p[0]);
    const vals = s.map((p) => p[1]);
    const fn = (d) => {
      let lo = 0, hi = dates.length - 1, ans = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
      if (ans < 0) return null;
      if (interp && ans < dates.length - 1 && dates[ans] !== d) {
        const t0 = t(dates[ans]), t1 = t(dates[ans + 1]), w = (t(d) - t0) / (t1 - t0);
        return vals[ans] + (vals[ans + 1] - vals[ans]) * w;
      }
      return vals[ans];
    };
    fn.at = (d) => { let lo = 0, hi = dates.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans < 0 ? null : s[ans]; };
    fn.first = s.length ? s[0] : null;
    fn.last = s.length ? s[s.length - 1] : null;
    fn.prev = s.length > 1 ? s[s.length - 2] : null;
    fn.points = s;
    return fn;
  }

  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function stdev(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
  function covar(a, b) { const n = Math.min(a.length, b.length); if (n < 2) return 0; const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb); return s / (n - 1); }
  function corr(a, b) { const sa = stdev(a), sb = stdev(b); return sa > 0 && sb > 0 ? covar(a, b) / (sa * sb) : null; }
  function quantile(a, q) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const pos = (s.length - 1) * q; const lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); }

  /** XIRR: flows [{date, amount}] investor perspective (out < 0, in > 0). Returns annual rate or null. */
  function xirr(flows) {
    const f = flows.filter((x) => Math.abs(x.amount) > EPS).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (f.length < 2) return null;
    if (!f.some((x) => x.amount > 0) || !f.some((x) => x.amount < 0)) return null;
    const t0 = t(f[0].date);
    const yrs = f.map((x) => (t(x.date) - t0) / (365 * DAY));
    const npv = (r) => f.reduce((s, x, i) => s + x.amount / Math.pow(1 + r, yrs[i]), 0);
    const dnpv = (r) => f.reduce((s, x, i) => s - yrs[i] * x.amount / Math.pow(1 + r, yrs[i] + 1), 0);
    // Newton first
    let r = 0.1;
    for (let i = 0; i < 100; i++) {
      const v = npv(r), d = dnpv(r);
      if (!Number.isFinite(v) || !Number.isFinite(d) || Math.abs(d) < 1e-12) break;
      const nr = r - v / d;
      if (!Number.isFinite(nr) || nr <= -0.999999) break;
      if (Math.abs(nr - r) < 1e-10) { return nr; }
      r = nr;
    }
    // Bisection fallback
    let lo = -0.9999, hi = 10;
    let flo = npv(lo), fhi = npv(hi);
    if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
    for (let i = 0; i < 300; i++) {
      const mid = (lo + hi) / 2, fm = npv(mid);
      if (Math.abs(fm) < 1e-9) return mid;
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }

  const TYPE_ORDER = { split: 0, buy: 1, transfer: 2, sell: 3, dividend: 4, interest: 5, fee: 6 };

  function normalizeTxs(txs) {
    return (txs || []).filter((x) => x && x.date && TYPE_ORDER[x.type] !== undefined)
      .map((x, i) => ({ ...x, _i: i }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || (num(a.seq, a._i) - num(b.seq, b._i))));
  }

  function build(state, opts) {
    opts = opts || {};
    const settings = state.settings || {};
    const today = settings.today || ds(Date.now());
    const rf = num(settings.riskFree, 0.02);
    const assets = state.assets || [];
    const assetById = Object.fromEntries(assets.map((a) => [a.id, a]));
    const txs = normalizeTxs(state.txs).filter((x) => x.date <= today);
    const warnings = [];

    // FX lookups
    const fxL = {};
    for (const [ccy, s] of Object.entries(state.fx || {})) fxL[ccy] = lookup(s);
    const fxAt = (ccy, d) => {
      if (!ccy || ccy === BASE) return 1;
      const L = fxL[ccy];
      if (!L || !L.first) return null;
      const v = L(d);
      return v == null ? L.first[1] : v;
    };
    const txFx = (tx, ccy) => {
      const f = num(tx.fx, NaN);
      if (Number.isFinite(f) && f > 0) return f;
      const v = fxAt(ccy, tx.date);
      if (v == null) { warnings.push({ kind: 'fx', ccy, date: tx.date, msg: `No ${ccy}/EUR exchange rate for ${tx.date}; using 1` }); return 1; }
      return v;
    };

    // Price lookups: history + tx prices as fallback points
    const txPricePts = {};
    for (const x of txs) if ((x.type === 'buy' || x.type === 'sell') && num(x.price) > 0) (txPricePts[x.assetId] = txPricePts[x.assetId] || []).push([x.date, num(x.price)]);
    const priceL = {};
    const histL = {};
    for (const a of assets) {
      const hist = (state.history && state.history[a.id]) || [];
      histL[a.id] = lookup(hist);
      // merge: history wins on same date; tx prices only fill dates before history starts or when no history
      // Trade prices are real observations too: they fill any date without a close (history wins on the same date).
      const histDates = new Set(histL[a.id].points.map((p) => p[0]));
      const extra = (txPricePts[a.id] || []).filter((p) => !histDates.has(p[0]));
      // Sparse series (fund NAVs typed monthly or rebuilt from published returns): interpolate between points
      // instead of drawing stairs. Daily series keep the last close.
      const hp = histL[a.id].points; let sparseH = false;
      if (hp.length >= 2) { const gaps = []; for (let i = Math.max(1, hp.length - 120); i < hp.length; i++) gaps.push((t(hp[i][0]) - t(hp[i - 1][0])) / DAY); gaps.sort((x, y) => x - y); sparseH = gaps[Math.floor(gaps.length / 2)] > 3; }
      priceL[a.id] = lookup(hist.concat(extra), sparseH);
      priceL[a.id].sparse = sparseH;
    }
    const priceAt = (id, d) => (priceL[id] ? priceL[id](d) : null);
    const ccyOf = (id) => (assetById[id] && assetById[id].currency) || BASE;
    const priceEURAt = (id, d) => { const p = priceAt(id, d); if (p == null) return null; const f = fxAt(ccyOf(id), d); return p * (f == null ? 1 : f); };

    // ---------- Pass 1: lots (FIFO), realized, per-asset aggregates, cash flows ----------
    const lots = {};         // id -> [{date, qty, cost}]  cost in EUR incl. fees
    const qty = {};          // running qty
    const per = {};          // per-asset aggregates
    const realized = [];     // one row per sale
    const incomeRows = [];   // dividends/interest for fiscal
    const flowsByDate = {};  // date -> {flow, income, fee}
    const xirrFlows = [];
    const perXirr = {};      // id -> flows
    const P = (id) => (per[id] = per[id] || { invested: 0, proceeds: 0, realized: 0, dividends: 0, fees: 0, buys: 0, sells: 0, firstDate: null });
    const F = (d) => (flowsByDate[d] = flowsByDate[d] || { flow: 0, buy: 0, sell: 0, income: 0, fee: 0 });
    const assetDayFlow = {}; const AF = (d, id, v) => { const o = (assetDayFlow[d] = assetDayFlow[d] || {}); o[id] = (o[id] || 0) + v; };
    let tradingFees = 0;
    const txEUR = {}; // tx id -> {eur, fx}

    for (const x of txs) {
      const a = assetById[x.assetId];
      if ((x.type === 'buy' || x.type === 'sell' || x.type === 'dividend' || x.type === 'split') && !a) { warnings.push({ kind: 'asset', msg: `Transaction ${x.id || ''} with an unknown asset` }); continue; }
      if (x.type === 'buy') {
        const q = num(x.qty), pr = num(x.price), fees = num(x.fees), fx = txFx(x, a.currency);
        if (q <= 0) continue;
        const cost = q * pr * fx + fees;
        (lots[a.id] = lots[a.id] || []).push({ date: x.date, qty: q, cost, txId: x.id || ('i' + x._i), fr: 1 });
        qty[a.id] = (qty[a.id] || 0) + q;
        const p = P(a.id); p.invested += cost; p.fees += fees; p.buys++; if (!p.firstDate) p.firstDate = x.date;
        txEUR[x.id] = { eur: cost, fx }; F(x.date).flow += cost; F(x.date).buy += cost; AF(x.date, a.id, cost); tradingFees += fees;
        xirrFlows.push({ date: x.date, amount: -cost });
        (perXirr[a.id] = perXirr[a.id] || []).push({ date: x.date, amount: -cost });
      } else if (x.type === 'sell') {
        const q = num(x.qty), pr = num(x.price), fees = num(x.fees), fx = txFx(x, a.currency);
        if (q <= 0) continue;
        const held = qty[a.id] || 0;
        let sellQ = q;
        if (q > held + EPS) { warnings.push({ kind: 'oversell', msg: `Sale of ${q} ${a.ticker || a.name} on ${x.date} exceeds the position (${+held.toFixed(8)})` }); sellQ = held; }
        const gross = q * pr * fx;
        const proceeds = gross - fees;                         // net proceeds for the whole order
        const ratio = q > 0 ? sellQ / q : 0;
        const netProc = proceeds * ratio;
        // FIFO matching
        let remaining = sellQ, cost = 0; const matched = [];
        const L = lots[a.id] || [];
        while (remaining > EPS && L.length) {
          const lot = L[0];
          const take = Math.min(lot.qty, remaining);
          const c = lot.cost * (take / lot.qty), fr = lot.fr * (take / lot.qty);
          matched.push({ buyDate: lot.date, qty: take, cost: c, txId: lot.txId, fr }); lot.fr -= fr;
          cost += c; lot.cost -= c; lot.qty -= take; remaining -= take;
          if (lot.qty <= EPS) L.shift();
        }
        qty[a.id] = Math.max(0, held - sellQ);
        const remainingLots = new Map(); for (const l of L) remainingLots.set(l.txId, (remainingLots.get(l.txId) || 0) + l.fr);
        const gain = netProc - cost;
        const p = P(a.id); p.proceeds += netProc; p.realized += gain; p.fees += fees; p.sells++;
        realized.push({ id: x.id, assetId: a.id, date: x.date, year: +x.date.slice(0, 4), qty: sellQ, proceeds: netProc, cost, gain, fees, lots: matched, remainingLots, washSale: false });
        txEUR[x.id] = { eur: netProc, fx }; F(x.date).flow -= netProc; F(x.date).sell += netProc; AF(x.date, a.id, -netProc); tradingFees += fees;
        xirrFlows.push({ date: x.date, amount: netProc });
        (perXirr[a.id] = perXirr[a.id] || []).push({ date: x.date, amount: netProc });
      } else if (x.type === 'interest') {
        // Interest is paid on cash, not on the investments: it goes to the tax view only, never into TWR/XIRR/P&L.
        const gross = num(x.amount), wh = num(x.withholding), net = gross - wh;
        if (Math.abs(gross) < EPS) continue;
        txEUR[x.id] = { eur: net, fx: 1, gross };
        incomeRows.push({ id: x.id, type: 'interest', assetId: null, date: x.date, year: +x.date.slice(0, 4), gross, withholding: wh, net });
      } else if (x.type === 'transfer') {
        // Spanish fund switch (traspaso): no taxable sale, cost basis and acquisition dates carry over to the new fund.
        const b = assetById[x.toAssetId];
        if (!a || !b) { warnings.push({ kind: 'asset', msg: `Switch ${x.id || ''} with an unknown fund` }); continue; }
        const q = num(x.qty), q2 = num(x.toQty);
        if (q <= 0 || q2 <= 0) continue;
        const held = qty[a.id] || 0; const outQ = Math.min(q, held);
        if (q > held + EPS) warnings.push({ kind: 'oversell', msg: `Switch of ${q} ${a.ticker || a.name} on ${x.date} exceeds the position (${+held.toFixed(8)})` });
        const k = q2 / q; let remaining = outQ, moved = 0;
        const L = lots[a.id] || []; const LB = (lots[b.id] = lots[b.id] || []);
        while (remaining > EPS && L.length) {
          const lot = L[0]; const take = Math.min(lot.qty, remaining); const c = lot.cost * (take / lot.qty), fr = lot.fr * (take / lot.qty);
          LB.push({ date: lot.date, qty: take * k, cost: c, txId: lot.txId, via: x.id, fr }); lot.fr -= fr;
          moved += c; lot.cost -= c; lot.qty -= take; remaining -= take; if (lot.qty <= EPS) L.shift();
        }
        LB.sort((u, v) => (u.date < v.date ? -1 : u.date > v.date ? 1 : 0));
        qty[a.id] = held - outQ; qty[b.id] = (qty[b.id] || 0) + outQ * k;
        const pa = P(a.id), pb = P(b.id); pa.invested -= moved; pb.invested += moved; if (!pb.firstDate) pb.firstDate = x.date;
        const pxA = priceEURAt(a.id, x.date); const mv = outQ * (pxA != null ? pxA : (outQ ? moved / outQ : 0));
        txEUR[x.id] = { eur: mv, fx: 1, cost: moved };
        AF(x.date, a.id, -mv); AF(x.date, b.id, mv);
        (perXirr[a.id] = perXirr[a.id] || []).push({ date: x.date, amount: mv });
        (perXirr[b.id] = perXirr[b.id] || []).push({ date: x.date, amount: -mv });
      } else if (x.type === 'dividend') {
        const ccy = a.currency;
        const fx = txFx(x, ccy);
        const gross = num(x.amount) * fx, wh = num(x.withholding) * fx, net = gross - wh;
        if (Math.abs(gross) < EPS) continue;
        if (x.assetId && assetById[x.assetId]) { P(x.assetId).dividends += net; AF(x.date, x.assetId, -net); }
        txEUR[x.id] = { eur: net, fx, gross: gross };
        incomeRows.push({ id: x.id, type: x.type, assetId: x.assetId || null, date: x.date, year: +x.date.slice(0, 4), gross, withholding: wh, net });
        F(x.date).income += net;
        xirrFlows.push({ date: x.date, amount: net });
        if (x.assetId) (perXirr[x.assetId] = perXirr[x.assetId] || []).push({ date: x.date, amount: net });
      } else if (x.type === 'fee') {
        const amt = num(x.amount);
        if (Math.abs(amt) < EPS) continue;
        if (x.assetId && assetById[x.assetId]) P(x.assetId).fees += amt;
        txEUR[x.id] = { eur: amt, fx: 1 };
        F(x.date).fee += amt;
        xirrFlows.push({ date: x.date, amount: -amt });
        if (x.assetId) (perXirr[x.assetId] = perXirr[x.assetId] || []).push({ date: x.date, amount: -amt });
      } else if (x.type === 'split') {
        const r = num(x.ratio);
        if (r <= 0) continue;
        for (const lot of lots[a.id] || []) lot.qty *= r;
        qty[a.id] = (qty[a.id] || 0) * r;
      }
    }

    // Deferred losses (art. 33.5 LIRPF): the blocked part of a loss is tied to the homogeneous units that blocked it
    // (fraction of each buy lot) and is integrated when those units are sold; a fund switch carries it to the new fund.
    const blkUsed = {};
    const deferLoss = (s, blk) => {
      let need = s.qty; s.blocking = [];
      for (const b of blk) {
        if (need <= EPS) break;
        const id = b.id || ('i' + b._i), bq = num(b.qty); if (bq <= 0) continue;
        const free = Math.max(0, (b.date > s.date ? 1 : s.remainingLots.get(id) || 0) - (blkUsed[id] || 0));
        const take = Math.min(free * bq, need); if (take <= EPS) continue;
        blkUsed[id] = (blkUsed[id] || 0) + take / bq; need -= take;
        s.blocking.push({ txId: id, date: b.date, qty: take, amount: s.gain * take / s.qty, left: s.gain * take / s.qty });
      }
      s.deferred = s.blocking.reduce((t, p) => t + p.amount, 0);
      if (!s.blocking.length) { s.washSale = false; delete s.washSaleDate; delete s.washSaleWindow; }
    };
    const releaseDeferred = () => {
      const cons = {}; realized.forEach((r, i) => r.lots.forEach((l) => { if (l.txId) (cons[l.txId] = cons[l.txId] || []).push({ i, fr: l.fr || 0 }); }));
      realized.forEach((s, i) => (s.blocking || []).forEach((p) => {
        let held = 1;
        for (const ev of cons[p.txId] || []) {
          if (ev.i > i && p.left < -EPS) { const r = ev.fr >= held - 1e-9 ? p.left : p.left * ev.fr / held; p.left -= r; const o = realized[ev.i]; (o.released = o.released || []).push({ fromId: s.id, fromDate: s.date, fromAssetId: s.assetId, fromGain: s.gain, buyDate: p.date, amount: r }); }
          held -= ev.fr;
        }
      }));
    };
    // Spanish 2-month / 1-year rule flag (art. 33.5 LIRPF): loss + homogeneous purchase in window
    for (const s of realized) {
      if (s.gain >= 0) continue;
      const a = assetById[s.assetId];
      const months = a.type === 'etf' || a.type === 'stock' ? 2 : a.type === 'fund' ? 12 : 0;
      if (!months) continue;
      const from = addMonths(s.date, -months), to = addMonths(s.date, months);
      // Re-purchase after the sale, or an earlier purchase inside the window whose units are still held after the sale
      const blk = txs.filter((x) => x.type === 'buy' && x.assetId === s.assetId && x.date >= from && x.date <= to &&
        (x.date > s.date || (x.date <= s.date && s.remainingLots.has(x.id || ('i' + x._i)))));
      const trigger = blk[0];
      if (trigger) { s.washSale = true; s.washSaleDate = trigger.date; s.washSaleWindow = months; deferLoss(s, blk); }
    }
    releaseDeferred();

    // ---------- Pass 2: daily valuation series ----------
    const series = [];
    const first = txs.length ? txs[0].date : null;
    const perAssetDaily = {}; // id -> [{date, priceEUR}]
    if (first) {
      const dateSet = new Set(txs.map((x) => x.date));
      for (let d = first; d <= today; d = addDays(d, 1)) { const w = dow(d); if (w !== 0 && w !== 6) dateSet.add(d); }
      dateSet.add(today);
      const dates = Array.from(dateSet).sort();
      const q = {}; let ti = 0; let prevV = 0; let idx = 1; let cumFlow = 0, cumIncome = 0, cumFee = 0;
      for (const d of dates) {
        while (ti < txs.length && txs[ti].date <= d) {
          const x = txs[ti++]; const a = assetById[x.assetId];
          if (!a) continue;
          if (x.type === 'buy') q[a.id] = (q[a.id] || 0) + num(x.qty);
          else if (x.type === 'sell') q[a.id] = Math.max(0, (q[a.id] || 0) - num(x.qty));
          else if (x.type === 'split') q[a.id] = (q[a.id] || 0) * num(x.ratio, 1);
          else if (x.type === 'transfer' && assetById[x.toAssetId]) { const out = Math.min(num(x.qty), q[a.id] || 0); q[a.id] = (q[a.id] || 0) - out; q[x.toAssetId] = (q[x.toAssetId] || 0) + (num(x.qty) > 0 ? out * num(x.toQty) / num(x.qty) : 0); }
        }
        let V = 0; const hold = {};
        for (const id of Object.keys(q)) {
          if (q[id] <= EPS) continue;
          const pe = priceEURAt(id, d);
          if (pe == null) continue;
          const v = q[id] * pe; V += v; hold[id] = v;
        }
        const fl = flowsByDate[d] || { flow: 0, buy: 0, sell: 0, income: 0, fee: 0 };
        // buys enter at start of day, sale proceeds leave at end of day -> denominator never goes negative
        const denom = prevV + fl.buy;
        const r = denom > EPS ? (V + fl.sell + fl.income - fl.fee) / denom - 1 : 0;
        idx *= 1 + r;
        cumFlow += fl.flow; cumIncome += fl.income; cumFee += fl.fee;
        series.push({ date: d, value: V, invested: cumFlow, income: cumIncome, fees: cumFee, pnl: V + cumIncome - cumFee - cumFlow, flow: fl.flow, r, index: idx, active: prevV > EPS, holdings: hold });
        prevV = V;
      }
      // drawdown
      let peak = 1;
      for (const p of series) { peak = Math.max(peak, p.index); p.drawdown = peak > 0 ? p.index / peak - 1 : 0; }
      // per-asset EUR price series on the same grid
      for (const a of assets) {
        perAssetDaily[a.id] = series.map((p) => priceEURAt(a.id, p.date));
      }
    }
    const last = series.length ? series[series.length - 1] : null;
    const prevS = series.length > 1 ? series[series.length - 2] : null;

    // ---------- Positions ----------
    const totalValue = last ? last.value : 0;
    const positions = [];
    for (const a of assets) {
      const p = per[a.id];
      const qn = qty[a.id] || 0;
      if (!p && qn <= EPS) continue;
      const L = lots[a.id] || [];
      const costBasis = L.reduce((s, l) => s + l.cost, 0);
      const pl = priceL[a.id];
      const lastPt = pl ? pl.at(today) : null;
      const fxNow = fxAt(a.currency, today) ?? 1;
      const price = lastPt ? lastPt[1] : null;
      const priceEUR = price != null ? price * fxNow : null;
      const value = qn > EPS && priceEUR != null ? qn * priceEUR : 0;
      let dayChange = null, dayChangePct = null;
      if (last && last.date === today) {
        const v0 = (prevS && prevS.holdings[a.id]) || 0, v1 = last.holdings[a.id] || 0;
        dayChange = v1 - v0 - ((assetDayFlow[today] || {})[a.id] || 0);
        dayChangePct = v0 > EPS ? dayChange / v0 : null;
      }
      const pp = p || { invested: 0, proceeds: 0, realized: 0, dividends: 0, fees: 0 };
      const unrealized = value - costBasis;
      const flows = (perXirr[a.id] || []).slice();
      if (value > EPS) flows.push({ date: today, amount: value });
      positions.push({
        assetId: a.id, asset: a, qty: qn, open: qn > EPS, costBasis, avgCost: qn > EPS ? costBasis / qn : null, lots: L.filter((l) => l.qty > EPS).map((l) => ({ date: l.date, qty: l.qty, cost: l.cost, txId: l.txId, via: l.via })),
        price, priceDate: lastPt ? lastPt[0] : null, priceEUR, value, weight: totalValue > 0 ? value / totalValue : 0,
        unrealized, unrealizedPct: costBasis > EPS ? unrealized / costBasis : null,
        realized: pp.realized, dividends: pp.dividends, fees: pp.fees, invested: pp.invested,
        totalReturn: unrealized + pp.realized + pp.dividends,
        totalReturnPct: pp.invested > EPS ? (unrealized + pp.realized + pp.dividends) / pp.invested : null,
        xirr: xirr(flows), dayChange, dayChangePct, stale: lastPt ? lastPt[0] : null,
        target: a.target != null && a.target !== '' ? num(a.target) : null,
      });
    }
    positions.sort((a, b) => b.value - a.value);
    for (const ccy of new Set(positions.filter((p) => p.open).map((p) => p.asset.currency))) {
      if (ccy && ccy !== BASE && !(fxL[ccy] && fxL[ccy].first)) warnings.push({ kind: 'fx', ccy, msg: `No ${ccy}/EUR exchange rate: positions in ${ccy} are valued at 1:1` });
    }

    // ---------- Totals ----------
    const sum = (k) => positions.reduce((s, p) => s + (p[k] || 0), 0);
    const standaloneFees = Object.values(flowsByDate).reduce((s, f) => s + f.fee, 0);
    const interestNet = incomeRows.filter((r) => r.type === 'interest').reduce((s, r) => s + r.net, 0);
    const totFlows = xirrFlows.slice(); if (totalValue > EPS) totFlows.push({ date: today, amount: totalValue });
    const openPos = positions.filter((p) => p.open);
    const dayChange = last ? last.pnl - (prevS ? prevS.pnl : 0) : 0;
    const prevValue = prevS ? prevS.value : 0;
    const totals = {
      value: totalValue,
      costBasis: sum('costBasis'),
      unrealized: openPos.reduce((s, p) => s + p.unrealized, 0),
      realized: sum('realized'),
      dividends: incomeRows.filter((r) => r.type === 'dividend').reduce((s, r) => s + r.net, 0),
      interest: interestNet,
      tradingFees,
      standaloneFees,
      netInvested: last ? last.invested : 0,
      grossInvested: Object.values(per).reduce((s, p) => s + p.invested, 0),
      pnl: last ? last.pnl : 0,
      dayChange, dayChangePct: prevValue > EPS ? dayChange / prevValue : null,
      twr: last ? last.index - 1 : 0,
      xirr: xirr(totFlows),
      firstDate: first, today,
      positionsOpen: openPos.length,
    };
    totals.fees = totals.tradingFees + standaloneFees;
    totals.pnlPct = totals.grossInvested > EPS ? totals.pnl / totals.grossInvested : null;
    const days = first ? (t(today) - t(first)) / DAY : 0;
    totals.twrAnn = days >= 365 ? Math.pow(1 + totals.twr, 365 / days) - 1 : null;

    // ---------- Allocation ----------
    const group = (keyFn) => {
      const m = {};
      for (const p of openPos) { const k = keyFn(p) || '—'; m[k] = (m[k] || 0) + p.value; }
      return Object.entries(m).map(([k, v]) => ({ key: k, value: v, weight: totalValue > 0 ? v / totalValue : 0 })).sort((a, b) => b.value - a.value);
    };
    const allocation = {
      asset: openPos.map((p) => ({ key: p.assetId, label: p.asset.ticker || p.asset.name, value: p.value, weight: p.weight })),
      type: group((p) => p.asset.type), currency: group((p) => p.asset.currency), broker: group((p) => p.asset.broker), tag: group((p) => p.asset.tag),
    };
    // Rebalancing vs targets
    const withTarget = positions.filter((p) => p.target != null);
    const rebalance = withTarget.length ? withTarget.map((p) => ({ assetId: p.assetId, label: p.asset.ticker || p.asset.name, weight: p.weight, target: p.target, drift: p.weight - p.target, trade: p.target * totalValue - p.value })) : [];

    // ---------- Fiscal ----------
    const fiscal = {};
    const Y = (y) => (fiscal[y] = fiscal[y] || { year: y, gains: 0, losses: 0, net: 0, flaggedLoss: 0, deferredReleased: 0, deferredPending: 0, dividendsGross: 0, withholding: 0, interestGross: 0, interestWithholding: 0, sales: 0 });
    for (const s of realized) { const f = Y(s.year); f.sales++; if (s.gain >= 0) f.gains += s.gain; else { f.losses += s.gain; if (s.washSale) f.flaggedLoss += s.deferred; } f.net += s.gain; for (const r of s.released || []) f.deferredReleased += r.amount; }
    for (const r of incomeRows) { const f = Y(r.year); if (r.type === 'dividend') { f.dividendsGross += r.gross; f.withholding += r.withholding; } else { f.interestGross += r.gross; f.interestWithholding += r.withholding; } }
    { let pend = 0; for (const y of Object.keys(fiscal).sort()) { pend += fiscal[y].flaggedLoss - fiscal[y].deferredReleased; fiscal[y].deferredPending = Math.min(0, pend); } }

    // ---------- Monthly / yearly returns & flows ----------
    const monthly = {}; const yearly = {}; const monthFlows = {};
    if (series.length) {
      let prevIdx = 1, prevYIdx = 1, curM = null, curY = null, lastIdx = 1;
      for (const p of series) {
        const m = p.date.slice(0, 7), y = p.date.slice(0, 4);
        if (curM && m !== curM) { monthly[curM] = lastIdx / prevIdx - 1; prevIdx = lastIdx; }
        if (curY && y !== curY) { yearly[curY] = lastIdx / prevYIdx - 1; prevYIdx = lastIdx; }
        curM = m; curY = y; lastIdx = p.index;
        const mf = (monthFlows[m] = monthFlows[m] || { invested: 0, withdrawn: 0, income: 0 });
        const fl = flowsByDate[p.date];
        if (fl) { if (fl.flow > 0) mf.invested += fl.flow; else mf.withdrawn += -fl.flow; mf.income += fl.income; }
      }
      monthly[curM] = lastIdx / prevIdx - 1; yearly[curY] = lastIdx / prevYIdx - 1;
    }

    // ---------- Correlations (open positions, last 252 obs) ----------
    const sparse = (id) => {
      const pts = (histL[id] && histL[id].points) || [];
      if (pts.length < 20) return true;
      const gaps = []; for (let i = Math.max(1, pts.length - 120); i < pts.length; i++) gaps.push((t(pts[i][0]) - t(pts[i - 1][0])) / DAY);
      gaps.sort((a, b) => a - b); return gaps[Math.floor(gaps.length / 2)] > 3;
    };
    const corrIds = openPos.map((p) => p.assetId).filter((id) => !sparse(id));
    const retOf = (id) => {
      const s = perAssetDaily[id] || []; const out = [];
      for (let i = 1; i < s.length; i++) out.push(s[i] != null && s[i - 1] != null && s[i - 1] > 0 ? s[i] / s[i - 1] - 1 : null);
      return out;
    };
    const rets = Object.fromEntries(corrIds.map((id) => [id, retOf(id)]));
    const N = series.length - 1, start = Math.max(0, N - 252);
    const matrix = corrIds.map((a) => corrIds.map((b) => {
      if (a === b) return 1;
      const xa = [], xb = [];
      for (let i = start; i < N; i++) { const u = rets[a][i], v = rets[b][i]; if (u != null && v != null && (u !== 0 || v !== 0)) { xa.push(u); xb.push(v); } }
      return xa.length >= 20 ? corr(xa, xb) : null;
    }));
    const assetVol = Object.fromEntries(corrIds.map((id) => { const r = rets[id].slice(start).filter((v) => v != null && v !== 0); return [id, r.length >= 20 ? stdev(r) * Math.sqrt(252) : null]; }));

    // ---------- Benchmark ----------
    let bench = null;
    if (state.benchmark && state.benchmark.length && series.length) {
      const bs = lookup(state.benchmark).points; let bSparse = false;
      if (bs.length >= 3) { const g = []; for (let i = Math.max(1, bs.length - 60); i < bs.length; i++) g.push((t(bs[i][0]) - t(bs[i - 1][0])) / DAY); g.sort((x, y) => x - y); bSparse = g[Math.floor(g.length / 2)] > 3; }
      const BL = lookup(state.benchmark, bSparse);
      let units = 0, bIdx = 1, prevB = null; const out = [];
      for (const p of series) {
        const raw = BL(p.date);
        const b = raw ?? (BL.first ? BL.first[1] : null);
        if (b == null) { out.push(null); continue; }
        const fl = flowsByDate[p.date] || { flow: 0, income: 0, fee: 0 };
        // simulate same net cash flows invested in the benchmark (income withdrawn like the portfolio)
        units += (fl.flow - fl.income + fl.fee) / b;
        if (units < 0) units = 0;
        const r = raw != null && prevB != null && prevB > 0 ? b / prevB - 1 : null;
        if (p.active && r != null) bIdx *= 1 + r;
        out.push({ date: p.date, level: b, has: raw != null, r: p.active ? r : null, index: bIdx, simValue: units * b });
        prevB = raw;
      }
      bench = out;
    }

    const result = { txEUR, series, positions, totals, allocation, rebalance, realized, incomeRows, fiscal, monthly, yearly, monthFlows, correlations: { ids: corrIds, matrix, vol: assetVol }, benchmark: bench, warnings, rf };
    result.stats = periodStats(result, null);
    return result;
  }

  /** Risk/return stats for series from `fromDate` (null = inception). */
  function periodStats(res, fromDate) {
    const S = res.series; const rf = res.rf ?? 0.02;
    if (!S.length) return null;
    let i0 = 0;
    if (fromDate) { i0 = S.findIndex((p) => p.date >= fromDate); if (i0 < 0) return null; }
    // index base = previous point (so return from fromDate's open)
    const baseIdx = i0 > 0 ? S[i0 - 1].index : 1;
    const baseDate = i0 > 0 ? S[i0 - 1].date : S[0].date;
    const slice = S.slice(i0);
    const rets = [], dates = [];
    for (let i = 0; i < slice.length; i++) { const p = slice[i]; if (p.active) { rets.push(p.r); dates.push(p.date); } }
    const endIdx = slice[slice.length - 1].index;
    const twr = endIdx / baseIdx - 1;
    const days = (t(slice[slice.length - 1].date) - t(baseDate)) / DAY;
    const cagr = days >= 365 ? Math.pow(1 + twr, 365 / days) - 1 : null;
    // risk on WEEKLY returns (base point + week-end points): daily values repeat stale prices (fund NAVs, trade-only prices) and understate volatility
    const wk = (d) => { const w = dow(d); return ds(t(d) - ((w + 6) % 7) * DAY); };
    const wEnds = [i0 > 0 ? i0 - 1 : 0];
    for (let i = wEnds[0] + 1; i < S.length; i++) { const nx = S[i + 1]; if (!nx || wk(nx.date) !== wk(S[i].date)) wEnds.push(i); }
    const wr = [];
    for (let k = 1; k < wEnds.length; k++) { const a = S[wEnds[k - 1]], z = S[wEnds[k]]; if (a.value > EPS && a.index > 0) wr.push(z.index / a.index - 1); }
    const rfw = rf / 52;
    const m = mean(wr), sd = wr.length >= 4 ? stdev(wr) : 0;
    const vol = sd > 0 ? sd * Math.sqrt(52) : null;
    const sharpe = sd > 0 ? ((m - rfw) / sd) * Math.sqrt(52) : null;
    const dd = wr.length >= 4 ? Math.sqrt(mean(wr.map((r) => Math.min(0, r - rfw) ** 2))) : 0;
    const sortino = dd > 0 ? ((m - rfw) / dd) * Math.sqrt(52) : null;
    // max drawdown inside window
    let peak = baseIdx, mdd = 0, mddPeak = null, mddPeakVal = null, mddTrough = null, recovery = null;
    let curPeakDate = baseDate;
    for (const p of slice) {
      if (p.index > peak) { peak = p.index; curPeakDate = p.date; }
      const d = p.index / peak - 1;
      if (d < mdd) { mdd = d; mddPeak = curPeakDate; mddPeakVal = peak; mddTrough = p.date; }
    }
    if (mddTrough) {
      const rec = slice.find((p) => p.date > mddTrough && p.index >= mddPeakVal - 1e-12);
      recovery = rec ? rec.date : null;
    }
    const var95 = wr.length >= 20 ? -quantile(wr, 0.05) : null;
    const tail = wr.filter((r) => r <= -var95);
    const cvar95 = var95 != null && tail.length ? -mean(tail) : null;
    const pos = rets.filter((r) => r > 0).length;
    const out = {
      from: baseDate, to: slice[slice.length - 1].date, days, n: rets.length, nw: wr.length, twr, cagr, vol, sharpe, sortino,
      maxDD: mdd, maxDDPeak: mddPeak, maxDDTrough: mddTrough, maxDDRecovery: recovery,
      calmar: cagr != null && mdd < 0 ? cagr / -mdd : null,
      var95, cvar95, best: rets.length ? Math.max(...rets) : null, worst: rets.length ? Math.min(...rets) : null,
      bestDate: rets.length ? dates[rets.indexOf(Math.max(...rets))] : null, worstDate: rets.length ? dates[rets.indexOf(Math.min(...rets))] : null,
      positiveDays: rets.length ? pos / rets.length : null,
      pnl: slice[slice.length - 1].pnl - (i0 > 0 ? S[i0 - 1].pnl : 0),
    };
    // vs benchmark — on WEEKLY returns (week-end points): robust when the benchmark only has weekly closes
    // and when fund NAVs and exchange closes are published on different days.
    if (res.benchmark) {
      const wkey = (d) => { const w = dow(d); return ds(t(d) - ((w + 6) % 7) * DAY); };
      const ends = [];
      for (let i = Math.max(0, i0 - 1); i < S.length; i++) { const nx = S[i + 1]; if (!nx || wkey(nx.date) !== wkey(S[i].date)) ends.push(i); }
      const pr = [], br = [];
      for (let k = 1; k < ends.length; k++) {
        const i = ends[k - 1], j = ends[k]; const bi = res.benchmark[i], bj = res.benchmark[j];
        if (!(S[i].value > EPS) || !bi || !bj || !bi.has || !bj.has || !(bi.level > 0) || !(bj.level > 0)) continue;
        pr.push(S[j].index / S[i].index - 1); br.push(bj.level / bi.level - 1);
      }
      if (pr.length >= 8) {
        const rfw = rf / 52; const vb = stdev(br) ** 2;
        const beta = vb > 0 ? covar(pr, br) / vb : null;
        const alphaW = beta != null ? (mean(pr) - rfw) - beta * (mean(br) - rfw) : null;
        const diff = pr.map((x, k) => x - br[k]);
        const te = stdev(diff) * Math.sqrt(52);
        const baseI = i0 > 0 ? i0 - 1 : 0;
        const b0 = res.benchmark[baseI], b1 = res.benchmark[S.length - 1];
        const btwr = b0 && b1 && b0.level > 0 ? b1.level / b0.level - 1 : null;
        out.bench = {
          beta, alpha: alphaW != null ? alphaW * 52 : null, corr: corr(pr, br), trackingError: te, weeks: pr.length,
          infoRatio: te > 0 ? (mean(diff) * 52) / te : null, twr: btwr, vol: stdev(br) * Math.sqrt(52), volPort: stdev(pr) * Math.sqrt(52),
          upCapture: (() => { const u = br.map((b, k) => [pr[k], b]).filter((z) => z[1] > 0); return u.length ? mean(u.map((z) => z[0])) / mean(u.map((z) => z[1])) : null; })(),
          downCapture: (() => { const u = br.map((b, k) => [pr[k], b]).filter((z) => z[1] < 0); return u.length ? mean(u.map((z) => z[0])) / mean(u.map((z) => z[1])) : null; })(),
        };
      }
    }
    return out;
  }

  /** Rolling annualized volatility over `win` active observations. */
  function rollingVol(res, win) {
    const S = res.series; const out = []; const buf = [];
    for (const p of S) {
      if (p.active) { buf.push(p.r); if (buf.length > win) buf.shift(); }
      out.push({ date: p.date, vol: buf.length >= Math.min(win, 20) ? stdev(buf) * Math.sqrt(252) : null });
    }
    return out;
  }

  const Engine = { build, periodStats, rollingVol, xirr, lookup, addMonths, addDays, util: { mean, stdev, corr, quantile } };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
