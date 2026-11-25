/* ================= Helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = 'en-GB';
const nf = {};
const NF = (o) => { const k = JSON.stringify(o); return nf[k] || (nf[k] = new Intl.NumberFormat(L, Object.assign({ useGrouping: 'always' }, o))); };
const ok = (v) => v != null && Number.isFinite(v);
const eur = (v, d = 2) => ok(v) ? NF({ style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '—';
const eurS = (v, d = 2) => ok(v) ? NF({ style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: 'exceptZero' }).format(v) : '—';
const eurK = (v) => ok(v) ? (v < 0 ? '−' : '') + '€' + (Math.abs(v) >= 1e6 ? NF({ maximumFractionDigits: 2 }).format(Math.abs(v) / 1e6) + 'M' : Math.abs(v) >= 1e4 ? NF({ maximumFractionDigits: 1 }).format(Math.abs(v) / 1e3) + 'k' : NF({ maximumFractionDigits: 0 }).format(Math.abs(v))) : '—';
const money = (v, ccy, d = 2) => ok(v) ? NF({ style: 'currency', currency: ccy || 'EUR', minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).format(v) : '—';
const numf = (v, d = 4) => ok(v) ? NF({ maximumFractionDigits: d }).format(v) : '—';
const pct = (v, d = 2) => ok(v) ? NF({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '—';
const pctS = (v, d = 2) => ok(v) ? NF({ style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: 'exceptZero' }).format(v) : '—';
const ppt = (v, d = 1, sign) => ok(v) ? NF({ minimumFractionDigits: d, maximumFractionDigits: d, signDisplay: sign ? 'exceptZero' : 'auto' }).format(v * 100) + '\u00a0pp' : '—';
const qn = (v, d) => `<span class="q">${numf(v, d)}</span>`; // quantity (hidden in privacy mode)
const ratio = (v, d = 2) => ok(v) ? NF({ minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '—';
const cls = (v) => (ok(v) ? (v > 1e-9 ? 'gain' : v < -1e-9 ? 'loss' : '') : '');
const todayStr = () => new Date().toLocaleDateString('sv-SE');
const df = {}; const DF = (o) => { const k = JSON.stringify(o); return df[k] || (df[k] = new Intl.DateTimeFormat(L, o)); }; // cached like NF
const fdate = (d, o) => d ? DF(Object.assign({ day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }, o || {})).format(new Date(d + 'T00:00:00Z')) : '—';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const parseNum = (v) => { if (v == null) return NaN; if (typeof v === 'number') return v; let s = String(v).trim().replace(/\s|€|\$|%/g, ''); if (!s) return NaN; if (s.includes(',') && s.includes('.')) { s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); } else if (/^-?[1-9]\d{0,2}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ''); else s = s.replace(',', '.'); return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? parseFloat(s) : NaN; };
const parseNumG = (v) => parseNum(v);
const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const alpha = (hex, a) => { const h = hex.replace('#', ''); if (h.length !== 6) return hex; const n = parseInt(h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 36 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { etf: 'ETF', stock: 'Stock', crypto: 'Crypto', fund: 'Fund', cash: 'Cash', other: 'Other' };
const TXT = { buy: 'Buy', sell: 'Sell', transfer: 'Transfer', dividend: 'Dividend', interest: 'Interest', fee: 'Fee', split: 'Split' };
const TXCHIP = { buy: 'buy', sell: 'tsell', transfer: 'xfer', dividend: 'inc', interest: 'int', fee: '', split: '' };

function toast(msg, ms = 3200, action) {
  const t = $('#toast');
  // a plain message waits until a toast with an action (Undo…) has run its course
  if (!action && toast._act && !t.hidden) { toast._q = [msg, ms]; return; }
  t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._act = !!action; toast._discard = false;
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label; b.addEventListener('click', () => { t.hidden = true; toast._act = false; toast._q = null; action.fn(); }); t.appendChild(b); ms = Math.max(ms, 7000); }
  toast._t = setTimeout(() => { t.hidden = true; toast._act = false; const q = toast._q; toast._q = null; if (q) toast(q[0], q[1]); }, ms);
}

