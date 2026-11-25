/* ================= Prices =================
 * Every price (fund NAVs, quotes, USD/EUR, benchmark) is written to navs/* by the Claude price-update routine
 * (weekdays 21:40 Madrid, or the "Update prices" button). Manual prices live in history/*.
 */
function csvRows(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  return lines.map((line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((s) => s.trim()); });
}
function mcpMsg(e) {
  const c = e && e.code;
  if (c === 'needs_reauth') return 'The connection has expired. Reconnect it in claude.ai → Settings → Connectors.';
  if (c === 'blocked_by_policy' || c === 'approval_required') return 'Your organization blocks this connector.';
  if (c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') return 'This view cannot use connectors.';
  if (c === 'server_unavailable') return 'The provider is not responding right now. Try again in a few minutes.';
  return (e && e.message) || 'Unknown error';
}

const isAuto = (a) => a.src !== 'manual' && a.src !== 'nav';
function mergePts(old, neu) { const m = new Map((old || []).map((p) => [p[0], p[1]])); for (const [d, v] of neu) m.set(d, v); return Array.from(m).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-HIST_CAP); }

function firstTxDate(assetId) { let m = null; for (const x of Object.values(S.txs)) if ((!assetId || x.assetId === assetId) && x.date && (!m || x.date < m)) m = x.date; return m; }
/* ---- Funds: Claude looks up the NAV by ISIN (quefondos.com) in a cloud task fired from here ---- */
const NAV_TASK = ''; // id of the price routine: set it here or in settings/main.navTask (see docs/routines.md)
const CCR = 'Claude Code Remote';
/** Business days after d up to today (Mon–Fri). */
function bizLag(d) { let n = 0, x = d; const t = todayStr(); while (x < t && n < 60) { x = E.addDays(x, 1); if (![0, 6].includes(new Date(x + 'T00:00:00Z').getUTCDay())) n++; } return n; }
function bizDay(d) { while ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = E.addDays(d, -1); return d; }
/** NAV points from a navs/{id} doc: every NAV Claude has read, plus anchors rebuilt from the published returns
 *  (1m/3m/1y/3y/5y and calendar years) so a new fund has some history from day one. */
function navPoints(nv) {
  const pts = Object.entries((nv && nv.m) || {}).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && +v > 0).map(([d, v]) => [d, +v]);
  const nd = nv && (nv.retDate || nv.navDate); const nav = nv && nv.retNav ? +nv.retNav : nd && nv.m ? +nv.m[nd] : NaN;
  if (nav > 0) {
    const anchors = []; const R = nv.ret || {}; const A = nv.annual || {};
    for (const [k, mo] of [['1m', 1], ['3m', 3], ['1y', 12], ['3y', 36], ['5y', 60]]) { const r = +R[k]; if (Number.isFinite(r) && r > -100) anchors.push([bizDay(E.addMonths(nd, -mo)), nav / (1 + r / 100)]); }
    let y = +nd.slice(0, 4); const ytd = +A[y];
    if (Number.isFinite(ytd) && ytd > -100) { let v = nav / (1 + ytd / 100); anchors.push([bizDay(`${y - 1}-12-31`), v]); y--; while (Number.isFinite(+A[y]) && +A[y] > -100) { v = v / (1 + +A[y] / 100); anchors.push([bizDay(`${y - 1}-12-31`), v]); y--; } }
    const have = pts.map((p) => Date.parse(p[0]));
    for (const [d, v] of anchors) { const t = Date.parse(d); if (!have.some((h) => Math.abs(h - t) < 4 * 864e5)) { pts.push([d, +v.toFixed(6)]); have.push(t); } }
  }
  return pts.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
