/* ================= Events ================= */
document.addEventListener('click', async (ev) => {
  const ab = ev.target.closest('abbr[title]'); if (ab && !ev.target.closest('button, a')) { toast(ab.title, 9000); return; }
  const t = ev.target.closest('button, a, th');
  if (!t) { if (ev.target === $('#overlay')) tryCloseModal(); return; }
  if (t.matches('[data-close]')) return closeModal();
  if (t.matches('#tabs button')) { const was = ui.tab; ui.tab = t.dataset.tab; try { history.replaceState(null, '', '#' + ui.tab); } catch (e) {} render(); if (was !== ui.tab) window.scrollTo(0, 0); return; }
  if (t.dataset.toast) { ev.preventDefault(); toast(t.dataset.toast, 9000); return; }
  if (t.dataset.goto) { ev.preventDefault(); if ($('#overlay') && !$('#overlay').hidden) closeModal(); ui.tab = t.dataset.goto; if (t.dataset.period) { ui.aPeriod = t.dataset.period; persistUI(); } try { history.replaceState(null, '', '#' + ui.tab); } catch (e) {} render(); window.scrollTo(0, 0); const to = t.dataset.to && $('#' + t.dataset.to); if (to) setTimeout(() => to.scrollIntoView({ block: 'start' }), 80); return; }
  if (t.dataset.p) { ui.period = t.dataset.p; persistUI(); render(); return; }
  if (t.dataset.aimode) { ui.aiMode = t.dataset.aimode; persistUI(); render(); return; }
  if (t.dataset.ddth) { ui.ddth = +t.dataset.ddth; render(); return; }
  if (t.dataset.mbw) { ui.mbw = t.dataset.mbw; render(); return; }
  if (t.dataset.mmonth) { ui.mmonth = t.dataset.mmonth; ui.mbw = 'N'; render(); return; }
  if (t.dataset.ap) { ui.aPeriod = t.dataset.ap; persistUI(); render(); return; }
  if (t.dataset.fy) { ui.fiscalYear = t.dataset.fy; render(); return; }
  if (t.dataset.pjmode) { const o = pjOpts(); o.mode = t.dataset.pjmode; pjSave(o); $$('[data-pjmode]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); renderProj(); return; }
  if (t.dataset.sort) { const k = t.dataset.sort; ui.sort = { key: k, dir: ui.sort.key === k ? -ui.sort.dir : (k === 'asset' ? 1 : -1) }; render(); const nb = document.querySelector(`#view .thsort[data-sort="${k}"]`); if (nb) nb.focus(); return; }
  if (t.dataset.price) return openPriceForm(t.dataset.price);
  if (t.dataset.trade) return openTxForm(null, t.dataset.trade);
  if (t.dataset.fiscalCsv) return fiscalCSV(t.dataset.fiscalCsv);
  if (t.dataset.dupTx) return dupTx(t.dataset.dupTx);
  if (t.dataset.repMonth) return openRepeatBuys();
  if (t.dataset.recurring) return recurringAct(t.dataset.recurring);
  if (t.dataset.gotoTx) { ui.txf = { asset: t.dataset.gotoTx, type: '', year: '', q: '' }; ui.tab = 'operaciones'; closeModal(); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.bt) return bottomNav(t.dataset.bt);
  if (t.dataset.sheetTab) { closeModal(); ui.tab = t.dataset.sheetTab; try { history.replaceState(null, '', '#' + ui.tab); } catch (e) {} render(); window.scrollTo(0, 0); return; }
  if (t.dataset.qtx) { closeModal(); return openTxForm({ type: t.dataset.qtx }, null, true); }
  if (t.dataset.editTx) { const x = S.txs[t.dataset.editTx]; if (x) openTxForm(x); else toast('La cartera de ejemplo no se puede editar.'); return; }
  if (t.dataset.delTx) { if (DEMO) return toast('La cartera de ejemplo no se puede editar.'); if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = delTxLabel(t.dataset.delTx); setTimeout(() => { if (t.isConnected) { t.dataset.armed = ''; t.textContent = 'Borrar'; } }, 3000); return; } await deleteTx(t.dataset.delTx); return; }
  if (t.dataset.trashRestore) { t.disabled = true; return restoreTrash(t.dataset.trashRestore); }
  if (t.dataset.snapRestore) return restoreSnapshot(t.dataset.snapRestore, t);
  if (t.dataset.snapDl) return downloadSnapshot(t.dataset.snapDl);
  if (t.dataset.editAsset) { const a = S.assets[t.dataset.editAsset]; if (a) openAssetForm(a); else toast('La cartera de ejemplo no se puede editar.'); return; }
  if (t.dataset.delAsset) {
    if (DEMO) return toast('La cartera de ejemplo no se puede editar.');
    const id = t.dataset.delAsset; const used = Object.values(S.txs).filter((x) => x.assetId === id).length;
    if (used) return toast(`No se puede borrar: tiene ${used} operaciones. Bórralas antes.`);
    if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = '¿Borrar?'; return; }
    const tid = await toTrash('asset', id, S.assets[id], 'borrado', S.history[id] ? { history: JSON.parse(JSON.stringify(S.history[id])) } : null); await remove('assets', id); if (S.history[id]) await remove('history', id); toast('Activo borrado.', 7000, tid ? { label: 'Deshacer', fn: () => restoreTrash(tid) } : null); return;
  }
  if (t.dataset.dust) return closeDust(t.dataset.dust, t);
  if (t.dataset.mv) { closeModal(); return openMoveForm(t.dataset.acc, t.dataset.mv); }
  if (t.dataset.mvDel) return deleteMove(t.dataset.acc, t.dataset.mvDel, t);
  if (t.dataset.editCash) { const c = S.cash[t.dataset.editCash]; if (c) openCashForm(c); else toast('La cartera de ejemplo no se puede editar.'); return; }
  if (t.dataset.delCash) { if (!S.cash[t.dataset.delCash]) return toast('La cartera de ejemplo no se puede editar.'); if (t.dataset.armed !== '1') { t.dataset.armed = '1'; t.textContent = '¿Borrar?'; return; } const cid = t.dataset.delCash; const tid = await toTrash('cash', cid, S.cash[cid], 'borrado'); await remove('cash', cid); toast('Cuenta borrada.', 7000, tid ? { label: 'Deshacer', fn: () => restoreTrash(tid) } : null); return; }
  const act = t.dataset.act;
  if (act === 'start' || act === 'add-asset') return openAssetForm();
  if (act === 'add-tx') return openTxForm();
  if (act === 'sell-sim') return openSellSim(t.dataset.id);
  if (act === 'snap-now') return maybeSnapshot(true);
  if (act === 'more-tx') { ui.txLimit = (ui.txLimit || 60) + 100; render(); return; }
  if (act === 'clear-txf') { ui.txf = { asset: '', type: '', year: '', q: '' }; render(); return; }
  if (act === 'txf-toggle') { ui.txfOpen = !ui.txfOpen; render(); return; }
  if (act === 'txf-rm') { ui.txf[t.dataset.k] = ''; render(); return; }
  if (act === 'sheet-refresh') { closeModal(); return refreshAll(); }
  if (act === 'sheet-theme') { closeModal(); return $('#btnTheme').click(); }
  if (act === 'add-cash') { closeModal(); return openCashForm(); }
  if (act === 'goal-edit') return openGoalForm();
  if (act === 'cushion-edit') return openCushionForm();
  if (act === 'ai-insights') return runAiInsights();
  if (act === 'ai-analyst') return runAiAnalyst();
  if (act === 'profile-edit') return openProfileForm();
  if (act === 'pj-reset') { const m = pjOpts().mode; try { localStorage.removeItem(PJ_KEY); localStorage.removeItem('cartera-proj2'); } catch (e) {} pjSave({ mode: m }); render(); return; }
  if (act === 'import') return openImport();
  if (act === 'export-csv') return exportCSV();
  if (act === 'export-json') return exportJSON();
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'chkClosed') { ui.showClosed = t.checked; render(); }
  if (t.id === 'fAsset') { ui.txf.asset = t.value; render(); }
  if (t.id === 'fType') { ui.txf.type = t.value; render(); }
  if (t.id === 'fYear') { ui.txf.year = t.value; render(); }
  if (t.id === 'mmSel') { ui.mmonth = t.value; render(); }
  if (t.id === 'restoreFile' && t.files[0]) { const f = t.files[0]; t.value = ''; restoreJSON(f); }
});
let qT = null;
document.addEventListener('input', (ev) => { if (ev.target.id === 'fQ') { clearTimeout(qT); const v = ev.target.value; qT = setTimeout(() => { ui.txf.q = v; render(); const el = $('#fQ'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 250); } });
document.addEventListener('input', (ev) => { if (ev.target.id === 'rbAmt') { ui.rbAmt = ev.target.value; const o = $('#rbOut'); if (o) o.innerHTML = contribTable(parseNum(ev.target.value)); } });
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'setForm') return; ev.preventDefault();
  const rf = parseNum($('#setRf').value); const sym = $('#setBench').value.trim().toUpperCase();
  try { await saveSettings({ riskFree: rf >= 0 ? rf / 100 : 0.02, benchSymbol: sym || null, benchName: $('#setBenchName').value.trim(), benchCcy: $('#setBenchCcy').value }); toast(sym && (!S.bench || S.bench.symbol !== sym) ? 'Ajustes guardados. El nuevo índice llega con la próxima actualización de precios.' : 'Ajustes guardados.'); }
  catch (e) { toast('No se pudo guardar: ' + (e.message || e.code)); }
});
document.addEventListener('keydown', (ev) => {
  if ($('#overlay').hidden) return;
  if (ev.key === 'Escape') { if (ev.target.matches && ev.target.matches('input[type=date]')) return; ev.preventDefault(); return tryCloseModal(); }
  if (ev.key === 'Tab') { const f = modalFocusables(); if (!f.length) return; const i = f.indexOf(document.activeElement); if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); } else if (!ev.shiftKey && (i < 0 || i === f.length - 1)) { ev.preventDefault(); f[0].focus(); } }
});
const markDirty = (ev) => { if (ev.target.closest && ev.target.closest('#modal form')) $('#modal').dataset.dirty = '1'; };
document.addEventListener('input', markDirty); document.addEventListener('change', markDirty);
document.addEventListener('toggle', (ev) => { if (ev.target.classList && ev.target.classList.contains('stale-chip')) ui.staleOpen = ev.target.open; }, true);
$('#btnRefresh').addEventListener('click', () => refreshAll());
