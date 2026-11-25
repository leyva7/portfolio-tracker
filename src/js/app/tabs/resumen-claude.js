/* ---------- Análisis de Claude (in Resumen) ---------- */
function aiPanel() {
  const ai = S.insights;
  if (ui.aiMode === 'analista') return `<section class="panel" id="aiPanel"><div class="panel-h"><h2>Análisis de Claude</h2>${aiModeSeg()}</div>${analystView()}</section>`;
  return `<section class="panel" id="aiPanel"><div class="panel-h"><h2>Análisis de Claude</h2><div class="toolbar">${aiModeSeg()}${ai && ai.date ? `<span class="small muted">${new Date(ai.date).toLocaleString(L, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}<button class="btn primary" type="button" data-act="ai-insights" ${sampleFn ? '' : 'disabled title="No disponible en esta vista"'}>${ai && ai.items ? 'Volver a analizar' : 'Analizar mi cartera'}</button></div></div>
    ${ai && ai.items && ai.date && (Date.now() - new Date(ai.date)) / 864e5 > 14 ? `<p class="small muted ai-old" style="margin:0 0 10px">Es de hace ${Math.floor((Date.now() - new Date(ai.date)) / 864e5)} días: puede no coincidir con tus cifras de hoy. Pulsa «Volver a analizar» para ponerlo al día.</p>` : ''}
    <div id="aiBox" class="ins-grid${ai && ai.items ? ' masonry' : ''}">${ai && ai.items ? ai.items.map((i) => insightCard({ tone: i.tone || 'info', title: esc(i.title), text: esc(i.text) })).join('') : '<p class="muted">Sin análisis todavía.</p>'}</div>
    <p class="note">${ai && ai.angles ? `Enfoques: ${ai.angles.map((a) => esc(a.split(':')[0])).join(' · ')}. ` : ''}Generado por IA a partir de tus datos; no es asesoramiento financiero.</p>
  </section>`;
}
/** Real-price coverage of the series: a session counts as priced when at least 80 % of the invested value has a
 *  market close (or a trade of yours) on that exact date; the rest are interpolated or repeated, which makes volatility look low. */
/** Per-asset volatility from res.correlations, but only when most sessions of the whole history have real prices. */
const volLow = () => { const c = priceCoverage(null); return !!(c && c.low); };
const assetVol = () => (volLow() ? {} : res.correlations.vol || {});
function priceCoverage(from) {
  if (!res || !res.series.length) return null;
  const S2 = res.series; const i0 = from ? Math.max(0, S2.findIndex((p) => p.date >= from)) : 0;
  const has = {}; const own = DEMO ? demoData.txs : Object.values(S.txs);
  const dates = (id) => has[id] || (has[id] = new Set(histPts(id).map((z) => z[0]).concat(own.filter((x) => x.assetId === id && (x.type === 'buy' || x.type === 'sell')).map((x) => x.date))));
  const okDay = (p) => { let v = 0, c = 0; for (const [id, x] of Object.entries(p.holdings || {})) { if (!(x > 0)) continue; v += x; if (dates(id).has(p.date)) c += x; } return v <= 0 || c / v >= 0.8; };
  const flags = S2.map((p) => (p.active ? okDay(p) : null));
  let n = 0, flat = 0; for (let i = i0; i < S2.length; i++) { if (flags[i] == null) continue; n++; if (!flags[i]) flat++; }
  let since = null, nn = 0, ff = 0; // earliest date from which ≤ 10 % of the sessions lack real prices
  for (let i = S2.length - 1; i >= 0; i--) { if (flags[i] == null) continue; nn++; if (!flags[i]) ff++; if (nn >= 20 && ff / nn <= 0.1) since = S2[i].date; }
  return { n, flat, share: n ? flat / n : 0, low: n > 0 && flat / n > 0.2, since };
}
function covNote(c) { if (!c) return undefined; return c.low ? `El ${Math.round(c.share * 100)} % de las sesiones no tiene precio de mercado de ese día (valor interpolado o repetido)${c.since ? `; hay precios diarios desde ${c.since}` : ''}: la volatilidad, el Sharpe, el Sortino y el VaR salen artificialmente bajos/altos; la caída máxima es más fiable. No los uses como conclusión principal.` : 'Hay precios diarios en casi todas las sesiones: las métricas de riesgo son representativas.'; }
function portfolioDigest() {
  const t = res.totals; const P = patrimony(); const y = ytdInfo(); const st = res.stats || {};
  const r2 = (v) => (ok(v) ? Math.round(v * 100) / 100 : null); const p1 = (v) => (ok(v) ? Math.round(v * 1000) / 10 : null);
  return {
    fecha: t.today, patrimonio: r2(P.total), inversiones: r2(P.inv), efectivo: r2(P.cash), taeEfectivo: p1(cashRate()),
    cuentasEfectivo: cashList().map((c) => ({ nombre: c.name, entidad: c.entity, saldo: r2(cashBal(c)), tae: +c.rate || 0 })),
    reparto: classAlloc().map((a) => ({ clase: a.label, pct: p1(a.weight) })),
    posiciones: res.positions.filter((p) => p.open).map((p) => ({ nombre: p.asset.name || p.asset.ticker, tipo: TYPES[p.asset.type], clase: CLS_LABEL[clsOf(p.asset)], valor: r2(p.value), pesoPct: p1(p.weight), latentePct: p1(p.unrealizedPct), latente: r2(p.unrealized), tirPct: p1(p.xirr), volatilidadPct: p1(assetVol()[p.assetId]) ?? undefined, cambio1mPct: p1(chg1m(p.assetId)) ?? undefined, desde: firstTxDate(p.assetId) })),
    cerradas: res.positions.filter((p) => !p.open).map((p) => ({ nombre: p.asset.name || p.asset.ticker, realizado: r2(p.realized) })),
    totales: { aportadoNeto: r2(t.netInvested), plusvaliaLatente: r2(t.unrealized), realizado: r2(t.realized), dividendosIntereses: r2(t.dividends + t.interest), comisiones: r2(t.fees), twrTotalPct: p1(t.twr), twrAnualPct: p1(t.twrAnn), tirPct: p1(t.xirr), primeraOperacion: t.firstDate },
    esteAño: y ? { resultado: r2(y.pnl), twrPct: p1(y.twr), aportado: r2(y.invested) } : null,
    ultimaSesion: (() => { const ls = lastSession(); return ls ? { fecha: ls.date, cambio: r2(ls.chg), cambioPct: p1(ls.pct), activos: ls.rows.map((r) => ({ activo: r.p.asset.ticker || r.p.asset.name, fecha: r.date, cambioPct: p1(r.pct) })) } : undefined; })(),
    riesgo: (() => { const c = priceCoverage(null); return c && c.low ? { caidaMaxPct: p1(st.maxDD), nota: covNote(c) } : { volatilidadPct: p1(st.vol), caidaMaxPct: p1(st.maxDD), sharpe: r2(st.sharpe), nota: covNote(c) }; })(),
    frenteAlIndice: st.bench && ok(st.bench.twr) ? { indice: benchName(), tuTwrPct: p1(st.twr), indiceTwrPct: p1(st.bench.twr), semanas: st.bench.weeks, nota: 'mismo periodo, rentabilidad ponderada por tiempo de las inversiones (sin efectivo)' } : undefined,
    aportacionesUltimos12Meses: Array.from({ length: 12 }, (_, i) => E.addMonths(t.today, -i).slice(0, 7)).reverse().map((m) => ({ mes: m, invertido: r2((res.monthFlows[m] || {}).invested || 0) })),
    fiscalEsteAño: (() => { const y = t.today.slice(0, 4), f = res.fiscal[y]; const fc = f ? fiscalCalc(y) : null; return f ? { ganancias: r2(f.gains), perdidas: r2(f.losses), neto: r2(fc.g), baseAhorro: r2(fc.base), ventas: f.sales, perdidasBloqueadasRecompra: r2(f.flaggedLoss), dividendosBrutos: r2(f.dividendsGross), interesesBrutos: r2(f.interestGross) } : null; })(), correlaciones: !res.correlations.ids.length ? undefined : res.correlations.ids.map((a, i) => ({ activo: (assetById(a) || {}).ticker, con: res.correlations.ids.map((b, j) => ({ activo: (assetById(b) || {}).ticker, r: r2(res.correlations.matrix[i][j]) })).filter((x) => x.activo !== (assetById(a) || {}).ticker) })),
  };
}
const AI_ANGLES = [
  'Escenario de estrés: cuánto perdería en euros la parte invertida con una caída del 20 % y del 35 % en bolsa, teniendo en cuenta qué parte es renta fija, oro y efectivo.',
  'Proyección: a su ritmo medio de aportación, patrimonio aproximado en 5 y 10 años con 3 %, 5 % y 7 % anual (di los supuestos).',
  'Plusvalías latentes por activo: cuáles tributarían más si vendiera hoy (FIFO) y qué implica para ordenar futuras ventas o usar traspasos entre fondos.',
  'Exposición real a divisa: qué parte depende del dólar aunque coticen en euros (S&P 500, acciones de EE. UU., bitcoin) y qué supone un euro más fuerte.',
  'Contribución: qué activo ha generado más euros de resultado y cuál más por euro invertido; y cuál menos.',
  'Últimas operaciones: cómo han cambiado el reparto y hacia dónde se está moviendo la cartera con las compras recientes.',
  'Efectivo: cuántos meses de colchón razonable cubre, coste de oportunidad frente a la renta fija corta de la cartera y frente a la inflación.',
  'Concentración: peso de los 3 mayores activos, solapamiento entre fondos (p. ej. S&P 500 y small caps globales también llevan EE. UU.).',
  'Ritmo de aportaciones: meses atípicos, regularidad y qué peso ha tenido aportar frente a la revalorización en el crecimiento del patrimonio.',
  'Movimiento del último mes por activo (cambio1mPct): qué ha tirado de la cartera y qué la ha frenado.',
  'Activos pequeños (menos del 3 %): si pesan lo bastante para mover la aguja o solo añaden complejidad.',
  'Fiscalidad del año en curso: margen hasta el siguiente tramo, pérdidas latentes compensables y riesgo de la regla de recompra.',
];
function pickAngles(n) { const a = AI_ANGLES.slice(); const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; }
function chg1m(assetId) {
  const lp = lastPx(assetId); if (!lp) return null;
  const pts = navPoints(S.navs[assetId]).concat(((S.history[assetId] || {}).points) || []).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const target = E.addDays(lp[0], -30); let base = null; for (const [d, v] of pts) { if (d <= target) base = [d, v]; else break; }
  if (!base || Date.parse(target) - Date.parse(base[0]) > 10 * 864e5) return null;
  return lp[1] / base[1] - 1;
}
function aiMetrics() { const P = patrimony(); const w = {}; for (const p of res.positions.filter((z) => z.open)) w[p.asset.ticker || p.asset.name] = Math.round(p.weight * 1000) / 10; return { patrimonio: Math.round(P.total), inversiones: Math.round(P.inv), efectivo: Math.round(P.cash), latente: Math.round(res.totals.unrealized), pesos: w }; }
function aiNovelty() {
  const t = res.totals.today; const since = E.addDays(t, -45);
  const recent = Object.values(S.txs).filter((x) => x.date >= since).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15).map((x) => { const a = assetById(x.assetId); const e2 = res.txEUR[x.id]; return { fecha: x.date, tipo: TXT[x.type] || x.type, activo: a ? a.ticker || a.name : null, euros: e2 ? Math.round(Math.abs(e2.eur)) : x.amount ? Math.round(+x.amount) : null }; });
  const nuevos = res.positions.filter((p) => p.open && (firstTxDate(p.assetId) || '') >= E.addDays(t, -120)).map((p) => ({ activo: p.asset.name || p.asset.ticker, desde: firstTxDate(p.assetId), pesoPct: Math.round(p.weight * 1000) / 10 }));
  const prev = S.insights && S.insights.metrics ? { fecha: (S.insights.date || '').slice(0, 10), ...S.insights.metrics } : null;
  const agg = {}; for (const x of Object.values(S.txs).filter((z) => z.date >= since)) { const a = assetById(x.assetId); const k = (a ? a.ticker || a.name : '—') + ' · ' + (TXT[x.type] || x.type); const e2 = res.txEUR[x.id]; agg[k] = agg[k] || { activoYTipo: k, operaciones: 0, euros: 0 }; agg[k].operaciones++; agg[k].euros += e2 ? Math.abs(e2.eur) : +x.amount || 0; }
  return { resumenUltimos45Dias: Object.values(agg).map((g) => ({ ...g, euros: Math.round(g.euros) })).sort((a, b) => b.euros - a.euros), ultimasOperaciones: recent.slice(0, 5), activosNuevosUltimos4Meses: nuevos, analisisAnterior: prev };
}
async function runAiInsights() {
  if (!sampleFn) return toast('El análisis con Claude no está disponible en esta vista.');
  if (!res || !res.positions.length) return toast('Añade tus inversiones primero.');
  const box = $('#aiBox'); const btn = $('[data-act="ai-insights"]'); if (btn) { btn.disabled = true; btn.textContent = 'Analizando…'; }
  if (box) box.innerHTML = `<div class="m-skel" style="display:contents" aria-busy="true"><p class="muted" style="grid-column:1/-1;margin:0 0 4px">Claude está revisando tu cartera…</p>${'<div class="ins sk"><span class="m-sk" style="width:55%;height:13px"></span><span class="m-sk"></span><span class="m-sk"></span><span class="m-sk" style="width:70%"></span></div>'.repeat(4)}</div>`;
  const angles = pickAngles(2); const nov = aiNovelty();
  const prevTitles = ((S.insights && S.insights.history) || []).flatMap((h) => h.titles || []).concat(S.insights && S.insights.items ? S.insights.items.map((i) => i.title) : []);
  const prevTexts = S.insights && S.insights.items ? S.insights.items.map((i) => `- ${i.title}: ${i.text}`).join('\n') : '';
  const prompt = `Eres un analista financiero que escribe en español de España para un inversor particular residente en España (tributa por IRPF, base del ahorro). Analiza su cartera con los datos JSON de abajo y devuelve SOLO un JSON con la forma {"insights":[{"title":"…","text":"…","tone":"good|warn|info"}]} con 5 observaciones.
Su cartera es estable (aporta casi cada mes), así que el valor está en lo NUEVO. Estructura:
1) Al menos una observación sobre lo que ha cambiado: operaciones de los últimos 45 días, activos nuevos, o diferencias frente al análisis anterior (campo "novedades.analisisAnterior": compara patrimonio, latente y pesos con cifras). Si no hay nada nuevo, dilo en una frase y pasa a otra cosa.
2) Dos observaciones con estos enfoques de hoy (obligatorios, con números): A) ${angles[0]} B) ${angles[1]}
3) El resto, lo más relevante que no se haya dicho antes.
${prevTexts ? `Análisis anterior (NO repitas estas ideas ni estos títulos; si un tema sigue siendo importante, aporta un dato o un ángulo nuevo):\n${prevTexts}\n` : ''}${prevTitles.length ? `Títulos ya usados en análisis previos: ${Array.from(new Set(prevTitles)).slice(0, 15).join(' | ')}\n` : ''}
Reglas: cada observación debe apoyarse en cifras concretas de los datos (cítalas); frases cortas y directas (máx. 50 palabras por "text"); título de 2 a 5 palabras y distinto de los ya usados. Temas posibles: diversificación real (solapamientos entre fondos, exposición a EE. UU., emergentes, sectores, renta fija, oro, cripto), riesgo y concentración, papel del efectivo y su rentabilidad frente a la inflación, ritmo de aportaciones, costes, y fiscalidad española (compensación de pérdidas, regla de recompra de 2 meses/1 año, traspasos entre fondos sin tributar). No recomiendes comprar o vender un producto concreto; puedes señalar opciones y sus pros y contras. No inventes datos que no estén ni menciones movimientos de mercado que no aparezcan. Cuidado con estas definiciones: "pesoPct" es sobre las inversiones (sin efectivo); la TWR, la TIR y la comparación con el índice miden SOLO las inversiones (el efectivo no entra, así que no lo uses para explicar esa diferencia); la TWR no depende de cuánto aportas. Si atribuyes una causa, que se deduzca de los datos (p. ej. peso en renta fija o emergentes). Tono "warn" para riesgos o puntos a revisar, "good" para fortalezas, "info" para contexto.
DATOS:
${JSON.stringify(Object.assign(portfolioDigest(), { novedades: nov }))}`;
  try {
    const r = await sampleFn.json(prompt, { modelTier: 'default', cache: false });
    const items = (r && Array.isArray(r.insights) ? r.insights : []).slice(0, 7).map((i) => ({ title: String(i.title || '').slice(0, 80), text: String(i.text || '').slice(0, 500), tone: ['good', 'warn', 'info'].includes(i.tone) ? i.tone : 'info' }));
    if (!items.length) throw { code: 'invalid_json', message: 'Respuesta vacía' };
    const hist = (((S.insights && S.insights.history) || []).concat(S.insights && S.insights.items ? [{ date: S.insights.date, titles: S.insights.items.map((i) => i.title) }] : [])).slice(-3);
    const doc = { date: new Date().toISOString(), items, metrics: aiMetrics(), angles, history: hist };
    if (db && !DEMO) await db.doc('insights/claude').set(doc); else { S.insights = doc; render(); }
  } catch (e) {
    const msg = { not_granted: 'No has dado permiso para preguntar a Claude desde esta página.', rate_limited: 'Demasiadas peticiones seguidas; prueba en un rato.', invalid_json: 'Claude no devolvió un formato válido; vuelve a intentarlo.' }[e && e.code] || ('No se pudo completar el análisis: ' + ((e && e.message) || e));
    if (box) box.innerHTML = `<p class="err">${esc(msg)}</p>`;
  } finally { const b = $('[data-act="ai-insights"]'); if (b) { b.disabled = false; b.textContent = 'Volver a analizar'; } }
}

/** Short session date: «vie 9 oct». */
const sdate = (d) => (d ? DF({ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')).replace(/[.,]/g, '') : '—');
/** Last session per open asset: change between its last two market closes (history + NAVs, not your own trade prices),
 *  at today's quantity and FX. `chg`/`pct` add up the portfolio; `date` is the latest session (crypto only if nothing else). */
function lastSession() {
  if (!res || !res.totals) return null;
  const today = res.totals.today; const old = E.addDays(today, -14); const rows = [];
  for (const p of res.positions.filter((z) => z.open && z.value > 0)) {
    const pts = histPts(p.assetId).filter((z) => z[0] <= today); if (pts.length < 2) continue;
    const [d1, v1] = pts[pts.length - 1], [d0, v0] = pts[pts.length - 2];
    if (!(v0 > 0) || d1 < old || (Date.parse(d1) - Date.parse(d0)) / 864e5 > 7) continue;
    const fx = p.price > 0 && ok(p.priceEUR) ? p.priceEUR / p.price : 1;
    rows.push({ p, assetId: p.assetId, date: d1, prevDate: d0, close: v1, prev: v0, chg: (typeof qtyAt === 'function' ? qtyAt(p.assetId, d1) : p.qty) * (v1 - v0) * fx, pct: v1 / v0 - 1 });
  }
  if (!rows.length) return null;
  const mkt = rows.filter((r) => r.p.asset.type !== 'crypto'); const date = (mkt.length ? mkt : rows).reduce((m, r) => (r.date > m ? r.date : m), '');
  const chg = rows.reduce((s, r) => s + r.chg, 0); const base = res.totals.value - chg;
  return { date, chg, pct: base > 0 ? chg / base : null, rows: rows.sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)) };
}
function moversTable() {
  const ls = lastSession();
  if (!ls) return '<div class="muted small">Sin cierres de mercado recientes todavía.</div>';
  const rows = ls.rows.filter((r) => Math.abs(r.chg) >= 0.005); const flat = ls.rows.length - rows.length;
  const foot = flat ? `<p class="note">${flat} activo${flat === 1 ? '' : 's'} sin cambios en su última sesión.</p>` : '';
  if (!rows.length) return '<div class="muted small">Sin cambios en la última sesión.</div>';
  const mob = `<div class="mlist">${rows.map((r) => `<div class="mrow"><div><div class="l1"><span class="sw" style="background:${acolor(r.assetId)}"></span><span class="tk">${esc(r.p.asset.ticker || r.p.asset.name)}</span></div><div class="l2">${sdate(r.date)} · ${money(r.close, r.p.asset.currency, 4)}</div></div><div><div class="r1 ${cls(r.chg)}">${eurS(r.chg)}</div><div class="r2 ${cls(r.pct)}">${pctS(r.pct)}</div></div></div>`).join('')}</div>`;
  return mob + `<div class="tbl-wrap only-desk"><table><thead><tr><th>Activo</th><th>Sesión</th><th class="n">Cierre</th><th class="n">Variación</th><th class="n">€</th><th class="n">Peso</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${assetCell(r.p.asset)}</td><td class="num">${sdate(r.date)}</td><td class="n">${money(r.close, r.p.asset.currency, 4)}</td><td class="n ${cls(r.pct)}">${pctS(r.pct)}</td><td class="n ${cls(r.chg)}">${eurS(r.chg)}</td><td class="n">${pct(r.p.weight, 1)}</td></tr>`).join('')}</tbody></table></div>` + foot;
}
function assetCell(a) { return `<div class="asset-cell"><span class="sw" style="background:${acolor(a.id)}"></span><div><div class="t">${esc(a.ticker || a.name)}</div><div class="nm">${esc(a.name || '')} · ${esc(TYPES[a.type] || a.type || '')}</div></div></div>`; }