const cloudAssets = () => Object.values(S.assets).filter((a) => !a.inactive && a.src !== 'manual' && (a.src === 'nav' ? a.isin : a.symbol || a.ysym || a.quoteUrl));
const navAssets = cloudAssets;
const refreshFunds = (o) => refreshCloud(o);
const JOB_TIMEOUT = 10 * 60e3;
const jobBusy = () => S.job && (S.job.state === 'queued' || S.job.state === 'running') && Date.now() - Date.parse(S.job.startedAt || 0) < JOB_TIMEOUT;
/** Launched more than 10 min ago and never finished: treated as lost, so it can be fired again. */
const jobStale = () => S.job && (S.job.state === 'queued' || S.job.state === 'running') && !jobBusy();
/** Latest market close among open positions (a trade of yours dated today doesn't move it). */
const lastMktDate = () => (res ? res.positions.filter((p) => p.open).reduce((m, p) => { const h = histPts(p.assetId); const d = h && h.length ? h[h.length - 1][0] : ''; return d > m ? d : m; }, '') : '');
const lastPxDate = () => (res ? res.positions.filter((p) => p.open && p.priceDate).reduce((m, p) => (p.priceDate > m ? p.priceDate : m), '') : '');
/** Every price (funds, ETFs, stocks, crypto, FX) is refreshed by a Claude task in the cloud: on this button, and on its own every weekday at 21:40. */
async function refreshCloud(opts = {}) {
  const list = cloudAssets(); if (!list.length) return 'none';
  if (!(S.settings.navTask || NAV_TASK)) { if (!opts.silent) toast('Set the id of the price routine (settings/main.navTask).'); return 'skip'; }
  if (jobBusy()) return 'busy';
  const last = S.job && S.job.state === 'done' && S.job.finishedAt ? Date.parse(S.job.finishedAt) : 0;
  if (!opts.force && Date.now() - last < 15 * 60e3) return 'fresh';
  if (perms) {
    let st = 'prompt'; try { st = await perms.state('mcp:' + CCR); } catch (e) {}
    if (st === 'prompt' && !opts.silent) { try { const r = await perms.request(['mcp:' + CCR]); st = (r && r['mcp:' + CCR]) || st; } catch (e) {} }
    if (st === 'denied') { await save('jobs', 'funds', { state: 'error', finishedAt: new Date().toISOString(), error: 'You denied the "Claude Code Remote" permission on this page. Turn it on in the page\'s permissions menu to update prices.' }).catch(() => {}); return 'error'; }
    if (st !== 'granted' && opts.silent) return 'skip';
  }
  const fire = () => mcp.callTool(CCR, 'fire_trigger', { trigger_id: S.settings.navTask || NAV_TASK }, { cache: false });
  try {
    await save('jobs', 'funds', { state: 'queued', startedAt: new Date().toISOString(), by: 'page' });
    try { await fire(); }
    catch (e) { if (e && e.retryable) { await sleep(Math.min(e.retryAfterMs || 2000, 15000) + 500); await fire(); } else throw e; }
    ui.fundsFired = true; return 'fired';
  } catch (e) {
    const msg = e && (e.code === 'server_not_connected' || e.code === 'not_in_manifest') ? 'Could not reach Claude (the Claude Code Remote connector is unavailable or not allowed on this page).' : e && e.code ? mcpMsg(e) : (e && e.message) || String(e);
    await save('jobs', 'funds', { state: 'error', finishedAt: new Date().toISOString(), error: msg }).catch(() => {});
    return 'error';
  }
}
async function refreshAll() {
  if (DEMO) return toast('You are viewing the sample portfolio. Add your assets to download prices.');
  if (!mcp) return toast(dbState === 'none' ? 'Open the page in claude.ai to update prices.' : 'Connectors are not available in this view.');
  const r = await refreshCloud({});
  renderHeader(); renderBanners();
  toast({ fired: 'Claude is updating all prices. It takes 1–3 minutes; the page refreshes by itself.', busy: 'An update is already running.', fresh: 'Prices were updated less than 15 minutes ago.', none: 'There are no assets with automatic prices.', error: 'Could not start the update. See the notice above.' }[r] || '', 5000);
}

